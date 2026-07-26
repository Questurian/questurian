"""Run query adapters for URL2Blog."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core import (
    get_all_runs,
    read_all_stage_results,
    read_output,
    read_status,
)

from ..config import FEATURE_NAME
from ..observability import read_langgraph_trace

router = APIRouter()


def _require_url2blog_run(run_id: str) -> dict[str, Any]:
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return status


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    return JSONResponse(_require_url2blog_run(run_id))


@router.get("/status-latest")
async def get_latest_status() -> JSONResponse:
    runs = get_all_runs(feature=FEATURE_NAME)
    if not runs:
        raise HTTPException(status_code=404, detail="No URL2Blog runs found.")
    latest = runs[0]
    return JSONResponse(
        {
            "run_id": latest.get("run_id"),
            "feature": FEATURE_NAME,
            "state": latest.get("status"),
            "stage": latest.get("stage"),
            "updated_at": latest.get("updated_at"),
        }
    )


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    _require_url2blog_run(run_id)
    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    trace_payload = read_langgraph_trace(run_id)
    artifact = output["artifact"]
    if trace_payload and isinstance(artifact, dict):
        pipeline_payload = artifact.get("pipeline_v2")
        if isinstance(pipeline_payload, dict):
            pipeline_payload.update(trace_payload)

    response_payload: dict[str, Any] = {
        "run_id": run_id,
        "markdown": output["markdown"],
        "artifact": artifact,
    }
    response_payload.update(trace_payload)
    return JSONResponse(response_payload)


@router.get("/debug/{run_id}")
async def debug_run(run_id: str) -> JSONResponse:
    status = _require_url2blog_run(run_id)
    return JSONResponse(
        {
            "run_id": run_id,
            "status": status,
            "stages": read_all_stage_results(run_id),
            "output": read_output(run_id),
        }
    )
