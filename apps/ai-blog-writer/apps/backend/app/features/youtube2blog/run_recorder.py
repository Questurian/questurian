from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4

from shared import (
    PipelineArtifact,
    PipelineMeta,
    RawVideoRecord,
    Stage0Output,
    StageResult,
)

from app.config import PIPELINE_VERSION
from app.core import read_stage_result, write_artifact, write_stage_result, write_status

FEATURE_NAME = "youtube2blog"


def _now() -> datetime:
    return datetime.utcnow()


@dataclass(frozen=True)
class RunRecorder:
    """The only YouTube2Blog adapter that mutates run lifecycle storage."""

    status_writer: Callable[..., None] = write_status
    stage_writer: Callable[[str, str, dict[str, Any]], None] = write_stage_result
    artifact_writer: Callable[[str, dict[str, Any]], Any] = write_artifact
    stage_reader: Callable[[str, str], dict[str, Any] | None] = read_stage_result
    clock: Callable[[], datetime] = _now
    active_stages: dict[str, str] = field(
        default_factory=dict,
        compare=False,
        repr=False,
    )

    def initialize(
        self,
        record: RawVideoRecord,
        source: str,
        notes: str | None = None,
        owner_staff_id: str | None = None,
    ) -> PipelineMeta:
        run_id = str(uuid4())
        meta = PipelineMeta(
            run_id=run_id,
            version=PIPELINE_VERSION,
            created_at=self.clock(),
            source=source,
            notes=notes,
        )
        stage0 = Stage0Output(meta=meta, record=record)
        result = StageResult(
            run_id=run_id,
            stage="stage_0",
            created_at=self.clock(),
            input_refs={"source": source},
            data=stage0.model_dump(),
        )
        self.stage_writer(run_id, "stage_0", result.model_dump())
        self._write_status(
            run_id,
            "stage_0",
            "pending",
            owner_staff_id=owner_staff_id,
        )
        return meta

    def start_stage(self, run_id: str, stage: str) -> None:
        self.active_stages[run_id] = stage
        self._write_status(run_id, stage, "running")

    def record_stage(
        self,
        run_id: str,
        stage_results: dict[str, dict[str, Any]],
        *,
        stage_name: str,
        input_refs: dict[str, str],
        data: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        result = StageResult(
            run_id=run_id,
            stage=stage_name,
            created_at=self.clock(),
            input_refs=input_refs,
            data=data,
        )
        self.stage_writer(run_id, stage_name, result.model_dump())
        updated_results = dict(stage_results)
        updated_results[stage_name] = result.model_dump(mode="json")
        return updated_results

    def record_trace(self, run_id: str, payload: dict[str, str]) -> None:
        self.stage_writer(
            run_id,
            "langgraph_trace",
            {"created_at": self.clock().isoformat(), "data": payload},
        )

    def finalize(
        self,
        *,
        run_id: str,
        meta: PipelineMeta,
        stage_results: dict[str, dict[str, Any]],
        markdown: str,
    ) -> None:
        payload = dict(stage_results)
        stage0 = self.stage_reader(run_id, "stage_0")
        if stage0:
            payload["stage_0"] = stage0
        artifact = PipelineArtifact(
            run_id=run_id,
            meta=meta,
            stages={
                key: StageResult.model_validate(value) for key, value in payload.items()
            },
            markdown_path=f"db:outputs:{run_id}",
        )
        artifact_payload = artifact.model_dump()
        artifact_payload["markdown"] = markdown
        self.artifact_writer(run_id, artifact_payload)
        self._write_status(run_id, "complete", "completed")
        self.active_stages.pop(run_id, None)

    def fail(self, run_id: str, error: Exception) -> None:
        stage = self.active_stages.get(run_id, "graph_execution")
        self._write_status(run_id, stage, "failed", error=str(error))
        self.active_stages.pop(run_id, None)

    def _write_status(
        self,
        run_id: str,
        stage: str,
        state: str,
        *,
        error: str | None = None,
        owner_staff_id: str | None = None,
    ) -> None:
        kwargs: dict[str, str] = {"feature": FEATURE_NAME}
        if owner_staff_id is not None:
            kwargs["owner_staff_id"] = owner_staff_id
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "stage": stage,
                "state": state,
                "updated_at": self.clock().isoformat(),
                "error": error,
            },
            **kwargs,
        )
