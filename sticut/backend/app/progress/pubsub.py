"""In-memory asyncio pub/sub keyed by task_id."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("stickut.bus")


@dataclass
class Event:
    name: str  # "image_started" | "image_progress" | "image_done" | "image_failed" | "complete"
    data: dict[str, Any]


_SENTINEL: Event = Event(name="__close__", data={})

# Combien d'événements on garde par task pour replay aux abonnés tardifs.
# (le client SSE peut s'abonner après que les premiers events soient déjà fired)
_REPLAY_BUFFER_MAX = 256


class TaskBus:
    """One bus per `task_id`. Multiple subscribers per task supported.

    Buffers recent events per task so a subscriber that connects *after* a
    publish still receives the backlog (sinon les events fired entre
    submit_task() et la connexion SSE étaient perdus → blocage à 0%).
    """

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[Event]]] = {}
        self._closed: set[str] = set()
        self._backlog: dict[str, list[Event]] = {}
        self._lock = asyncio.Lock()

    async def register(self, task_id: str) -> None:
        async with self._lock:
            self._subscribers.setdefault(task_id, [])
            self._backlog.setdefault(task_id, [])
        logger.info("bus.register task=%s", task_id)

    async def publish(self, task_id: str, event: Event) -> None:
        async with self._lock:
            queues = list(self._subscribers.get(task_id, ()))
            backlog = self._backlog.setdefault(task_id, [])
            backlog.append(event)
            if len(backlog) > _REPLAY_BUFFER_MAX:
                del backlog[: len(backlog) - _REPLAY_BUFFER_MAX]
            if event.name == "complete":
                self._closed.add(task_id)
        logger.info(
            "bus.publish task=%s event=%s subs=%d data=%s",
            task_id, event.name, len(queues), event.data,
        )
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
            backlog_snapshot = list(self._backlog.get(task_id, ()))
        logger.info(
            "bus.subscribe task=%s replaying=%d already_closed=%s",
            task_id, len(backlog_snapshot), already_closed,
        )
        # Replay du backlog au nouvel abonné (events fired avant qu'il se connecte).
        for ev in backlog_snapshot:
            yield ev
            if ev.name == "complete":
                await self._unsubscribe(task_id, q)
                return
        if already_closed:
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
            logger.info("bus.unsubscribe task=%s", task_id)
            await self._unsubscribe(task_id, q)

    async def _unsubscribe(self, task_id: str, q: asyncio.Queue[Event]) -> None:
        async with self._lock:
            queues = self._subscribers.get(task_id)
            if queues is not None and q in queues:
                queues.remove(q)
            if queues is not None and not queues and task_id in self._closed:
                self._subscribers.pop(task_id, None)
                self._closed.discard(task_id)
