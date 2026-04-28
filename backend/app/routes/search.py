"""GET /api/search — proxy de recherche d'images en ligne.

Désactivé par défaut (constitution : "no runtime network"). À activer via
STICKUT_ENABLE_SEARCH=true.

Providers supportés :
  - **pixabay** (clé requise) — photos/illustrations/vecteurs, filtre image_type
  - **openverse** (sans clé) — ~600 M items CC, mostly photos
  - **openclipart** (sans clé) — ~150 k SVG illustrations CC0, parfait stickers
  - **iconify** (sans clé) — ~200 k icônes SVG (Phosphor, Tabler, Game-Icons…)

Si aucun provider n'est précisé, on utilise Pixabay si une clé est dispo,
sinon Openverse.

Les résultats sont normalisés vers une forme commune `SearchHit`.
"""

from __future__ import annotations

import logging
import uuid
from typing import Literal
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.errors import fr_error
from app.models import UploadedImageOut, UploadResponse
from app.runtime_config import effective_search_settings
from app.utils.hashing import sha256_stream_to_disk
from app.utils.images import EXTENSION_BY_FORMAT, decode_to_rgba, detect_format
from app.cutout.detector import is_already_cutout
from app.sessions.tmp import UploadedImage

logger = logging.getLogger("stickut.search")

router = APIRouter()

ProviderName = Literal["pixabay", "openverse", "wikimedia", "iconify"]
ImageType = Literal["all", "photo", "illustration", "vector"]


class SearchHit(BaseModel):
    id: str  # ID provider-spécifique (str pour homogénéiser)
    thumb_url: str
    full_url: str
    width: int
    height: int
    author: str | None = None
    source_url: str | None = None  # lien public vers la page originale
    license: str | None = None


class SearchResponse(BaseModel):
    provider: ProviderName
    hits: list[SearchHit]
    total: int
    page: int
    per_page: int


class ImportFromUrlRequest(BaseModel):
    session_id: str | None = None
    url: str
    name: str | None = None  # nom suggéré pour le fichier


@router.get("/search", response_model=SearchResponse)
async def search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=120),
    page: int = Query(default=1, ge=1, le=50),
    per_page: int = Query(default=20, ge=1, le=50),
    provider: ProviderName | None = Query(default=None),
    image_type: ImageType = Query(default="all"),
) -> SearchResponse:
    settings = request.app.state.settings
    runtime = request.app.state.runtime_config
    enabled, api_key = effective_search_settings(settings, runtime)
    if not enabled:
        raise fr_error(403, "Recherche désactivée. Activez-la dans les paramètres.")

    # Provider auto si non précisé : Pixabay si clé, sinon Openverse.
    if provider is None:
        provider = "pixabay" if api_key else "openverse"

    timeout = settings.search_timeout_seconds

    if provider == "pixabay":
        if not api_key:
            raise fr_error(400, "Provider Pixabay sélectionné mais aucune clé n'est configurée.")
        return await _search_pixabay(q, page, per_page, api_key, timeout, image_type)
    if provider == "openverse":
        return await _search_openverse(q, page, per_page, timeout)
    if provider == "wikimedia":
        return await _search_wikimedia(q, page, per_page, timeout)
    if provider == "iconify":
        return await _search_iconify(q, page, per_page, timeout)
    raise fr_error(400, f"Provider inconnu : {provider}")


async def _search_pixabay(
    q: str,
    page: int,
    per_page: int,
    api_key: str,
    timeout: int,
    image_type: ImageType = "all",
) -> SearchResponse:
    url = "https://pixabay.com/api/"
    params: dict = {
        "key": api_key,
        "q": q,
        "page": page,
        "per_page": per_page,
        "safesearch": "true",
        "image_type": image_type if image_type != "all" else "all",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, params=params)
    except httpx.HTTPError as exc:
        logger.warning("pixabay request failed: %s", exc)
        raise fr_error(502, "Recherche indisponible. Réessayez plus tard.") from exc
    if r.status_code != 200:
        logger.warning("pixabay HTTP %d: %s", r.status_code, r.text[:200])
        raise fr_error(502, f"Pixabay a répondu {r.status_code}.")
    data = r.json()
    hits = [
        SearchHit(
            id=str(item["id"]),
            thumb_url=item.get("previewURL") or item.get("webformatURL"),
            full_url=item.get("largeImageURL") or item.get("webformatURL"),
            width=int(item.get("imageWidth") or 0),
            height=int(item.get("imageHeight") or 0),
            author=item.get("user"),
            source_url=item.get("pageURL"),
            license="Pixabay Content License",
        )
        for item in data.get("hits", [])
    ]
    return SearchResponse(
        provider="pixabay",
        hits=hits,
        total=int(data.get("totalHits", 0)),
        page=page,
        per_page=per_page,
    )


async def _search_openverse(
    q: str, page: int, per_page: int, timeout: int
) -> SearchResponse:
    url = "https://api.openverse.org/v1/images/"
    params = {"q": q, "page": page, "page_size": per_page}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, params=params, headers={"User-Agent": "Stickut/1.0"})
    except httpx.HTTPError as exc:
        logger.warning("openverse request failed: %s", exc)
        raise fr_error(502, "Recherche indisponible. Réessayez plus tard.") from exc
    if r.status_code != 200:
        logger.warning("openverse HTTP %d: %s", r.status_code, r.text[:200])
        raise fr_error(502, f"Openverse a répondu {r.status_code}.")
    data = r.json()
    hits = [
        SearchHit(
            id=str(item.get("id")),
            thumb_url=item.get("thumbnail") or item.get("url"),
            full_url=item.get("url"),
            width=int(item.get("width") or 0),
            height=int(item.get("height") or 0),
            author=item.get("creator"),
            source_url=item.get("foreign_landing_url"),
            license=item.get("license"),
        )
        for item in data.get("results", [])
        if item.get("url")
    ]
    return SearchResponse(
        provider="openverse",
        hits=hits,
        total=int(data.get("result_count", 0)),
        page=page,
        per_page=per_page,
    )


async def _search_wikimedia(
    q: str, page: int, per_page: int, timeout: int
) -> SearchResponse:
    """Wikimedia Commons — illustrations / photos / SVG (~100M items, CC variable).

    On utilise generator=search avec namespace 6 (Files) pour ne récupérer
    que des fichiers, et prop=imageinfo pour avoir directement les URLs.
    """
    offset = (page - 1) * per_page
    url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrnamespace": "6",  # File:
        "gsrsearch": q,
        "gsrlimit": per_page,
        "gsroffset": offset,
        "gsrinfo": "totalhits",
        "prop": "imageinfo",
        "iiprop": "url|size|user|extmetadata",
        "iiurlheight": "240",
        "origin": "*",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url, params=params, headers={"User-Agent": "Stickut/1.0 (homelab sticker tool)"})
    except httpx.HTTPError as exc:
        logger.warning("wikimedia request failed: %s", exc)
        raise fr_error(502, "Wikimedia indisponible.") from exc
    if r.status_code != 200:
        raise fr_error(502, f"Wikimedia a répondu {r.status_code}.")
    data = r.json()
    pages = (data.get("query") or {}).get("pages") or {}
    total = int(((data.get("query") or {}).get("searchinfo") or {}).get("totalhits") or 0)
    hits: list[SearchHit] = []
    for _, p in pages.items():
        infos = p.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        full = info.get("url")
        thumb = info.get("thumburl") or full
        if not full:
            continue
        author = (info.get("extmetadata") or {}).get("Artist", {}).get("value")
        if author:
            # extmetadata contient parfois du HTML — on strip simplement.
            import re as _re
            author = _re.sub(r"<[^>]+>", "", author).strip() or None
        license_short = (info.get("extmetadata") or {}).get("LicenseShortName", {}).get("value")
        hits.append(
            SearchHit(
                id=str(p.get("pageid")),
                thumb_url=thumb,
                full_url=full,
                width=int(info.get("width") or 0),
                height=int(info.get("height") or 0),
                author=author,
                source_url=p.get("title")
                and f"https://commons.wikimedia.org/wiki/{quote(p.get('title'), safe=':_')}",
                license=license_short,
            )
        )
    return SearchResponse(
        provider="wikimedia",
        hits=hits,
        total=total,
        page=page,
        per_page=per_page,
    )


async def _search_iconify(
    q: str, page: int, per_page: int, timeout: int
) -> SearchResponse:
    """Iconify — icônes SVG d'open-source icon sets (~200k icons).

    Iconify ne supporte pas la pagination native ; on demande limit*page et on
    slice pour simuler les pages.
    """
    limit = max(per_page * page, per_page)
    limit = min(limit, 999)  # cap API
    url = "https://api.iconify.design/search"
    params = {"query": q, "limit": limit}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, params=params, headers={"User-Agent": "Stickut/1.0"})
    except httpx.HTTPError as exc:
        logger.warning("iconify request failed: %s", exc)
        raise fr_error(502, "Iconify indisponible.") from exc
    if r.status_code != 200:
        logger.warning("iconify HTTP %d", r.status_code)
        raise fr_error(502, f"Iconify a répondu {r.status_code}.")
    data = r.json()
    icons: list[str] = data.get("icons", [])  # ex: ["mdi:cat", "ph:cat"]
    total = int(data.get("total", len(icons)))

    start = (page - 1) * per_page
    end = start + per_page
    page_icons = icons[start:end]

    # Pour chaque icône → thumb (PNG 96px) et full (PNG 512px) via l'API rasterize.
    hits: list[SearchHit] = []
    for name in page_icons:
        # name = "prefix:icon"
        if ":" not in name:
            continue
        encoded = quote(name, safe="")  # encode ':' → %3A
        thumb_url = f"https://api.iconify.design/{name.replace(':', '/', 1)}.png?height=96"
        full_url = f"https://api.iconify.design/{name.replace(':', '/', 1)}.png?height=512"
        hits.append(
            SearchHit(
                id=encoded,
                thumb_url=thumb_url,
                full_url=full_url,
                width=512,
                height=512,
                author=name.split(":", 1)[0],  # le set d'icônes
                source_url=f"https://icon-sets.iconify.design/{name.split(':', 1)[0]}/{name.split(':', 1)[1]}/",
                license="Voir page de l'icon set (open source)",
            )
        )
    return SearchResponse(
        provider="iconify",
        hits=hits,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/search/import", response_model=UploadResponse)
async def import_from_url(request: Request, body: ImportFromUrlRequest) -> UploadResponse:
    """Télécharge une URL externe et l'injecte dans la session comme un upload normal."""
    settings = request.app.state.settings
    sessions = request.app.state.sessions
    cache = request.app.state.cache
    runtime = request.app.state.runtime_config
    enabled, _ = effective_search_settings(settings, runtime)
    if not enabled:
        raise fr_error(403, "Recherche désactivée.")

    session = await sessions.get_or_create(body.session_id)
    remaining = settings.max_files_per_session - len(session.images)
    if remaining <= 0:
        raise fr_error(422, f"Limite atteinte : {settings.max_files_per_session} images par session.")

    # Téléchargement avec cap de taille (header + streaming).
    max_bytes = settings.max_file_size_bytes
    timeout = settings.search_timeout_seconds
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async with client.stream("GET", body.url, headers={"User-Agent": "Stickut/1.0"}) as r:
                if r.status_code != 200:
                    raise fr_error(502, f"Téléchargement échoué (HTTP {r.status_code}).")
                ctype = (r.headers.get("content-type") or "").lower()
                if not ctype.startswith("image/"):
                    raise fr_error(415, f"Type non-image refusé : {ctype or 'inconnu'}.")
                clen = r.headers.get("content-length")
                if clen and int(clen) > max_bytes:
                    raise fr_error(413, "Image trop volumineuse.")
                buf = bytearray()
                async for chunk in r.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > max_bytes:
                        raise fr_error(413, "Image trop volumineuse.")
    except httpx.HTTPError as exc:
        logger.warning("import_from_url failed: %s", exc)
        raise fr_error(502, "Téléchargement échoué.") from exc

    # Détection format via les magic bytes (rejette HTML/SVG/etc.).
    fmt = detect_format(bytes(buf[:16]))
    if fmt is None:
        raise fr_error(415, "Format de fichier non supporté.")

    ext = EXTENSION_BY_FORMAT[fmt]
    image_id = uuid.uuid4().hex
    target = session.tmp_dir / f"{image_id}{ext}"
    target.write_bytes(bytes(buf))

    import io as _io

    digest, written = await sha256_stream_to_disk(
        _io.BytesIO(bytes(buf)), target, max_bytes=max_bytes
    )

    try:
        rgba = decode_to_rgba(target)
    except Exception:
        target.unlink(missing_ok=True)
        raise fr_error(422, "Image illisible.")

    already_cut = is_already_cutout(rgba)
    fname = body.name or body.url.rsplit("/", 1)[-1] or f"{image_id}{ext}"
    record = UploadedImage(
        id=image_id,
        name=fname,
        format=fmt,
        size_bytes=written,
        hash=digest,
        tmp_path=target,
        width_px=rgba.width,
        height_px=rgba.height,
        is_already_cutout=already_cut,
    )
    session.images[image_id] = record
    await sessions.touch(session.id)

    cutout_url: str | None = None
    if already_cut and cache.exists(digest, "passthrough"):
        cutout_url = f"/api/cutout/{digest}?model=passthrough"
    elif cache.exists(digest, settings.default_model):
        cutout_url = f"/api/cutout/{digest}?model={settings.default_model}"

    return UploadResponse(
        session_id=session.id,
        images=[UploadedImageOut(id=image_id, name=record.name, hash=digest, cutout_url=cutout_url)],
    )
