"""GET /api/cutout/{hash} and POST /api/cache/clear."""

from __future__ import annotations

import re

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.errors import fr_error
from app.models import CacheClearResponse

router = APIRouter()

_HASH_RE = re.compile(r"^[a-f0-9]{64}$")
_MODELS = {"birefnet-general", "isnet-general-use", "u2net", "isnet-anime", "passthrough"}


@router.get("/cutout/{image_hash}")
async def get_cutout(request: Request, image_hash: str, model: str | None = None) -> FileResponse:
    settings = request.app.state.settings
    cache = request.app.state.cache

    if not _HASH_RE.match(image_hash):
        raise fr_error(422, "Empreinte invalide.")
    chosen = model or settings.default_model
    if chosen not in _MODELS:
        raise fr_error(422, "Modèle inconnu.")

    if not cache.exists(image_hash, chosen):
        raise fr_error(404, "Cutout introuvable pour ce hash et ce modèle.")
    return FileResponse(
        cache.path(image_hash, chosen),
        media_type="image/png",
        filename=f"{image_hash}_{chosen}.png",
    )


@router.post("/cache/clear", response_model=CacheClearResponse)
async def clear_cache(request: Request) -> CacheClearResponse:
    cache = request.app.state.cache
    deleted = cache.clear()
    return CacheClearResponse(deleted=deleted)
