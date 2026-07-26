"""Cohesive URL2Blog graph node family."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from fastapi.responses import JSONResponse

from ..dependencies import PipelineDependencies
from ..observability import append_stage_trace
from ..pipeline_v2.context import _pipeline_v2_prepare_context
from ..pipeline_v2.editorial import _pipeline_v2_run_editorial_phase
from ..pipeline_v2.editorial_recheck import (
    _pipeline_v2_run_editorial_post_recheck_phase,
)
from ..pipeline_v2.fact_length import _pipeline_v2_run_fact_length_phase
from ..pipeline_v2.finalize import _pipeline_v2_finalize_response
from ..pipeline_v2.intake import (
    _pipeline_v2_run_stage1,
    _pipeline_v2_run_stage2,
)
from ..pipeline_v2.rewrite_quality import _pipeline_v2_run_rewrite_quality_phase
from .routing import (
    apply_editorial_rollback,
    evaluate_editorial_gate,
    evaluate_fact_gate,
    evaluate_rewrite_gate,
)
from .state import Url2BlogGraphState

logger = logging.getLogger(__name__)


@dataclass
class Url2BlogNodeContext:
    request: Any
    dependencies: PipelineDependencies
    response_holder: dict[str, JSONResponse | None]

    def _record(self, run_id: str, stage: str, data: dict[str, Any]) -> None:
        self.dependencies.recorder.record_stage(run_id, stage, data)

    def _persist_trace(self, run_id: str, stage_trace: list[dict[str, Any]]) -> None:
        if not stage_trace:
            return
        try:
            self._record(run_id, "pipeline_trace", {"trace": stage_trace})
        except Exception:  # noqa: BLE001
            logger.exception("Failed persisting URL2Blog pipeline trace")

    async def stage_1(self, state: Url2BlogGraphState) -> Url2BlogGraphState:
        result = await _pipeline_v2_run_stage1(
            request=self.request,
            run_id=state["run_id"],
            selected_model_name=state["selected_model_name"],
            include_debug=state["include_debug"],
            dependencies=self.dependencies,
            stage_trace=list(state.get("stage_trace") or []),
        )
        self._persist_trace(state["run_id"], list(result.get("trace") or []))
        return {
            "stage1_payload": dict(result.get("stage1_payload") or {}),
            "stage_trace": list(result.get("trace") or []),
            "normalized_title": str(result.get("normalized_title") or ""),
            "normalized_content": str(result.get("normalized_content") or ""),
            "normalized_language": str(result.get("normalized_language") or "English"),
            "source_word_count": int(result.get("source_word_count") or 0),
            "min_expanded_word_target": int(
                result.get("min_expanded_word_target") or 0
            ),
        }

    async def stage_2(self, state: Url2BlogGraphState) -> Url2BlogGraphState:
        parse_metrics = dict(state.get("json_parse_metrics") or {})
        result = await _pipeline_v2_run_stage2(
            request=self.request,
            run_id=state["run_id"],
            selected_model_name=state["selected_model_name"],
            include_debug=state["include_debug"],
            json_parse_metrics=parse_metrics,
            stage_trace=list(state.get("stage_trace") or []),
            normalized_title=str(state.get("normalized_title") or ""),
            normalized_content=str(state.get("normalized_content") or ""),
            normalized_language=str(state.get("normalized_language") or "English"),
            dependencies=self.dependencies,
        )
        self._persist_trace(state["run_id"], list(result.get("trace") or []))
        return {
            "stage2_payload": dict(result.get("stage2_payload") or {}),
            "stage_trace": list(result.get("trace") or []),
            "json_parse_metrics": parse_metrics,
        }

    async def rewrite_quality(self, state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog rewrite quality node start")
        context = _pipeline_v2_prepare_context(
            request=self.request,
            run_id=state["run_id"],
            selected_model_name=state["selected_model_name"],
            execution_profile=state["execution_profile"],
            stage1_payload=dict(state.get("stage1_payload") or {}),
            stage2_payload=dict(state.get("stage2_payload") or {}),
            stage_trace=list(state.get("stage_trace") or []),
            json_parse_metrics=dict(state.get("json_parse_metrics") or {}),
            dependencies=self.dependencies,
        )
        retry_count = int(state.get("rewrite_quality_retry_count") or 0)
        context["rewrite_quality_retry_count"] = retry_count
        context = _pipeline_v2_run_rewrite_quality_phase(context, self.dependencies)
        self._persist_trace(state["run_id"], list(context.get("stage_trace") or []))

        while True:
            decision, gate_data = evaluate_rewrite_gate(
                context=context,
                retry_count=retry_count,
            )
            logger.debug(
                "URL2Blog rewrite gate decision=%s retry_count=%d "
                "score=%.2f ngram=%.3f",
                decision,
                retry_count,
                gate_data["overall_score"],
                gate_data["ngram_overlap"],
            )
            self._record(state["run_id"], "rewrite_quality_gate", gate_data)
            context["rewrite_quality_gate"] = gate_data
            context["stage_trace"] = append_stage_trace(
                stage_trace=list(context.get("stage_trace") or []),
                include_debug=bool(state.get("include_debug")),
                stage="rewrite_quality_gate",
                output=gate_data,
            )
            self._persist_trace(state["run_id"], list(context.get("stage_trace") or []))
            if decision == "fail":
                raise RuntimeError(str(gate_data.get("failure_reason")))
            if decision == "pass":
                break

            retry_count += 1
            quality_feedback = dict(context.get("quality") or {})
            retry_feedback = {
                "overall_score": quality_feedback.get("overall_score"),
                "quality_summary": quality_feedback.get("quality_summary"),
                "required_revisions": list(
                    quality_feedback.get("required_revisions") or []
                ),
                "ngram_overlap": context.get("ngram_overlap"),
            }
            context["rewrite_quality_retry_count"] = retry_count
            context["rewrite_retry_feedback"] = retry_feedback
            self._record(
                state["run_id"],
                "rewrite_quality_retry",
                {
                    "retry_count": retry_count,
                    "retry_feedback": retry_feedback,
                },
            )
            context = _pipeline_v2_run_rewrite_quality_phase(context, self.dependencies)
            self._persist_trace(state["run_id"], list(context.get("stage_trace") or []))

        logger.debug("URL2Blog rewrite quality node complete")
        return {
            "pipeline_context": context,
            "rewrite_quality_retry_count": retry_count,
            "stage_trace": list(context.get("stage_trace") or []),
            "json_parse_metrics": dict(context.get("json_parse_metrics") or {}),
        }

    async def fact_length(self, state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog fact/length node start")
        context = dict(state.get("pipeline_context") or {})
        retry_count = int(state.get("fact_retry_count") or 0)
        context = _pipeline_v2_run_fact_length_phase(context, self.dependencies)
        self._persist_trace(state["run_id"], list(context.get("stage_trace") or []))

        while True:
            decision, gate_data = evaluate_fact_gate(
                context=context,
                retry_count=retry_count,
            )
            logger.debug(
                "URL2Blog fact gate decision=%s retry_count=%d "
                "score=%.2f missing_high=%d",
                decision,
                retry_count,
                gate_data["coverage_score"],
                gate_data["missing_high_count"],
            )
            self._record(state["run_id"], "fact_gate", gate_data)
            context["fact_gate"] = gate_data
            context["stage_trace"] = append_stage_trace(
                stage_trace=list(context.get("stage_trace") or []),
                include_debug=bool(state.get("include_debug")),
                stage="fact_gate",
                output=gate_data,
            )
            self._persist_trace(state["run_id"], list(context.get("stage_trace") or []))
            if decision == "pass":
                if gate_data["pass_mode"] == "fallback_unverified_facts":
                    context["fact_coverage_warning"] = {
                        "message": gate_data.get("fact_warning"),
                        "coverage_score": gate_data.get("coverage_score"),
                        "coverage_threshold": gate_data.get("coverage_threshold"),
                        "missing_facts": list(gate_data.get("missing_facts") or []),
                        "coverage_summary": gate_data.get("coverage_summary"),
                    }
                    logger.warning(
                        "URL2Blog fact gate passing with unverified facts: %s",
                        gate_data.get("fact_warning"),
                    )
                break

            retry_count += 1
            self._record(state["run_id"], "fact_retry", {"retry_count": retry_count})
            context = _pipeline_v2_run_fact_length_phase(context, self.dependencies)
            self._persist_trace(state["run_id"], list(context.get("stage_trace") or []))

        logger.debug("URL2Blog fact/length node complete")
        return {
            "pipeline_context": context,
            "fact_retry_count": retry_count,
            "stage_trace": list(context.get("stage_trace") or []),
            "json_parse_metrics": dict(context.get("json_parse_metrics") or {}),
        }

    async def editorial(self, state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog editorial node start")
        context = dict(state.get("pipeline_context") or {})
        context = _pipeline_v2_run_editorial_phase(context, self.dependencies)
        gate_data = evaluate_editorial_gate(context=context)
        logger.debug(
            "URL2Blog editorial gate decision=%s pre_words=%d post_words=%d",
            gate_data["decision"],
            gate_data["pre_editorial_word_count"],
            gate_data["post_editorial_word_count"],
        )
        self._record(state["run_id"], "editorial_gate", gate_data)
        context["editorial_gate"] = gate_data
        context["stage_trace"] = append_stage_trace(
            stage_trace=list(context.get("stage_trace") or []),
            include_debug=bool(state.get("include_debug")),
            stage="editorial_gate",
            output=gate_data,
        )

        if gate_data["decision"] == "rollback":
            context, rollback_data = apply_editorial_rollback(context=context)
            self._record(state["run_id"], "editorial_rollback", rollback_data)
            context["stage_trace"] = append_stage_trace(
                stage_trace=list(context.get("stage_trace") or []),
                include_debug=bool(state.get("include_debug")),
                stage="editorial_rollback",
                output=rollback_data,
            )
        else:
            context = _pipeline_v2_run_editorial_post_recheck_phase(
                context, self.dependencies
            )

        self._persist_trace(state["run_id"], list(context.get("stage_trace") or []))
        logger.debug("URL2Blog editorial node complete")
        return {
            "pipeline_context": context,
            "stage_trace": list(context.get("stage_trace") or []),
            "json_parse_metrics": dict(context.get("json_parse_metrics") or {}),
        }

    async def finalize(self, state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog finalize node start")
        context = dict(state.get("pipeline_context") or {})
        self.response_holder["response"] = _pipeline_v2_finalize_response(
            context, self.dependencies
        )
        logger.debug("URL2Blog finalize node complete")
        return {"completed": True}


def build_url2blog_nodes(
    context: Url2BlogNodeContext,
) -> dict[str, Any]:
    return {
        "stage_1": context.stage_1,
        "stage_2": context.stage_2,
        "rewrite_quality": context.rewrite_quality,
        "fact_length": context.fact_length,
        "editorial": context.editorial,
        "finalize": context.finalize,
    }
