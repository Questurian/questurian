"""Development-only pipeline probe routes."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from shared import RawVideoRecord

from ..stages import stage_1_clean_transcript

router = APIRouter()

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


def _run_stage1_probe(*, success_message: str, error_detail: str) -> JSONResponse:
    try:
        stage1_output = stage_1_clean_transcript(TEST_RECORD)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=error_detail) from exc
    return JSONResponse(
        {
            "message": success_message,
            "stage_1": stage1_output.model_dump(),
        }
    )


@router.post("/test-stage1")
async def test_stage1() -> JSONResponse:
    """Test Stage 1 only (requires AI)."""
    return _run_stage1_probe(
        success_message="Stage 1 test completed successfully",
        error_detail="YouTube2Blog stage 1 test failed",
    )


@router.post("/test")
async def test_pipeline() -> JSONResponse:
    """Test endpoint that runs Stage 1 with a hardcoded test record."""
    return _run_stage1_probe(
        success_message="Pipeline test completed successfully",
        error_detail="YouTube2Blog pipeline test failed",
    )
