# Docker Deployment

## Image

- **Docker Hub:** [`sharkhunterr/stickut`](https://hub.docker.com/r/sharkhunterr/stickut)
- Tags: `latest` (auto-updated), `vX.Y.Z` (pinned)
- Size: ~2.5 GB (4 ONNX models pre-baked)
- Architecture: `linux/amd64`

## Minimal compose

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
```

## Production compose (with reverse proxy + LAN access)

```yaml
services:
  stickut:
    image: sharkhunterr/stickut:latest
    container_name: stickut
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - /opt/stickut/cache:/app/cache
      - /opt/stickut/tmp:/app/tmp
    environment:
      - STICKUT_DEFAULT_MODEL=isnet-general-use
      - STICKUT_REMBG_WORKERS=2
      - STICKUT_BEHIND_PROXY=true
      - STICKUT_ENABLE_SEARCH=true
      - STICKUT_PIXABAY_API_KEY=YOUR_KEY_HERE
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

## Build locally

```bash
git clone https://github.com/sharkhunterr/stickut.git
cd stickut
docker compose up --build -d
```

## Logs & ops

```bash
docker compose logs -f stickut             # follow logs
docker compose restart stickut             # restart
docker compose down                         # stop + remove
docker compose pull && docker compose up -d # update
docker compose exec stickut sh             # shell into the container
```

## Volumes

| Path inside container | Host mount example | Purpose |
|---|---|---|
| `/app/cache` | `./cache` or `/opt/stickut/cache` | Detoured sticker PNG cache (long-lived). |
| `/app/tmp` | `./tmp` or `/opt/stickut/tmp` | Per-session upload temp files (auto-purged). |
| `/app/templates` | _(optional)_ | Override the bundled SVG frame templates. |

## Networking

The container exposes port **8000** (HTTP). Bind it to the host port of your choice. The frontend is served from the same port as the API; no CORS dance.

For LAN access, use `0.0.0.0` binding (default) and point any device at `http://<host-ip>:8000/`.

## Resource sizing

| Component | Idle | Peak (single rembg call) |
|---|---|---|
| RAM | ~600 MB | ~2.5 GB with `birefnet-general` ; ~1 GB with `isnet-general-use` |
| CPU | <1% | 100% per worker during inference |
| Disk | ~2.5 GB image + cache (~500 KB / sticker) | — |

For low-RAM hosts (≤4 GB), set `STICKUT_REMBG_WORKERS=1` and avoid `birefnet-general`.

## Troubleshooting

- **0 % stuck at start**: probably the first inference of `birefnet-general` (slow on CPU). Switch to `isnet-general-use` in settings.
- **OOM during second image**: reduce workers to 1 or switch to a lighter model.
- **No image returned by search**: check `docker logs stickut` for `STICKUT_ENABLE_SEARCH` toggle and provider availability.
- **Black holes in detoured image**: the white-on-white case — Stickut's hole-filling should handle it ; if not, switch to `birefnet-general` for that image.
