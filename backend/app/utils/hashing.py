"""SHA-256 streaming hash that doubles as a writer."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import BinaryIO


async def sha256_stream_to_disk(
    source: BinaryIO,
    dest: Path,
    chunk_size: int = 1 << 16,
    max_bytes: int | None = None,
) -> tuple[str, int]:
    """Stream `source` into `dest` while hashing.

    Returns `(hex_digest, byte_count)`. Raises `ValueError` if `max_bytes`
    is exceeded. Caller is responsible for opening/closing `source`.
    """
    h = hashlib.sha256()
    written = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as out:
        while True:
            chunk = source.read(chunk_size)
            if not chunk:
                break
            written += len(chunk)
            if max_bytes is not None and written > max_bytes:
                raise ValueError("Fichier trop volumineux.")
            h.update(chunk)
            out.write(chunk)
    return h.hexdigest(), written


def sha256_path(path: Path, chunk_size: int = 1 << 16) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()
