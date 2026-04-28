# Installation

Stickut runs as a single Docker container. The recommended deployment is `docker compose`.

## Prerequisites

- Docker 24+ and `docker compose` plugin
- ~3 GB free disk for the image (multi-stage build with 4 ONNX models pre-downloaded)
- 2+ GB RAM at runtime (more for `birefnet-general` model)

## With docker-compose

Save the following as `docker-compose.yml`:

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
      - STICKUT_BEHIND_PROXY=false
```

Then:

```bash
docker compose up -d
docker compose logs -f stickut
```

Open <http://localhost:8000/>.

## Behind a reverse proxy

Set `STICKUT_BEHIND_PROXY=true` to trust `X-Forwarded-*` headers. Example Nginx Proxy Manager / Traefik:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.stickut.rule=Host(`stickut.your.domain`)"
  - "traefik.http.services.stickut.loadbalancer.server.port=8000"
```

## From source

```bash
git clone https://github.com/sharkhunterr/stickut.git
cd stickut
docker compose up --build -d
```

The first build downloads ONNX models (~700 MB total) and takes 5–10 minutes.

## Updating

```bash
docker compose pull
docker compose up -d
```

The cache (`./cache`) is preserved — already-detoured stickers stay cached across versions.

## Uninstalling

```bash
docker compose down
rm -rf cache/ tmp/
```
