"""GET /api/health — service status probe."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.models import HealthResponse
from app.runtime_config import effective_search_settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    runner = request.app.state.runner
    cache = request.app.state.cache
    settings = request.app.state.settings
    runtime = request.app.state.runtime_config
    enabled, key = effective_search_settings(settings, runtime)
    provider = ("pixabay" if key else "openverse") if enabled else None
    return HealthResponse(
        models_loaded=list(runner.loaded_models),
        cache_size_mb=cache.size_mb(),
        search_enabled=enabled,
        search_provider=provider,
    )
