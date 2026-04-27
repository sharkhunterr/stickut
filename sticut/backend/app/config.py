"""Stickut runtime configuration via STICKUT_* environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ModelName = Literal[
    "birefnet-general",
    "isnet-general-use",
    "u2net",
    "isnet-anime",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="STICKUT_", env_file=None, extra="ignore")

    max_file_size_mb: int = Field(default=20, ge=1, le=500)
    max_files_per_session: int = Field(default=50, ge=1, le=500)

    default_model: ModelName = "birefnet-general"
    rembg_workers: int = Field(default=2, ge=1, le=32)

    cache_dir: Path = Path("/app/cache")
    templates_dir: Path = Path("/app/templates")
    tmp_dir: Path = Path("/app/tmp")
    tmp_ttl_seconds: int = Field(default=3600, ge=60)

    port: int = Field(default=8000, ge=1, le=65535)
    behind_proxy: bool = False

    @property
    def cutouts_dir(self) -> Path:
        return self.cache_dir / "cutouts"

    @property
    def effective_workers(self) -> int:
        cpu = os.cpu_count() or 1
        return max(1, min(self.rembg_workers, cpu))

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
