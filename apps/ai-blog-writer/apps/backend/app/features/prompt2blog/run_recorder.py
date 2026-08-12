from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core import write_artifact, write_stage_result, write_status

from .config import FEATURE_NAME
from .observability import _now_iso

StageWriter = Callable[[str, str, dict[str, Any]], None]
ArtifactWriter = Callable[[str, dict[str, Any]], None]


@dataclass(frozen=True)
class RunRecorder:
    """The only Prompt2Blog adapter allowed to mutate run lifecycle storage."""

    status_writer: Callable[..., None] = write_status
    stage_writer: StageWriter = write_stage_result
    artifact_writer: ArtifactWriter = write_artifact
    clock: Callable[[], str] = _now_iso
    active_stages: dict[str, str] = field(
        default_factory=dict,
        compare=False,
        repr=False,
    )

    def queue(self, run_id: str, owner_staff_id: str | None = None) -> None:
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": "queued",
                "error": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
            owner_staff_id=owner_staff_id,
        )

    def start_stage(self, run_id: str, stage: str) -> None:
        self.active_stages[run_id] = stage
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": stage,
                "error": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )

    def record_stage(self, run_id: str, stage: str, data: dict[str, Any]) -> None:
        self.stage_writer(
            run_id,
            stage,
            {
                "created_at": self.clock(),
                "data": data,
            },
        )

    def record_artifact(self, run_id: str, artifact: dict[str, Any]) -> None:
        self.artifact_writer(run_id, artifact)

    def complete(self, run_id: str) -> None:
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "completed",
                "stage": "complete",
                "error": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )
        self.active_stages.pop(run_id, None)

    def active_stage(self, run_id: str, fallback: str = "graph_execution") -> str:
        return self.active_stages.get(run_id, fallback)

    def fail(
        self,
        run_id: str,
        stage: str,
        error: Exception,
        *,
        debug_data: dict[str, Any] | None = None,
    ) -> None:
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": stage,
                "error": str(error),
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )
        if debug_data is not None:
            self.record_stage(
                run_id,
                "pipeline_v2",
                {
                    "error": str(error),
                    "failed_stage": stage,
                    **debug_data,
                },
            )
        self.active_stages.pop(run_id, None)
