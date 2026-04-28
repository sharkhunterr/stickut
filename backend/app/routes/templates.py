"""GET /api/templates and GET /api/templates/{id}. Hot-reloads on every call."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.errors import fr_error
from app.frames.loader import get_raw_svg, list_templates
from app.models import FrameTemplateSummary

router = APIRouter()


@router.get("/templates", response_model=list[FrameTemplateSummary])
async def get_templates(request: Request) -> list[FrameTemplateSummary]:
    settings = request.app.state.settings
    return list_templates(settings.templates_dir)


@router.get("/templates/{template_id}")
async def get_template_svg(request: Request, template_id: str) -> Response:
    settings = request.app.state.settings
    raw = get_raw_svg(settings.templates_dir, template_id)
    if raw is None:
        raise fr_error(404, "Cadre inconnu.")
    return Response(content=raw, media_type="image/svg+xml")
