"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.cutout.cache import CutoutCache
from app.cutout.runner import CutoutRunner
from app.progress.pubsub import TaskBus
from app.progress.queue import CutoutQueue
from app.routes import cutout, health, process, templates, upload
from app.sessions.tmp import SessionStore
from app.utils.images import register_decoders

logger = logging.getLogger("stickut")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    register_decoders()

    settings.cutouts_dir.mkdir(parents=True, exist_ok=True)
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)

    runner = CutoutRunner(max_workers=settings.effective_workers)
    runner.start()

    _warn_missing_models()

    cache = CutoutCache(settings.cutouts_dir)
    bus = TaskBus()
    queue = CutoutQueue(runner=runner, cache=cache, bus=bus)
    queue.start()

    sessions = SessionStore(root=settings.tmp_dir, ttl_seconds=settings.tmp_ttl_seconds)
    import asyncio  # local to avoid global

    purge_task = asyncio.create_task(sessions.purge_loop(), name="session-purge")

    app.state.settings = settings
    app.state.runner = runner
    app.state.cache = cache
    app.state.bus = bus
    app.state.queue = queue
    app.state.sessions = sessions

    logger.info("Stickut ready (model=%s, workers=%d)", settings.default_model, settings.effective_workers)
    try:
        yield
    finally:
        purge_task.cancel()
        try:
            await purge_task
        except (Exception, BaseException):
            pass
        await queue.stop()
        runner.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Stickut",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    if settings.behind_proxy:
        # Trust X-Forwarded-* from the upstream reverse proxy.
        from starlette.middleware.trustedhost import TrustedHostMiddleware  # noqa: F401

        # uvicorn already has --proxy-headers; we just whitelist hosts.
        # (No extra middleware needed for SSE to work with Authentik.)

    # Permissive CORS in dev only; in prod the SPA is served from the same origin.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix="/api", tags=["health"])
    app.include_router(upload.router, prefix="/api", tags=["upload"])
    app.include_router(process.router, prefix="/api", tags=["process"])
    app.include_router(cutout.router, prefix="/api", tags=["cutout"])
    app.include_router(templates.router, prefix="/api", tags=["templates"])

    if STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="spa")

    return app


def _warn_missing_models() -> None:
    """Soft check: warn (don't crash) when expected ONNX files aren't on disk."""
    import os

    home = Path(os.environ.get("U2NET_HOME", str(Path.home() / ".u2net")))
    expected = ["birefnet-general", "isnet-general-use", "u2net", "isnet-anime"]
    missing: list[str] = []
    for name in expected:
        # rembg uses {U2NET_HOME}/{name}.onnx for most models.
        candidate = home / f"{name}.onnx"
        if not candidate.is_file():
            missing.append(name)
    if missing:
        logger.warning(
            "ONNX models not found on disk: %s (expected at %s). They will be downloaded on first use, "
            "which violates the constitutional 'no runtime network' rule. Rebuild the image to bundle them.",
            ", ".join(missing),
            home,
        )


app = create_app()
