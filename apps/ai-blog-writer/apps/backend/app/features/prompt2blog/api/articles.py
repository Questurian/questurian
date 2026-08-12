from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core import cleanup_run, read_status
from app.core.staff_auth import authorize_article_deletion, require_staff
from app.core.storage import read_run_owner

from ..config import FEATURE_NAME
from ..storage import (
    get_all_completed_articles,
    get_article_sync_status,
    mark_article_synced,
)

router = APIRouter()


@router.get("/articles")
async def get_articles() -> JSONResponse:
    """Get all completed Prompt2Blog articles."""
    return JSONResponse(get_all_completed_articles())


@router.delete("/articles/{run_id}")
async def delete_article(
    run_id: str,
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Delete a Prompt2Blog run and all stored data."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    authorize_article_deletion(
        staff_user=staff_user,
        owner_staff_id=read_run_owner(run_id),
    )
    cleanup_run(run_id)
    return JSONResponse({"message": "Article deleted", "run_id": run_id})


@router.post("/articles/{run_id}/sync")
async def mark_article_as_synced(run_id: str, request: dict) -> JSONResponse:
    """Mark a Prompt2Blog article as synced to Payload CMS."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    payload_article_id = request.get("payload_article_id")
    if not payload_article_id:
        raise HTTPException(status_code=400, detail="payload_article_id is required")

    success = mark_article_synced(run_id, payload_article_id)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")

    return JSONResponse(
        {
            "message": "Article marked as synced",
            "run_id": run_id,
            "payload_article_id": payload_article_id,
        }
    )


@router.get("/articles/{run_id}/sync")
async def get_sync_status(run_id: str) -> JSONResponse:
    """Get Prompt2Blog article sync status."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    sync_status = get_article_sync_status(run_id)
    if not sync_status:
        raise HTTPException(status_code=404, detail="Article not found")
    return JSONResponse(sync_status)
