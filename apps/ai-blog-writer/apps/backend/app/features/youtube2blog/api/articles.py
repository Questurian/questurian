"""Completed-article storage routes for YouTube2Blog."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core import cleanup_run, clear_all_runs, read_status
from app.core.staff_auth import require_staff

from ..storage import get_all_completed_articles

router = APIRouter()


@router.post("/clear", dependencies=[Depends(require_staff)])
async def clear_database() -> JSONResponse:
    """Clear ALL YouTube2Blog data from the database."""
    count = clear_all_runs(feature="youtube2blog")
    return JSONResponse(
        {
            "message": f"Cleared {count} runs from database",
            "deleted_runs": count,
        }
    )


@router.get("/articles")
async def get_articles() -> JSONResponse:
    """Get all completed YouTube2Blog articles."""
    return JSONResponse(get_all_completed_articles())


@router.delete("/articles/{run_id}", dependencies=[Depends(require_staff)])
async def delete_article(run_id: str) -> JSONResponse:
    """Delete a YouTube2Blog run and all of its stored data."""
    status = read_status(run_id)
    if not status or status.get("feature") != "youtube2blog":
        raise HTTPException(status_code=404, detail="Article not found")

    cleanup_run(run_id)
    return JSONResponse(
        {
            "message": "Article deleted",
            "run_id": run_id,
        }
    )
