from datetime import datetime, timezone

from shared import PipelineMeta

from app.features.youtube2blog.run_recorder import RunRecorder


def _clock():
    return datetime(2026, 1, 2, 3, 4, tzinfo=timezone.utc)


def test_run_recorder_owns_stage_lifecycle_and_failure_status():
    statuses = []
    stages = []
    recorder = RunRecorder(
        status_writer=lambda run_id, payload, feature: statuses.append(
            (run_id, payload, feature)
        ),
        stage_writer=lambda run_id, stage, payload: stages.append(
            (run_id, stage, payload)
        ),
        clock=_clock,
    )

    recorder.start_stage("run-1", "stage_3")
    results = recorder.record_stage(
        "run-1",
        {},
        stage_name="stage_3",
        input_refs={"stage_2": "ref"},
        data={"article": "draft"},
    )
    recorder.fail("run-1", RuntimeError("boom"))

    assert results["stage_3"]["data"] == {"article": "draft"}
    assert stages[0][1] == "stage_3"
    assert statuses[0][1]["state"] == "running"
    assert statuses[-1][1] == {
        "run_id": "run-1",
        "stage": "stage_3",
        "state": "failed",
        "updated_at": "2026-01-02T03:04:00+00:00",
        "error": "boom",
    }


def test_run_recorder_finalizes_artifact_and_completion():
    statuses = []
    artifacts = []
    stage0 = {
        "run_id": "run-1",
        "stage": "stage_0",
        "created_at": _clock().isoformat(),
        "input_refs": {"source": "youtube-url"},
        "data": {},
    }
    recorder = RunRecorder(
        status_writer=lambda run_id, payload, feature: statuses.append(payload),
        artifact_writer=lambda run_id, payload: artifacts.append(payload),
        stage_reader=lambda run_id, stage: stage0,
        clock=_clock,
    )
    meta = PipelineMeta(
        run_id="run-1",
        version="test",
        created_at=_clock(),
        source="youtube-url",
    )

    recorder.finalize(
        run_id="run-1",
        meta=meta,
        stage_results={},
        markdown="# Final",
    )

    assert artifacts[0]["markdown"] == "# Final"
    assert "stage_0" in artifacts[0]["stages"]
    assert statuses[-1]["state"] == "completed"
