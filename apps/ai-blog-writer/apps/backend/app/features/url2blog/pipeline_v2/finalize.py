"""Thin response finalizer for URL2Blog pipeline v2."""

from typing import Any
from fastapi.responses import JSONResponse
from ..dependencies import PipelineDependencies
from .finalize_payload import _FinalizePayload
from .finalize_setup import _FinalizeSetup


class _FinalizeResponsePhase(_FinalizeSetup, _FinalizePayload):

    def __init__(
        self,
        context: dict[str, Any],
        dependencies: PipelineDependencies,
    ) -> None:
        self.context = context
        self.dependencies = dependencies
        self.llm = dependencies.llm
        self.recorder = dependencies.recorder

    def run(self) -> JSONResponse:
        self._initialize()
        self._build_markdown_and_excerpt()
        self._collect_stage_metadata()
        self._build_response_payload()
        self._attach_optional_debug()
        self._persist_artifact_and_status()
        return JSONResponse(self.response_payload)


def _pipeline_v2_finalize_response(
    context: dict[str, Any],
    dependencies: PipelineDependencies,
) -> JSONResponse:
    return _FinalizeResponsePhase(context, dependencies).run()
