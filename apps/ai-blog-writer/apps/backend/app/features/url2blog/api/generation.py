"""Pipeline command adapter for URL2Blog."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core.staff_auth import require_staff, staff_user_id
from app.shared.tone_profiles import resolve_tone_profile
from app.shared.writer_models import resolve_writer_model

from ..dependencies import PipelineDependencies
from ..graph import run_url2blog_pipeline_graph
from ..models import PipelineV2Request

router = APIRouter()
logger = logging.getLogger(__name__)


def get_pipeline_dependencies() -> PipelineDependencies:
    return PipelineDependencies()


@router.post("/pipeline-v2")
async def pipeline_v2(
    request: PipelineV2Request,
    dependencies: PipelineDependencies = Depends(get_pipeline_dependencies),
    staff_user=Depends(require_staff),
) -> JSONResponse:
    try:
        resolve_writer_model(request.writing_model)
        resolve_tone_profile(request.tone_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        response = await run_url2blog_pipeline_graph(
            request=request,
            dependencies=dependencies,
            owner_staff_id=staff_user_id(staff_user),
        )
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("URL2Blog pipeline-v2 request failed")
        raise HTTPException(
            status_code=500,
            detail=f"URL2Blog pipeline failed: {exc}",
        ) from exc
