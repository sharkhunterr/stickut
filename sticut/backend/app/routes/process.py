"""POST /api/process and GET /api/process/stream/{task_id}."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request

from app.errors import fr_error
from app.models import ProcessRequest, ProcessResponse
from app.progress.queue import WorkItem
from app.progress.sse import event_source

router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
async def start_process(request: Request, body: ProcessRequest) -> ProcessResponse:
    sessions = request.app.state.sessions
    queue = request.app.state.queue

    session = await sessions.get(body.session_id)
    if session is None:
        raise fr_error(404, "Session expirée ou inexistante.")

    if not session.images:
        raise fr_error(422, "Aucune image à traiter dans cette session.")

    task_id = uuid.uuid4().hex
    items: list[WorkItem] = []
    for img in session.images.values():
        items.append(
            WorkItem(
                task_id=task_id,
                image_id=img.id,
                image_name=img.name,
                image_path=img.tmp_path,
                image_hash=img.hash,
                model="passthrough" if img.is_already_cutout else body.model,
                alpha_matting=body.alpha_matting,
            )
        )

    await queue.submit_task(task_id, items)
    await sessions.touch(session.id)
    return ProcessResponse(task_id=task_id)


@router.get("/process/stream/{task_id}")
async def stream(request: Request, task_id: str):
    bus = request.app.state.bus
    return event_source(bus, task_id)
