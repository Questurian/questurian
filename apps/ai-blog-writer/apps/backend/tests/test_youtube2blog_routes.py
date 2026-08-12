import asyncio
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from shared import PipelineMeta, RawVideoRecord

import app.features.youtube2blog.routes as youtube2blog_routes
from app.features.youtube2blog.api import articles as youtube2blog_articles
from app.features.youtube2blog.api import diagnostics as youtube2blog_diagnostics
from app.features.youtube2blog.api import expansion as youtube2blog_expansion
from app.features.youtube2blog.api import pipeline as youtube2blog_pipeline
from app.features.youtube2blog.api import sync as youtube2blog_sync
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


def test_router_preserves_public_http_contract():
    client = _build_client()

    routes = {
        (route.path, method)
        for route in client.app.routes
        if route.path.startswith("/youtube2blog")
        for method in route.methods
    }

    assert routes == {
        ("/youtube2blog/from-url", "POST"),
        ("/youtube2blog/status/{run_id}", "GET"),
        ("/youtube2blog/tones", "GET"),
        ("/youtube2blog/result/{run_id}", "GET"),
        ("/youtube2blog/debug/{run_id}", "GET"),
        ("/youtube2blog/test-stage1", "POST"),
        ("/youtube2blog/test", "POST"),
        ("/youtube2blog/clear", "POST"),
        ("/youtube2blog/articles", "GET"),
        ("/youtube2blog/articles/{run_id}", "DELETE"),
        ("/youtube2blog/articles/{run_id}/sync", "POST"),
        ("/youtube2blog/articles/{run_id}/sync", "GET"),
        ("/youtube2blog/{run_id}/expand/detect", "POST"),
        ("/youtube2blog/{run_id}/expand", "POST"),
        ("/youtube2blog/expand/{expand_job_id}/status", "GET"),
        ("/youtube2blog/expand/{expand_job_id}/result", "GET"),
    }


def test_from_url_keeps_blocking_fetches_off_the_event_loop(monkeypatch):
    """Transcript extraction and the oEmbed title lookup are blocking network
    I/O. Awaited on the event loop thread they stall every other request for
    the length of the fetch, so both must be offloaded to a worker thread."""
    client = _build_client()
    ran_on_event_loop: dict[str, bool] = {}

    def _on_event_loop_thread() -> bool:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return False
        return True

    def fake_extract_transcript(_video_id: str):
        ran_on_event_loop["transcript"] = _on_event_loop_thread()
        return {"status": "completed", "transcript": "Transcript body"}

    def fake_fetch_oembed_title(_url: str):
        ran_on_event_loop["oembed"] = _on_event_loop_thread()
        return "Resolved Title"

    monkeypatch.setattr(
        youtube2blog_pipeline,
        "parse_youtube_video_url",
        lambda _url: YouTubeVideoSource(
            video_id="abc123DEF45",
            canonical_url="https://www.youtube.com/watch?v=abc123DEF45",
        ),
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "extract_transcript_sync",
        fake_extract_transcript,
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "fetch_oembed_title",
        fake_fetch_oembed_title,
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "initialize_run",
        lambda record, source, notes=None, owner_staff_id=None: _sample_meta(
            source=source, notes=notes
        ),
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "process_run",
        lambda record, meta, **kwargs: "# done",
    )

    response = client.post(
        "/youtube2blog/from-url",
        json={"url": "https://www.youtube.com/watch?v=abc123DEF45"},
    )

    assert response.status_code == 200
    assert ran_on_event_loop == {"transcript": False, "oembed": False}


def test_from_url_queues_single_run(monkeypatch):
    client = _build_client()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        youtube2blog_pipeline,
        "parse_youtube_video_url",
        lambda _url: YouTubeVideoSource(
            video_id="abc123DEF45",
            canonical_url="https://www.youtube.com/watch?v=abc123DEF45",
        ),
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "extract_transcript_sync",
        lambda _video_id: {
            "status": "completed",
            "transcript": "Transcript body",
        },
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "fetch_oembed_title",
        lambda _url: "Resolved Title",
    )

    def fake_initialize_run(
        record: RawVideoRecord,
        source: str,
        notes: str | None = None,
        owner_staff_id: str | None = None,
    ):
        captured["record"] = record
        captured["source"] = source
        captured["notes"] = notes
        captured["owner_staff_id"] = owner_staff_id
        return _sample_meta(source=source, notes=notes)

    def fake_process_run(record: RawVideoRecord, meta: PipelineMeta, **kwargs):
        captured["process_record"] = record
        captured["process_meta"] = meta
        captured["process_kwargs"] = kwargs
        return "# done"

    monkeypatch.setattr(youtube2blog_pipeline, "initialize_run", fake_initialize_run)
    monkeypatch.setattr(youtube2blog_pipeline, "process_run", fake_process_run)

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
    assert captured["owner_staff_id"] is None
    assert captured["process_meta"] is not None
    # A body carrying only `url` must queue the run with every option unset,
    # so the pipeline falls back to its configured defaults.
    assert captured["process_kwargs"] == {
        "model_name": None,
        "forced_article_type": None,
        "tone_id": None,
        "writing_model": None,
    }


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
        youtube2blog_pipeline,
        "parse_youtube_video_url",
        lambda _url: YouTubeVideoSource(
            video_id="abc123DEF45",
            canonical_url="https://www.youtube.com/watch?v=abc123DEF45",
        ),
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
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
        youtube2blog_pipeline,
        "parse_youtube_video_url",
        lambda _url: YouTubeVideoSource(
            video_id="abc123DEF45",
            canonical_url="https://www.youtube.com/watch?v=abc123DEF45",
        ),
    )
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "extract_transcript_sync",
        lambda _video_id: {
            "status": "completed",
            "transcript": "Transcript body",
        },
    )
    monkeypatch.setattr(youtube2blog_pipeline, "fetch_oembed_title", lambda _url: None)

    def fake_initialize_run(
        record: RawVideoRecord,
        source: str,
        notes: str | None = None,
        owner_staff_id: str | None = None,
    ):
        captured["record"] = record
        assert owner_staff_id is None
        return _sample_meta(source=source, notes=notes)

    monkeypatch.setattr(youtube2blog_pipeline, "initialize_run", fake_initialize_run)
    monkeypatch.setattr(
        youtube2blog_pipeline,
        "process_run",
        # Title fallback only; run options are irrelevant here.
        lambda _record, _meta, **_kwargs: "# done",
    )

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
        youtube2blog_diagnostics,
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

    monkeypatch.setattr(
        youtube2blog_diagnostics,
        "read_stage_result",
        fake_read_stage_result,
    )
    monkeypatch.setattr(
        youtube2blog_diagnostics,
        "read_output",
        lambda _run_id: None,
    )

    response = client.get("/youtube2blog/debug/run-123")

    assert response.status_code == 200
    payload = response.json()
    assert "stage_editorial_augmentation" in payload["stages"]


def test_article_storage_and_sync_routes_delegate_to_owned_adapters(monkeypatch):
    client = _build_client()
    deleted = []
    synced = []

    monkeypatch.setattr(
        youtube2blog_articles,
        "get_all_completed_articles",
        lambda: [{"run_id": "run-123"}],
    )
    monkeypatch.setattr(
        youtube2blog_articles,
        "read_status",
        lambda run_id: {"run_id": run_id, "feature": "youtube2blog"},
    )
    monkeypatch.setattr(
        youtube2blog_articles,
        "cleanup_run",
        lambda run_id: deleted.append(run_id),
    )
    monkeypatch.setattr(
        youtube2blog_sync,
        "mark_article_synced",
        lambda run_id, payload_id: synced.append((run_id, payload_id)) or True,
    )
    monkeypatch.setattr(
        youtube2blog_sync,
        "get_article_sync_status",
        lambda run_id: {"run_id": run_id, "synced_to_payload": True},
    )

    assert client.get("/youtube2blog/articles").json() == [{"run_id": "run-123"}]
    assert client.delete("/youtube2blog/articles/run-123").status_code == 200
    assert deleted == ["run-123"]

    sync_response = client.post(
        "/youtube2blog/articles/run-123/sync",
        json={"payload_article_id": 42},
    )
    assert sync_response.status_code == 200
    assert synced == [("run-123", 42)]
    assert client.get("/youtube2blog/articles/run-123/sync").json() == {
        "run_id": "run-123",
        "synced_to_payload": True,
    }


def test_deep_expansion_routes_validate_and_queue_without_pipeline_coupling(
    monkeypatch,
):
    client = _build_client()
    queued = []

    monkeypatch.setattr(
        youtube2blog_expansion,
        "uuid4",
        lambda: "expand-job-123",
    )
    monkeypatch.setattr(
        youtube2blog_expansion,
        "run_deep_expand",
        lambda *args: queued.append(args),
    )

    response = client.post(
        "/youtube2blog/run-123/expand",
        json={
            "article": "Article body",
            "article_type": "guide",
            "title": "Title",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"expand_job_id": "expand-job-123"}
    assert queued == [
        (
            "expand-job-123",
            "Article body",
            "guide",
            "Title",
            "gemini-2.5-flash-lite",
            None,
        )
    ]

    invalid_response = client.post(
        "/youtube2blog/run-123/expand",
        json={"article": "Article body", "model": "unsupported"},
    )
    assert invalid_response.status_code == 400
