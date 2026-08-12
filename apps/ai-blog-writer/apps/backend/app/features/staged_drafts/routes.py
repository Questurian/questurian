"""
Staged-drafts API routes.

All routes are prefixed with /staged-drafts in the main router. Drafts are global
(no auth) and keyed by a ``storageKey`` query param plus the path ``draft_id``,
matching the frontend's per-feature storage namespaces.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.core.staff_auth import require_staff

from .storage import (
    StagedDraftConflict,
    delete_all_staged_drafts,
    delete_staged_draft,
    get_staged_draft,
    list_staged_drafts,
    update_staged_draft_if_unmodified,
    upsert_staged_draft,
)

router = APIRouter(prefix="/staged-drafts", tags=["staged-drafts"])


def _require_storage_key(storage_key: str) -> str:
    key = (storage_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="storageKey is required")
    return key


@router.get("")
async def list_drafts(
    storage_key: str = Query(..., alias="storageKey")
) -> JSONResponse:
    """List all staged drafts for a storage key, newest first."""
    key = _require_storage_key(storage_key)
    return JSONResponse({"drafts": list_staged_drafts(key)})


@router.get("/{draft_id}")
async def get_draft(
    draft_id: str, storage_key: str = Query(..., alias="storageKey")
) -> JSONResponse:
    """Get a single staged draft, or 404 if it does not exist."""
    key = _require_storage_key(storage_key)
    draft = get_staged_draft(key, draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Staged draft not found")
    return JSONResponse(draft)


@router.put("/{draft_id}")
async def put_draft(
    draft_id: str,
    body: Dict[str, Any],
    storage_key: str = Query(..., alias="storageKey"),
    expected_updated_at: Optional[str] = Query(None, alias="expectedUpdatedAt"),
) -> JSONResponse:
    """Upsert a staged draft (body is the full draft JSON).

    When ``expectedUpdatedAt`` is provided the write is conditional: it succeeds
    only if the stored draft's ``updatedAt`` still matches, otherwise a 409 is
    returned with the current server-side draft (``current`` is null if the
    draft was deleted). Without the param the write is an unconditional upsert,
    which is also how new drafts are created.
    """
    key = _require_storage_key(storage_key)
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Draft body must be an object")
    if expected_updated_at is None:
        saved = upsert_staged_draft(key, draft_id, body)
        return JSONResponse(saved)
    try:
        saved = update_staged_draft_if_unmodified(
            key, draft_id, body, expected_updated_at
        )
    except StagedDraftConflict as exc:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Staged draft was modified by someone else",
                "current": exc.current,
            },
        )
    return JSONResponse(saved)


@router.delete("/{draft_id}", status_code=204, dependencies=[Depends(require_staff)])
async def delete_draft(
    draft_id: str, storage_key: str = Query(..., alias="storageKey")
) -> None:
    """Delete a single staged draft (idempotent)."""
    key = _require_storage_key(storage_key)
    delete_staged_draft(key, draft_id)


@router.delete("", status_code=204, dependencies=[Depends(require_staff)])
async def clear_drafts(storage_key: str = Query(..., alias="storageKey")) -> None:
    """Delete all staged drafts for a storage key."""
    key = _require_storage_key(storage_key)
    delete_all_staged_drafts(key)
