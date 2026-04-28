# ✂️ Stickut — Sticker Sheet Generator for Cricut Print Then Cut

[![GitHub](https://img.shields.io/github/v/tag/sharkhunterr/stickut?label=version&color=blue)](https://github.com/sharkhunterr/stickut/releases)
[![Docker Pulls](https://img.shields.io/docker/pulls/sharkhunterr/stickut?color=2496ED)](https://hub.docker.com/r/sharkhunterr/stickut)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/sharkhunterr/stickut/blob/main/LICENSE)

**Self-hosted, no-telemetry sticker sheet generator** — turn photos into a printable A4 (or any other size) of cut-around stickers ready for Cricut Print Then Cut, with online image search and an interactive A4 layout editor.

---

## 🚀 Quick Start

```yaml
services:
  stickut:
    image: sharkhunterr/stickut:latest
    container_name: stickut
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./cache:/app/cache    # detoured stickers (PNG cache)
      - ./tmp:/app/tmp        # per-session uploaded files (auto-purged)
    environment:
      - STICKUT_DEFAULT_MODEL=isnet-general-use   # birefnet-general | isnet-general-use | u2net | isnet-anime
      - STICKUT_REMBG_WORKERS=1                   # 1 sur CPU faible / RAM limitée
      - STICKUT_BEHIND_PROXY=false
      # Optionnel : recherche d'images en ligne
      # - STICKUT_ENABLE_SEARCH=true
      # - STICKUT_PIXABAY_API_KEY=your-key-here
```

Then:

```bash
docker compose up -d
```

Open <http://localhost:8000/> → drop images → adjust placement / rotation / size → export.

---

## ✨ Features

- 🖼️ **Background removal** with [rembg](https://github.com/danielgatis/rembg) — 4 ONNX models pre-baked into the image, runs fully offline.
- 🧩 **Interactive A4 editor** — drag, rotate, resize each sticker, undo / redo, reset to auto-pack.
- 📐 **Configurable page size** — A4, A3, A5, A6, US Letter / Legal, **Cricut PTC mat (165×235 mm)**, business card, or custom.
- 🔁 **Per-image duplicate count** — place ×3, ×5… of the same sticker.
- 📦 **Two export modes** — composite PNG @ 300 DPI, or ZIP with one PNG per sticker (Cricut Sticker workflow).
- 🔍 **Online image search** (opt-in) — Pixabay, Iconify, Wikimedia Commons, Openverse, all proxied through the backend.
- 🎨 **Decorative frames** with color + header-text customisation (SVG templates).

## 🛠️ Configuration

| Variable | Default | Description |
|---|---|---|
| `STICKUT_DEFAULT_MODEL` | `birefnet-general` | rembg model used by default |
| `STICKUT_REMBG_WORKERS` | `2` | Concurrent rembg workers (1 si peu de RAM) |
| `STICKUT_MAX_FILE_SIZE_MB` | `20` | Per-file upload cap |
| `STICKUT_MAX_FILES_PER_SESSION` | `50` | Session cap |
| `STICKUT_TMP_TTL_SECONDS` | `3600` | Session temp file TTL |
| `STICKUT_BEHIND_PROXY` | `false` | Trust X-Forwarded-* headers |
| `STICKUT_ENABLE_SEARCH` | `false` | Activer la recherche en ligne |
| `STICKUT_PIXABAY_API_KEY` | _(empty)_ | Active le provider Pixabay (clé gratuite sur pixabay.com/api/docs) |
| `STICKUT_SEARCH_TIMEOUT_SECONDS` | `10` | Timeout HTTP des appels de recherche |

## 📁 Volumes

- `/app/cache` — detoured PNG cache (long-lived, indexé par hash + modèle)
- `/app/tmp` — fichiers uploadés en session (auto-purge après TTL)
- `/app/templates` — *(optional)* override des cadres SVG fournis

## 🔗 Links

- [📖 Documentation](https://github.com/sharkhunterr/stickut/tree/main/docs)
- [🐛 Report Issues](https://github.com/sharkhunterr/stickut/issues)
- [📋 GitHub Repo](https://github.com/sharkhunterr/stickut)
