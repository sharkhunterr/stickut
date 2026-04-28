---

description: "Task list for V1 Stickers Pipeline feature implementation"
---

# Tasks: V1 Stickers Pipeline

**Input**: Design documents from `/specs/001-v1-stickers-pipeline/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: NOT requested in the spec — task list is implementation-only. The
manual smoke validation in `quickstart.md` (A1–A13) plays the role of the
acceptance suite for V1.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/app/...` and `backend/tests/...`
- **Frontend**: `frontend/src/...`
- **Containerization**: `docker/...`, `Dockerfile`, `docker-compose.yml` at repo root
- **Frame templates**: `templates/*.svg` at repo root (mounted as Docker volume)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repo scaffolding, dependency manifests, container skeletons.

- [X] T001 Create monorepo skeleton: directories `backend/app/`, `backend/tests/`, `frontend/src/`, `templates/`, `docker/` at repo root
- [X] T002 [P] Author `backend/pyproject.toml` declaring Python 3.12, runtime deps (fastapi, uvicorn[standard], rembg[cpu], pillow, pillow-heif, pillow-avif-plugin, lxml, diskcache, pydantic-settings, pydantic, python-multipart, sse-starlette, numpy), dev deps (ruff, black, pytest, pytest-asyncio, httpx), and ruff/black configuration
- [X] T003 [P] Author `frontend/package.json` declaring React 18, Vite, TypeScript strict, Tailwind, Zustand, maxrects-packer; add scripts `dev`, `build`, `lint`, `format`
- [X] T004 [P] Author `frontend/tsconfig.json` with `"strict": true` and `"noImplicitAny": true`
- [X] T005 [P] Author `frontend/vite.config.ts` with dev proxy `/api` → `http://localhost:8000`
- [X] T006 [P] Author `frontend/tailwind.config.ts` with the mobile-first defaults and the project content globs
- [X] T007 [P] Author `frontend/index.html` and `frontend/src/styles/index.css` with the Tailwind directives
- [X] T008 [P] Author `frontend/.eslintrc.cjs` and `frontend/.prettierrc` enforcing `no-explicit-any`
- [X] T009 [P] Author `Dockerfile` (multi-stage: `node` build → `python:3.12-slim` runtime → ONNX model bundling stage in between, copying `/models` into the runtime image)
- [X] T010 [P] Author `docker-compose.yml` declaring one `stickut` service, port 8000, three named volumes (`templates`, `cache`, `tmp`) with bind paths `./templates`, `./cache`, `./tmp`
- [X] T011 [P] Author `.env.example` documenting every `STICKUT_*` env var listed in `data-model.md` §1.6, with default values
- [X] T012 [P] Author repo-root `README.md` with a 1-paragraph description and a pointer to `specs/001-v1-stickers-pipeline/quickstart.md`
- [X] T013 [P] Author `docker/download-models.py` that downloads the four ONNX models (`birefnet-general`, `isnet-general-use`, `u2net`, `isnet-anime`) into `/models` using `rembg.bg.new_session().inner_session.get_modelpath()` or equivalent, called from the Dockerfile build stage

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure that EVERY user story depends on. No user story
work begins until this phase is complete.

⚠️ **CRITICAL**: No user story work can begin until this phase is complete.

### Backend foundation

- [X] T014 Implement `backend/app/__init__.py` (empty package marker) and `backend/app/config.py` exposing a `Settings` class via `pydantic-settings` mapping every `STICKUT_*` env var per `data-model.md` §1.6, with `@lru_cache` accessor `get_settings()`
- [X] T015 [P] Implement `backend/app/errors.py` with `def fr_error(status_code: int, detail: str) -> HTTPException` returning `HTTPException(status_code, detail=detail)` so every route emits `{"detail": "<message FR>"}` consistently
- [X] T016 [P] Implement `backend/app/utils/hashing.py` with `async def sha256_stream(file: UploadFile, chunk_size: int = 1<<16) -> str` that streams bytes through `hashlib.sha256` while writing to disk to avoid double-reading
- [X] T017 [P] Implement `backend/app/utils/images.py` with: (a) `register_decoders()` calling `pillow_heif.register_heif_opener()` and `pillow_avif.register_avif_opener()`, (b) `detect_format(head_bytes: bytes) -> str | None` using magic bytes for the 9 supported formats, (c) `decode_to_rgba(path: Path) -> Image` applying `ImageOps.exif_transpose` and converting to RGBA
- [X] T018 [P] Implement `backend/app/cutout/cache.py` exposing `path(image_hash, model) -> Path`, `exists(image_hash, model) -> bool`, `write(image_hash, model, png_bytes)`, `clear() -> int`, all rooted at `Settings.cache_dir / "cutouts"`
- [X] T019 [P] Implement `backend/app/cutout/detector.py` with `def is_already_cutout(rgba: Image, threshold: int = 240, ratio: float = 0.05) -> bool` per R4 in `research.md`
- [X] T020 [P] Implement `backend/app/sessions/tmp.py` with `create_session() -> Session`, `get_session(id) -> Session | None`, `touch(id)`, and a background `purge_loop()` that deletes `tmp/{session_id}/` older than `STICKUT_TMP_TTL_SECONDS`
- [X] T021 [P] Implement `backend/app/progress/pubsub.py`: an asyncio in-memory pub/sub keyed by `task_id`, with `subscribe(task_id) -> AsyncIterator[Event]`, `publish(task_id, event)`, and connection drop handling
- [X] T022 Implement `backend/app/progress/queue.py`: a global FIFO `asyncio.Queue` plus a dispatcher coroutine that pulls `(task_id, image_id, model, alpha_matting)` and submits to the rembg `ProcessPoolExecutor`; depends on T021 for emitting `image_progress {step: "En attente"}` every 10 s while items are queued
- [X] T023 Implement `backend/app/cutout/runner.py`: the rembg pool wrapper. Lifespan startup builds a `ProcessPoolExecutor(max_workers=min(STICKUT_REMBG_WORKERS, os.cpu_count()))`. Each worker lazy-loads ONNX models. Provide `async def detour(image_path: Path, model: str, alpha_matting: bool) -> bytes` that runs `rembg.remove` in the executor, returning the PNG bytes
- [X] T024 [P] Implement `backend/app/progress/sse.py` exporting a helper `event_source_response(generator)` built on `sse_starlette.sse.EventSourceResponse` with `ping=15` (s)
- [X] T025 [P] Implement `backend/app/models.py` with all Pydantic v2 schemas from `data-model.md` §1.1–1.4 and the OpenAPI request/response models from `contracts/openapi.yaml`
- [X] T026 Implement `backend/app/main.py`: build the `FastAPI` app, register `register_decoders()` and the lifespan that boots the pool / queue dispatcher / tmp purger, mount the SPA at `/` from `backend/static/` (will be empty until the front is built), wire CORS only for dev (off in prod), include the routers (placeholders OK at this stage)
- [X] T027 [P] Implement `backend/app/routes/health.py` with `GET /api/health` returning `{status, models_loaded, cache_size_mb}` (cache size = sum of file sizes in `cache/cutouts/`)

### Frontend foundation

- [X] T028 [P] Implement `frontend/src/types.ts` mirroring the TypeScript shapes from `data-model.md` §3 (ModelName, ImageStep, UploadResponse, etc.)
- [X] T029 [P] Implement `frontend/src/lib/api.ts` exposing typed fetch wrappers `uploadImages(files, sessionId?)`, `startProcess(req)`, `getCutoutUrl(hash, model)`, `listTemplates()`, `getTemplate(id)`, `getHealth()`, `clearCache()`, all returning typed promises and surfacing `{detail: string}` errors as French Error messages
- [X] T030 [P] Implement `frontend/src/lib/sse.ts` exposing `subscribeProcess(taskId, handlers: { onStarted, onProgress, onDone, onFailed, onComplete })` wrapping `EventSource` with typed parsing
- [X] T031 [P] Implement `frontend/src/lib/decode.ts`: `async decodeImageToBitmap(blob: Blob): Promise<ImageBitmap>` with a `HTMLImageElement` + `<canvas>` fallback for browsers without `createImageBitmap`
- [X] T032 [P] Implement `frontend/src/lib/filename.ts`: `buildExportFilename(now: Date = new Date()): string` returning `stickut_AAAA-MM-JJ_HHMM.png` (local time)
- [X] T033 Implement `frontend/src/store/useStore.ts` (Zustand) with the full `StickutStore` shape from `data-model.md` §3, default values for `settings` and `frame`, and pure-function actions; assert in code comments that the store NEVER persists to `localStorage` (FR-046b)
- [X] T034 [P] Implement `frontend/src/main.tsx` and `frontend/src/App.tsx` skeleton rendering an empty layout `<header><main><footer>` with the page title "Stickut"

**Checkpoint**: Foundation ready — backend pool, queue, SSE infrastructure, and frontend wiring exist; user-story implementation can now proceed.

---

## Phase 3: User Story 1 - Produire une planche A4 imprimable (Priority: P1) 🎯 MVP

**Goal**: Drop images → see them detoured → see them placed on an A4 preview → export a PNG ready for Cricut Print Then Cut, with default settings.

**Independent Test**: from `quickstart.md` A1, A2, A3, A9, A12, A13: drop 5 mixed JPEG, run, export, verify Cricut compatibility; drop a HEIC, verify it works; drop an already-transparent PNG, verify rembg is skipped; verify cache hit on re-upload; verify cold boot < 2 minutes.

### Backend: upload, process, SSE, cutout serving

- [X] T035 [US1] Implement `backend/app/routes/upload.py` with `POST /api/upload` (multipart, optional `session_id` query param). Steps: create or fetch session, for each file → magic-bytes detect format → 415 / 413 / 422 on rejection → stream-hash + write to `tmp/{session_id}/{image_id}.{ext}` → decode header for `width_px/height_px` → cache-hit lookup for default model → return `UploadResponse` with `cutout_url` populated when applicable
- [X] T036 [US1] Implement `backend/app/routes/process.py` `POST /api/process`: validate session, build `ProcessTask`, enqueue every image without a cache hit for the chosen model, return `{task_id}`
- [X] T037 [US1] Implement in `backend/app/routes/process.py` the `GET /api/process/stream/{task_id}` SSE endpoint: subscribe to pubsub, emit events per `contracts/sse-events.md`, close on `complete` or client disconnect; depends on T036 for the task registry
- [X] T038 [US1] Wire the queue dispatcher to the `runner.detour()` call: emit `image_started`, `image_progress {step: "Détourage IA"}`, write cache via `cache.write(...)`, then `image_done`. On exception, emit `image_failed` with a French message per the matrix in `contracts/sse-events.md`. After the last image, emit `complete`
- [X] T039 [P] [US1] Implement passthrough path in the dispatcher: when `detector.is_already_cutout(...)` returns `True`, skip the pool, write `cache/cutouts/{hash}_passthrough.png` directly, and emit `image_done` immediately
- [X] T040 [P] [US1] Implement `backend/app/routes/cutout.py` with `GET /api/cutout/{hash}` (optional `?model=...`, defaults to `STICKUT_DEFAULT_MODEL`); returns the cached PNG via `FileResponse` with `media_type="image/png"`; 404 if missing
- [X] T041 [US1] Wire all three routers (upload, process, cutout, health) into `backend/app/main.py` via `app.include_router(...)`

### Frontend: minimal happy-path UI

- [X] T042 [US1] Implement `frontend/src/components/UploadZone.tsx`: drag-drop + `<input type="file" multiple>`, accept the 9 MIME types, show file count after drop, expose an `onFiles(files: File[])` prop
- [X] T043 [P] [US1] Implement `frontend/src/components/ProgressBar.tsx`: takes `{ done: number, total: number }`, shows `X / N images traitées`
- [X] T044 [P] [US1] Implement `frontend/src/components/ImageGrid.tsx` and `ImageCard.tsx` minimal versions: ImageGrid maps `useStore().images` to one `ImageCard` each; ImageCard shows `name` and current `step` as plain text (rich UX comes in US3)
- [X] T045 [P] [US1] Implement `frontend/src/lib/canvas/border.ts`: the white-border pipeline per `research.md` R7. Inputs: `RGBA ImageData`, `thicknessMm`, `dpi=300`. Output: new `ImageData` with the white silhouette composited under the original alpha. 2-pass box-blur smoothing + dilation + threshold + `destination-over` composition
- [X] T046 [P] [US1] Implement `frontend/src/lib/canvas/pack.ts`: wrap `maxrects-packer` to take `{stickers: {id, widthMm, heightMm}[], a4: {marginMm, spacingMm}, allowRotation: true}` and return `{placed: PlacedSticker[], unplaced: string[]}`. Single fixed-size mode in this story (size in mm passed in)
- [X] T047 [US1] Implement `frontend/src/lib/canvas/compose.ts`: produce a `2480 × 3508` offscreen canvas (300 DPI A4); for each placed sticker, draw the bordered RGBA at the right position; return a `Blob` via `canvas.toBlob('image/png')`. Default to no frame in US1
- [X] T048 [US1] Implement `frontend/src/components/A4Preview.tsx`: a smaller on-screen canvas (≈ 35 % of viewport width) showing the same composition with a light checkerboard background; subscribes to `useStore` and re-renders on relevant change
- [X] T049 [US1] Implement `frontend/src/components/ExportButton.tsx`: disabled when no sticker is `Terminé`; on click runs `compose.ts`, calls `URL.createObjectURL`, triggers the download with `buildExportFilename()`
- [X] T050 [US1] Wire the full happy path in `frontend/src/App.tsx`: `UploadZone → api.uploadImages → store.setImages → api.startProcess → sse.subscribeProcess → on each image_done fetch cutout, run border, store cutoutBlobUrl + step="Terminé" → A4Preview re-renders → ExportButton enabled`
- [X] T051 [US1] Build the SPA (`npm run build`) and serve `frontend/dist/` via FastAPI `StaticFiles` mount in `backend/app/main.py` (path `/`, html=True)

**Checkpoint**: User Story 1 fully functional — drop, process, preview, export. Cricut compatibility provable via quickstart A9.

---

## Phase 4: User Story 2 - Maîtriser la taille des stickers (Priority: P2)

**Goal**: Switch between fixed-size and range modes, watch the layout react instantly, see overflow stickers flagged.

**Independent Test**: quickstart A4 (slider responsiveness) + A5 (mode comparison): with cutouts ready, move thickness/size sliders, switch modes, and verify all updates feel instantaneous and the resulting layouts differ visibly.

- [X] T052 [US2] Implement `frontend/src/components/SettingsPanel.tsx` exposing: size mode toggle (`fixed` / `range`), conditional sliders (single 15–120 mm or dual min/max), border-thickness slider 0.5–8 mm (default 2.5), spacing slider 1–10 mm (default 3), outer-margin slider 5–20 mm (default 10). All values bound to `useStore().settings`
- [X] T053 [US2] Extend `frontend/src/lib/canvas/pack.ts` with a `range` mode: assign each sticker a target size in [min, max] proportional to its source area, then run maxrects with rotation enabled and shrink the largest unplaced item until everything fits or `min` is reached
- [X] T054 [US2] Wire the `useStore` to throttle re-pack + re-render of `A4Preview` and the per-card "after" thumbnails to ≤ 16 ms wall-clock per change (RAF-coalesced) so SC-003 (≤ 100 ms perceived) holds
- [X] T055 [P] [US2] Add overflow detection: in `A4Preview` and `ImageCard`, mark stickers in `pack.unplaced` with a red ring (`ring-2 ring-red-500`) and a French tooltip "Trop grand pour cette planche" (FR-018). Excluded ids skipped by `compose.ts`
- [X] T056 [P] [US2] Update `frontend/src/components/ExportButton.tsx`: if `unplaced.length === stickers.length` (i.e. nothing fits), disable the button and surface a hint "Réduisez la taille pour pouvoir exporter"

**Checkpoint**: Sizing modes interactive and reactive; overflow visibly flagged.

---

## Phase 5: User Story 3 - Suivre le traitement en temps réel (Priority: P2)

**Goal**: Per-image step labels update live; failures display a French message without breaking the rest of the run.

**Independent Test**: quickstart A11 + the failure probe in the negative-path table: process 20 images including one corrupt, watch each label transition through the full chain (`En attente` → `Décodage` → `Détourage IA` → `Génération du contour` → `Mise en page` → `Terminé`), and confirm a single failed card does not stop the others.

- [X] T057 [US3] Refine `frontend/src/components/ImageCard.tsx` to render the current step as a labeled chip with a color per state (gray = `En attente`, blue = active, green = `Terminé`, red = `Échec`)
- [X] T058 [P] [US3] Add the frontend-only step transitions in `App.tsx` orchestration: after `image_done`, set step to `Génération du contour`, run `border.ts`, set step to `Mise en page`, run `pack.ts`, then set step to `Terminé`. Each transition triggers a single store update so the chip updates progressively
- [X] T059 [P] [US3] Implement `frontend/src/components/ErrorBanner.tsx` for global API/network errors (e.g. session 404, network down) and render it in `App.tsx` above `UploadZone`
- [X] T060 [P] [US3] Surface per-image errors directly on `ImageCard` (red chip + the French `error` string from `image_failed`); the rest of the UI continues normally

**Checkpoint**: The progress UX matches the steps spec'd in FR-023; errors are isolated to their card.

---

## Phase 6: User Story 4 - Valider visuellement avant impression (Priority: P3)

**Goal**: Side-by-side before/after thumbnails on every card; pinch-zoom modal for detailed inspection on mobile.

**Independent Test**: quickstart A2: drop a complex subject (hair, fur), see the after thumbnail on a checkerboard, tap to zoom on mobile, verify edges are inspectable.

- [X] T061 [US4] Extend `frontend/src/components/ImageCard.tsx` with two side-by-side thumbnails (200 × 200 max, `object-fit: contain`): "Avant" (the original blob URL) and "Après" (the bordered cutout, rendered to a small canvas with a light checkerboard background)
- [X] T062 [P] [US4] Implement `frontend/src/components/ZoomModal.tsx`: full-screen overlay using CSS `touch-action: none` + `transform: scale()` for pinch-zoom, two-finger pan; close on tap outside or `Escape`. Open via tap on a thumbnail
- [X] T063 [P] [US4] Add a checkerboard CSS class (`.checker-bg`) in `frontend/src/styles/index.css` using a 16-px gradient pattern; apply to "Après" thumbnails and the `A4Preview` background

**Checkpoint**: Users can validate detourage quality before exporting.

---

## Phase 7: User Story 5 - Habiller la planche d'un cadre décoratif (Priority: P3)

**Goal**: Pick a frame, change its color, set a header text, see the A4 preview update in real time, export with the frame baked into the PNG.

**Independent Test**: quickstart A6 + A7: select each of the 7 V1 frames, change colors, type "Anniversaire Léa" — preview updates < 100 ms, export PNG includes the frame.

### Backend: frame loader and endpoints

- [X] T064 [US5] Implement `backend/app/frames/schema.py` with the `FrameTemplateSummary` Pydantic model from `data-model.md` §1.5
- [X] T065 [US5] Implement `backend/app/frames/loader.py`: `def list_templates(dir: Path) -> list[FrameTemplateSummary]` that walks the dir, parses each `.svg` via `lxml`, runs the 10 validation rules from `contracts/svg-template.md` (skip + WARNING log on failure), and returns the valid summaries; expose `def get_raw_svg(dir: Path, id: str) -> bytes | None`
- [X] T066 [P] [US5] Implement `backend/app/routes/templates.py` with `GET /api/templates` (calls `list_templates(Settings.templates_dir)`) and `GET /api/templates/{id}` (calls `get_raw_svg`, returns `Response(media_type="image/svg+xml")` or 404 with French detail). Wire into `main.py`
- [X] T067 [P] [US5] Author the 7 V1 frame SVG files in `templates/`: `stars-confetti.svg`, `rainbow-sky.svg`, `ocean-waves.svg`, `dino-tracks.svg`, `stall-festive.svg`, `bunting-garland.svg`, `scallop-frame.svg`. Each MUST satisfy the 10 validation rules and use the `data-stickut="frame-color"` / `data-stickut="header-text"` markers per `contracts/svg-template.md`

### Frontend: frame selector, injection, integration with preview and export

- [X] T068 [US5] Implement `frontend/src/lib/canvas/svgInject.ts`: `injectFrame(svgText: string, color: string, header: string): string` parses with `DOMParser`, replaces `fill`/`stroke` on every `[data-stickut="frame-color"]` element, sets text content + fill on the `[data-stickut="header-text"]` element (or `display="none"` if `header.trim() === ""`), and serialises back. Pure function, no DOM mounting
- [X] T069 [US5] Implement `frontend/src/components/FrameSelector.tsx`: fetches `api.listTemplates()` once on mount, renders a horizontal scroll of thumbnails (each thumbnail = small `<img src="/api/templates/{id}">` with the current color injected via a CSS filter or live re-rendering), plus a `<input type="color">` color picker and an `<input type="text" maxLength={60}>` header field. State bound to `useStore().frame`
- [X] T070 [P] [US5] Add a "Sans cadre" pseudo-entry as the first option in `FrameSelector` (selectedId = null)
- [X] T071 [US5] Update `frontend/src/lib/canvas/pack.ts` to accept an optional `stickerArea: Rect` (in mm) overriding the default A4-minus-margins area when a frame is active; reads from `useStore().frame.selectedId` → resolved against the cached templates list
- [X] T072 [US5] Update `frontend/src/components/A4Preview.tsx`: when a frame is selected, fetch its raw SVG, run `injectFrame`, rasterise via an `<img>` + `drawImage` to a 2480 × 3508 offscreen canvas at 300 DPI; layer it under the stickers
- [X] T073 [US5] Update `frontend/src/lib/canvas/compose.ts`: same frame rasterisation for the export PNG, ensuring the colour and header injected into the SVG are baked into the final image (FR-039)
- [X] T074 [P] [US5] Add throttled re-render: any change to `frame.selectedId`, `frame.color`, or `frame.headerText` in the store triggers a single RAF-coalesced rebuild of `A4Preview`, meeting SC-003 (≤ 100 ms perceived)

**Checkpoint**: A4 preview and export honour the active frame; user can pick a frame, customize, export.

---

## Phase 8: User Story 6 - Ajouter mes propres cadres (Priority: P4)

**Goal**: Drop a new SVG into `templates/` on the host; the next refresh picks it up, no restart. Invalid SVGs log a warning and are silently skipped.

**Independent Test**: quickstart A8: copy `my-test.svg` into `templates/`, refresh the frame selector, see it appear; copy a broken SVG, see it absent and a backend warning logged.

- [X] T075 [P] [US6] In `backend/app/frames/loader.py`, ensure NO in-memory caching of the parsed templates: every `list_templates()` call must rescan; add a `logger = logging.getLogger("stickut.frames")` and emit `logger.warning("template '%s' rejected: %s", file.name, reason)` with a precise reason for each of the 10 validation rules
- [X] T076 [US6] In `frontend/src/components/FrameSelector.tsx`, refetch the templates list every time the selector is opened (and on a manual "🔄 Actualiser" button), so an admin's drop-in is visible without a full page reload
- [X] T077 [P] [US6] In `frontend/src/store/useStore.ts`, when the templates list refreshes and `frame.selectedId` is no longer present in the new list, silently revert to `selectedId = null` ("Sans cadre") without throwing or showing an error

**Checkpoint**: Admin extensibility validated; invalid drop-ins do not break the service.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories — advanced settings, cache management, and final hardening.

- [X] T078 [P] Implement `backend/app/routes/cutout.py` `POST /api/cache/clear`: calls `cache.clear()`, returns `{deleted: int}`. Wire into `main.py`
- [X] T079 [P] Implement `frontend/src/components/AdvancedPanel.tsx` (collapsed by default): model select (4 options + the default), alpha-matting toggle, outer-margin slider (already in SettingsPanel — surface here too if cleaner), and a "Vider le cache de détourage" button calling `api.clearCache()` with a confirmation
- [X] T080 [P] Update `backend/app/routes/process.py` to read `model` and `alpha_matting` from the request body and propagate them through the queue and the runner, so the AdvancedPanel choices take effect
- [X] T081 [P] Update `backend/app/routes/health.py` to populate `models_loaded` from the runner's lazy registry and `cache_size_mb` by walking `cache/cutouts/`
- [X] T082 [P] Add Authentik-aware behaviour to `backend/app/main.py`: trust `X-Forwarded-*` headers when `STICKUT_BEHIND_PROXY=true`, document this in `.env.example`. No auth logic — only correct origin/host detection for SSE
- [X] T083 [P] Confirm the docker `HEALTHCHECK` directive in the `Dockerfile` calls `curl -fs http://localhost:8000/api/health` every 30 s
- [X] T084 Wire a backend startup check that warns (does not crash) if any of the 4 ONNX models is missing from disk, listing the affected ones; helpful for non-bundled debug builds
- [ ] T085 [P] Run the manual quickstart suite (A1 through A13 + the negative-path probes from `quickstart.md`) on a fresh `docker compose up`, fix any failure, and tick each item
- [ ] T086 [P] Verify SC-003 (slider reactivity ≤ 100 ms) and SC-006 (10 photos under 90 s on 2 vCPU) on the target platform; if either misses, profile and tune the box-blur radius / pool worker count
- [X] T087 [P] Update repo-root `README.md` with a 1-paragraph "What is Stickut", the `docker compose up` quickstart, and a deep-link to `specs/001-v1-stickers-pipeline/quickstart.md` for full validation
- [X] T088 Final sweep: enable `ruff` and `eslint` on CI-equivalent local commands; confirm `npm run build && cd backend && pytest -q || true` (suite empty by design but the harness runs) returns zero errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — can start immediately.
- **Phase 2 (Foundational)**: depends on Phase 1 — BLOCKS all user stories.
- **Phase 3 (US1, P1)**: depends on Phase 2; the MVP. Story 1 is the largest and lays the rails (canvas, SSE wiring, default pack, export) that subsequent stories augment.
- **Phase 4 (US2, P2)**: depends on Phase 3 (extends `pack.ts`, `A4Preview`, `ImageGrid`).
- **Phase 5 (US3, P2)**: depends on Phase 3 (refines `ImageCard` and `App.tsx` orchestration).
- **Phase 6 (US4, P3)**: depends on Phase 3 (extends `ImageCard`).
- **Phase 7 (US5, P3)**: depends on Phase 3 (extends `pack.ts`, `A4Preview`, `compose.ts`).
- **Phase 8 (US6, P4)**: depends on Phase 7 (extends the loader behavior introduced in US5).
- **Phase 9 (Polish)**: depends on Phases 3–8 being functionally complete.

### User Story Dependencies

- **US1 (P1)** is independent — once Phase 2 is done, US1 alone is a shippable MVP.
- **US2, US3, US4, US5** depend on US1's components but each is independently testable on top of US1 (sliders, step labels, before/after, frames).
- **US6** depends on US5 (no point validating drop-in templates if no template UI exists).

### Within Each User Story

- Backend models/routers before frontend wiring (`api.ts`, `sse.ts` typed wrappers).
- Pure logic (`canvas/border.ts`, `canvas/pack.ts`, `canvas/compose.ts`, `svgInject.ts`) before the components that use them.
- Components consuming the store before integration into `App.tsx`.

### Parallel Opportunities

- All `[P]` tasks in Phase 1 can run in parallel (independent file creation).
- All `[P]` tasks in Phase 2 can run in parallel within the backend foundation block, and the frontend foundation block runs entirely in parallel to the backend.
- Within US1: `border.ts`, `pack.ts`, `filename.ts`, `decode.ts`, `ProgressBar.tsx`, `ImageGrid.tsx` can be done in parallel — they touch independent files.
- Within US5: the 7 SVG files (T067) can be authored in parallel; `svgInject.ts` and `FrameSelector.tsx` are independent.
- Phase 9 polish tasks are largely independent across files.

---

## Parallel Example: User Story 1

```bash
# Once Phase 2 is complete, US1 can start. Independent files first:
Task: "Implement border.ts in frontend/src/lib/canvas/border.ts"
Task: "Implement pack.ts in frontend/src/lib/canvas/pack.ts"
Task: "Implement ProgressBar.tsx in frontend/src/components/ProgressBar.tsx"
Task: "Implement ImageGrid.tsx and ImageCard.tsx skeletons"
Task: "Implement filename.ts in frontend/src/lib/filename.ts"

# Backend routes can be authored in parallel:
Task: "Implement upload.py route"
Task: "Implement cutout.py route"
# (process.py SSE wiring depends on the queue dispatcher, so sequential after T038)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete **Phase 1** (Setup).
2. Complete **Phase 2** (Foundational — pool, queue, SSE, store, types).
3. Complete **Phase 3** (US1).
4. **STOP and VALIDATE** with quickstart A1, A2, A3, A9, A12, A13. If those tick, ship the MVP.

### Incremental Delivery

1. Setup + Foundational.
2. Add US1 → quickstart A1/A2/A3/A9/A12/A13 → ship.
3. Add US2 → quickstart A4/A5 → ship.
4. Add US3 → quickstart A11 + negative-path probes → ship.
5. Add US4 → quickstart A2 (mobile zoom) → ship.
6. Add US5 → quickstart A6/A7 → ship.
7. Add US6 → quickstart A8 → ship.
8. Run Phase 9 polish.

### Parallel Team Strategy

With multiple developers, after Phase 2:

- Developer A: US1 backend (T035–T041).
- Developer B: US1 frontend canvas (T045, T046, T047, T032, T031).
- Developer C: US1 frontend components (T042, T043, T044, T048, T049, T050, T051).
- Once US1 is done, US2 / US3 / US4 / US5 can be split across developers.

---

## Notes

- `[P]` tasks have no shared file with their phase peers — safe to parallelise.
- `[Story]` labels exist for US1–US6 only; Setup, Foundational, and Polish phases carry no story label.
- Each user story phase ends in a working, demoable increment.
- Tests are intentionally absent: `quickstart.md` (A1–A13) is the V1 acceptance harness. If TDD is desired, run `/speckit-checklist` to derive tests later.
- Avoid: vague tasks, edits to the same file in parallel, cross-story dependencies that break independence.
