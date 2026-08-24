from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core import write_artifact, write_stage_result, write_status

from .config import FEATURE_NAME
from .observability import _now_iso

logger = logging.getLogger(__name__)

StageWriter = Callable[[str, str, dict[str, Any]], None]
ArtifactWriter = Callable[[str, dict[str, Any]], None]
UsageReader = Callable[[], dict[str, int]]
UsageWriter = Callable[[str, dict[str, int]], None]


@dataclass(frozen=True)
class RunRecorder:
    """The only Prompt2Blog adapter allowed to mutate run lifecycle storage."""

    status_writer: Callable[..., None] = write_status
    stage_writer: StageWriter = write_stage_result
    artifact_writer: ArtifactWriter = write_artifact
    clock: Callable[[], str] = _now_iso
    # Left unset by the pipeline's own tests and by any caller that builds a
    # recorder without a token tracker; attribution is then simply absent.
    usage_reader: UsageReader | None = None
    usage_writer: UsageWriter | None = None
    active_stages: dict[str, str] = field(
        default_factory=dict,
        compare=False,
        repr=False,
    )
    usage_marks: dict[str, dict[str, int]] = field(
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

    def _mark_usage(self, run_id: str) -> None:
        if self.usage_reader is None:
            return
        try:
            self.usage_marks[run_id] = dict(self.usage_reader())
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Prompt2Blog stage usage snapshot failed: %s", exc)
            self.usage_marks.pop(run_id, None)

    def _stage_usage(self, run_id: str, stage: str) -> dict[str, int] | None:
        # Only the stage that is currently open gets attribution. Debug dumps
        # like `pipeline_v2` and `langgraph_trace` are written under a name no
        # `start_stage` ever opened, and they are not stages that spend tokens.
        if self.usage_reader is None or self.active_stages.get(run_id) != stage:
            return None
        mark = self.usage_marks.get(run_id)
        if mark is None:
            return None
        try:
            current = dict(self.usage_reader())
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Prompt2Blog stage usage read failed: %s", exc)
            return None
        delta = {
            key: max(0, value - mark.get(key, 0)) for key, value in current.items()
        }
        # `stage_final_verify` records twice: the re-grounding call writes under
        # the stage name, then the verification summary does. Advancing the mark
        # on every write keeps the second one from re-charging the first's
        # tokens.
        self.usage_marks[run_id] = current
        return delta

    def start_stage(self, run_id: str, stage: str) -> None:
        self.active_stages[run_id] = stage
        self._mark_usage(run_id)
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
        stage_usage = self._stage_usage(run_id, stage)
        if stage_usage is not None:
            data = {**data, "stage_usage": stage_usage}
            if self.usage_writer is not None:
                try:
                    self.usage_writer(stage, stage_usage)
                except Exception as exc:  # pragma: no cover -- telemetry only
                    logger.warning(
                        "Prompt2Blog stage usage attribution failed: %s",
                        exc,
                    )
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
        self.usage_marks.pop(run_id, None)

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
        self.usage_marks.pop(run_id, None)
