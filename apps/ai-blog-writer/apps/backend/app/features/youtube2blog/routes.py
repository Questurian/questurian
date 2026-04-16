"""
YouTube2Blog API routes.

All routes are prefixed with /youtube2blog in the main router.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from uuid import uuid4

from shared import RawVideoRecord
from app.core import read_stage_result, read_status, read_output, clear_all_runs

from .orchestrator import initialize_run, process_run
from .stages.stage_deep_expand import detect_listicle, run_deep_expand
from .storage import (
    get_all_completed_articles,
    mark_article_synced,
    get_article_sync_status,
)
from .stages import stage_1_clean_transcript
from .transcript_extractor import extract_transcript_sync
from .youtube_source import (
    fetch_oembed_title,
    parse_youtube_video_url,
)

router = APIRouter(prefix="/youtube2blog", tags=["youtube2blog"])

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


VALID_Y2B_MODELS = {
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.1-flash-image-preview",
}


class YouTubeUrlRequest(BaseModel):
    url: str = Field(..., min_length=1)
    model: str | None = Field(default=None)
    forced_article_type: str | None = Field(default=None)


def _read_langgraph_trace(run_id: str) -> dict[str, str]:
    stage_payload = read_stage_result(run_id, "langgraph_trace")
    if not isinstance(stage_payload, dict):
        return {}
    data = stage_payload.get("data")
    if not isinstance(data, dict):
        return {}

    trace_payload: dict[str, str] = {}
    trace_url = data.get("langsmith_trace_url")
    if isinstance(trace_url, str) and trace_url.strip():
        trace_payload["langsmith_trace_url"] = trace_url.strip()
    trace_run_id = data.get("langsmith_trace_run_id")
    if isinstance(trace_run_id, str) and trace_run_id.strip():
        trace_payload["langsmith_trace_run_id"] = trace_run_id.strip()
    return trace_payload


@router.post("/from-url")
async def start_from_youtube_url(
    request: YouTubeUrlRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Queue a YouTube2Blog run directly from a YouTube video URL."""
    if request.model is not None and request.model not in VALID_Y2B_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model '{request.model}'. Valid options: {sorted(VALID_Y2B_MODELS)}",
        )

    try:
        source = parse_youtube_video_url(request.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    transcript_result = extract_transcript_sync(source.video_id)
    if transcript_result.get("status") != "completed":
        detail = transcript_result.get("error") or "Transcript extraction failed."
        raise HTTPException(status_code=422, detail=detail)

    transcript = transcript_result.get("transcript", "")
    if not isinstance(transcript, str) or not transcript.strip():
        raise HTTPException(status_code=422, detail="Transcript extraction failed.")

    title = (
        fetch_oembed_title(source.canonical_url)
        or f"YouTube Video {source.video_id}"
    )
    now_iso = datetime.now(timezone.utc).isoformat()

    record = RawVideoRecord(
        video_id=source.video_id,
        title=title,
        description="",
        video_url=source.canonical_url,
        published_at=now_iso,
        transcript=transcript,
        transcript_status="completed",
        transcript_extracted_at=now_iso,
    )

    meta = initialize_run(
        record,
        source="youtube-url",
        notes=f"url:{source.canonical_url}",
    )
    background_tasks.add_task(
        process_run,
        record,
        meta,
        model_name=request.model,
        forced_article_type=request.forced_article_type,
    )

    return JSONResponse({
        "run_id": meta.run_id,
        "run_ids": [meta.run_id],
        "message": "Queued 1 pipeline run.",
    })


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

    trace_payload = _read_langgraph_trace(run_id)

    if format == "md":
        response_payload: dict[str, str] = {
            "run_id": run_id,
            "markdown": output["markdown"],
            "filename": f"{run_id}.md",
        }
        response_payload.update(trace_payload)
        return JSONResponse(response_payload)

    artifact = output["artifact"]
    if trace_payload and isinstance(artifact, dict):
        artifact.update(trace_payload)

    response_payload: dict[str, object] = {
        "run_id": run_id,
        "markdown": output["markdown"],
        "artifact": artifact,
    }
    response_payload.update(trace_payload)

    return JSONResponse(response_payload)


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
    try:
        stage1_output = stage_1_clean_transcript(TEST_RECORD)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="YouTube2Blog stage 1 test failed") from exc
    return JSONResponse({
        "message": "Stage 1 test completed successfully",
        "stage_1": stage1_output.model_dump(),
    })


@router.post("/test")
async def test_pipeline() -> JSONResponse:
    """Test endpoint that runs Stage 1 with a hardcoded test record."""
    try:
        stage1_output = stage_1_clean_transcript(TEST_RECORD)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="YouTube2Blog pipeline test failed") from exc
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


class ListicleDetectRequest(BaseModel):
    article: str = Field(..., min_length=1)
    title: str = Field(default="")
    model: str | None = Field(default=None)


class DeepExpandRequest(BaseModel):
    article: str = Field(..., min_length=1)
    article_type: str = Field(default="")
    title: str = Field(default="")
    model: str | None = Field(default=None)
    rewrite_items: list[str] | None = Field(default=None)


@router.post("/{run_id}/expand/detect")
async def detect_article_listicle(
    run_id: str,
    request: ListicleDetectRequest,
) -> JSONResponse:
    """Synchronously detect whether an article is a listicle and extract its items."""
    if request.model is not None and request.model not in VALID_Y2B_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model '{request.model}'. Valid options: {sorted(VALID_Y2B_MODELS)}",
        )
    result = detect_listicle(
        request.article,
        request.title,
        model_name=request.model or "gemini-2.5-flash-lite",
    )
    return JSONResponse(result)


@router.post("/{run_id}/expand")
async def start_deep_expand(
    run_id: str,
    request: DeepExpandRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Start a deep expansion job for a completed article."""
    if request.model is not None and request.model not in VALID_Y2B_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model '{request.model}'. Valid options: {sorted(VALID_Y2B_MODELS)}",
        )

    expand_job_id = str(uuid4())
    background_tasks.add_task(
        run_deep_expand,
        expand_job_id,
        request.article,
        request.article_type,
        request.title,
        request.model or "gemini-2.5-flash-lite",
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
        raise HTTPException(status_code=404, detail="Expansion result not available yet.")
    return JSONResponse(result)


@router.get("/articles/{run_id}/sync")
async def get_sync_status(run_id: str) -> JSONResponse:
    """Get the sync status of an article."""
    status = get_article_sync_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Article not found")
    return JSONResponse(status)
