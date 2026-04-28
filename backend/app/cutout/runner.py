"""rembg ProcessPoolExecutor wrapper.

Each worker lazy-loads and reuses ONNX sessions per model name. The pool
is exposed to async code via `loop.run_in_executor`.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

logger = logging.getLogger("stickut.runner")

_WORKER_SESSIONS: dict[str, Any] = {}


def _worker_init() -> None:
    # Pillow plugins must be re-registered inside each worker process.
    try:
        import pillow_heif  # type: ignore[import-not-found]

        pillow_heif.register_heif_opener()
    except Exception:
        pass
    try:
        import pillow_avif  # type: ignore[import-not-found]  # noqa: F401
    except Exception:
        pass


def _get_session(model: str) -> Any:
    sess = _WORKER_SESSIONS.get(model)
    if sess is None:
        from rembg import new_session

        sess = new_session(model)
        _WORKER_SESSIONS[model] = sess
    return sess


def _fill_alpha_holes(png_bytes: bytes, original_path: str) -> bytes:
    """Bouche les trous internes du masque alpha en restaurant les RGB d'origine.

    rembg (surtout isnet/u2net) regarde la couleur : si l'intérieur du sujet
    a la même teinte que le fond, des "trous" de transparence apparaissent au
    milieu du sujet. On détecte ces trous via scipy.ndimage.binary_fill_holes
    puis :
      - alpha → 255
      - RGB → couleur du pixel correspondant dans l'image source
        (rembg met RGB=0 dans les zones masquées, on doit donc les recoller).
    """
    import numpy as np
    from PIL import Image
    from scipy.ndimage import binary_fill_holes

    out_img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    out_arr = np.array(out_img)
    alpha = out_arr[:, :, 3]
    # Seuil > 16 plutôt que > 0 : avec alpha matting (bords flous), de minuscules
    # halos résiduels créent des "îlots" qui empêchent fill_holes de boucher.
    mask = alpha > 16
    filled = binary_fill_holes(mask)
    holes = filled & ~mask
    if not holes.any():
        return png_bytes

    # Recharge l'original pour lire les RGB des pixels-trous.
    src = Image.open(original_path).convert("RGB")
    if src.size != out_img.size:
        # rembg conserve les dimensions, mais au cas où.
        src = src.resize(out_img.size, Image.LANCZOS)
    src_arr = np.array(src)

    out_arr[holes, 0] = src_arr[holes, 0]
    out_arr[holes, 1] = src_arr[holes, 1]
    out_arr[holes, 2] = src_arr[holes, 2]
    out_arr[holes, 3] = 255

    buf = io.BytesIO()
    Image.fromarray(out_arr, mode="RGBA").save(buf, format="PNG")
    return buf.getvalue()


def _detour_sync(image_path: str, model: str, alpha_matting: bool) -> bytes:
    """Run rembg in the worker process. Returns PNG bytes (RGBA)."""
    import time as _time
    print(f"[worker] detour.begin pid={os.getpid()} model={model} path={image_path}", flush=True)
    from rembg import remove  # imported inside worker to avoid main-process load

    t_session = _time.time()
    session = _get_session(model)
    print(f"[worker] session ready model={model} elapsed={_time.time()-t_session:.2f}s", flush=True)
    src_bytes = Path(image_path).read_bytes()
    print(f"[worker] read input bytes={len(src_bytes)}", flush=True)
    kwargs: dict[str, Any] = {"session": session}
    if alpha_matting:
        kwargs["alpha_matting"] = True
        kwargs["alpha_matting_foreground_threshold"] = 240
        kwargs["alpha_matting_background_threshold"] = 10
        kwargs["alpha_matting_erode_size"] = 10
    t_remove = _time.time()
    out = remove(src_bytes, **kwargs)
    print(f"[worker] rembg.remove done elapsed={_time.time()-t_remove:.2f}s", flush=True)

    # Normaliser la sortie en PNG bytes.
    if isinstance(out, (bytes, bytearray)):
        png = bytes(out)
    else:
        from PIL import Image  # local import
        if isinstance(out, Image.Image):
            buf = io.BytesIO()
            out.convert("RGBA").save(buf, format="PNG")
            png = buf.getvalue()
        else:
            raise TypeError(f"Unexpected rembg output: {type(out)!r}")

    # Post-traitement : combler les trous internes (cf. _fill_alpha_holes).
    t_fill = _time.time()
    try:
        png = _fill_alpha_holes(png, image_path)
    except Exception as e:
        print(f"[worker] fill_holes FAILED ({e!r}) — keeping rembg output", flush=True)
    print(f"[worker] fill_holes done elapsed={_time.time()-t_fill:.2f}s", flush=True)
    return png


class CutoutRunner:
    """Async-friendly wrapper around a fixed ProcessPoolExecutor."""

    def __init__(self, max_workers: int) -> None:
        self.max_workers = max_workers
        self._pool: ProcessPoolExecutor | None = None
        self._loaded_models: set[str] = set()

    def start(self) -> None:
        if self._pool is None:
            cpu = os.cpu_count() or 1
            workers = max(1, min(self.max_workers, cpu))
            logger.info("Starting rembg pool: %d worker(s)", workers)
            self._pool = ProcessPoolExecutor(max_workers=workers, initializer=_worker_init)

    def stop(self) -> None:
        if self._pool is not None:
            logger.info("Shutting down rembg pool")
            self._pool.shutdown(wait=False, cancel_futures=True)
            self._pool = None

    @property
    def loaded_models(self) -> list[str]:
        return sorted(self._loaded_models)

    async def detour(self, image_path: Path, model: str, alpha_matting: bool = False) -> bytes:
        if self._pool is None:
            raise RuntimeError("CutoutRunner not started")
        loop = asyncio.get_running_loop()
        png = await loop.run_in_executor(
            self._pool, _detour_sync, str(image_path), model, alpha_matting
        )
        self._loaded_models.add(model)
        return png
