"""Completed Article and Sync bookkeeping adapters for URL2Blog."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core import cleanup_run, read_status

from ..config import FEATURE_NAME
from ..storage import (
    get_all_completed_articles,
    get_article_sync_status,
    mark_article_synced,
)

router = APIRouter()


def _require_article(run_id: str) -> None:
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")


@router.get("/articles")
async def get_articles() -> JSONResponse:
    return JSONResponse(get_all_completed_articles())


@router.delete("/articles/{run_id}")
async def delete_article(run_id: str) -> JSONResponse:
    _require_article(run_id)
    cleanup_run(run_id)
    return JSONResponse({"message": "Article deleted", "run_id": run_id})


@router.post("/articles/{run_id}/sync")
async def mark_article_as_synced(run_id: str, request: dict) -> JSONResponse:
    _require_article(run_id)
    payload_article_id = request.get("payload_article_id")
    if not payload_article_id:
        raise HTTPException(status_code=400, detail="payload_article_id is required")
    if not mark_article_synced(run_id, payload_article_id):
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
    _require_article(run_id)
    status = get_article_sync_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Article not found")
    return JSONResponse(status)
