# Phase 0 — Research: V1 Stickers Pipeline

**Date**: 2026-04-27
**Branch**: `001-v1-stickers-pipeline`

La constitution et la spec verrouillent presque tous les choix
fondamentaux. Cette note résout les 8 inconnues techniques qui restaient
ouvertes.

---

## R1. Pool de workers rembg dans une app FastAPI asyncio

**Decision**: utiliser un `concurrent.futures.ProcessPoolExecutor` de
taille fixe = `min(STICKUT_REMBG_WORKERS, os.cpu_count())` (défaut 2),
alimenté via `asyncio.get_running_loop().run_in_executor(...)`. Les
workers chargent paresseusement chaque modèle ONNX au premier usage et
le gardent en mémoire pour la durée de vie du processus.

**Rationale**:
- ONNX Runtime CPU est thread-bloquant et libère mal le GIL ; un
  `ThreadPoolExecutor` ne donne pas de parallélisme réel.
- `ProcessPoolExecutor` partage proprement la charge entre vCPU sans GIL.
- `run_in_executor` permet d'exposer le tout derrière `async def` sans
  bloquer l'event loop d'uvicorn.
- Charger les modèles une fois par worker amortit le coût de chargement
  ONNX (~1–2 s) sur toutes les requêtes ultérieures.

**Alternatives considered**:
- `ThreadPoolExecutor` : rejeté, pas de parallélisme effectif sur CPU.
- Celery + Redis : surdimensionné pour homelab, viole « zéro dépendance
  réseau ».
- `multiprocessing.Pool` direct : équivalent fonctionnel, mais
  `ProcessPoolExecutor` s'intègre nativement avec asyncio.
- Un seul process worker : double le temps total sur 2 vCPU et viole
  SC-006.

**Implications**:
- La file FIFO globale (FR-025b) vit dans un objet asyncio singleton ;
  elle pousse les `(image_id, model)` au pool et émet des événements de
  pubsub sur transitions d'état.
- La déclaration de l'app FastAPI démarre l'executor au lifespan startup
  et le shutdown au lifespan shutdown.

---

## R2. Implémentation du packing rectangulaire MaxRects côté navigateur

**Decision**: utiliser la lib npm `maxrects-packer` (TypeScript natif,
~3 ko gz, MIT, plusieurs algorithmes BSSF/BLSF/CONTACT, pas de
dépendances). Wrapper léger dans `frontend/src/lib/canvas/pack.ts`.

**Rationale**:
- Implémentation correcte de MaxRects, testée sur des cas réels de
  texture atlas et de planches d'impression.
- API minimaliste : `add(width, height, data)` / `pack(maxWidth,
  maxHeight, padding)`.
- Permet la rotation des stickers (utile en mode plage pour mieux
  remplir).
- Pas de Canvas requis dans la lib elle-même : pure logique.

**Alternatives considered**:
- Implémentation custom courte : ~150 lignes mais nécessiterait des
  tests étendus pour rivaliser avec une lib éprouvée.
- `bin-packing` (npm) : algorithmes plus simples (shelf, guillotine),
  moins efficaces sur lots hétérogènes — viole l'esprit de FR-017.
- `potpack` : très léger mais ne fait pas la rotation, qualité moindre.

**Implications**:
- La lib accepte des `padding` ; on l'utilisera pour matérialiser
  l'espacement inter-stickers (FR-016).
- Les rectangles non placés sont signalables via le tableau `unpacked`
  retourné, branché sur le surlignage rouge (FR-018).

---

## R3. Modèles ONNX rembg — bundle vs téléchargement à la demande

**Decision**: télécharger les 4 modèles (`birefnet-general`,
`isnet-general-use`, `u2net`, `isnet-anime`) lors d'une étape dédiée du
Dockerfile multi-stage, avant que l'image runtime soit finalisée. Aucun
téléchargement à l'exécution.

**Rationale**:
- Constitution IX interdit les appels réseau à l'exécution.
- SC-007 exige que le service soit fonctionnel en moins de 2 minutes
  après `docker compose up` ; un download de ~600 Mo (birefnet) en
  premier usage casserait ce critère.
- Les modèles sont stables : pas besoin de refresh à chaque démarrage.

**Alternatives considered**:
- Téléchargement au lifespan startup avec cache disque : viole l'esprit
  de la constitution (réseau à l'exécution) et casse SC-007.
- `birefnet-general` seul : économise ~400 Mo mais prive l'utilisateur
  des modèles plus rapides (alternatives prévues par la spec).
- Volume séparé `/app/models` pré-rempli par l'admin : non Docker-natif
  (viole constitution X « `docker compose up`, c'est tout »).

**Implications**:
- Une étape `FROM python:3.12-slim AS models` du Dockerfile exécute
  `python docker/download-models.py` qui appelle `rembg.bg.new_session()`
  pour chaque nom et copie les fichiers `.onnx` vers `/models/`.
- L'étape runtime copie `/models/` vers le `U2NET_HOME` configuré par
  rembg (`~/.u2net/` par défaut).
- Taille image finale ~1.2 Go (acceptable pour homelab).
- `STICKUT_DEFAULT_MODEL` permet de basculer si un modèle se révèle
  inadapté.

---

## R4. Détection automatique de transparence existante (FR-007)

**Decision**: décoder via Pillow, convertir en RGBA, échantillonner
l'alpha. Si plus de 5 % des pixels ont alpha < 240, considérer l'image
comme déjà détourée et sauter rembg. Implémentation O(N) mais en NumPy
vectorisé.

**Rationale**:
- Le seuil 240 (et non 255) tolère les artefacts de compression PNG.
- 5 % évite les faux positifs sur PNG opaque avec un coin transparent.
- Calcul ~10 ms pour une image 4 MP : négligeable face au coût rembg.

**Alternatives considered**:
- Vérifier le mode Pillow seul (`P` avec transparence, `RGBA`) : trop
  de faux positifs (PNG sauvegardé en RGBA mais tout opaque).
- Toujours détourer : viole le critère d'acceptation V1 « PNG déjà
  transparente → skip détourage ».
- Demander à l'utilisateur : viole « une seule action utilisateur ».

**Implications**:
- La fonction `detector.is_already_cutout(image)` retourne un booléen.
- Si `True`, `runner` court-circuite le pool et écrit directement
  l'image RGBA en cache avec un suffixe `_passthrough`.

---

## R5. SSE dans FastAPI — implémentation et keep-alive

**Decision**: utiliser `sse-starlette` (lib légère, Apache-2.0, ~150
lignes) qui fournit `EventSourceResponse` avec keep-alive automatique
(commentaire `:` toutes les 15 secondes). Émettre les events depuis un
pubsub asyncio in-memory indexé par `task_id`.

**Rationale**:
- `sse-starlette` gère proprement la déconnexion client, les keep-alive,
  et l'encodage ; écrire ça à la main c'est ~50 lignes de pièges.
- Keep-alive 15 s satisfait SC-008 (« jamais figé > 30 s »).
- Pubsub asyncio in-memory suffit puisque tout vit dans un seul
  processus (la file est globale, pas distribuée).

**Alternatives considered**:
- WebSockets : bidirectionnel, surdimensionné, chemin réseau différent
  derrière un reverse proxy (besoin d'`Upgrade` headers).
- Long polling : perçu plus lent, moins propre.
- Implémentation SSE custom : faisable, ~50 lignes, mais risqué
  (formatage `event:` / `data:`, keep-alive, fermeture gracieuse).

**Implications**:
- Schéma d'events documenté dans `contracts/sse-events.md`.
- Émettre périodiquement (toutes les 10 s) un `image_progress`
  step="En attente" pour les images en file (cf. FR-025b).

---

## R6. Décodage HEIC/HEIF/AVIF côté Python

**Decision**: `pillow-heif` (HEIC/HEIF) + `pillow-avif-plugin` (AVIF) en
dépendances explicites. Imports `register_heif_opener()` et
`register_avif_opener()` au démarrage de l'app.

**Rationale**:
- pillow-heif est le standard de facto, maintenu, wheels précompilées
  pour Linux x86_64 et arm64.
- pillow-avif-plugin couvre AVIF qui n'est pas dans Pillow natif.
- Aucune dépendance externe à ImageMagick ou libvips, ce qui simplifie
  l'image Docker.

**Alternatives considered**:
- libvips/pyvips : très performant, mais surdimensionné pour le volume
  V1 et alourdit l'image Docker.
- Ne pas supporter HEIC : casse le cas d'usage iPhone, principal
  scénario mobile.
- Conversion CLI externe (heif-convert) : ajoute une dépendance système.

**Implications**:
- Étape « Décodage » (FR-023) couvre la conversion vers RGBA Pillow.
- Métadonnées EXIF gérées par `ImageOps.exif_transpose` pour respecter
  l'orientation iPhone.
- Magic bytes vérifiés avant toute lecture (FR-004) via `imghdr` étendu
  ou inspection des 12 premiers octets.

---

## R7. Pipeline de contour blanc côté Canvas

**Decision**: implémenter en `OffscreenCanvas` avec ImageData ;
algorithme = box blur 2 passes + threshold pour lisser, dilatation
morphologique via blur + threshold, recomposition par
`globalCompositeOperation = "destination-over"` pour poser le blanc
sous l'alpha original. Un seul module
`frontend/src/lib/canvas/border.ts` (port direct du proto fourni).

**Rationale**:
- `OffscreenCanvas` permet le travail hors écran et — si supporté — le
  déport en Web Worker pour ne pas bloquer le thread UI.
- Box blur séparable (horizontal puis vertical) en 2 passes équivaut à
  un disque arrondi, ce qui produit les coins arrondis exigés (FR-011).
- ImageData permet une dilatation par seuillage de l'alpha flouté ;
  pas besoin de convolution morphologique custom plus chère.
- L'épaisseur en mm (FR-012) est convertie en pixels selon le DPI cible
  (300 DPI) : `radius_px = thickness_mm * 300 / 25.4`.

**Alternatives considered**:
- Filtres CSS / SVG `feMorphology` : flexibles mais moins déterministes
  cross-browser, et capture du résultat en Canvas pas trivial.
- Lib externe (e.g. `glfx.js`) : viole « pas de lib graphique tierce »
  de la constitution.
- Implémentation WebGL : performance excellente mais complexité
  (shaders) injustifiée à cette échelle.

**Implications**:
- L'algorithme s'exécute sur la cutout chargée depuis `/api/cutout/{hash}`.
- Le résultat (image avec contour) est mis en mémoire (pas en cache
  navigateur explicite) ; recalculé à chaque changement d'épaisseur,
  visé sous 100 ms pour 50 stickers (SC-003).
- Si un Web Worker n'est pas dispo, le fallback main-thread est
  acceptable car le calcul reste rapide pour des images ≤ 2 MP.

---

## R8. Identification de session côté serveur (sans persister d'état utilisateur)

**Decision**: `session_id` = UUID v4 généré à la première requête
`POST /api/upload`, retourné au client et passé en paramètre de toutes
les requêtes suivantes (`/api/process`, etc.). Aucune entrée DB ;
l'`session_id` sert uniquement de clé pour le sous-dossier `tmp/` et
de portée pour la file FIFO. Le frontend conserve cette valeur en
mémoire React seulement (pas de `localStorage`, conformément à Q1).

**Rationale**:
- Permet d'isoler les fichiers temporaires entre utilisateurs sans
  authentification (qui est gérée plus haut par Authentik).
- Aucun stockage persistant : si le frontend perd la valeur (refresh),
  un nouveau `session_id` est créé au prochain upload — comportement
  attendu.
- Le serveur peut purger `tmp/{session_id}/` après 1 h d'inactivité
  sans risque, le client n'ayant rien à reprendre.

**Alternatives considered**:
- Cookie de session HTTP : casse le principe « session purement
  éphémère côté client » de Q1 (le navigateur retiendrait la valeur
  et l'utilisateur croirait avoir un état persistant).
- Pas de session_id du tout : alors `tmp/` partagé, risque de
  collisions de noms de fichiers et fuite de noms entre utilisateurs.
- Token JWT : pas pertinent (auth déjà gérée par Authentik).

**Implications**:
- L'endpoint `/api/upload` est le seul qui peut créer un `session_id`.
- `/api/process` exige un `session_id` valide (= dossier tmp existant
  et non purgé) ; sinon retourne `404 {"detail": "Session expirée ou
  inexistante"}`.
- Une tâche cron interne asyncio purge les `tmp/{session_id}/` plus
  vieux qu'1 h toutes les 10 minutes.

---

## Récapitulatif des décisions

| ID | Sujet | Décision en une ligne |
|---|---|---|
| R1 | Pool rembg | `ProcessPoolExecutor(max_workers = nb_cpu)` via `run_in_executor`. |
| R2 | Packing client | Lib npm `maxrects-packer`. |
| R3 | Modèles ONNX | Téléchargés au build Docker, jamais à l'exécution. |
| R4 | Skip détourage | NumPy : > 5 % pixels avec alpha < 240. |
| R5 | SSE | `sse-starlette`, keep-alive 15 s, pubsub asyncio in-memory. |
| R6 | HEIC/AVIF | `pillow-heif` + `pillow-avif-plugin`. |
| R7 | Contour blanc | OffscreenCanvas + box blur 2 passes, port du proto. |
| R8 | Session | UUID v4, mémoire frontend uniquement, dossier tmp côté serveur. |

Aucune `NEEDS CLARIFICATION` ne reste ouverte. Le plan peut entrer en
Phase 1 (data-model + contracts).
