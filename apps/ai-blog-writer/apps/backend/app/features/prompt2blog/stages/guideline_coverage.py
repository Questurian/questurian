from __future__ import annotations

from typing import Any

from ..config import (
    PROMPT2BLOG_GUIDELINES_DIR,
    PROMPT2BLOG_GUIDELINE_FILE_ALIASES,
    PROMPT2BLOG_TITLE_FILE_ALIASES,
    PROMPT2BLOG_TITLE_GUIDELINES_DIR,
)
from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..prompts.generation import P2B_COVERAGE_CHECK_PROMPT
from ..quality import _sanitize_coverage
from ..support import _json, _safe_str


def run_guideline_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_guideline_fetch"
    run_id = state["run_id"]
    request = state["request"]
    dependencies.recorder.start_stage(run_id, stage)

    article_type = dependencies.get_article_type(request.article_type_id)
    if not article_type:
        raise RuntimeError(f"Article type {request.article_type_id} not found")

    guideline_text, guideline_file = dependencies.read_article_type_markdown(
        article_type_name=_safe_str(article_type.get("name")),
        directory=PROMPT2BLOG_GUIDELINES_DIR,
        fallback=_safe_str(article_type.get("guideline")),
        aliases=PROMPT2BLOG_GUIDELINE_FILE_ALIASES,
    )
    title_guideline_text, title_guideline_file = (
        dependencies.read_article_type_markdown(
            article_type_name=_safe_str(article_type.get("name")),
            directory=PROMPT2BLOG_TITLE_GUIDELINES_DIR,
            fallback=_safe_str(article_type.get("title_guideline")),
            aliases=PROMPT2BLOG_TITLE_FILE_ALIASES,
        )
    )
    guideline = {
        "id": article_type["id"],
        "name": article_type["name"],
        "definition": article_type.get("definition") or "",
        "guideline": guideline_text,
        "title_guideline": title_guideline_text,
        "guideline_file": guideline_file,
        "title_guideline_file": title_guideline_file,
    }
    dependencies.recorder.record_stage(run_id, stage, guideline)
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        output=guideline,
    )
    return {"current_stage": stage, "guideline": guideline}


def run_coverage_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_coverage_check"
    run_id = state["run_id"]
    guideline = state["guideline"]
    dependencies.recorder.start_stage(run_id, stage)

    prompt = P2B_COVERAGE_CHECK_PROMPT.format(
        raw_sources=state["raw_sources_text"],
        cleaned_data=state["cleaned_data"],
        article_type_name=guideline["name"],
        article_type_definition=guideline["definition"],
        guideline=guideline["guideline"] or "No guideline provided.",
        title_guideline=guideline["title_guideline"] or "No title guideline provided.",
        writing_brief_json=_json(state["writing_brief"]),
        narrative_focus=state["narrative_focus"],
        style_directive=state["style_directive"],
        hard_constraints=state["hard_constraints"],
    )
    parsed, raw_response = dependencies.llm.invoke_json(
        prompt=prompt,
        max_tokens=1536,
        temperature=0.05,
        model_name=state["model_name"],
    )
    coverage = _sanitize_coverage(parsed)
    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"coverage": coverage, "raw_response": raw_response},
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["model_name"],
        input_payload={
            "article_type": guideline,
            "narrative_focus": state["narrative_focus"],
            "style_directive": state["style_directive"],
        },
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output=coverage,
    )
    return {"current_stage": stage, "coverage": coverage}
