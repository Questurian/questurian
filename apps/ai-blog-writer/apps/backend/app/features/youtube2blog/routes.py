"""
YouTube2Blog API routes.

All routes are prefixed with /youtube2blog in the main router.
"""
import io
from typing import List
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from shared import RawVideoRecord
from app.core import read_stage_result, read_status, read_output, clear_all_runs
from utils import parse_csv

from .orchestrator import initialize_run, process_run
from .storage import (
    get_all_completed_articles,
    mark_article_synced,
    get_article_sync_status,
)
from .stages import stage_1_clean_transcript

router = APIRouter(prefix="/youtube2blog", tags=["youtube2blog"])

# Hardcoded test record for /test endpoint
TEST_RECORD = RawVideoRecord(
    video_id="test_video_001",
    title="How to Build AI Pipelines That Actually Work",
    description="A deep dive into building reliable AI pipelines.",
    video_url="https://youtube.com/watch?v=test123",
    published_at="2024-01-15T10:00:00Z",
    transcript="""Hey everyone, welcome back to the AI Engineering Podcast!
Before we dive in, this video is sponsored by CloudProvider - use code AIPOD for 20% off.

Okay, so today we're talking about building AI pipelines that actually work in production.
The key insight is that you need to break things down into small, verifiable steps.

Each stage should have clear inputs and outputs. You should be able to inspect
what happened at each step. This is crucial for debugging when things go wrong.

Another important point: start simple. Don't try to build the perfect system on day one.
Get something working end to end, then iterate.

For example, if you're building a content pipeline, start with just two stages:
1. Parse the input data
2. Process it with AI

Once those work reliably, you can add more complexity.

The biggest mistake I see is people trying to be too clever too early.
Keep it simple. Make it work. Then make it better.

If you found this helpful, don't forget to like and subscribe!
And check out CloudProvider in the description below. See you next time!""",
    transcript_status="completed",
    transcript_extracted_at="2024-01-15T10:30:00Z",
)


@router.post("/upload")
async def upload_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> JSONResponse:
    """Upload a CSV file with YouTube video data to process."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    content = await file.read()
    text = content.decode("utf-8-sig")
    try:
        records = parse_csv(io.StringIO(text))
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    if not records:
        raise HTTPException(status_code=400, detail="CSV file has no rows.")

    batch_id = str(uuid4())
    run_ids: List[str] = []

    for record in records:
        meta = initialize_run(
            record,
            source=file.filename,
            notes=f"batch:{batch_id}",
        )
        run_ids.append(meta.run_id)
        background_tasks.add_task(process_run, record, meta)

    response_payload = {
        "batch_id": batch_id,
        "run_ids": run_ids,
        "message": f"Queued {len(run_ids)} pipeline runs.",
    }
    if len(run_ids) == 1:
        response_payload["run_id"] = run_ids[0]

    return JSONResponse(response_payload)


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get the status of a pipeline run."""
    status = read_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/result/{run_id}")
async def get_result(run_id: str, format: str = "json") -> JSONResponse:
    """Get the result of a completed pipeline run."""
    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    if format == "md":
        return JSONResponse({
            "run_id": run_id,
            "markdown": output["markdown"],
            "filename": f"{run_id}.md"
        })

    return JSONResponse({
        "run_id": run_id,
        "markdown": output["markdown"],
        "artifact": output["artifact"]
    })


@router.get("/debug/{run_id}")
async def debug_run(run_id: str) -> JSONResponse:
    """Debug endpoint: shows all stage inputs and outputs for a run."""
    status = read_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Run not found.")

    stages = {}
    for stage_name in ["stage_0", "stage_1", "stage_2", "stage_3", "stage_4"]:
        stage_data = read_stage_result(run_id, stage_name)
        if stage_data:
            stages[stage_name] = stage_data

    output = read_output(run_id)

    return JSONResponse({
        "run_id": run_id,
        "status": status,
        "stages": stages,
        "output": output
    })


@router.post("/test-stage1")
async def test_stage1() -> JSONResponse:
    """Test Stage 1 only (requires AI)."""
    stage1_output = stage_1_clean_transcript(TEST_RECORD)
    return JSONResponse({
        "message": "Stage 1 test completed successfully",
        "stage_1": stage1_output.model_dump(),
    })


@router.post("/test")
async def test_pipeline() -> JSONResponse:
    """Test endpoint that runs Stage 1 with a hardcoded test record."""
    stage1_output = stage_1_clean_transcript(TEST_RECORD)
    return JSONResponse({
        "message": "Pipeline test completed successfully",
        "stage_1": stage1_output.model_dump(),
    })


@router.post("/clear")
async def clear_database() -> JSONResponse:
    """Clear ALL YouTube2Blog data from the database."""
    count = clear_all_runs(feature="youtube2blog")
    return JSONResponse({
        "message": f"Cleared {count} runs from database",
        "deleted_runs": count
    })


@router.get("/articles")
async def get_articles() -> JSONResponse:
    """Get all completed YouTube2Blog articles."""
    articles = get_all_completed_articles()
    return JSONResponse(articles)


# Sync Status Endpoints
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

    return JSONResponse({
        "message": "Article marked as synced",
        "run_id": run_id,
        "payload_article_id": payload_article_id,
    })


@router.get("/articles/{run_id}/sync")
async def get_sync_status(run_id: str) -> JSONResponse:
    """Get the sync status of an article."""
    status = get_article_sync_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Article not found")
    return JSONResponse(status)
