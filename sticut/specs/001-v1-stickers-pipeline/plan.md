# Implementation Plan: V1 Stickers Pipeline

**Branch**: `001-v1-stickers-pipeline` | **Date**: 2026-04-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-v1-stickers-pipeline/spec.md`

## Summary

Stickut V1 livre la chaîne complète : upload multi-format → détourage IA
côté serveur (cache disque par hash) → contour blanc + agencement A4 +
cadre décoratif côté client en Canvas → export PNG 300 DPI compatible
Cricut Print Then Cut.

L'approche technique ressort directement de la constitution : monorepo
backend FastAPI + frontend React, conteneurisé en Dockerfile multi-stage,
trois volumes (`templates`, `cache`, `tmp`). Le backend ne fait que ce qui
est lent ou impossible côté navigateur (décodage HEIC/AVIF, inférence
rembg, lecture du dossier de templates) ; tout le reste — composition,
contour blanc, packing, rasterisation finale — vit dans le canvas du
navigateur, ce qui rend toute interaction de réglage instantanée.

Tâches CPU-bound (rembg) sérialisées dans un pool de workers de taille
fixe = `nb_cpu`, alimenté par une file FIFO globale. Progression diffusée
en SSE. Aucun état utilisateur persistant : refresh = repartir de zéro,
le cache de cutouts (global, indexé par hash) rend ce repartir
quasi-instantané.

## Technical Context

**Language/Version**: Python 3.12 (backend), TypeScript 5.x strict
(frontend) — fixés par la constitution.
**Primary Dependencies (backend)**: FastAPI, uvicorn (ASGI), rembg[cpu]
(modèles ONNX : `birefnet-general` par défaut, `isnet-general-use`,
`u2net`, `isnet-anime`), Pillow + pillow-heif + pillow-avif-plugin
(décodage multi-format), lxml (parsing & manipulation SVG des templates),
diskcache (cache persistant indexé par hash), pydantic-settings (config
via env vars), pydantic v2 (modèles request/response), python-multipart
(uploads).
**Primary Dependencies (frontend)**: React 18, Vite, TypeScript strict,
TailwindCSS, Zustand (state), `maxrects-packer` (npm) pour le packing
rectangulaire (cf. research). Aucune lib graphique tierce — Canvas API
native exclusivement. Client SSE basé sur l'API native `EventSource`.
**Storage** : système de fichiers uniquement, monté en volumes Docker.
- `/app/cache/cutouts/{sha256}_{model}.png` — cutouts persistants,
  partagés entre toutes les sessions.
- `/app/templates/*.svg` — bibliothèque de cadres, rechargée à chaque
  lecture (pas de cache mémoire).
- `/app/tmp/{session_id}/*` — fichiers d'upload temporaires, purgés au
  bout d'une heure.
- Aucune base de données. Aucune table.
**Testing**: backend = pytest + httpx (TestClient FastAPI) + pytest-asyncio.
Frontend = vitest + @testing-library/react. Smoke E2E via une commande
quickstart manuelle ; pas de Playwright en V1.
**Target Platform**: serveur Linux (Proxmox LXC ou Docker host Unraid),
2 vCPU, 2–4 Go RAM, sans GPU. Image Docker multi-stage. Frontend cible
les navigateurs modernes (Chrome/Firefox/Safari récents) avec un soin
particulier pour Chrome iOS/Android.
**Project Type**: web (backend FastAPI + frontend React, servis depuis le
même conteneur, le backend sert le SPA buildé).
**Performance Goals**:
- Détourage cache miss : ≤ 90 s pour un lot de 10 photos smartphone sur
  2 vCPU avec `birefnet-general` (SC-006).
- Cache hit : ≤ 200 ms perçus (SC-002).
- Réactivité UI sur changement de paramètre : ≤ 100 ms perçus (SC-003).
- Démarrage à froid (premier `docker compose up`) : ≤ 2 min (SC-007).
**Constraints**:
- CPU-only (constitution III). Pas de CUDA, ONNX Runtime CPU.
- Pas d'appel réseau sortant à l'exécution (constitution IX). Modèles ONNX
  téléchargés au build de l'image.
- Pas de DB ni de session serveur (FR-046b).
- Tous les libellés UI en français (constitution + FR-048).
- Unités utilisateur en mm exclusivement (constitution + FR-043).
**Scale/Scope**:
- 1 à ~5 utilisateurs simultanés sur un même conteneur (homelab familial).
- Jusqu'à 50 fichiers par session, 20 Mo par fichier (configurables).
- Jusqu'à ~50 stickers par planche A4.
- Cache disque sans TTL, purge manuelle.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principe constitutionnel | Comment ce plan le respecte |
|---|---|---|
| I | Une seule action utilisateur | Le seul flux exposé est upload → planche A4. Aucun éditeur per-sticker dans le scope V1 (cf. Non-objectifs). |
| II | Qualité de détourage non négociable | Backend utilise `rembg` avec modèles ONNX (`birefnet-general` par défaut). Aucune heuristique flood-fill ou alpha-edge dans le pipeline serveur. |
| III | CPU-first | `rembg[cpu]` explicite, ONNX Runtime CPU. Aucun import CUDA. Image Docker construite sur Python 3.12-slim, pas de stack GPU. |
| IV | Réactivité maximale (cache + canvas) | Détourage = 1 fois par hash, persisté sur disque. Tout le reste (contour, packing, cadre, couleur, titre, taille) recalculé côté client en Canvas API native, sans aller-retour serveur. |
| V | Multi-formats généreux | Backend pré-décode JPEG/PNG/WebP/GIF/BMP/TIFF/HEIC/HEIF/AVIF via Pillow + pillow-heif + pillow-avif-plugin avant détourage ; frontend ne reçoit que des PNG transparents. |
| VI | Mobile-first responsive | TailwindCSS configuré mobile-first ; pas de `:hover` requis ; touch targets ≥ 44 px ; modal pinch-zoom natif (transformations CSS, pas de lib). |
| VII | Feedback constant | SSE depuis `/api/process/stream/{task_id}` ; libellés étape français inclus « En attente » ; before/after systématique. |
| VIII | Cadres extensibles | Templates lus depuis `/app/templates/*.svg` à chaque GET `/api/templates` ; aucune compilation, aucun rebuild. Hot-reload garanti par construction. |
| IX | Self-hosted, zéro cloud | Aucune dépendance Python ou JS ne fait d'appel réseau à l'exécution. Modèles téléchargés au build (étape multi-stage). Pas de SDK analytics. |
| X | Docker-natif | Dockerfile multi-stage unique + docker-compose.yml unique. Volumes : `templates`, `cache`, `tmp`. Pas d'étape post-up. |

**Conventions** :

- Erreurs API uniformément `{"detail": "<message FR>"}` via `HTTPException`
  custom helper.
- Modèles Pydantic v2 partout côté backend.
- TypeScript strict, ESLint + Prettier, `any` interdit.
- Naming interne : pas de suffixe `ut` dans variables/fichiers (constitution).

**Verdict** : aucune violation. Aucune entrée à porter en *Complexity
Tracking*.

## Project Structure

### Documentation (this feature)

```text
specs/001-v1-stickers-pipeline/
├── spec.md                  # Feature specification (/speckit-specify)
├── plan.md                  # This file (/speckit-plan)
├── research.md              # Phase 0 output (/speckit-plan)
├── data-model.md            # Phase 1 output (/speckit-plan)
├── quickstart.md            # Phase 1 output (/speckit-plan)
├── contracts/               # Phase 1 output (/speckit-plan)
│   ├── openapi.yaml         # REST API contract
│   ├── sse-events.md        # SSE event schema
│   └── svg-template.md      # Frame template SVG schema
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md                 # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml           # ruff + black + pytest + deps via uv or pip-tools
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, mounts SPA, wires routes
│   ├── config.py            # pydantic-settings (STICKUT_* env vars)
│   ├── models.py            # Pydantic v2 request/response schemas
│   ├── errors.py            # HTTPException helpers (detail FR)
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── upload.py        # POST /api/upload
│   │   ├── process.py       # POST /api/process + GET /api/process/stream/{task_id}
│   │   ├── cutout.py        # GET /api/cutout/{hash}
│   │   ├── templates.py     # GET /api/templates, GET /api/templates/{id}
│   │   └── health.py        # GET /api/health
│   ├── cutout/
│   │   ├── __init__.py
│   │   ├── runner.py        # Pool de workers (asyncio + ProcessPoolExecutor)
│   │   ├── models.py        # Lazy-load ONNX models par nom
│   │   ├── detector.py      # Détection transparence existante
│   │   └── cache.py         # Cache disque par hash (diskcache)
│   ├── frames/
│   │   ├── __init__.py
│   │   ├── loader.py        # Scan + parse + valide SVG dans templates dir
│   │   └── schema.py        # Représentation interne d'un template
│   ├── progress/
│   │   ├── __init__.py
│   │   ├── queue.py         # File FIFO globale + dispatch
│   │   ├── pubsub.py        # Pub/sub asyncio par task_id
│   │   └── sse.py           # Wrapping en EventSourceResponse
│   ├── sessions/
│   │   ├── __init__.py
│   │   └── tmp.py           # Création + purge tmp/{session_id}/
│   └── utils/
│       ├── __init__.py
│       ├── images.py        # Décodage multi-format Pillow + heif + avif
│       └── hashing.py       # SHA-256 streamé
└── tests/
    ├── conftest.py
    ├── unit/
    │   ├── test_hashing.py
    │   ├── test_detector.py
    │   ├── test_cache.py
    │   ├── test_loader.py
    │   └── test_queue.py
    ├── integration/
    │   ├── test_upload.py
    │   ├── test_process_sse.py
    │   ├── test_templates_hot_reload.py
    │   └── test_cutout_endpoint.py
    └── fixtures/
        ├── images/          # JPEG, PNG transparent, HEIC, AVIF, corrupted
        └── templates/       # Valides + invalides

frontend/
├── package.json
├── tsconfig.json            # strict: true
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── UploadZone.tsx
│   │   ├── ImageGrid.tsx
│   │   ├── ImageCard.tsx          # avant/après + step label
│   │   ├── ZoomModal.tsx          # plein écran pinch-zoom
│   │   ├── A4Preview.tsx          # canvas géant + checkerboard
│   │   ├── SettingsPanel.tsx      # taille (fixe/plage), contour, espacement
│   │   ├── AdvancedPanel.tsx      # repliable : modèle, alpha matting, marges, purge
│   │   ├── FrameSelector.tsx      # liste templates + color picker + titre
│   │   ├── ProgressBar.tsx
│   │   ├── ErrorBanner.tsx
│   │   └── ExportButton.tsx
│   ├── lib/
│   │   ├── api.ts                 # fetch wrappers typés
│   │   ├── sse.ts                 # client EventSource typé
│   │   ├── canvas/
│   │   │   ├── border.ts          # contour blanc (port du proto)
│   │   │   ├── pack.ts            # wrapper maxrects-packer
│   │   │   ├── compose.ts         # rendu A4 final 300 DPI
│   │   │   └── svgInject.ts       # parsing + injection couleur/texte
│   │   ├── decode.ts              # ImageBitmap depuis blob, fallback HTMLImageElement
│   │   └── filename.ts            # stickut_AAAA-MM-JJ_HHMM.png
│   ├── store/
│   │   └── useStore.ts            # Zustand : images, params, frame, progress
│   ├── types.ts                   # types partagés API <-> UI
│   └── styles/
│       └── index.css              # Tailwind directives
└── tests/
    ├── unit/
    │   ├── border.test.ts
    │   ├── pack.test.ts
    │   ├── svgInject.test.ts
    │   └── filename.test.ts
    └── components/
        ├── UploadZone.test.tsx
        ├── FrameSelector.test.tsx
        └── SettingsPanel.test.tsx

templates/                          # Volume Docker, fourni en V1
├── stars-confetti.svg
├── rainbow-sky.svg
├── ocean-waves.svg
├── dino-tracks.svg
├── stall-festive.svg
├── bunting-garland.svg
└── scallop-frame.svg

docker/
├── Dockerfile                      # multi-stage : node build → python runtime
└── download-models.py              # Téléchargement ONNX au build (étape isolée)

docker-compose.yml                  # service unique + 3 volumes
.env.example                        # toutes les STICKUT_* documentées
README.md                           # quickstart pointant vers specs/.../quickstart.md
```

**Structure Decision** : Web application (Option 2) avec backend Python
servant aussi le SPA buildé. Les répertoires `backend/` et `frontend/`
restent séparés pour la clarté du code et le cycle de dev (`vite dev`
hot-reload côté front, `uvicorn --reload` côté back). L'image Docker de
production combine les deux : étape `node` qui produit `frontend/dist/`,
étape `python` qui copie ce build dans `backend/static/` et le sert via
`StaticFiles` au même origin que l'API. Le dossier `templates/` à la
racine du repo est monté tel quel comme volume — il contient les 7 cadres
livrés et accueille les ajouts admin.

## Complexity Tracking

> Aucune violation à justifier. Le plan suit la constitution ligne à ligne.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(aucune)_ | _(aucune)_ | _(aucune)_ |
