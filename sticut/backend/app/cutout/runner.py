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


def _detour_sync(image_path: str, model: str, alpha_matting: bool) -> bytes:
    """Run rembg in the worker process. Returns PNG bytes (RGBA)."""
    from rembg import remove  # imported inside worker to avoid main-process load

    session = _get_session(model)
    src_bytes = Path(image_path).read_bytes()
    kwargs: dict[str, Any] = {"session": session}
    if alpha_matting:
        kwargs["alpha_matting"] = True
        kwargs["alpha_matting_foreground_threshold"] = 240
        kwargs["alpha_matting_background_threshold"] = 10
        kwargs["alpha_matting_erode_size"] = 10
    out = remove(src_bytes, **kwargs)
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    # remove() can also return a PIL image when given one — normalise to PNG bytes.
    from PIL import Image  # local import for typing only

    if isinstance(out, Image.Image):
        buf = io.BytesIO()
        out.convert("RGBA").save(buf, format="PNG")
        return buf.getvalue()
    raise TypeError(f"Unexpected rembg output: {type(out)!r}")


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
