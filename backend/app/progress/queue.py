"""Global FIFO task queue with per-task progress emission.

A single dispatcher coroutine consumes the queue, hands work to the
CutoutRunner, and publishes events on the TaskBus. Items waiting in the
queue receive a periodic `image_progress {step: "En attente"}` keep-alive
so the SSE client never sees a > 30 s gap (SC-008).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from app.cutout.cache import CutoutCache
from app.cutout.detector import is_already_cutout
from app.cutout.runner import CutoutRunner
from app.progress.pubsub import Event, TaskBus
from app.utils.images import decode_to_rgba

logger = logging.getLogger("stickut.queue")

WAITING_REEMIT_SECONDS = 10.0


@dataclass
class WorkItem:
    task_id: str
    image_id: str
    image_name: str
    image_path: Path
    image_hash: str
    model: str
    alpha_matting: bool
    enqueued_at: float = field(default_factory=time.time)
    last_waiting_emit: float = field(default_factory=time.time)


@dataclass
class TaskState:
    task_id: str
    total: int
    processed: int = 0
    failed: int = 0


class CutoutQueue:
    def __init__(self, runner: CutoutRunner, cache: CutoutCache, bus: TaskBus) -> None:
        self.runner = runner
        self.cache = cache
        self.bus = bus
        self._queue: asyncio.Queue[WorkItem] = asyncio.Queue()
        self._tasks: dict[str, TaskState] = {}
        self._dispatcher: asyncio.Task[None] | None = None
        self._waiter_task: asyncio.Task[None] | None = None
        self._waiting_items: list[WorkItem] = []
        self._lock = asyncio.Lock()

    def start(self) -> None:
        if self._dispatcher is None:
            self._dispatcher = asyncio.create_task(self._run(), name="cutout-dispatcher")
            self._waiter_task = asyncio.create_task(
                self._reemit_waiting_loop(), name="cutout-waiter"
            )

    async def stop(self) -> None:
        for t in (self._dispatcher, self._waiter_task):
            if t is not None:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass
        self._dispatcher = None
        self._waiter_task = None

    async def submit_task(self, task_id: str, items: list[WorkItem]) -> None:
        logger.info("submit_task task=%s items=%d models=%s", task_id, len(items),
                    sorted({i.model for i in items}))
        await self.bus.register(task_id)
        async with self._lock:
            self._tasks[task_id] = TaskState(task_id=task_id, total=len(items))
            self._waiting_items.extend(items)
        for item in items:
            await self._queue.put(item)
            await self.bus.publish(
                task_id,
                Event(name="image_progress", data={"image_id": item.image_id, "step": "En attente"}),
            )
        logger.info("submit_task task=%s queued, qsize=%d dispatcher=%s",
                    task_id, self._queue.qsize(),
                    "running" if self._dispatcher and not self._dispatcher.done() else "DEAD")

    async def _reemit_waiting_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(2)
                now = time.time()
                async with self._lock:
                    waiting = list(self._waiting_items)
                for item in waiting:
                    if now - item.last_waiting_emit >= WAITING_REEMIT_SECONDS:
                        item.last_waiting_emit = now
                        await self.bus.publish(
                            item.task_id,
                            Event(
                                name="image_progress",
                                data={"image_id": item.image_id, "step": "En attente"},
                            ),
                        )
        except asyncio.CancelledError:
            raise

    async def _run(self) -> None:
        logger.info("dispatcher started")
        while True:
            try:
                item = await self._queue.get()
            except asyncio.CancelledError:
                logger.info("dispatcher cancelled")
                raise
            logger.info("dispatcher.pick task=%s image=%s name=%s model=%s",
                        item.task_id, item.image_id, item.image_name, item.model)
            try:
                await self._process(item)
            except Exception:
                logger.exception("dispatcher: unexpected failure for image %s", item.image_id)
            finally:
                self._queue.task_done()
                logger.info("dispatcher.done task=%s image=%s qsize=%d",
                            item.task_id, item.image_id, self._queue.qsize())

    async def _detour_heartbeat(self, task_id: str, image_id: str, t0: float) -> None:
        """Émet un event toutes les 2 s pendant le détourage rembg (silencieux)."""
        try:
            while True:
                await asyncio.sleep(2.0)
                elapsed = time.time() - t0
                await self.bus.publish(
                    task_id,
                    Event(
                        name="image_progress",
                        data={
                            "image_id": image_id,
                            "step": "Détourage IA",
                            "elapsed_s": round(elapsed, 1),
                        },
                    ),
                )
        except asyncio.CancelledError:
            return

    async def _remove_from_waiting(self, item: WorkItem) -> None:
        async with self._lock:
            try:
                self._waiting_items.remove(item)
            except ValueError:
                pass

    async def _on_terminal(
        self, item: WorkItem, kind: Literal["processed", "failed"]
    ) -> None:
        async with self._lock:
            state = self._tasks.get(item.task_id)
            if state is None:
                return
            if kind == "processed":
                state.processed += 1
            else:
                state.failed += 1
            done = state.processed + state.failed
            total = state.total
        if done == total:
            await self.bus.publish(
                item.task_id,
                Event(
                    name="complete",
                    data={"processed": state.processed, "failed": state.failed},
                ),
            )
            async with self._lock:
                self._tasks.pop(item.task_id, None)

    async def _process(self, item: WorkItem) -> None:
        await self._remove_from_waiting(item)
        loop = asyncio.get_running_loop()

        logger.info("process.start image=%s path=%s", item.image_id, item.image_path)
        # 1) image_started + Décodage
        await self.bus.publish(
            item.task_id,
            Event(
                name="image_started",
                data={"image_id": item.image_id, "name": item.image_name, "step": "Décodage"},
            ),
        )

        try:
            logger.info("process.decode image=%s", item.image_id)
            rgba = await loop.run_in_executor(None, decode_to_rgba, item.image_path)
            logger.info("process.decoded image=%s size=%s mode=%s",
                        item.image_id, getattr(rgba, "size", None), getattr(rgba, "mode", None))
        except Exception as exc:
            logger.warning("decoding failed for %s: %s", item.image_path, exc)
            await self.bus.publish(
                item.task_id,
                Event(
                    name="image_failed",
                    data={"image_id": item.image_id, "error": "Image illisible ou corrompue."},
                ),
            )
            await self._on_terminal(item, "failed")
            return

        # 2) Cache hit?
        cache_hit = self.cache.exists(item.image_hash, item.model)
        logger.info("process.cache image=%s hash=%s model=%s hit=%s",
                    item.image_id, item.image_hash, item.model, cache_hit)
        if cache_hit:
            await self.bus.publish(
                item.task_id,
                Event(
                    name="image_done",
                    data={
                        "image_id": item.image_id,
                        "cutout_url": _cutout_url(item.image_hash, item.model),
                    },
                ),
            )
            await self._on_terminal(item, "processed")
            return

        # 3) Already-transparent passthrough
        if is_already_cutout(rgba):
            try:
                import io

                buf = io.BytesIO()
                rgba.save(buf, format="PNG")
                self.cache.write(item.image_hash, "passthrough", buf.getvalue())
                await self.bus.publish(
                    item.task_id,
                    Event(
                        name="image_done",
                        data={
                            "image_id": item.image_id,
                            "cutout_url": _cutout_url(item.image_hash, "passthrough"),
                        },
                    ),
                )
                await self._on_terminal(item, "processed")
                return
            except OSError as exc:
                logger.error("passthrough write failed: %s", exc)
                await self.bus.publish(
                    item.task_id,
                    Event(
                        name="image_failed",
                        data={
                            "image_id": item.image_id,
                            "error": "Espace disque insuffisant côté serveur.",
                        },
                    ),
                )
                await self._on_terminal(item, "failed")
                return

        # 4) Détourage IA
        await self.bus.publish(
            item.task_id,
            Event(
                name="image_progress",
                data={"image_id": item.image_id, "step": "Détourage IA"},
            ),
        )
        try:
            logger.info("process.detour.start image=%s model=%s alpha=%s",
                        item.image_id, item.model, item.alpha_matting)
            t0 = time.time()
            # Heartbeat : pendant que rembg tourne (silencieux), on publie un event
            # tous les 2 s pour (a) garder la connexion SSE en vie côté client,
            # (b) afficher l'avancement intra-étape côté frontend.
            heartbeat = asyncio.create_task(
                self._detour_heartbeat(item.task_id, item.image_id, t0)
            )
            try:
                png_bytes = await self.runner.detour(item.image_path, item.model, item.alpha_matting)
            finally:
                heartbeat.cancel()
                try:
                    await heartbeat
                except (asyncio.CancelledError, Exception):
                    pass
            logger.info("process.detour.done image=%s bytes=%d elapsed=%.2fs",
                        item.image_id, len(png_bytes), time.time() - t0)
        except OSError as exc:
            logger.error("disk full while detouring: %s", exc)
            await self.bus.publish(
                item.task_id,
                Event(
                    name="image_failed",
                    data={
                        "image_id": item.image_id,
                        "error": "Espace disque insuffisant côté serveur.",
                    },
                ),
            )
            await self._on_terminal(item, "failed")
            return
        except Exception as exc:
            logger.warning("rembg failed for %s: %s", item.image_id, exc)
            await self.bus.publish(
                item.task_id,
                Event(
                    name="image_failed",
                    data={
                        "image_id": item.image_id,
                        "error": "Échec du détourage. Réessayez avec un autre modèle.",
                    },
                ),
            )
            await self._on_terminal(item, "failed")
            return

        try:
            self.cache.write(item.image_hash, item.model, png_bytes)
        except OSError as exc:
            logger.error("cache write failed: %s", exc)
            await self.bus.publish(
                item.task_id,
                Event(
                    name="image_failed",
                    data={
                        "image_id": item.image_id,
                        "error": "Espace disque insuffisant côté serveur.",
                    },
                ),
            )
            await self._on_terminal(item, "failed")
            return

        await self.bus.publish(
            item.task_id,
            Event(
                name="image_done",
                data={
                    "image_id": item.image_id,
                    "cutout_url": _cutout_url(item.image_hash, item.model),
                },
            ),
        )
        await self._on_terminal(item, "processed")


def _cutout_url(image_hash: str, model: str) -> str:
    return f"/api/cutout/{image_hash}?model={model}"
