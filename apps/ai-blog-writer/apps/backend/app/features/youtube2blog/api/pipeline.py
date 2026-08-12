"""YouTube source intake and pipeline lifecycle routes."""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from shared import RawVideoRecord
from app.core import read_output, read_stage_result, read_status
from app.core.staff_auth import require_staff, staff_user_id
from app.shared.tone_profiles import load_tone_profiles, resolve_tone_profile
from app.shared.writer_models import resolve_writer_model

from ..models import YouTubeUrlRequest
from ..orchestrator import initialize_run, process_run
from ..transcript_extractor import extract_transcript_sync
from ..youtube_source import fetch_oembed_title, parse_youtube_video_url
from .validation import require_valid_model

router = APIRouter()


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
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Queue a YouTube2Blog run directly from a YouTube video URL."""
    require_valid_model(request.model)

    try:
        resolve_writer_model(request.writing_model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        resolve_tone_profile(request.tone_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        source = parse_youtube_video_url(request.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Both of these do blocking network I/O. Called directly they stall the
    # event loop for the whole fetch, freezing every other request.
    transcript_result = await run_in_threadpool(
        extract_transcript_sync,
        source.video_id,
    )
    if transcript_result.get("status") != "completed":
        detail = transcript_result.get("error") or "Transcript extraction failed."
        raise HTTPException(status_code=422, detail=detail)

    transcript = transcript_result.get("transcript", "")
    if not isinstance(transcript, str) or not transcript.strip():
        raise HTTPException(status_code=422, detail="Transcript extraction failed.")

    oembed_title = await run_in_threadpool(fetch_oembed_title, source.canonical_url)
    title = oembed_title or f"YouTube Video {source.video_id}"
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
        owner_staff_id=staff_user_id(staff_user),
    )
    background_tasks.add_task(
        process_run,
        record,
        meta,
        model_name=request.model,
        forced_article_type=request.forced_article_type,
        tone_id=request.tone_id,
        writing_model=request.writing_model,
    )

    return JSONResponse(
        {
            "run_id": meta.run_id,
            "run_ids": [meta.run_id],
            "message": "Queued 1 pipeline run.",
        }
    )


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get the status of a pipeline run."""
    status = read_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/tones")
async def get_tones() -> JSONResponse:
    """Return read-only article tone profiles for UI reference."""
    return JSONResponse({"tones": load_tone_profiles()})


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
