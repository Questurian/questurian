from __future__ import annotations

from typing import Any

from app.shared.prompts import ANTI_AI_TELLS_FULL

from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..prompts.generation import SEO_SAFE_CONTENT_GENERATION_GUIDELINES
from ..prompts.quality import P2B_QUALITY_AUDIT_PROMPT, P2B_REPAIR_PROMPT
from ..quality import (
    _build_constraint_checks,
    _sanitize_quality,
    _sanitize_rewrite,
    _should_run_repair,
)
from ..support import _json


def _audit_rewrite(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
    rewrite: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], str, str, dict[str, Any]]:
    guideline = state["guideline"]
    prompt = P2B_QUALITY_AUDIT_PROMPT.format(
        raw_sources=state["raw_sources_text"],
        cleaned_data=state["cleaned_data"],
        rewritten_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
        article_type_name=guideline["name"],
        guideline=guideline["guideline"] or "No guideline provided.",
        title_guideline=guideline["title_guideline"] or "No title guideline provided.",
        writing_brief_json=_json(state["writing_brief"]),
        seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    )
    parsed, raw_response = dependencies.llm.invoke_json(
        prompt=prompt,
        max_tokens=1536,
        temperature=0.05,
        model_name=state["audit_model"],
    )
    quality = _sanitize_quality(parsed)
    computed_checks = _build_constraint_checks(
        rewrite["improved_title"],
        rewrite["improved_content"],
        state["writing_brief"],
    )
    quality_checks = {
        **quality.get("constraint_checks", {}),
        **{
            key: value
            for key, value in computed_checks.items()
            if key != "word_count_estimate"
        },
    }
    quality["constraint_checks"] = quality_checks
    quality["word_count_estimate"] = computed_checks["word_count_estimate"]
    return quality, quality_checks, prompt, raw_response, parsed


def run_quality_audit_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_quality_audit"
    run_id = state["run_id"]
    dependencies.recorder.start_stage(run_id, stage)

    quality, checks, prompt, raw_response, parsed = _audit_rewrite(
        state,
        dependencies,
        state["rewrite"],
    )
    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"quality": quality, "raw_response": raw_response},
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["audit_model"],
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output=quality,
    )
    return {
        "current_stage": stage,
        "quality": quality,
        "quality_checks": checks,
    }


def run_repair_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_repair"
    run_id = state["run_id"]
    guideline = state["guideline"]
    rewrite = state["rewrite"]
    quality = state["quality"]
    quality_checks = state["quality_checks"]
    dependencies.recorder.start_stage(run_id, stage)

    repair_applied = _should_run_repair(quality, quality_checks)
    raw_response = ""
    if repair_applied:
        prompt = P2B_REPAIR_PROMPT.format(
            raw_sources=state["raw_sources_text"],
            cleaned_data=state["cleaned_data"],
            previous_title=rewrite["improved_title"],
            previous_content=rewrite["improved_content"],
            required_revisions=_json(quality.get("required_revisions", [])),
            article_type_name=guideline["name"],
            guideline=guideline["guideline"] or "No guideline provided.",
            title_guideline=guideline["title_guideline"]
            or "No title guideline provided.",
            writing_brief_json=_json(state["writing_brief"]),
            seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
            narrative_focus=state["narrative_focus"],
        )
        prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"
        # Repair rewrites the whole article, so it runs on the writer model.
        # Routing it to the analysis model downgraded every repaired run.
        parsed, raw_response = dependencies.llm.invoke_json(
            prompt=prompt,
            max_tokens=6144,
            temperature=0.1,
            model_name=state["writing_model"],
        )
        rewrite = _sanitize_rewrite(
            parsed,
            fallback_title=rewrite["improved_title"],
            fallback_content=rewrite["improved_content"],
        )
        rewrite["improved_content"] = dependencies.llm.enforce_anti_ai(
            rewrite["improved_content"],
            model_name=state["writing_model"],
            max_tokens=6144,
            context="prompt2blog repair",
        )
        quality, quality_checks, _, quality_raw, _ = _audit_rewrite(
            state,
            dependencies,
            rewrite,
        )
        quality["post_repair_raw_response"] = quality_raw
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["writing_model"],
            prompt=prompt,
            raw_response=raw_response,
            parsed=parsed,
            output={"rewrite": rewrite, "quality_after_repair": quality},
        )
    else:
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["model_name"],
            output={
                "skipped": True,
                "reason": "Quality and constraint checks passed.",
            },
            skipped=True,
        )

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "repair_applied": repair_applied,
            "rewrite": rewrite,
            "quality": quality,
            "raw_response": raw_response,
        },
    )
    return {
        "current_stage": stage,
        "repair_applied": repair_applied,
        "rewrite": rewrite,
        "quality": quality,
        "quality_checks": quality_checks,
    }
