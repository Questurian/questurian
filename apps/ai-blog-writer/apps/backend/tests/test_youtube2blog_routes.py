from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from shared import PipelineMeta, RawVideoRecord

import app.features.youtube2blog.routes as youtube2blog_routes
from app.features.youtube2blog.youtube_source import YouTubeVideoSource


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(youtube2blog_routes.router)
    return TestClient(app)


def _sample_record() -> RawVideoRecord:
    now = datetime.now(timezone.utc).isoformat()
    return RawVideoRecord(
        video_id="abc123DEF45",
        title="Sample Video",
        description="",
        video_url="https://www.youtube.com/watch?v=abc123DEF45",
        published_at=now,
        transcript="Sample transcript",
        transcript_status="completed",
        transcript_extracted_at=now,
    )


def _sample_meta(source: str, notes: str | None = None) -> PipelineMeta:
    return PipelineMeta(
        run_id="run-123",
        version="test",
        created_at=datetime.now(timezone.utc),
        source=source,
        notes=notes,
    )


def test_from_url_queues_single_run(monkeypatch):
    client = _build_client()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        youtube2blog_routes,
        "parse_youtube_video_url",
        lambda _url: YouTubeVideoSource(
            video_id="abc123DEF45",
            canonical_url="https://www.youtube.com/watch?v=abc123DEF45",
        ),
    )
    monkeypatch.setattr(
        youtube2blog_routes,
        "extract_transcript_sync",
        lambda _video_id: {
            "status": "completed",
            "transcript": "Transcript body",
        },
    )
    monkeypatch.setattr(
        youtube2blog_routes,
        "fetch_oembed_title",
        lambda _url: "Resolved Title",
    )

    def fake_initialize_run(record: RawVideoRecord, source: str, notes: str | None = None):
        captured["record"] = record
        captured["source"] = source
        captured["notes"] = notes
        return _sample_meta(source=source, notes=notes)

    def fake_process_run(record: RawVideoRecord, meta: PipelineMeta):
        captured["process_record"] = record
        captured["process_meta"] = meta
        return "# done"

    monkeypatch.setattr(youtube2blog_routes, "initialize_run", fake_initialize_run)
    monkeypatch.setattr(youtube2blog_routes, "process_run", fake_process_run)

    response = client.post(
        "/youtube2blog/from-url",
        json={"url": "https://www.youtube.com/watch?v=abc123DEF45"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "run-123"
    assert payload["run_ids"] == ["run-123"]
    assert payload["message"] == "Queued 1 pipeline run."

    record = captured["record"]
    assert isinstance(record, RawVideoRecord)
    assert record.video_id == "abc123DEF45"
    assert record.title == "Resolved Title"
    assert record.transcript == "Transcript body"
    assert record.transcript_status == "completed"
    assert captured["source"] == "youtube-url"
    assert str(captured["notes"]).startswith("url:https://www.youtube.com/watch?v=")
    assert captured["process_meta"] is not None


def test_from_url_rejects_invalid_or_non_video_url():
    client = _build_client()
    response = client.post(
        "/youtube2blog/from-url",
        json={"url": "https://www.youtube.com/channel/UC123456789"},
    )
    assert response.status_code == 400


def test_from_url_returns_422_when_transcript_unavailable(monkeypatch):
    client = _build_client()

    monkeypatch.setattr(
        youtube2blog_routes,
        "parse_youtube_video_url",
        lambda _url: YouTubeVideoSource(
            video_id="abc123DEF45",
            canonical_url="https://www.youtube.com/watch?v=abc123DEF45",
        ),
    )
    monkeypatch.setattr(
        youtube2blog_routes,
        "extract_transcript_sync",
        lambda _video_id: {
            "status": "unavailable",
            "error": "No transcript found for this video.",
        },
    )

    response = client.post(
        "/youtube2blog/from-url",
        json={"url": "https://www.youtube.com/watch?v=abc123DEF45"},
    )

    assert response.status_code == 422
    assert "No transcript found for this video." in response.json()["detail"]


def test_from_url_uses_fallback_title_when_oembed_fails(monkeypatch):
    client = _build_client()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        youtube2blog_routes,
        "parse_youtube_video_url",
        lambda _url: YouTubeVideoSource(
            video_id="abc123DEF45",
            canonical_url="https://www.youtube.com/watch?v=abc123DEF45",
        ),
    )
    monkeypatch.setattr(
        youtube2blog_routes,
        "extract_transcript_sync",
        lambda _video_id: {
            "status": "completed",
            "transcript": "Transcript body",
        },
    )
    monkeypatch.setattr(youtube2blog_routes, "fetch_oembed_title", lambda _url: None)

    def fake_initialize_run(record: RawVideoRecord, source: str, notes: str | None = None):
        captured["record"] = record
        return _sample_meta(source=source, notes=notes)

    monkeypatch.setattr(youtube2blog_routes, "initialize_run", fake_initialize_run)
    monkeypatch.setattr(youtube2blog_routes, "process_run", lambda _record, _meta: "# done")

    response = client.post(
        "/youtube2blog/from-url",
        json={"url": "https://www.youtube.com/watch?v=abc123DEF45"},
    )

    assert response.status_code == 200
    record = captured["record"]
    assert isinstance(record, RawVideoRecord)
    assert record.title == "YouTube Video abc123DEF45"


def test_upload_csv_route_removed():
    client = _build_client()
    response = client.post("/youtube2blog/upload")
    assert response.status_code == 404


def test_debug_includes_editorial_augmentation_stage(monkeypatch):
    client = _build_client()

    monkeypatch.setattr(
        youtube2blog_routes,
        "read_status",
        lambda run_id: {
            "run_id": run_id,
            "stage": "stage_editorial_augmentation",
            "state": "running",
            "error": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    def fake_read_stage_result(_run_id: str, stage: str):
        if stage == "stage_editorial_augmentation":
            return {
                "data": {
                    "augmentation_applied": True,
                    "augmentation_summary": "Added editorial blocks.",
                }
            }
        return None

    monkeypatch.setattr(youtube2blog_routes, "read_stage_result", fake_read_stage_result)
    monkeypatch.setattr(youtube2blog_routes, "read_output", lambda _run_id: None)

    response = client.get("/youtube2blog/debug/run-123")

    assert response.status_code == 200
    payload = response.json()
    assert "stage_editorial_augmentation" in payload["stages"]
