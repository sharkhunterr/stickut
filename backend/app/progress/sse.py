"""Server-Sent Events helpers built on sse-starlette."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from sse_starlette.sse import EventSourceResponse

from app.progress.pubsub import Event, TaskBus


async def stream_task(bus: TaskBus, task_id: str) -> AsyncIterator[dict[str, str]]:
    async for event in bus.subscribe(task_id):
        yield {"event": event.name, "data": json.dumps(event.data, ensure_ascii=False)}


def event_source(bus: TaskBus, task_id: str) -> EventSourceResponse:
    return EventSourceResponse(stream_task(bus, task_id), ping=15)


__all__ = ["Event", "event_source"]
