"""Thin orchestrator for URL2Blog fact retention and length work."""

from typing import Any
from ..dependencies import PipelineDependencies
from .fact_length_audit import _FactLengthAudit
from .fact_length_expansion import _FactLengthExpansion
from .fact_length_repair import _FactLengthRepair
from .fact_length_setup import _FactLengthSetup


class _FactLengthPhase(
    _FactLengthSetup, _FactLengthRepair, _FactLengthExpansion, _FactLengthAudit
):

    def __init__(
        self,
        context: dict[str, Any],
        dependencies: PipelineDependencies,
    ) -> None:
        self.context = context
        self.dependencies = dependencies
        self.llm = dependencies.llm
        self.recorder = dependencies.recorder

    def run(self) -> dict[str, Any]:
        self._initialize()
        self._audit_and_repair_facts()
        self._prepare_length_expansion()
        self._expand_to_target_length()
        self._audit_final_length()
        self._persist_result()
        return self.context


def _pipeline_v2_run_fact_length_phase(
    context: dict[str, Any],
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    return _FactLengthPhase(context, dependencies).run()
