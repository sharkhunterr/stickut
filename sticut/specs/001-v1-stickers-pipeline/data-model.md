# Phase 1 — Data Model: V1 Stickers Pipeline

**Date**: 2026-04-27
**Branch**: `001-v1-stickers-pipeline`

Stickut n'utilise pas de base de données. Le « modèle de données » décrit
ici recouvre :

1. Les structures backend en mémoire (Pydantic v2) qui pilotent les
   endpoints et le pool de détourage.
2. La structure sur disque (cache de cutouts, fichiers tmp d'upload,
   dossier de templates).
3. Les types partagés frontend ↔ backend qui dérivent strictement des
   modèles Pydantic via codegen ou copie manuelle.

---

## 1. Entités backend (Pydantic v2)

### 1.1 `UploadedImage`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `str` (UUID v4) | required, unique par session | identifiant frontend |
| `name` | `str` | 1..255 chars | nom de fichier original (sanitized) |
| `format` | `Literal["jpeg","png","webp","gif","bmp","tiff","heic","heif","avif"]` | required | format réel détecté par magic bytes |
| `size_bytes` | `int` | 1..`STICKUT_MAX_FILE_SIZE_MB`*1024*1024 | |
| `hash` | `str` | sha-256 hex (64 chars) | calculé en streaming pendant l'upload |
| `tmp_path` | `Path` | absolute, dans `tmp/{session_id}/` | usage backend uniquement, pas exposé |
| `width_px` / `height_px` | `int` | > 0 | détectées au décodage |
| `is_already_cutout` | `bool` | | résultat de `detector.is_already_cutout` |

**Validation rules**:

- `format` détecté côté serveur (FR-004) ; refus 415 si non listé.
- `size_bytes` > limite → 413.
- L'instance ne quitte jamais le serveur : seuls `id`, `name`, `hash`,
  et l'URL `/api/cutout/{hash}` sont exposés via `UploadResponseImage`.

**Lifecycle**:

```
created (upload reçu, hash calculé)
  → tmp_persisted (fichier écrit dans tmp/{session_id}/)
  → queued (POST /api/process l'a poussée dans la file)
  → processing (un worker l'a prise)
  → cached (cutout écrit dans cache/cutouts/)
  → tmp_purged (après 1h ou fin de session)
```

### 1.2 `CutoutKey` et `CutoutEntry`

```python
class CutoutKey(BaseModel):
    image_hash: str  # sha-256 hex
    model: Literal["birefnet-general","isnet-general-use","u2net","isnet-anime","passthrough"]
```

Le fichier sur disque s'écrit `cache/cutouts/{image_hash}_{model}.png`.
Le suffixe `_passthrough` est utilisé quand la détection R4 a sauté
rembg.

`CutoutEntry` n'existe pas comme classe : la présence du fichier sur
disque EST l'entrée. La fonction `cache.exists(key) -> bool` et
`cache.path(key) -> Path` suffisent. Pas d'index séparé.

### 1.3 `Session`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `str` (UUID v4) | | retourné au premier `/api/upload` |
| `created_at` | `datetime` (UTC) | | |
| `last_activity_at` | `datetime` (UTC) | | mis à jour à chaque endpoint |
| `tmp_dir` | `Path` | `/app/tmp/{id}` | créé au premier upload |
| `images` | `dict[str, UploadedImage]` | clé = `image.id` | |

**Lifecycle**:

```
created (premier POST /api/upload)
  → updated (uploads supplémentaires, /api/process, etc.)
  → expired (last_activity_at + 1h < now → purge tmp_dir)
```

Une session expirée renvoie `404 {"detail": "Session expirée ou
inexistante"}` à toute requête. Le frontend, qui n'a pas persisté la
valeur (Q1), récupère naturellement un nouvel `id` au prochain upload.

### 1.4 `ProcessTask`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `str` (UUID v4) | retourné par `/api/process` | |
| `session_id` | `str` | | référence forte |
| `model` | `str` | un des 4 modèles ou `passthrough` | |
| `alpha_matting` | `bool` | défaut `False` | |
| `image_ids` | `list[str]` | toutes les images de la session sans cutout cache hit | |
| `created_at` | `datetime` (UTC) | | |
| `state` | `Literal["running","done","failed"]` | | |
| `progress` | `dict[str, ImageProgress]` | clé = `image_id` | |

```python
class ImageProgress(BaseModel):
    step: Literal["En attente","Décodage","Détourage IA","Génération du contour","Mise en page","Terminé","Échec"]
    error: str | None  # populé seulement si step == "Échec"
    cutout_url: str | None  # populé quand step == "Terminé"
```

**Lifecycle d'une image au sein d'une task**:

```
En attente → Décodage → Détourage IA → Terminé
                              ↘ Échec (erreur ONNX, mémoire, etc.)
```

Note : « Génération du contour » et « Mise en page » sont annoncées dans
la spec (FR-023) mais s'exécutent **côté client** ; elles n'apparaissent
donc dans `ImageProgress` que comme transitions purement frontend, pas
comme événements SSE serveur. Le contrat SSE n'émet que les étapes
serveur (En attente / Décodage / Détourage IA / Terminé / Échec).

### 1.5 `FrameTemplate`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `str` | nom de fichier sans extension, slugifié | |
| `name` | `str` | depuis `<stickut:name>` ou nom de fichier humanisé | |
| `path` | `Path` | dans `templates/` | |
| `viewbox` | `tuple[float, float, float, float]` | doit être `(0,0,210,297)` | |
| `sticker_area` | `Rect` | depuis `<stickut:sticker-area x y width height/>` | |
| `supports_color` | `bool` | `True` si ≥ 1 élément `data-stickut="frame-color"` | |
| `supports_header` | `bool` | `True` si élément `<text data-stickut="header-text">` | |

```python
class Rect(BaseModel):
    x: float
    y: float
    width: float
    height: float
```

**Validation à l'ajout** (FR-035) :

1. Parsing lxml sans erreur.
2. `viewBox` = `0 0 210 297`.
3. Présence de `<stickut:meta><stickut:sticker-area .../></stickut:meta>`
   avec les 4 attributs flottants.
4. `sticker_area` ⊂ viewbox.

Tout SVG qui échoue à un de ces points est ignoré, un `logger.warning`
nommé est émis (FR-035), et le service reste fonctionnel (FR-035).

**Lifecycle**: pas de cache mémoire. À chaque `GET /api/templates`, le
loader rescanne `templates/`, parse, valide, et renvoie la liste — coût
budgété < 50 ms pour 20 templates (cf. R5).

### 1.6 `Settings` (env-driven, pydantic-settings)

| Variable | Default | Type | Notes |
|---|---|---|---|
| `STICKUT_MAX_FILE_SIZE_MB` | 20 | `int` | > 0 |
| `STICKUT_MAX_FILES_PER_SESSION` | 50 | `int` | > 0 |
| `STICKUT_DEFAULT_MODEL` | `birefnet-general` | enum | un des 4 modèles |
| `STICKUT_REMBG_WORKERS` | 2 | `int` | clamp à `os.cpu_count()` |
| `STICKUT_CACHE_DIR` | `/app/cache` | `Path` | doit exister, writable |
| `STICKUT_TEMPLATES_DIR` | `/app/templates` | `Path` | doit exister, readable |
| `STICKUT_TMP_DIR` | `/app/tmp` | `Path` | doit exister, writable |
| `STICKUT_TMP_TTL_SECONDS` | 3600 | `int` | session purgée après inactivité |
| `STICKUT_PORT` | 8000 | `int` | uvicorn |

---

## 2. Structure sur disque

```text
/app/
├── cache/
│   └── cutouts/
│       ├── {sha256}_birefnet-general.png     # 4 MB typique RGBA
│       ├── {sha256}_passthrough.png          # quand l'image était déjà transparente
│       └── ...
├── templates/                                 # monté en volume
│   └── *.svg
├── tmp/
│   └── {session_id}/
│       ├── {image_id}.{ext}                   # fichier original validé
│       └── ...                                # purgé après 1h d'inactivité
└── static/                                    # SPA Vite buildé (servi par FastAPI)
    ├── index.html
    └── assets/...
```

**Garanties** :

- `cache/cutouts/` est globalement partagé entre sessions (Q3, FR-008).
- Aucun fichier hors de ces 4 dossiers ne MUST être créé par l'app à
  l'exécution.
- Les noms de fichiers dans `tmp/` sont l'`image_id` (UUID v4) + extension
  réelle ; le `name` original n'apparaît jamais sur disque côté serveur
  (anti path-traversal).

---

## 3. Modèle frontend (TypeScript)

Les types frontend sont dérivés des modèles Pydantic. Pour V1, on les
recopie à la main dans `frontend/src/types.ts` et un test simple vérifie
qu'ils sont en accord (snapshot du JSON Schema d'OpenAPI servi par
FastAPI sur `/openapi.json`).

```typescript
// types.ts (extrait)

export type ModelName =
  | "birefnet-general"
  | "isnet-general-use"
  | "u2net"
  | "isnet-anime";

export type ImageStep =
  | "En attente"
  | "Décodage"
  | "Détourage IA"
  | "Génération du contour"
  | "Mise en page"
  | "Terminé"
  | "Échec";

export interface UploadResponseImage {
  id: string;
  name: string;
  hash: string;
  cutout_url?: string; // populated if cache hit at upload time
}

export interface UploadResponse {
  session_id: string;
  images: UploadResponseImage[];
}

export interface ProcessRequest {
  session_id: string;
  model?: ModelName;
  alpha_matting?: boolean;
}

export interface ProcessResponse {
  task_id: string;
}

export interface FrameTemplateSummary {
  id: string;
  name: string;
  preview_url: string;
  sticker_area: { x: number; y: number; width: number; height: number };
  supports_color: boolean;
  supports_header: boolean;
}
```

### Store Zustand (mémoire seulement, jamais persisté)

```typescript
interface StickutStore {
  sessionId: string | null;
  images: ImageState[];      // {id, name, hash, originalBlobUrl, cutoutBlobUrl, step, error}
  taskId: string | null;
  settings: {
    sizeMode: "fixed" | "range";
    sizeFixedMm: number;          // 50
    sizeMinMm: number;            // 30
    sizeMaxMm: number;            // 60
    borderThicknessMm: number;    // 2.5
    spacingMm: number;            // 3
    outerMarginMm: number;        // 10
    model: ModelName;             // "birefnet-general"
    alphaMatting: boolean;        // false
  };
  frame: {
    selectedId: string | null;    // null = "Sans cadre"
    color: string;                // "#000000"
    headerText: string;           // ""
  };
  // actions...
}
```

Aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, cookie
applicatif, ou URL hash. Conformément à FR-046b (issu de Q1).

---

## 4. Invariants

1. **Une cutout n'est jamais recalculée** si `(hash, model)` existe déjà
   sur disque (FR-008). Le code MUST vérifier `cache.exists()` avant tout
   appel rembg.
2. **`session_id` n'est jamais réutilisé** entre exécutions du serveur :
   le redémarrage du conteneur invalide toutes les sessions en vol (les
   dossiers tmp pourront être purgés au démarrage).
3. **Le pool de détourage a exactement N workers** (N = `min(STICKUT_REMBG_WORKERS, nb_cpu)`),
   créés au lifespan startup et fermés au shutdown.
4. **La file de tâches est strictement FIFO** entre tous les utilisateurs
   (FR-025b). Les `task_id` distincts n'ont aucun privilège.
5. **Aucune image utilisateur n'est conservée passé la purge tmp** ;
   seules les cutouts (RGBA détourés, sans EXIF) survivent dans le cache.
