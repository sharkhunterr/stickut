"""Configuration runtime modifiable depuis l'IHM.

Persistée dans `{cache_dir}/runtime-config.json` (donc survit aux restart du
container, puisque cache/ est un volume).

Les valeurs ici **surchargent** les variables d'environnement STICKUT_* :
si une var d'env est définie ET le runtime config aussi, le runtime gagne
(pour que l'utilisateur qui modifie via l'IHM voie son changement appliqué
sans avoir à redémarrer en touchant son .env).
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger("stickut.runtime_config")


class RuntimeConfigData(BaseModel):
    """Valeurs persistées. Tout est optionnel : None = retomber sur env / défaut."""

    enable_search: bool | None = None
    pixabay_api_key: str | None = None


class RuntimeConfig:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._data: RuntimeConfigData = RuntimeConfigData()
        self._load()

    def _load(self) -> None:
        try:
            raw = self.path.read_text(encoding="utf-8")
            self._data = RuntimeConfigData.model_validate_json(raw)
            logger.info("runtime config loaded from %s", self.path)
        except FileNotFoundError:
            logger.info("runtime config %s not found — using empty defaults", self.path)
        except Exception as exc:
            logger.warning("runtime config %s unreadable (%s) — using defaults", self.path, exc)

    def get(self) -> RuntimeConfigData:
        with self._lock:
            return self._data.model_copy(deep=True)

    def update(self, patch: dict) -> RuntimeConfigData:
        with self._lock:
            current = self._data.model_dump()
            current.update({k: v for k, v in patch.items() if v is not None or k in current})
            new = RuntimeConfigData.model_validate(current)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(self.path.suffix + ".part")
            tmp.write_text(new.model_dump_json(indent=2), encoding="utf-8")
            tmp.replace(self.path)
            self._data = new
            return new.model_copy(deep=True)


def effective_search_settings(
    settings, runtime: RuntimeConfig
) -> tuple[bool, str]:
    """Retourne (enable_search, pixabay_api_key) après merge env+runtime.

    Règle : runtime gagne si défini ; sinon on retombe sur l'env.
    """
    rt = runtime.get()
    enable = rt.enable_search if rt.enable_search is not None else bool(getattr(settings, "enable_search", False))
    key = rt.pixabay_api_key if rt.pixabay_api_key is not None else (getattr(settings, "pixabay_api_key", "") or "")
    return enable, key
