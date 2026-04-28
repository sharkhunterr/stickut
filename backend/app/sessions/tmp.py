"""Per-session tmp directory management. No DB; just disk + in-memory map."""

from __future__ import annotations

import asyncio
import logging
import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("stickut.sessions")


@dataclass
class UploadedImage:
    id: str
    name: str
    format: str
    size_bytes: int
    hash: str
    tmp_path: Path
    width_px: int = 0
    height_px: int = 0
    is_already_cutout: bool = False


@dataclass
class Session:
    id: str
    tmp_dir: Path
    created_at: float = field(default_factory=time.time)
    last_activity_at: float = field(default_factory=time.time)
    images: dict[str, UploadedImage] = field(default_factory=dict)


class SessionStore:
    def __init__(self, root: Path, ttl_seconds: int) -> None:
        self.root = root
        self.ttl_seconds = ttl_seconds
        self.root.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, Session] = {}
        self._lock = asyncio.Lock()

    async def create(self) -> Session:
        async with self._lock:
            sid = uuid.uuid4().hex
            tmp_dir = self.root / sid
            tmp_dir.mkdir(parents=True, exist_ok=True)
            sess = Session(id=sid, tmp_dir=tmp_dir)
            self._sessions[sid] = sess
            return sess

    async def get(self, sid: str) -> Session | None:
        async with self._lock:
            sess = self._sessions.get(sid)
        if sess is None:
            return None
        if not sess.tmp_dir.exists():
            await self.drop(sid)
            return None
        return sess

    async def get_or_create(self, sid: str | None) -> Session:
        if sid:
            existing = await self.get(sid)
            if existing is not None:
                return existing
        return await self.create()

    async def touch(self, sid: str) -> None:
        async with self._lock:
            sess = self._sessions.get(sid)
            if sess is not None:
                sess.last_activity_at = time.time()

    async def drop(self, sid: str) -> None:
        async with self._lock:
            sess = self._sessions.pop(sid, None)
        if sess is not None:
            shutil.rmtree(sess.tmp_dir, ignore_errors=True)

    async def purge_loop(self) -> None:
        """Background coroutine: every 10 minutes, drop sessions older than TTL."""
        while True:
            try:
                await asyncio.sleep(600)
                cutoff = time.time() - self.ttl_seconds
                stale: list[str] = []
                async with self._lock:
                    for sid, sess in self._sessions.items():
                        if sess.last_activity_at < cutoff:
                            stale.append(sid)
                for sid in stale:
                    logger.info("Purging stale session %s", sid)
                    await self.drop(sid)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("session purge loop error: %s", exc)
