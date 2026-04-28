"""Detect images that are already detoured (significant transparency)."""

from __future__ import annotations

import numpy as np
from PIL import Image


def is_already_cutout(rgba: Image.Image, threshold: int = 240, ratio: float = 0.05) -> bool:
    """Return True if more than `ratio` of pixels have alpha < `threshold`.

    Default thresholds (240, 5 %) are tuned per `research.md` R4: tolerant of
    PNG compression artifacts, robust against PNGs that contain a tiny
    transparent corner.
    """
    if rgba.mode != "RGBA":
        return False
    arr = np.asarray(rgba)
    if arr.ndim != 3 or arr.shape[2] != 4:
        return False
    alpha = arr[:, :, 3]
    transparent = np.count_nonzero(alpha < threshold)
    return transparent > ratio * alpha.size
