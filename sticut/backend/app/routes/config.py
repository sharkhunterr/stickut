"""GET / POST /api/config — runtime config modifiable depuis l'IHM."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.runtime_config import effective_search_settings

router = APIRouter()


class ConfigPayload(BaseModel):
    enable_search: bool | None = None
    pixabay_api_key: str | None = None


class ConfigResponse(BaseModel):
    enable_search: bool
    pixabay_api_key_set: bool
    search_provider: str | None  # provider par défaut quand l'IHM ne précise pas
    available_providers: list[str]
    # Indique si la valeur vient d'une variable d'env (lecture seule depuis l'IHM)
    env_locked: dict[str, bool]


def _build_response(request: Request) -> ConfigResponse:
    settings = request.app.state.settings
    runtime = request.app.state.runtime_config
    enabled, key = effective_search_settings(settings, runtime)
    default_provider = ("pixabay" if key else "iconify") if enabled else None
    available: list[str] = []
    if enabled:
        if key:
            available.append("pixabay")
        available.extend(["iconify", "wikimedia", "openverse"])
    env_locked = {
        "enable_search": bool(getattr(settings, "enable_search", False))
        and runtime.get().enable_search is None,
        "pixabay_api_key": bool(getattr(settings, "pixabay_api_key", ""))
        and runtime.get().pixabay_api_key is None,
    }
    return ConfigResponse(
        enable_search=enabled,
        pixabay_api_key_set=bool(key),
        search_provider=default_provider,
        available_providers=available,
        env_locked=env_locked,
    )


@router.get("/config", response_model=ConfigResponse)
async def get_config(request: Request) -> ConfigResponse:
    return _build_response(request)


@router.post("/config", response_model=ConfigResponse)
async def update_config(request: Request, body: ConfigPayload) -> ConfigResponse:
    runtime = request.app.state.runtime_config
    patch: dict = {}
    if body.enable_search is not None:
        patch["enable_search"] = body.enable_search
    if body.pixabay_api_key is not None:
        # Une chaîne vide = on enlève la clé (retour à Openverse / env).
        patch["pixabay_api_key"] = body.pixabay_api_key.strip() or None
    if patch:
        runtime.update(patch)
    return _build_response(request)
