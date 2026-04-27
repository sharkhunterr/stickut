"""POST /api/upload — multipart upload with magic-byte validation."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Request, UploadFile
from fastapi.params import File, Query

from app.errors import fr_error
from app.models import UploadedImageOut, UploadResponse
from app.utils.hashing import sha256_stream_to_disk
from app.utils.images import EXTENSION_BY_FORMAT, decode_to_rgba, detect_format
from app.cutout.detector import is_already_cutout

logger = logging.getLogger("stickut.upload")

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload(
    request: Request,
    files: list[UploadFile] = File(...),
    session_id: str | None = Query(default=None),
) -> UploadResponse:
    settings = request.app.state.settings
    sessions = request.app.state.sessions
    cache = request.app.state.cache

    if not files:
        raise fr_error(422, "Aucun fichier reçu.")

    # Resolve or create the session.
    session = await sessions.get_or_create(session_id)
    if session_id and session.id != session_id:
        # Caller passed a stale session_id; we created a fresh one. Tell them.
        logger.info("Session %s expired; created %s instead", session_id, session.id)

    # Honour per-session file count cap.
    remaining = settings.max_files_per_session - len(session.images)
    if remaining <= 0:
        raise fr_error(
            422, f"Limite atteinte : {settings.max_files_per_session} images par session."
        )
    if len(files) > remaining:
        raise fr_error(
            422,
            f"Trop de fichiers : maximum {remaining} de plus pour cette session.",
        )

    out_images: list[UploadedImageOut] = []
    for upload in files:
        head = await upload.read(16)
        fmt = detect_format(head)
        if fmt is None:
            raise fr_error(415, f"Format de fichier non supporté : {upload.filename!r}.")
        # Reset stream and stream-hash with size check.
        await upload.seek(0)
        ext = EXTENSION_BY_FORMAT[fmt]
        image_id = uuid.uuid4().hex
        target = session.tmp_dir / f"{image_id}{ext}"
        try:
            digest, written = await sha256_stream_to_disk(
                upload.file, target, max_bytes=settings.max_file_size_bytes
            )
        except ValueError:
            target.unlink(missing_ok=True)
            raise fr_error(
                413, f"Fichier trop volumineux : {upload.filename!r} dépasse la limite."
            )
        finally:
            await upload.close()

        # Decode header to learn dimensions and detect existing transparency.
        try:
            rgba = decode_to_rgba(target)
        except Exception:
            target.unlink(missing_ok=True)
            raise fr_error(422, f"Image illisible : {upload.filename!r}.")

        already_cut = is_already_cutout(rgba)
        from app.sessions.tmp import UploadedImage

        record = UploadedImage(
            id=image_id,
            name=upload.filename or f"{image_id}{ext}",
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

        # Surface a cutout URL straight away if the cache already has it.
        cutout_url: str | None = None
        if already_cut and cache.exists(digest, "passthrough"):
            cutout_url = f"/api/cutout/{digest}?model=passthrough"
        elif cache.exists(digest, settings.default_model):
            cutout_url = f"/api/cutout/{digest}?model={settings.default_model}"

        out_images.append(
            UploadedImageOut(
                id=image_id, name=record.name, hash=digest, cutout_url=cutout_url
            )
        )

    return UploadResponse(session_id=session.id, images=out_images)
