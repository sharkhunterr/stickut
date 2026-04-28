"""Multi-format image decoding and magic-byte format detection."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

from PIL import Image, ImageOps

logger = logging.getLogger("stickut.images")

SupportedFormat = Literal["jpeg", "png", "webp", "gif", "bmp", "tiff", "heic", "heif", "avif"]

EXTENSION_BY_FORMAT: dict[str, str] = {
    "jpeg": ".jpg",
    "png": ".png",
    "webp": ".webp",
    "gif": ".gif",
    "bmp": ".bmp",
    "tiff": ".tif",
    "heic": ".heic",
    "heif": ".heif",
    "avif": ".avif",
}

_REGISTERED = False


def register_decoders() -> None:
    """Register HEIC/HEIF and AVIF Pillow plugins. Idempotent."""
    global _REGISTERED
    if _REGISTERED:
        return
    try:
        import pillow_heif  # type: ignore[import-not-found]

        pillow_heif.register_heif_opener()
    except Exception as exc:
        logger.warning("pillow-heif not available: %s", exc)
    try:
        import pillow_avif  # type: ignore[import-not-found]  # noqa: F401
    except Exception as exc:
        logger.warning("pillow-avif-plugin not available: %s", exc)
    _REGISTERED = True


def detect_format(head: bytes) -> SupportedFormat | None:
    """Detect a supported format from the first ~16 bytes of a file."""
    if len(head) < 12:
        return None
    if head[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if head[:2] == b"BM":
        return "bmp"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return "tiff"
    # ISO-BMFF based: HEIC/HEIF/AVIF — check `ftyp` brand
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"hevx"):
            return "heic"
        if brand in (b"mif1", b"msf1", b"heim", b"heis", b"hevm", b"hevs"):
            return "heif"
        if brand in (b"avif", b"avis"):
            return "avif"
    return None


def decode_to_rgba(path: Path) -> Image.Image:
    """Open `path` with Pillow, fix EXIF orientation, return an RGBA copy."""
    register_decoders()
    with Image.open(path) as src:
        src.load()
        oriented = ImageOps.exif_transpose(src) or src
        return oriented.convert("RGBA")
