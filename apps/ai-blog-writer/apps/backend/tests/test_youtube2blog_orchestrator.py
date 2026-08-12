from datetime import datetime, timezone

from shared import PipelineMeta, RawVideoRecord

import app.features.youtube2blog.orchestrator as y2b_orchestrator


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


def _sample_meta() -> PipelineMeta:
    return PipelineMeta(
        run_id="run-123",
        version="test",
        created_at=datetime.now(timezone.utc),
        source="youtube-url",
        notes="test run",
    )


def test_initialize_run_delegates_to_recorder():
    record = _sample_record()
    expected = _sample_meta()

    class Recorder:
        def initialize(self, record_arg, source, notes, owner_staff_id=None):
            assert record_arg is record
            assert source == "youtube-url"
            assert notes == "notes"
            assert owner_staff_id is None
            return expected

    assert (
        y2b_orchestrator.initialize_run(
            record,
            "youtube-url",
            "notes",
            recorder=Recorder(),
        )
        is expected
    )


def test_process_run_uses_langgraph_runner(monkeypatch):
    record = _sample_record()
    meta = _sample_meta()
    captured: dict[str, object] = {}

    def fake_graph_runner(record_arg, meta_arg, **kwargs):
        captured["record"] = record_arg
        captured["meta"] = meta_arg
        captured["kwargs"] = kwargs
        return "# Graph Markdown"

    monkeypatch.setattr(y2b_orchestrator, "run_youtube2blog_graph", fake_graph_runner)

    markdown = y2b_orchestrator.process_run(
        record,
        meta,
        model_name="gemini-2.5-flash-lite",
        forced_article_type="listicle",
        tone_id="tone-abc",
        writing_model="gemini-2.5-pro",
    )

    assert markdown == "# Graph Markdown"
    assert captured["record"] is record
    assert captured["meta"] is meta
    assert captured["kwargs"] == {
        "model_name": "gemini-2.5-flash-lite",
        "forced_article_type": "listicle",
        "tone_id": "tone-abc",
        "writing_model": "gemini-2.5-pro",
        "dependencies": None,
    }
