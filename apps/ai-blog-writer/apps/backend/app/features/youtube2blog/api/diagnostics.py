"""Run diagnostics routes for YouTube2Blog."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core import read_output, read_stage_result, read_status

router = APIRouter()

Y2B_DEBUG_STAGE_ORDER = [
    "stage_0",
    "stage_1",
    "stage_1_quality_gate",
    "stage_1_repair",
    "stage_2",
    "stage_2_quality_gate",
    "stage_2_retry",
    "stage_3_guideline",
    "stage_3_coverage",
    "stage_3_supplement",
    "stage_3",
    "stage_3_quality_gate",
    "stage_3_improve",
    "stage_seo_brief",
    "stage_seo_enrich",
    "stage_seo_quality_gate",
    "stage_seo_retry",
    "stage_seo_rollback",
    "stage_editorial_gate",
    "stage_editorial_augmentation",
    "stage_editorial_skip",
    "stage_4",
    "stage_5_quality_gate",
    "stage_5_retry",
    "langgraph_trace",
]


@router.get("/debug/{run_id}")
async def debug_run(run_id: str) -> JSONResponse:
    """Debug endpoint: shows all stage inputs and outputs for a run."""
    status = read_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Run not found.")

    stages = {}
    for stage_name in Y2B_DEBUG_STAGE_ORDER:
        stage_data = read_stage_result(run_id, stage_name)
        if stage_data:
            stages[stage_name] = stage_data

    return JSONResponse(
        {
            "run_id": run_id,
            "status": status,
            "stages": stages,
            "output": read_output(run_id),
        }
    )
