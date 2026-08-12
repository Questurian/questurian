"""Deep-expansion routes for completed YouTube2Blog articles."""

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core import read_stage_result, read_status
from app.core.staff_auth import require_staff

from ..config import Y2B_PRIMARY_MODEL
from ..models import DeepExpandRequest, ListicleDetectRequest
from ..stages.stage_deep_expand import detect_listicle, run_deep_expand
from .validation import require_valid_model

router = APIRouter()


@router.post("/{run_id}/expand/detect", dependencies=[Depends(require_staff)])
async def detect_article_listicle(
    run_id: str,
    request: ListicleDetectRequest,
) -> JSONResponse:
    """Synchronously detect whether an article is a listicle and extract its items."""
    require_valid_model(request.model)
    result = detect_listicle(
        request.article,
        request.title,
        model_name=request.model or Y2B_PRIMARY_MODEL,
    )
    return JSONResponse(result)


@router.post("/{run_id}/expand", dependencies=[Depends(require_staff)])
async def start_deep_expand(
    run_id: str,
    request: DeepExpandRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Start a deep expansion job for a completed article."""
    require_valid_model(request.model)

    expand_job_id = str(uuid4())
    background_tasks.add_task(
        run_deep_expand,
        expand_job_id,
        request.article,
        request.article_type,
        request.title,
        request.model or Y2B_PRIMARY_MODEL,
        request.rewrite_items or None,
    )

    return JSONResponse({"expand_job_id": expand_job_id})


@router.get("/expand/{expand_job_id}/status")
async def get_expand_status(expand_job_id: str) -> JSONResponse:
    """Poll the status of a deep expansion job."""
    status = read_status(expand_job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Expansion job not found.")
    return JSONResponse(status)


@router.get("/expand/{expand_job_id}/result")
async def get_expand_result(expand_job_id: str) -> JSONResponse:
    """Get the result of a completed deep expansion job."""
    result = read_stage_result(expand_job_id, "expand_result")
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Expansion result not available yet.",
        )
    return JSONResponse(result)
