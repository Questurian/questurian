from __future__ import annotations

from typing import Any

from app.shared.prompts import ANTI_AI_TELLS_FULL

from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..prompts.generation import (
    P2B_COMPOSE_PROMPT,
    P2B_SUPPLEMENT_PROMPT,
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
)
from ..quality import _sanitize_rewrite
from ..support import _json


def run_supplement_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_supplement"
    run_id = state["run_id"]
    coverage = state["coverage"]
    guideline = state["guideline"]
    dependencies.recorder.start_stage(run_id, stage)

    supplemental_content = ""
    raw_response = ""
    skipped = coverage["coverage_sufficient"] or not coverage["missing_sections"]

    if skipped:
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["model_name"],
            output={
                "skipped": True,
                "reason": "Coverage is sufficient or no missing sections found.",
            },
            skipped=True,
        )
    else:
        prompt = P2B_SUPPLEMENT_PROMPT.format(
            raw_sources=state["raw_sources_text"],
            cleaned_data=state["cleaned_data"],
            article_type_name=guideline["name"],
            missing_sections="\n".join(
                f"- {item}" for item in coverage["missing_sections"]
            ),
            writing_brief_json=_json(state["writing_brief"]),
            narrative_focus=state["narrative_focus"],
            style_directive=state["style_directive"],
            hard_constraints=state["hard_constraints"],
        )
        prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"
        raw_response = dependencies.llm.invoke_text(
            prompt=prompt,
            max_tokens=4096,
            temperature=state["compose_temperature"],
            model_name=state["model_name"],
        )
        # Supplemental sections are intermediate material: compose rewrites
        # them into the article rather than pasting them, so enforcing voice
        # rules on text that never ships verbatim is wasted work. Compose
        # enforces the prose that does ship.
        supplemental_content = raw_response
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["model_name"],
            input_payload={"missing_sections": coverage["missing_sections"]},
            prompt=prompt,
            raw_response=raw_response,
            output={
                "supplemental_content_preview": supplemental_content[:600],
                "supplemental_length": len(supplemental_content),
            },
        )

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "skipped": skipped,
            "missing_sections": coverage["missing_sections"],
            "supplemental_content": supplemental_content,
            "raw_response": raw_response,
        },
    )
    return {
        "current_stage": stage,
        "supplemental_content": supplemental_content,
    }


def run_compose_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_compose"
    run_id = state["run_id"]
    guideline = state["guideline"]
    dependencies.recorder.start_stage(run_id, stage)

    prompt = P2B_COMPOSE_PROMPT.format(
        raw_sources=state["raw_sources_text"],
        cleaned_data=state["cleaned_data"],
        supplemental_content=state["supplemental_content"]
        or "No supplemental material generated.",
        article_type_name=guideline["name"],
        article_type_definition=guideline["definition"],
        guideline=guideline["guideline"] or "No guideline provided.",
        title_guideline=guideline["title_guideline"] or "No title guideline provided.",
        writing_brief_json=_json(state["writing_brief"]),
        seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
        narrative_focus=state["narrative_focus"],
        style_directive=state["style_directive"],
        hard_constraints=state["hard_constraints"],
        outline=state["outline_text"],
    )
    prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"
    parsed, raw_response = dependencies.llm.invoke_json(
        prompt=prompt,
        max_tokens=6144,
        temperature=state["compose_temperature"],
        model_name=state["writing_model"],
    )
    rewrite = _sanitize_rewrite(
        parsed,
        fallback_title=guideline["name"],
        fallback_content=state["cleaned_data"],
    )
    rewrite["improved_content"] = dependencies.llm.enforce_anti_ai(
        rewrite["improved_content"],
        model_name=state["writing_model"],
        max_tokens=6144,
        context="prompt2blog compose",
    )
    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"rewrite": rewrite, "raw_response": raw_response},
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["writing_model"],
        input_payload={
            "article_type": guideline,
            "narrative_focus": state["narrative_focus"],
            "style_directive": state["style_directive"],
        },
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output=rewrite,
    )
    return {"current_stage": stage, "rewrite": rewrite}
