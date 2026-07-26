"""Payload sync-bookkeeping routes for YouTube2Blog articles."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..storage import get_article_sync_status, mark_article_synced

router = APIRouter()


@router.post("/articles/{run_id}/sync")
async def mark_article_as_synced(run_id: str, request: dict) -> JSONResponse:
    """
    Mark an article as synced to Payload CMS.

    Once synced, the article should be edited in Payload CMS, not this app.
    """
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
    """Get the sync status of an article."""
    status = get_article_sync_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Article not found")
    return JSONResponse(status)
