"""Pydantic v2 request/response schemas. Mirrors `data-model.md`."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ModelName = Literal["birefnet-general", "isnet-general-use", "u2net", "isnet-anime"]


class UploadedImageOut(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=255)
    hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    cutout_url: str | None = None


class UploadResponse(BaseModel):
    session_id: str
    images: list[UploadedImageOut]


class ProcessRequest(BaseModel):
    session_id: str
    model: ModelName = "birefnet-general"
    alpha_matting: bool = False


class ProcessResponse(BaseModel):
    task_id: str


class Rect(BaseModel):
    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class FrameTemplateSummary(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    name: str = Field(min_length=1)
    preview_url: str
    sticker_area: Rect
    supports_color: bool
    supports_header: bool


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    models_loaded: list[str]
    cache_size_mb: float


class CacheClearResponse(BaseModel):
    deleted: int = Field(ge=0)


class ErrorBody(BaseModel):
    detail: str
