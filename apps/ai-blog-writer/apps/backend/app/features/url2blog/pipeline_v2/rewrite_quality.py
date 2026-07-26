"""Thin orchestrator for URL2Blog rewrite and quality work."""

from typing import Any
from .rewrite_quality_blueprint import _RewriteQualityBlueprint
from .rewrite_quality_composition import _RewriteQualityComposition
from .rewrite_quality_repair import _RewriteQualityRepair
from .rewrite_quality_setup import _RewriteQualitySetup


class _RewriteQualityPhase(
    _RewriteQualitySetup,
    _RewriteQualityBlueprint,
    _RewriteQualityComposition,
    _RewriteQualityRepair,
):

    def __init__(self, context: dict[str, Any]) -> None:
        self.context = context

    def run(self) -> dict[str, Any]:
        self._initialize()
        self._enrich_short_article()
        self._extract_source_facts()
        self._prepare_editorial_blueprint()
        self._build_rewrite_prompts()
        self._run_initial_rewrite()
        self._audit_initial_quality()
        self._run_second_pass_if_needed()
        self._persist_result()
        return self.context


def _pipeline_v2_run_rewrite_quality_phase(context: dict[str, Any]) -> dict[str, Any]:
    return _RewriteQualityPhase(context).run()
