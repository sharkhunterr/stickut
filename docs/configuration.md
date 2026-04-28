# Configuration

All runtime configuration is done via `STICKUT_*` environment variables and an in-app settings drawer (gear icon top-right).

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `STICKUT_DEFAULT_MODEL` | `birefnet-general` | Default rembg model. Recommended: `isnet-general-use`. |
| `STICKUT_REMBG_WORKERS` | `2` | Concurrent rembg workers. Set to `1` if you OOM. |
| `STICKUT_MAX_FILE_SIZE_MB` | `20` | Per-file upload cap. |
| `STICKUT_MAX_FILES_PER_SESSION` | `50` | Per-session image cap. |
| `STICKUT_TMP_TTL_SECONDS` | `3600` | Session temp file TTL (1 h default). |
| `STICKUT_PORT` | `8000` | Listening port (mostly for non-Docker deployments). |
| `STICKUT_BEHIND_PROXY` | `false` | Trust `X-Forwarded-*` headers from a reverse proxy. |
| `STICKUT_ENABLE_SEARCH` | `false` | Enable the online image search panel. |
| `STICKUT_PIXABAY_API_KEY` | _(empty)_ | Activate the Pixabay provider. Free key at <https://pixabay.com/api/docs/>. |
| `STICKUT_SEARCH_TIMEOUT_SECONDS` | `10` | Timeout for outbound search/import HTTP calls. |

## Cutout models

| Model | Size | Speed (CPU) | Best for |
|---|---|---|---|
| `birefnet-general` | ~430 MB | 30–90 s/img | Highest quality (transformer); good for tricky subjects. |
| `isnet-general-use` | ~170 MB | 3–6 s/img | **Recommended default** — balanced speed and quality. |
| `u2net` | ~170 MB | 2–4 s/img | Fastest; quality slightly below ISNet. |
| `isnet-anime` | ~170 MB | 3–5 s/img | Tuned for anime / illustrations. |

The model is also user-selectable per-session in the settings drawer; the env var controls the default for new sessions.

## Online image search

Two ways to enable:

1. **Via env var (locked in UI):** set `STICKUT_ENABLE_SEARCH=true` in your compose file.
2. **Via UI (persisted to `cache/runtime-config.json`):** click the gear icon → "Recherche d'images en ligne" → toggle the switch.

### Providers

| Provider | API key | Best for |
|---|---|---|
| **Pixabay** | required (free) | Curated illustrations / vectors / photos. Filter by image type. |
| **Iconify** | none | 200k+ open-source icons (Phosphor, Tabler, Game-Icons…). |
| **Wikimedia Commons** | none | 100M items, mostly photos/illustrations, CC variable. |
| **Openverse** | none | 600M items aggregated from CC sources. |

Without a Pixabay key the panel falls back to the three keyless providers. Enter the Pixabay key in the settings drawer (it's stored in `cache/runtime-config.json`, only ever sent server-side, never reaches the browser).

## Behind a reverse proxy

`STICKUT_BEHIND_PROXY=true` is required for SSE + correct origin reporting when fronted by Nginx Proxy Manager, Traefik, or Authentik. The frontend is served from the same origin as the API by default — no CORS configuration needed.

## Persistence

| Mount | Content | Lifetime |
|---|---|---|
| `/app/cache` | Detoured PNG cache (indexed by `<hash>_<model>.png`) and `runtime-config.json` | Long-lived; survives restarts and image updates. |
| `/app/tmp` | Per-session uploaded files | Auto-purged after `STICKUT_TMP_TTL_SECONDS`. |
| `/app/templates` | Optional override of bundled SVG frame templates | Long-lived. |
