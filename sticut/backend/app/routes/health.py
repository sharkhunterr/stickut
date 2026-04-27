"""GET /api/health — service status probe."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.models import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    runner = request.app.state.runner
    cache = request.app.state.cache
    return HealthResponse(
        models_loaded=list(runner.loaded_models),
        cache_size_mb=cache.size_mb(),
    )
