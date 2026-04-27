"""Hot-reload SVG frame template loader and validator."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from lxml import etree

from app.models import FrameTemplateSummary, Rect

logger = logging.getLogger("stickut.frames")

NS_SVG = "http://www.w3.org/2000/svg"
NS_STICKUT = "https://stickut.local/ns"

VIEWBOX_RE = re.compile(r"^\s*0\s+0\s+210\s+297\s*$")
ID_RE = re.compile(r"[^a-z0-9_-]+")
EXPECTED_ROOT = f"{{{NS_SVG}}}svg"
META_TAG = f"{{{NS_STICKUT}}}meta"
NAME_TAG = f"{{{NS_STICKUT}}}name"
AREA_TAG = f"{{{NS_STICKUT}}}sticker-area"


def slugify(stem: str) -> str:
    s = stem.lower()
    s = ID_RE.sub("-", s).strip("-")
    return s or "untitled"


def humanize(stem: str) -> str:
    return " ".join(part.capitalize() for part in re.split(r"[-_\s]+", stem) if part)


def list_templates(directory: Path) -> list[FrameTemplateSummary]:
    if not directory.is_dir():
        return []
    out: list[FrameTemplateSummary] = []
    for path in sorted(directory.glob("*.svg")):
        try:
            summary = _parse_one(path)
        except _Invalid as exc:
            logger.warning("template '%s' rejected: %s", path.name, exc)
            continue
        except Exception as exc:
            logger.warning("template '%s' rejected: parse error: %s", path.name, exc)
            continue
        out.append(summary)
    return out


def get_raw_svg(directory: Path, template_id: str) -> bytes | None:
    if not re.match(r"^[a-z0-9_-]+$", template_id):
        return None
    candidate = directory / f"{template_id}.svg"
    if not candidate.is_file():
        # Fallback: maybe the file basename slugified matches.
        for path in directory.glob("*.svg"):
            if slugify(path.stem) == template_id:
                candidate = path
                break
        else:
            return None
    return candidate.read_bytes()


class _Invalid(Exception):
    pass


def _parse_one(path: Path) -> FrameTemplateSummary:
    parser = etree.XMLParser(remove_blank_text=False)
    try:
        tree = etree.parse(str(path), parser=parser)
    except etree.XMLSyntaxError as exc:
        raise _Invalid(f"invalid XML: {exc}") from exc
    root = tree.getroot()

    if root.tag != EXPECTED_ROOT:
        raise _Invalid(f"root must be <svg> (got {root.tag})")

    viewbox = root.get("viewBox", "")
    if not VIEWBOX_RE.match(viewbox):
        raise _Invalid(f"viewBox must be '0 0 210 297' (got {viewbox!r})")

    metas = root.findall(f".//{META_TAG}")
    if len(metas) != 1:
        raise _Invalid(f"expected exactly one <stickut:meta>, got {len(metas)}")
    meta = metas[0]

    areas = meta.findall(AREA_TAG)
    if len(areas) != 1:
        raise _Invalid(f"expected exactly one <stickut:sticker-area>, got {len(areas)}")
    area = areas[0]

    try:
        x = float(area.get("x", ""))
        y = float(area.get("y", ""))
        width = float(area.get("width", ""))
        height = float(area.get("height", ""))
    except ValueError as exc:
        raise _Invalid(f"sticker-area numeric attrs invalid: {exc}") from exc

    if width <= 0 or height <= 0:
        raise _Invalid("sticker-area width/height must be > 0")
    if x < 0 or y < 0 or x + width > 210 or y + height > 297:
        raise _Invalid("sticker-area must lie within 0 0 210 297")

    headers = root.findall(".//*[@data-stickut='header-text']")
    if len(headers) > 1:
        raise _Invalid(f"at most one data-stickut='header-text' element, got {len(headers)}")
    if headers:
        if headers[0].tag != f"{{{NS_SVG}}}text":
            raise _Invalid("data-stickut='header-text' must be a <text> element")

    color_targets = root.findall(".//*[@data-stickut='frame-color']")

    name_el = meta.find(NAME_TAG)
    name = (name_el.text or "").strip() if name_el is not None else ""
    if not name:
        name = humanize(path.stem)

    template_id = slugify(path.stem)

    return FrameTemplateSummary(
        id=template_id,
        name=name,
        preview_url=f"/api/templates/{template_id}",
        sticker_area=Rect(x=x, y=y, width=width, height=height),
        supports_color=len(color_targets) > 0,
        supports_header=len(headers) > 0,
    )
