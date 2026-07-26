from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from shared import PipelineMeta, RawVideoRecord

from ..dependencies import YouTube2BlogDependencies
from .state import YouTube2BlogGraphState


@dataclass(frozen=True)
class YouTube2BlogNodeContext:
    record: RawVideoRecord
    meta: PipelineMeta
    active_model: str
    writing_model: str
    tone_guidance: str
    dependencies: YouTube2BlogDependencies

    @property
    def run_id(self) -> str:
        return self.meta.run_id

    def start_stage(self, stage: str) -> None:
        self.dependencies.recorder.start_stage(self.run_id, stage)

    def stage_ref(self, run_id: str, stage: str) -> str:
        return f"data/runs/{run_id}/{stage}.json"

    def record_stage(
        self,
        state: YouTube2BlogGraphState,
        *,
        stage_name: str,
        input_refs: dict[str, str],
        data: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        return self.dependencies.recorder.record_stage(
            self.run_id,
            dict(state.get("stage_results") or {}),
            stage_name=stage_name,
            input_refs=input_refs,
            data=data,
        )
