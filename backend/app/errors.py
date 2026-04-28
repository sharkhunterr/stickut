"""French-detail HTTPException helper used by every route."""

from __future__ import annotations

from fastapi import HTTPException


def fr_error(status_code: int, detail: str) -> HTTPException:
    """Return an HTTPException with `{"detail": "<message FR>"}` shape."""
    return HTTPException(status_code=status_code, detail=detail)
