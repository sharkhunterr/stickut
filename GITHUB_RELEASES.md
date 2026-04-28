# GitHub Releases — Stickut

> Release notes for GitHub releases. The most recent version goes at the top;
> the GitLab CI extracts the first `## …` block as the release body.

---

# v1.0.0

## ✂️ Stickut v1.0.0 — Sticker Sheet Generator for Cricut Print Then Cut

The first public release of Stickut, a self-hosted, no-telemetry tool that turns your photos into a printable A4 (or any other size) of cut-around stickers for **Cricut Print Then Cut** machines.

### ✨ What it does

**🖼️ Background removal pipeline**
- Drop any photo (JPEG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP, TIFF) — the backend detours the subject with [rembg](https://github.com/danielgatis/rembg) running fully offline.
- Four ONNX models pre-baked into the image: `birefnet-general` (highest quality), `isnet-general-use` (recommended), `u2net` (fastest), `isnet-anime` (cartoon / illustrations).
- Hole-filling post-process: white animals on white backgrounds keep their fur, no more transparent gaps inside the subject.
- White contour generated client-side at the chosen thickness — that's the line the Cricut blade follows.

**🧩 Interactive A4 layout**
- Auto-pack via [maxrects-packer](https://github.com/soimy/maxrects-packer), then drag / rotate / resize each sticker individually in the preview.
- Per-sticker undo / redo / reset to auto-pack.
- Duplicate count per image (×1 to ×99) — every copy is independently positionable.

**📐 Configurable sheet size**
- Standard formats out of the box: A4, A3, A5, A6, US Letter, US Legal, **Cricut PTC mat (165×235 mm)**, business card, or fully custom dimensions.
- Optional decorative frame template (SVG) injected behind the stickers, with color and header-text customisation.

**📦 Two export modes**
- **Composite PNG** at 300 DPI on the chosen page size — ready to drop into Cricut Design Space as a Print Then Cut import.
- **ZIP archive** — one transparent PNG per sticker (rotation baked in, dimensions in mm exact at 300 DPI), the frame separately as SVG + PNG, plus a `layout.json` with the placement metadata. Workflow: upload each PNG individually in Cricut DS → "Make this a Sticker" → choose Kiss Cut / Die Cut / Cut Around.

**🔍 Online image search (opt-in)**
- Search bar with tabs for **Pixabay** (illustrations / vectors / photos, requires a free API key), **Iconify** (200k icons), **Wikimedia Commons** (100M items, CC), and **Openverse** (600M items, CC). All routed through the backend so no key leaks to the browser.
- Click a result → backend downloads the image, validates it (magic bytes, size cap), and feeds it into the same cutout pipeline as a normal upload.
- Toggle and Pixabay key are configurable from the in-app settings drawer (gear icon top-right) and persisted across container restarts under `cache/runtime-config.json`.

**🧰 Self-hosted, sane defaults**
- Single Docker image, two volume mounts (`cache/` and `tmp/`), zero runtime network calls unless you enable search.
- Server-Sent Events for progress with a per-task replay buffer + 2-second heartbeat — no more "stuck at 0 %".
- Pre-flight magic-byte validation on uploads, hard cap on file size and per-session count, automatic purge of session temp files after configurable TTL.

### 🐳 Docker Quick Start

```yaml
services:
  stickut:
    image: sharkhunterr/stickut:latest
    container_name: stickut
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./cache:/app/cache
      - ./tmp:/app/tmp
    environment:
      - STICKUT_DEFAULT_MODEL=isnet-general-use
      - STICKUT_REMBG_WORKERS=1
      # - STICKUT_ENABLE_SEARCH=true
      # - STICKUT_PIXABAY_API_KEY=your-key-here
```

Open http://localhost:8000/ → drop images → adjust → export.

### 🛠️ Technical Stack

| Layer | Technologies |
|---|---|
| Backend | Python 3.12, FastAPI, uvicorn, rembg (ONNX), Pillow, scipy |
| Frontend | React 18, TypeScript 5, Tailwind 3, Zustand, Vite |
| Layout | maxrects-packer (auto-pack) + custom override + history (undo/redo) |
| Export | Canvas2D @ 300 DPI, fflate (ZIP), SVG injection (color + header) |
| DevOps | Docker (multi-stage), GitLab CI/CD, Docker Hub, GitHub mirror |

### 🔗 Links

- [🐳 Docker Hub](https://hub.docker.com/r/sharkhunterr/stickut)
- [📖 Documentation](https://github.com/sharkhunterr/stickut/tree/main/docs)
- [🐛 Report Issues](https://github.com/sharkhunterr/stickut/issues)

### ⚠️ Known limitations

- Cricut Print Then Cut max printable area is ~165×235 mm — use the dedicated "Cricut PTC" page format to avoid getting the import truncated.
- The Sticker → Kiss Cut / Die Cut menu in Cricut Design Space only appears when each sticker is uploaded as its own image. Use the **ZIP export** for that workflow.
- All processing is CPU-bound; first inference of `birefnet-general` takes 30–90 s. `isnet-general-use` is the sane default at ~3–6 s per image.

---
