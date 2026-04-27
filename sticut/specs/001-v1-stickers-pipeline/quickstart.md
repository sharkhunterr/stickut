# Quickstart — Stickut V1

**Date**: 2026-04-27
**Branch**: `001-v1-stickers-pipeline`

How to bring Stickut V1 up locally and validate the V1 acceptance
criteria from the spec. This document is the manual smoke test that
replaces a Playwright suite for V1.

---

## Prerequisites

- Docker 24+ and `docker compose` plugin.
- ~1.5 Go free disk for the image and the bundled ONNX models.
- A handful of test images:
  - 5 JPEG photos from any smartphone (mixed orientations, sujets variés).
  - 1 HEIC photo straight from an iPhone (no conversion).
  - 1 PNG with alpha (already cut out).
  - 1 deliberately corrupt JPEG (e.g. truncate one with `dd`).

---

## Bring it up

```bash
git clone <repo> stickut && cd stickut
cp .env.example .env
docker compose up --build
```

The first build downloads 4 ONNX models (~700 Mo cumulative) at the
**model bundle stage** of the multi-stage Dockerfile. Subsequent builds
are cached.

When the container is ready you should see:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     stickut.startup: 7 templates loaded from /app/templates
INFO:     stickut.cutout: pool ready (workers=2, default=birefnet-general)
```

Open `http://localhost:8000` (or your reverse-proxied URL).

---

## V1 acceptance walk-through

Tick each item; each one maps to a criterion in `spec.md`.

### A1 — 10 hétérogènes JPEG

1. Drop 10 JPEG files into the upload zone.
2. Click "Lancer le traitement".
3. **Expect**: each card transitions through `Décodage` → `Détourage IA`
   → `Terminé`. Aperçu A4 builds up live. No card stays stuck.

→ matches **SC-001**, **SC-006**, criterion `[ ] Upload de 10 images JPEG hétérogènes`.

### A2 — HEIC iPhone

1. Drop one HEIC straight from an iPhone.
2. Run treatment.
3. **Expect**: traitement réussi, cutout RGBA correct dans la vignette
   "après". Pas de message d'erreur.

→ matches `[ ] Upload d'une HEIC iPhone`.

### A3 — PNG déjà transparente

1. Drop one PNG with > 5 % transparent pixels.
2. Run treatment.
3. **Expect**: SSE saute directement à `Terminé` sans passer par
   `Détourage IA` (R4). Le cutout est l'image source. Le contour blanc
   apparaît dans la vignette "après".

→ matches `[ ] Upload d'une PNG déjà transparente`.

### A4 — Slider épaisseur de contour

1. With at least one cutout ready, move the contour thickness slider.
2. **Expect**: every "après" thumbnail and the A4 preview update under
   100 ms (perçu). No flicker.

→ matches **SC-003**, criterion `[ ] Slider épaisseur de contour réagit en <100ms`.

### A5 — Mode taille fixe puis plage

1. With ~8 cutouts ready, ensure mode "Taille fixe" 50 mm: tous les
   stickers font 50 mm sur leur côté long, layout régulier.
2. Switch to "Plage" 30–60 mm: layout instantanément ré-agencé, tailles
   visiblement variées, meilleur remplissage.

→ matches `[ ] Mode taille fixe puis plage`.

### A6 — Cadre + couleur + titre

1. Open the frame selector.
2. Choose `stars-confetti` (or any other).
3. Pick a magenta color in the picker.
4. Type "Anniversaire Léa" in the header field.
5. **Expect**: A4 preview updates < 100 ms; all `frame-color` elements
   are now magenta; the header text replaces the placeholder; emptying
   the header makes it disappear.

→ matches `[ ] Sélection cadre + changement couleur + saisie titre`.

### A7 — Test des 7 templates fournis

For each of the 7 V1 templates, repeat A6 briefly and confirm:
- Color picker actually changes the colorable elements.
- Header text appears in the right place (when supported).
- The `sticker-area` correctly constrains the packer (no sticker
  overlaps the decorative perimeter).

→ matches `[ ] Test des 7 templates fournis`.

### A8 — Hot-reload d'un template ajouté

1. From a host shell on the docker host:
   `cp my-test.svg ./templates/`
   where `my-test.svg` is the minimal example from
   `contracts/svg-template.md`.
2. In the browser, close and re-open the frame selector (or refresh).
3. **Expect**: `Minimal` appears in the list, fully functional.
4. Now `cp ./templates/broken.svg ./templates/` with broken XML.
5. **Expect**: not in the list; backend logs a `WARNING` line citing
   the file.

→ matches **SC-010**, criterion `[ ] Ajout d'un nouveau SVG dans /templates/`.

### A9 — Export & Cricut

1. With ≥ 1 sticker ready and a frame active, click "Exporter A4".
2. **Expect**: a file `stickut_AAAA-MM-JJ_HHMM.png` downloads.
3. Open it in Cricut Design Space.
4. Send it as a Print Then Cut project.
5. **Expect**: Cricut recognises it as "Complex" type, cut contour
   matches the white silhouettes.

→ matches **SC-005**, criterion `[ ] Export A4 ouvert dans Cricut Design Space`.

### A10 — Mobile Chrome (Android et iOS)

On a phone (Chrome iOS + Chrome Android), via the same URL:

1. Tap "Sélectionner des images" and pick from the camera roll.
2. Run treatment, watch progress.
3. Move sliders one at a time.
4. Pinch-zoom into a thumbnail.
5. Tap "Exporter A4" and verify the PNG appears in Downloads.

→ matches **SC-012**, criterion `[ ] Mobile Chrome (Android & iOS)`.

### A11 — Session de 20 images

1. Drop 20 mixed images. Run.
2. **Expect**: `X / 20` global progress monotonic ; jamais figé > 30 s
   sans nouvel événement (les images en file reçoivent leur
   `image_progress` `En attente` régulièrement).
3. If one image fails, others continue.

→ matches **SC-008**, **SC-009**.

### A12 — Cache hit

1. Re-run treatment for the same 10 JPEG of A1, same model.
2. **Expect**: processing finishes in **< 2 s wall-clock** (cache hits).
   Front goes straight to `Terminé` for each (no `Détourage IA`).

→ matches **SC-002**, criterion `[ ] Cache: 2e upload de la même image`.

### A13 — Cold boot < 2 min

1. `docker compose down` then `docker compose up`.
2. Time the seconds until `http://localhost:8000` returns 200 with the
   SPA loaded and `/api/health` returns models loaded.
3. **Expect**: < 120 s.

→ matches **SC-007**, criterion `[ ] docker compose up sur machine vierge`.

---

## Negative-path probes

| Action | Expected response |
|---|---|
| Drop a `.svg` file | 415 + `"Format de fichier non supporté."` |
| Drop a 30 Mo JPEG (> 20 Mo) | 413 + `"Fichier trop volumineux."` |
| Drop a corrupt JPEG | upload OK, then SSE `image_failed` with `"Image illisible ou corrompue."`. Other images proceed. |
| `POST /api/process` with bogus `session_id` | 404 + `"Session expirée ou inexistante."` |
| `GET /api/cutout/<not-hex>` | 422 (FastAPI validation) |
| Drop a malformed SVG into `templates/` | does not appear in `/api/templates`, warning in logs |

---

## Cleanup

```bash
docker compose down            # keeps cache + tmp
docker volume rm stickut_cache # nukes detourage cache
rm -rf ./tmp                   # nukes uploads
```

---

## Health check

`GET /api/health` is the always-available probe used by Docker
healthcheck and by Authentik's upstream health monitor:

```json
{
  "status": "ok",
  "models_loaded": ["birefnet-general", "isnet-general-use", "u2net", "isnet-anime"],
  "cache_size_mb": 12.4
}
```
