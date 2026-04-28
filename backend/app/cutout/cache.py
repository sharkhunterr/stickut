"""Disk cache for detoured cutouts, indexed by content hash + model."""

from __future__ import annotations

import re
from pathlib import Path

_HASH_RE = re.compile(r"^[a-f0-9]{64}$")


class CutoutCache:
    """Filesystem-backed cache. Layout: `<root>/<sha256>_<model>.png`."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _key(self, image_hash: str, model: str) -> str:
        if not _HASH_RE.match(image_hash):
            raise ValueError(f"Invalid hash: {image_hash!r}")
        if not re.match(r"^[a-z0-9_-]+$", model):
            raise ValueError(f"Invalid model name: {model!r}")
        return f"{image_hash}_{model}.png"

    def path(self, image_hash: str, model: str) -> Path:
        return self.root / self._key(image_hash, model)

    def exists(self, image_hash: str, model: str) -> bool:
        return self.path(image_hash, model).is_file()

    def write(self, image_hash: str, model: str, png_bytes: bytes) -> Path:
        target = self.path(image_hash, model)
        tmp = target.with_suffix(target.suffix + ".part")
        tmp.write_bytes(png_bytes)
        tmp.replace(target)
        return target

    def read(self, image_hash: str, model: str) -> bytes:
        return self.path(image_hash, model).read_bytes()

    def clear(self) -> int:
        count = 0
        for item in self.root.glob("*.png"):
            try:
                item.unlink()
                count += 1
            except OSError:
                pass
        return count

    def size_mb(self) -> float:
        total = 0
        for item in self.root.glob("*.png"):
            try:
                total += item.stat().st_size
            except OSError:
                pass
        return round(total / (1024 * 1024), 2)
