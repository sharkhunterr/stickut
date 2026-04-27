# SSE Event Schema — `/api/process/stream/{task_id}`

**Date**: 2026-04-27
**Branch**: `001-v1-stickers-pipeline`

The endpoint emits Server-Sent Events. The frontend uses the browser's
native `EventSource`. The connection is kept alive with a `:` comment
every 15 seconds. All event payloads are JSON, all string content is in
French where it's user-facing (per FR-048).

## Event types

### `image_started`

Emitted when an image leaves the FIFO queue and a worker begins
processing it.

```json
{
  "image_id": "f81b…",
  "name": "leon-velo.heic",
  "step": "Décodage"
}
```

| Field | Type | Notes |
|---|---|---|
| `image_id` | string (UUID) | matches `UploadedImageOut.id` |
| `name` | string | original filename, for log/UI traceability |
| `step` | enum | always `Décodage` for this event |

---

### `image_progress`

Emitted on each step transition, **including periodic re-emits while in
the `En attente` step** (every 10 s, to satisfy SC-008).

```json
{
  "image_id": "f81b…",
  "step": "Détourage IA"
}
```

Steps emitted by the server: `En attente`, `Décodage`, `Détourage IA`.
Frontend-only steps (`Génération du contour`, `Mise en page`, `Terminé`)
are NOT emitted by the server — the frontend transitions to them after
receiving the cutout.

---

### `image_done`

Emitted when the cutout is written to disk (or already existed in cache).

```json
{
  "image_id": "f81b…",
  "cutout_url": "/api/cutout/9f2c…?model=birefnet-general"
}
```

After this event, the frontend takes over: it fetches the cutout PNG,
runs the white-border pipeline (`Génération du contour`), and integrates
the sticker into the layout (`Mise en page`).

---

### `image_failed`

Emitted on any per-image failure. Other images continue (FR-025).

```json
{
  "image_id": "f81b…",
  "error": "Format non supporté ou fichier corrompu."
}
```

The `error` string is a French, user-displayable message. Specific cases:

| Cause | `error` |
|---|---|
| Décodage Pillow KO | `"Image illisible ou corrompue."` |
| Modèle ONNX échec | `"Échec du détourage. Réessayez avec un autre modèle."` |
| Disque plein | `"Espace disque insuffisant côté serveur."` |
| Inconnu | `"Erreur interne lors du traitement."` |

---

### `complete`

Emitted exactly once at the end of the task, just before the server
closes the SSE connection.

```json
{
  "processed": 9,
  "failed": 1
}
```

`processed + failed === total submitted`. After this event, the client
SHOULD close the EventSource.

---

## Connection lifecycle

1. Client opens `EventSource('/api/process/stream/{task_id}')`.
2. Server flushes initial `:` keep-alive and the first `image_started`
   or `image_progress` event already buffered (if any).
3. Server emits per-image events until all images are in a terminal
   state (`Terminé` or `Échec`).
4. Server emits `complete` and closes.
5. If the client disconnects mid-stream, the server detects the
   disconnect on next write attempt and tears down the subscription. The
   underlying processing continues — the cutouts will land in cache and
   be available via `/api/cutout/{hash}` on next visit.

## Ordering guarantees

- Per-image events are strictly ordered: an image's `image_started`
  always precedes its `image_progress`/`image_done`/`image_failed`.
- Across images, ordering follows the FIFO queue. Two images can produce
  interleaved events (worker pool > 1).
- The `complete` event is the last event of the stream.

## Examples

### Happy path (3 images, no cache hits, 2 workers)

```
:
event: image_started
data: {"image_id":"a1","name":"chat.jpg","step":"Décodage"}

event: image_started
data: {"image_id":"a2","name":"chien.png","step":"Décodage"}

event: image_progress
data: {"image_id":"a3","step":"En attente"}

event: image_progress
data: {"image_id":"a1","step":"Détourage IA"}

event: image_done
data: {"image_id":"a1","cutout_url":"/api/cutout/abc…?model=birefnet-general"}

event: image_started
data: {"image_id":"a3","name":"vache.heic","step":"Décodage"}

event: image_progress
data: {"image_id":"a2","step":"Détourage IA"}

event: image_done
data: {"image_id":"a2","cutout_url":"/api/cutout/def…?model=birefnet-general"}

event: image_progress
data: {"image_id":"a3","step":"Détourage IA"}

event: image_done
data: {"image_id":"a3","cutout_url":"/api/cutout/123…?model=birefnet-general"}

event: complete
data: {"processed":3,"failed":0}
```

### One failure

```
event: image_started
data: {"image_id":"b1","name":"corrompu.jpg","step":"Décodage"}

event: image_failed
data: {"image_id":"b1","error":"Image illisible ou corrompue."}

event: complete
data: {"processed":0,"failed":1}
```
