"""YouTube2Blog LangGraph runner with explicit branch gates."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, TypedDict

from shared import (
    PipelineArtifact,
    PipelineMeta,
    RawVideoRecord,
    Stage1Output,
    Stage2Output,
    Stage3Output,
    Stage4Output,
    StageEditorialAugmentationOutput,
    StageResult,
)

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint,
    langgraph_trace,
    langsmith_trace_payload,
)
from app.core import read_stage_result, write_artifact, write_stage_result, write_status
from app.features.youtube2blog.config import (
    Y2B_EDITORIAL_GATE_MIN_PARAGRAPHS,
    Y2B_EDITORIAL_GATE_MIN_WORDS,
    Y2B_STAGE1_MAX_RETENTION_RATIO,
    Y2B_STAGE1_MIN_CLEANED_CHARS,
    Y2B_STAGE1_MIN_RETENTION_RATIO,
    Y2B_STAGE1_REPAIR_MAX_RETRIES,
    Y2B_STAGE2_CLASSIFICATION_MAX_RETRIES,
    Y2B_STAGE2_MIN_CONFIDENCE,
    Y2B_STAGE5_MIN_TITLE_SCORE,
    Y2B_STAGE5_TITLE_MAX_RETRIES,
)
from app.features.youtube2blog.stages import (
    stage_1_clean_transcript,
    stage_1_repair_transcript,
    stage_2_classify_article_type,
    stage_3_compose_from_parts,
    stage_3_coverage_check,
    stage_3_generate_supplement,
    stage_3_retrieve_guideline,
    stage_4_generate_title,
    stage_5_evaluate_title_quality,
    stage_5_generate_title_retry,
    stage_editorial_augmentation,
)
from app.features.youtube2blog.storage import read_article_type_names

logger = logging.getLogger(__name__)
FEATURE_NAME = "youtube2blog"


def _now() -> datetime:
    return datetime.utcnow()


def _stage_ref(run_id: str, stage: str) -> str:
    return f"data/runs/{run_id}/{stage}.json"


def _clean_title(title: str) -> str:
    cleaned = title.strip().strip("\"'")
    cleaned = cleaned.lstrip("#").strip()
    return cleaned


def _normalize_markdown_body(content: str) -> str:
    cleaned = content.strip()
    if not cleaned:
        return ""
    return re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()


def _build_final_markdown(title: str, content: str) -> str:
    body = _normalize_markdown_body(content)
    cleaned_title = _clean_title(title)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{body}".strip()
    return body


def _count_paragraphs(content: str) -> int:
    return len([chunk for chunk in re.split(r"\n\s*\n", content) if chunk.strip()])


def _count_words(content: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", content))


class YouTube2BlogGraphState(TypedDict, total=False):
    run_id: str

    stage1: dict[str, Any]
    stage1_retry_count: int
    stage1_gate_decision: str

    stage2: dict[str, Any]
    stage2_retry_count: int
    stage2_gate_decision: str

    stage3_guideline: str
    stage3_coverage: dict[str, Any]
    stage3_supplement: dict[str, str]
    stage3: dict[str, Any]

    stage_editorial_gate: dict[str, Any]
    stage_editorial_decision: str
    stage_editorial: dict[str, Any]
    stage3_for_title: dict[str, Any]

    stage4: dict[str, Any]
    stage5_retry_count: int
    stage5_gate: dict[str, Any]
    stage5_gate_decision: str
    stage5_feedback: str

    stage_results: dict[str, dict[str, Any]]
    markdown: str


def run_youtube2blog_graph(
    record: RawVideoRecord,
    meta: PipelineMeta,
) -> str:
    """Run YouTube2Blog as a gated multi-node LangGraph workflow."""
    from langgraph.graph import END, START, StateGraph

    run_id = meta.run_id
    current_stage = "stage_1"

    def _write_running_status(stage: str) -> None:
        nonlocal current_stage
        current_stage = stage
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": stage,
                "state": "running",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

    def _record_stage_result(
        state: YouTube2BlogGraphState,
        *,
        stage_name: str,
        input_refs: dict[str, str],
        data: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        result = StageResult(
            run_id=run_id,
            stage=stage_name,
            created_at=_now(),
            input_refs=input_refs,
            data=data,
        )
        write_stage_result(run_id, stage_name, result.model_dump())
        stage_results = dict(state.get("stage_results") or {})
        stage_results[stage_name] = result.model_dump(mode="json")
        return stage_results

    def stage_1_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_1")
        stage1 = stage_1_clean_transcript(record)
        stage_results = _record_stage_result(
            state,
            stage_name="stage_1",
            input_refs={"stage_0": _stage_ref(run_id, "stage_0")},
            data=stage1.model_dump(),
        )
        return {
            "stage1": stage1.model_dump(),
            "stage1_retry_count": int(state.get("stage1_retry_count", 0)),
            "stage_results": stage_results,
        }

    def stage_1_quality_gate_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_1_quality_gate")
        stage1 = Stage1Output.model_validate(state["stage1"])

        cleaned_chars = len(stage1.cleaned_transcript.strip())
        original_chars = len(record.transcript)
        retention_ratio = cleaned_chars / max(1, original_chars)

        checks = {
            "minimum_cleaned_chars": cleaned_chars >= Y2B_STAGE1_MIN_CLEANED_CHARS,
            "minimum_retention_ratio": retention_ratio >= Y2B_STAGE1_MIN_RETENTION_RATIO,
            "maximum_retention_ratio": retention_ratio <= Y2B_STAGE1_MAX_RETENTION_RATIO,
        }
        passed = all(checks.values())

        retry_count = int(state.get("stage1_retry_count", 0))
        if passed:
            decision = "pass"
        elif retry_count < Y2B_STAGE1_REPAIR_MAX_RETRIES:
            decision = "retry"
        else:
            failed_checks = [name for name, ok in checks.items() if not ok]
            raise RuntimeError(
                "Stage 1 quality gate failed after retries; "
                f"checks_failed={failed_checks}, cleaned_chars={cleaned_chars}, "
                f"retention_ratio={retention_ratio:.3f}"
            )

        gate_data = {
            "passed": passed,
            "decision": decision,
            "retry_count": retry_count,
            "max_retries": Y2B_STAGE1_REPAIR_MAX_RETRIES,
            "checks": checks,
            "metrics": {
                "cleaned_chars": cleaned_chars,
                "original_chars": original_chars,
                "retention_ratio": round(retention_ratio, 4),
            },
        }
        stage_results = _record_stage_result(
            state,
            stage_name="stage_1_quality_gate",
            input_refs={"stage_1": _stage_ref(run_id, "stage_1")},
            data=gate_data,
        )
        return {
            "stage1_gate_decision": decision,
            "stage_results": stage_results,
        }

    def stage_1_repair_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_1_repair")
        previous_stage1 = Stage1Output.model_validate(state["stage1"])
        repaired_stage1 = stage_1_repair_transcript(
            record,
            previous_stage1.cleaned_transcript,
        )
        retry_count = int(state.get("stage1_retry_count", 0)) + 1

        stage_results = _record_stage_result(
            state,
            stage_name="stage_1_repair",
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_1_quality_gate": _stage_ref(run_id, "stage_1_quality_gate"),
            },
            data={
                "retry_count": retry_count,
                "previous_cleaned_chars": len(previous_stage1.cleaned_transcript),
                "repaired_cleaned_chars": len(repaired_stage1.cleaned_transcript),
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_1",
            input_refs={"stage_1_repair": _stage_ref(run_id, "stage_1_repair")},
            data=repaired_stage1.model_dump(),
        )
        return {
            "stage1": repaired_stage1.model_dump(),
            "stage1_retry_count": retry_count,
            "stage_results": stage_results,
        }

    def stage_2_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_2")
        stage1 = Stage1Output.model_validate(state["stage1"])
        allowed_types = read_article_type_names()
        if not allowed_types:
            raise RuntimeError("No article types available for classification")

        stage2 = stage_2_classify_article_type(
            stage1,
            allowed_types,
            classification_mode="primary",
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_2",
            input_refs={"stage_1": _stage_ref(run_id, "stage_1")},
            data=stage2.model_dump(),
        )
        return {
            "stage2": stage2.model_dump(),
            "stage2_retry_count": int(state.get("stage2_retry_count", 0)),
            "stage_results": stage_results,
        }

    def stage_2_quality_gate_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_2_quality_gate")
        stage2 = Stage2Output.model_validate(state["stage2"])
        retry_count = int(state.get("stage2_retry_count", 0))
        confidence = float(stage2.confidence)
        passed = confidence >= Y2B_STAGE2_MIN_CONFIDENCE

        if passed:
            decision = "pass"
        elif retry_count < Y2B_STAGE2_CLASSIFICATION_MAX_RETRIES:
            decision = "retry"
        else:
            raise RuntimeError(
                "Stage 2 quality gate failed after retries; "
                f"confidence={confidence:.3f}, threshold={Y2B_STAGE2_MIN_CONFIDENCE:.3f}, "
                f"classification={stage2.classification!r}"
            )

        gate_data = {
            "passed": passed,
            "decision": decision,
            "retry_count": retry_count,
            "max_retries": Y2B_STAGE2_CLASSIFICATION_MAX_RETRIES,
            "metrics": {
                "confidence": confidence,
                "threshold": Y2B_STAGE2_MIN_CONFIDENCE,
            },
            "classification": stage2.classification,
            "reasoning": stage2.reasoning,
        }
        stage_results = _record_stage_result(
            state,
            stage_name="stage_2_quality_gate",
            input_refs={"stage_2": _stage_ref(run_id, "stage_2")},
            data=gate_data,
        )
        return {
            "stage2_gate_decision": decision,
            "stage_results": stage_results,
        }

    def stage_2_retry_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_2_retry")
        stage1 = Stage1Output.model_validate(state["stage1"])
        allowed_types = read_article_type_names()
        if not allowed_types:
            raise RuntimeError("No article types available for classification retry")

        retry_count = int(state.get("stage2_retry_count", 0)) + 1
        stage2 = stage_2_classify_article_type(
            stage1,
            allowed_types,
            classification_mode="retry",
        )

        stage_results = _record_stage_result(
            state,
            stage_name="stage_2_retry",
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_2_quality_gate": _stage_ref(run_id, "stage_2_quality_gate"),
            },
            data={
                "retry_count": retry_count,
                "classification": stage2.classification,
                "confidence": stage2.confidence,
                "reasoning": stage2.reasoning,
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_2",
            input_refs={"stage_2_retry": _stage_ref(run_id, "stage_2_retry")},
            data=stage2.model_dump(),
        )
        return {
            "stage2": stage2.model_dump(),
            "stage2_retry_count": retry_count,
            "stage_results": stage_results,
        }

    def stage_3_guideline_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_guideline")
        stage2 = Stage2Output.model_validate(state["stage2"])
        guideline = stage_3_retrieve_guideline(stage2.classification)
        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_guideline",
            input_refs={"stage_2": _stage_ref(run_id, "stage_2")},
            data={
                "article_type": stage2.classification,
                "guideline": guideline,
                "guideline_length": len(guideline),
            },
        )
        return {
            "stage3_guideline": guideline,
            "stage_results": stage_results,
        }

    def stage_3_coverage_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_coverage")
        stage1 = Stage1Output.model_validate(state["stage1"])
        guideline = str(state.get("stage3_guideline") or "")
        coverage = stage_3_coverage_check(
            transcript=stage1.cleaned_transcript,
            guideline=guideline,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_coverage",
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_3_guideline": _stage_ref(run_id, "stage_3_guideline"),
            },
            data=coverage,
        )
        return {
            "stage3_coverage": coverage,
            "stage_results": stage_results,
        }

    def stage_3_supplement_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_supplement")
        stage1 = Stage1Output.model_validate(state["stage1"])
        stage2 = Stage2Output.model_validate(state["stage2"])
        coverage = dict(state.get("stage3_coverage") or {})
        missing_sections_value = coverage.get("missing_sections")
        missing_sections = (
            list(missing_sections_value)
            if isinstance(missing_sections_value, list)
            else []
        )
        supplement = stage_3_generate_supplement(
            transcript=stage1.cleaned_transcript,
            missing_sections=missing_sections,
            article_type=stage2.classification,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_supplement",
            input_refs={"stage_3_coverage": _stage_ref(run_id, "stage_3_coverage")},
            data=supplement,
        )
        return {
            "stage3_supplement": supplement,
            "stage_results": stage_results,
        }

    def stage_3_compose_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3")
        stage1 = Stage1Output.model_validate(state["stage1"])
        stage2 = Stage2Output.model_validate(state["stage2"])
        guideline = str(state.get("stage3_guideline") or "")
        coverage = dict(state.get("stage3_coverage") or {})
        supplement = dict(state.get("stage3_supplement") or {})

        supplemental_content_value = supplement.get("supplemental_content")
        supplemental_content = (
            str(supplemental_content_value).strip()
            if isinstance(supplemental_content_value, str)
            else ""
        )
        supplemental_content_or_none = supplemental_content or None

        composed = stage_3_compose_from_parts(
            transcript=stage1.cleaned_transcript,
            supplemental=supplemental_content_or_none,
            guideline=guideline,
            article_type=stage2.classification,
            title=stage1.title,
        )

        stage3 = Stage3Output(
            video_id=stage1.video_id,
            title=stage1.title,
            article_type=stage2.classification,
            coverage_sufficient=bool(coverage.get("coverage_sufficient", False)),
            coverage_analysis=str(coverage.get("coverage_analysis") or ""),
            missing_sections=list(coverage.get("missing_sections") or []),
            supplemental_content=supplemental_content_or_none,
            final_article=str(composed["final_article"]),
            guideline_used=guideline,
            debug_coverage_prompt=str(coverage.get("debug_coverage_prompt") or ""),
            debug_coverage_response=str(coverage.get("debug_coverage_response") or ""),
            debug_supplement_prompt=str(supplement.get("debug_supplement_prompt") or ""),
            debug_supplement_response=str(supplement.get("debug_supplement_response") or ""),
            debug_composition_prompt=str(composed.get("debug_composition_prompt") or ""),
            debug_composition_response=str(composed.get("debug_composition_response") or ""),
        )

        input_refs = {
            "stage_1": _stage_ref(run_id, "stage_1"),
            "stage_2": _stage_ref(run_id, "stage_2"),
            "stage_3_guideline": _stage_ref(run_id, "stage_3_guideline"),
            "stage_3_coverage": _stage_ref(run_id, "stage_3_coverage"),
        }
        if supplemental_content_or_none:
            input_refs["stage_3_supplement"] = _stage_ref(run_id, "stage_3_supplement")

        stage_results = _record_stage_result(
            state,
            stage_name="stage_3",
            input_refs=input_refs,
            data=stage3.model_dump(),
        )
        return {
            "stage3": stage3.model_dump(),
            "stage_results": stage_results,
        }

    def stage_editorial_gate_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_editorial_gate")
        stage3 = Stage3Output.model_validate(state["stage3"])
        words = _count_words(stage3.final_article)
        paragraphs = _count_paragraphs(stage3.final_article)
        should_augment = (
            words >= Y2B_EDITORIAL_GATE_MIN_WORDS
            and paragraphs >= Y2B_EDITORIAL_GATE_MIN_PARAGRAPHS
        )
        decision = "augment" if should_augment else "skip"

        gate_data = {
            "decision": decision,
            "thresholds": {
                "min_words": Y2B_EDITORIAL_GATE_MIN_WORDS,
                "min_paragraphs": Y2B_EDITORIAL_GATE_MIN_PARAGRAPHS,
            },
            "metrics": {
                "word_count": words,
                "paragraph_count": paragraphs,
            },
        }
        stage_results = _record_stage_result(
            state,
            stage_name="stage_editorial_gate",
            input_refs={"stage_3": _stage_ref(run_id, "stage_3")},
            data=gate_data,
        )
        return {
            "stage_editorial_gate": gate_data,
            "stage_editorial_decision": decision,
            "stage_results": stage_results,
        }

    def stage_editorial_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_editorial_augmentation")
        stage3 = Stage3Output.model_validate(state["stage3"])
        stage_editorial = stage_editorial_augmentation(stage3, fail_fast=True)
        stage_results = _record_stage_result(
            state,
            stage_name="stage_editorial_augmentation",
            input_refs={"stage_3": _stage_ref(run_id, "stage_3")},
            data=stage_editorial.model_dump(),
        )
        stage3_for_title = stage3.model_copy(
            update={"final_article": stage_editorial.augmented_content}
        )
        return {
            "stage_editorial": stage_editorial.model_dump(),
            "stage3_for_title": stage3_for_title.model_dump(),
            "stage_results": stage_results,
        }

    def stage_editorial_skip_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_editorial_skip")
        stage3 = Stage3Output.model_validate(state["stage3"])
        stage_editorial = StageEditorialAugmentationOutput(
            video_id=stage3.video_id,
            title=stage3.title,
            article_type=stage3.article_type,
            augmented_content=stage3.final_article,
            components_added=[],
            diagnostic={
                "cognitive_load": "strong",
                "narrative_density": "strong",
                "emphasis_clarity": "strong",
                "reading_behavior_risk": "strong",
            },
            augmentation_summary=(
                "Editorial augmentation skipped by gate "
                "(content was below augmentation thresholds)."
            ),
            augmentation_applied=False,
            debug_prompt="",
            debug_raw_response="",
            error=None,
        )
        gate_data = dict(state.get("stage_editorial_gate") or {})
        stage_results = _record_stage_result(
            state,
            stage_name="stage_editorial_skip",
            input_refs={"stage_editorial_gate": _stage_ref(run_id, "stage_editorial_gate")},
            data={
                "decision": "skip",
                "gate": gate_data,
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_editorial_augmentation",
            input_refs={"stage_editorial_skip": _stage_ref(run_id, "stage_editorial_skip")},
            data=stage_editorial.model_dump(),
        )
        return {
            "stage_editorial": stage_editorial.model_dump(),
            "stage3_for_title": stage3.model_dump(),
            "stage_results": stage_results,
        }

    def stage_4_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_4")
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])
        stage4 = stage_4_generate_title(stage3_for_title)
        stage_results = _record_stage_result(
            state,
            stage_name="stage_4",
            input_refs={
                "stage_3": _stage_ref(run_id, "stage_3"),
                "stage_editorial_augmentation": _stage_ref(
                    run_id,
                    "stage_editorial_augmentation",
                ),
            },
            data=stage4.model_dump(),
        )
        return {
            "stage4": stage4.model_dump(),
            "stage_results": stage_results,
        }

    def stage_5_quality_gate_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_5_quality_gate")
        stage4 = Stage4Output.model_validate(state["stage4"])
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])
        evaluation = stage_5_evaluate_title_quality(
            title=stage4.title,
            article=stage3_for_title.final_article,
            guideline=stage4.title_guideline_used,
            baseline_title=stage3_for_title.title,
        )
        retry_count = int(state.get("stage5_retry_count", 0))
        score = float(evaluation.get("score", 0.0))
        checks = evaluation.get("checks", {})
        length_range_ok = bool(checks.get("length_range")) if isinstance(checks, dict) else False
        passed = score >= Y2B_STAGE5_MIN_TITLE_SCORE and length_range_ok

        if passed:
            decision = "pass"
        elif retry_count < Y2B_STAGE5_TITLE_MAX_RETRIES:
            decision = "retry"
        else:
            raise RuntimeError(
                "Stage 5 quality gate failed after retries; "
                f"score={score:.2f}, threshold={Y2B_STAGE5_MIN_TITLE_SCORE:.2f}, "
                f"title={stage4.title!r}"
            )

        gate_data = {
            **evaluation,
            "decision": decision,
            "retry_count": retry_count,
            "max_retries": Y2B_STAGE5_TITLE_MAX_RETRIES,
            "score_threshold": Y2B_STAGE5_MIN_TITLE_SCORE,
            "title": stage4.title,
        }
        stage_results = _record_stage_result(
            state,
            stage_name="stage_5_quality_gate",
            input_refs={"stage_4": _stage_ref(run_id, "stage_4")},
            data=gate_data,
        )
        return {
            "stage5_gate": gate_data,
            "stage5_gate_decision": decision,
            "stage5_feedback": str(evaluation.get("feedback") or ""),
            "stage_results": stage_results,
        }

    def stage_5_retry_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_5_retry")
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])
        feedback = str(
            state.get("stage5_feedback")
            or "Improve title quality while preserving article intent and guideline fit."
        )
        retry_count = int(state.get("stage5_retry_count", 0)) + 1
        retried_stage4 = stage_5_generate_title_retry(
            stage3_for_title,
            feedback=feedback,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_5_retry",
            input_refs={"stage_5_quality_gate": _stage_ref(run_id, "stage_5_quality_gate")},
            data={
                "retry_count": retry_count,
                "feedback": feedback,
                "title": retried_stage4.title,
                "title_guideline_used": retried_stage4.title_guideline_used,
                "debug_prompt": retried_stage4.debug_prompt,
                "debug_raw_response": retried_stage4.debug_raw_response,
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_4",
            input_refs={"stage_5_retry": _stage_ref(run_id, "stage_5_retry")},
            data=retried_stage4.model_dump(),
        )
        return {
            "stage4": retried_stage4.model_dump(),
            "stage5_retry_count": retry_count,
            "stage_results": stage_results,
        }

    def finalize_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        stage4 = Stage4Output.model_validate(state["stage4"])
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])

        markdown = _build_final_markdown(stage4.title, stage3_for_title.final_article)
        stage_results_payload = dict(state.get("stage_results") or {})
        stage0_result = read_stage_result(run_id, "stage_0")
        if stage0_result:
            stage_results_payload["stage_0"] = stage0_result

        stage_results = {
            key: StageResult.model_validate(value)
            for key, value in stage_results_payload.items()
        }
        artifact = PipelineArtifact(
            run_id=run_id,
            meta=meta,
            stages=stage_results,
            markdown_path=f"db:outputs:{run_id}",
        )
        artifact_dict = artifact.model_dump()
        artifact_dict["markdown"] = markdown
        write_artifact(run_id, artifact_dict)

        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "complete",
                "state": "completed",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )
        return {"markdown": markdown}

    def route_stage_1_gate(state: YouTube2BlogGraphState) -> str:
        return str(state.get("stage1_gate_decision") or "pass")

    def route_stage_2_gate(state: YouTube2BlogGraphState) -> str:
        return str(state.get("stage2_gate_decision") or "pass")

    def route_stage_3_coverage(state: YouTube2BlogGraphState) -> str:
        coverage = dict(state.get("stage3_coverage") or {})
        missing_sections_value = coverage.get("missing_sections")
        missing_sections = (
            list(missing_sections_value)
            if isinstance(missing_sections_value, list)
            else []
        )
        if bool(coverage.get("coverage_sufficient")) or not missing_sections:
            return "compose"
        return "supplement"

    def route_editorial_gate(state: YouTube2BlogGraphState) -> str:
        return str(state.get("stage_editorial_decision") or "skip")

    def route_stage_5_gate(state: YouTube2BlogGraphState) -> str:
        return str(state.get("stage5_gate_decision") or "pass")

    builder = StateGraph(YouTube2BlogGraphState)
    builder.add_node("stage_1", stage_1_node)
    builder.add_node("stage_1_quality_gate", stage_1_quality_gate_node)
    builder.add_node("stage_1_repair", stage_1_repair_node)

    builder.add_node("stage_2", stage_2_node)
    builder.add_node("stage_2_quality_gate", stage_2_quality_gate_node)
    builder.add_node("stage_2_retry", stage_2_retry_node)

    builder.add_node("stage_3_guideline", stage_3_guideline_node)
    builder.add_node("stage_3_coverage", stage_3_coverage_node)
    builder.add_node("stage_3_supplement", stage_3_supplement_node)
    builder.add_node("stage_3", stage_3_compose_node)

    builder.add_node("stage_editorial_gate", stage_editorial_gate_node)
    builder.add_node("stage_editorial_augmentation", stage_editorial_node)
    builder.add_node("stage_editorial_skip", stage_editorial_skip_node)

    builder.add_node("stage_4", stage_4_node)
    builder.add_node("stage_5_quality_gate", stage_5_quality_gate_node)
    builder.add_node("stage_5_retry", stage_5_retry_node)
    builder.add_node("finalize", finalize_node)

    builder.add_edge(START, "stage_1")
    builder.add_edge("stage_1", "stage_1_quality_gate")
    builder.add_conditional_edges(
        "stage_1_quality_gate",
        route_stage_1_gate,
        {
            "pass": "stage_2",
            "retry": "stage_1_repair",
        },
    )
    builder.add_edge("stage_1_repair", "stage_1_quality_gate")

    builder.add_edge("stage_2", "stage_2_quality_gate")
    builder.add_conditional_edges(
        "stage_2_quality_gate",
        route_stage_2_gate,
        {
            "pass": "stage_3_guideline",
            "retry": "stage_2_retry",
        },
    )
    builder.add_edge("stage_2_retry", "stage_2_quality_gate")

    builder.add_edge("stage_3_guideline", "stage_3_coverage")
    builder.add_conditional_edges(
        "stage_3_coverage",
        route_stage_3_coverage,
        {
            "compose": "stage_3",
            "supplement": "stage_3_supplement",
        },
    )
    builder.add_edge("stage_3_supplement", "stage_3")

    builder.add_edge("stage_3", "stage_editorial_gate")
    builder.add_conditional_edges(
        "stage_editorial_gate",
        route_editorial_gate,
        {
            "augment": "stage_editorial_augmentation",
            "skip": "stage_editorial_skip",
        },
    )
    builder.add_edge("stage_editorial_augmentation", "stage_4")
    builder.add_edge("stage_editorial_skip", "stage_4")

    builder.add_edge("stage_4", "stage_5_quality_gate")
    builder.add_conditional_edges(
        "stage_5_quality_gate",
        route_stage_5_gate,
        {
            "pass": "finalize",
            "retry": "stage_5_retry",
        },
    )
    builder.add_edge("stage_5_retry", "stage_5_quality_gate")

    builder.add_edge("finalize", END)

    trace_payload: dict[str, str] = {}
    try:
        with langgraph_trace(
            trace_name="youtube2blog.pipeline",
            feature="youtube2blog",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline"],
            metadata={"entrypoint": "youtube2blog/process"},
            inputs={"run_id": run_id, "video_id": record.video_id},
        ) as (trace_run, trace_metadata):
            with langgraph_checkpoint() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                final_state = graph.invoke(
                    {
                        "run_id": run_id,
                        "stage1_retry_count": 0,
                        "stage2_retry_count": 0,
                        "stage5_retry_count": 0,
                        "stage_results": {},
                    },
                    config={
                        "configurable": {"thread_id": run_id},
                        "tags": ["langgraph", "youtube2blog"],
                        "metadata": {"feature": "youtube2blog", "run_id": run_id},
                        "run_name": "youtube2blog_pipeline_graph",
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )

        if trace_payload:
            write_stage_result(
                run_id,
                "langgraph_trace",
                {
                    "created_at": _now().isoformat(),
                    "data": trace_payload,
                },
            )

        return str(final_state.get("markdown", "")).strip()
    except Exception as exc:
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": current_stage,
                "state": "failed",
                "updated_at": _now().isoformat(),
                "error": str(exc),
            },
            feature=FEATURE_NAME,
        )
        logger.exception("LangGraph YouTube2Blog pipeline failed")
        raise
