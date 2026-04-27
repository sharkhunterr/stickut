"""In-memory asyncio pub/sub keyed by task_id."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any


@dataclass
class Event:
    name: str  # "image_started" | "image_progress" | "image_done" | "image_failed" | "complete"
    data: dict[str, Any]


_SENTINEL: Event = Event(name="__close__", data={})


class TaskBus:
    """One bus per `task_id`. Multiple subscribers per task supported."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[Event]]] = {}
        self._closed: set[str] = set()
        self._lock = asyncio.Lock()

    async def register(self, task_id: str) -> None:
        async with self._lock:
            self._subscribers.setdefault(task_id, [])

    async def publish(self, task_id: str, event: Event) -> None:
        async with self._lock:
            queues = list(self._subscribers.get(task_id, ()))
            if event.name == "complete":
                self._closed.add(task_id)
        for q in queues:
            await q.put(event)
        if event.name == "complete":
            for q in queues:
                await q.put(_SENTINEL)

    async def subscribe(self, task_id: str) -> AsyncIterator[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=1024)
        async with self._lock:
            self._subscribers.setdefault(task_id, []).append(q)
            already_closed = task_id in self._closed
        if already_closed:
            yield Event(name="complete", data={})
            await self._unsubscribe(task_id, q)
            return
        try:
            while True:
                event = await q.get()
                if event is _SENTINEL:
                    return
                yield event
                if event.name == "complete":
                    return
        finally:
            await self._unsubscribe(task_id, q)

    async def _unsubscribe(self, task_id: str, q: asyncio.Queue[Event]) -> None:
        async with self._lock:
            queues = self._subscribers.get(task_id)
            if queues is not None and q in queues:
                queues.remove(q)
            if queues is not None and not queues and task_id in self._closed:
                self._subscribers.pop(task_id, None)
                self._closed.discard(task_id)
