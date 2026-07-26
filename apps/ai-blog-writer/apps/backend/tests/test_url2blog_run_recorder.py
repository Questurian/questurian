from app.features.url2blog.run_recorder import RunRecorder


def test_run_recorder_owns_status_stage_and_artifact_writes() -> None:
    statuses = []
    stages = []
    artifacts = []
    recorder = RunRecorder(
        status_writer=lambda run_id, payload, feature: statuses.append(
            (run_id, payload, feature)
        ),
        stage_writer=lambda run_id, stage, payload: stages.append(
            (run_id, stage, payload)
        ),
        artifact_writer=lambda run_id, payload: artifacts.append((run_id, payload)),
        status_reader=lambda _run_id: {"stage": "rewrite_quality"},
        clock=lambda: "2026-07-25T12:00:00",
    )

    recorder.mark_running("run-12345", "stage_1")
    recorder.record_stage("run-12345", "stage_1", {"title": "Example"})
    recorder.record_artifact("run-12345", {"markdown": "# Example"})
    recorder.mark_failed("run-12345", RuntimeError("boom"))

    assert statuses[0][1]["state"] == "running"
    assert statuses[-1][1] == {
        "run_id": "run-12345",
        "state": "failed",
        "stage": "rewrite_quality",
        "error": "boom",
        "updated_at": "2026-07-25T12:00:00",
    }
    assert stages == [
        (
            "run-12345",
            "stage_1",
            {
                "created_at": "2026-07-25T12:00:00",
                "data": {"title": "Example"},
            },
        )
    ]
    assert artifacts == [("run-12345", {"markdown": "# Example"})]


def test_mark_failed_preserves_original_failure_when_storage_is_unavailable() -> None:
    def unavailable(*_args, **_kwargs) -> None:
        raise RuntimeError("storage unavailable")

    recorder = RunRecorder(
        status_writer=unavailable,
        status_reader=unavailable,
    )

    recorder.mark_failed("run-12345", RuntimeError("pipeline failed"))
