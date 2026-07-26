"""URL2Blog source intake and classification."""

import json
import logging
from typing import Any

from fastapi import HTTPException

from ..config import (
    URL2BLOG_TEXT_CLEANUP_MAX_OUTPUT_TOKENS,
    _llm_context_text,
    _resolve_execution_profile,
    _use_editorial_blueprint,
)
from ..dependencies import PipelineDependencies
from ..content.sanitizers import _resolve_min_expanded_word_target
from ..llm.coerce import (
    _normalize_language_name,
    _safe_bool,
    _safe_dict,
    _safe_str,
    _tokenize_similarity_words,
)
from ..llm.parsing import _json_parse_tracking_scope
from ..models import ExtractRequest, PipelineV2Request, Stage2ClassifyRequest
from ..observability import append_stage_trace
from ..prompts import (
    NARRATIVE_FOCUS_PRESETS,
    V2_NARRATIVE_FOCUS_SELECTION_PROMPT,
)

logger = logging.getLogger(__name__)


async def _pipeline_v2_run_stage1(
    *,
    request: PipelineV2Request,
    run_id: str,
    selected_model_name: str,
    include_debug: bool,
    dependencies: PipelineDependencies,
    stage_trace: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Execute URL2Blog stage 1 extraction and normalization."""
    pasted_text = _safe_str(request.pasted_text or "")
    url = _safe_str(request.url or "")

    trace = list(stage_trace or [])
    dependencies.recorder.mark_running(run_id, "stage_1")

    if pasted_text:
        stage1_payload = dependencies.cleanup_pasted_text(
            raw_text=pasted_text,
            model_name=selected_model_name,
            llm=dependencies.llm,
        )
        if include_debug:
            trace.append(
                {
                    "stage": "stage1_cleanup_pasted_text",
                    "model_name": selected_model_name,
                    "max_tokens": URL2BLOG_TEXT_CLEANUP_MAX_OUTPUT_TOKENS,
                    "temperature": 0.1,
                    "input": {"raw_text_length": len(pasted_text)},
                    "output": {
                        "title": _safe_dict(stage1_payload.get("parsed")).get(
                            "title", ""
                        ),
                        "language": _safe_dict(stage1_payload.get("parsed")).get(
                            "language", ""
                        ),
                        "cleaned_chars": len(
                            _safe_dict(stage1_payload.get("parsed")).get("content", "")
                        ),
                        "removed_blocks_count": len(
                            stage1_payload.get("removed_blocks") or []
                        ),
                        "fallback_used": stage1_payload.get(
                            "text_cleanup_fallback", False
                        ),
                    },
                }
            )
    elif url.startswith(("http://", "https://")):
        stage1_response = await dependencies.extract_article(
            ExtractRequest(
                url=url,
                model_name=selected_model_name,
                include_debug=include_debug,
            ),
            dependencies.llm,
        )
        stage1_payload = json.loads(stage1_response.body.decode("utf-8"))
        if include_debug:
            stage1_debug = _safe_dict(stage1_payload.get("debug"))
            stage1_trace = stage1_debug.get("trace")
            if isinstance(stage1_trace, list):
                for entry in stage1_trace:
                    if isinstance(entry, dict):
                        trace.append(entry)
    else:
        raise HTTPException(
            status_code=400,
            detail="Either a valid URL (http:// or https://) or pasted_text must be provided.",
        )

    dependencies.recorder.record_stage(run_id, "stage_1", stage1_payload)

    parsed_article = _safe_dict(stage1_payload.get("parsed"))
    if not parsed_article:
        raise HTTPException(
            status_code=500,
            detail=stage1_payload.get("parse_error")
            or "Stage 1 returned no parsed article content.",
        )

    translated_article = _safe_dict(stage1_payload.get("translated"))
    translation_skipped = _safe_bool(
        stage1_payload.get("translation_skipped"), default=False
    )
    was_translated = not translation_skipped and bool(translated_article)

    normalized_title = (
        _safe_str(translated_article.get("title"))
        if was_translated
        else _safe_str(parsed_article.get("title"))
    )
    normalized_content = (
        _safe_str(translated_article.get("content"))
        if was_translated
        else _safe_str(parsed_article.get("content"))
    )
    if not normalized_content:
        raise HTTPException(
            status_code=422, detail="No article content available after extraction."
        )

    source_word_count = len(_tokenize_similarity_words(normalized_content))
    min_expanded_word_target = _resolve_min_expanded_word_target(source_word_count)
    normalized_language = (
        "English"
        if was_translated
        else _normalize_language_name(
            _safe_str(parsed_article.get("language")) or "English"
        )
    )

    return {
        "stage1_payload": stage1_payload,
        "trace": trace,
        "normalized_title": normalized_title,
        "normalized_content": normalized_content,
        "normalized_language": normalized_language,
        "source_word_count": source_word_count,
        "min_expanded_word_target": min_expanded_word_target,
    }


def _pipeline_v2_select_narrative_focus(
    *,
    normalized_title: str,
    normalized_content: str,
    classification: dict[str, Any],
    selected_model_name: str,
    json_parse_metrics: dict[str, Any],
    dependencies: PipelineDependencies,
) -> tuple[dict[str, Any] | None, str, dict[str, Any]]:
    """Auto-pick a narrative focus preset for the article via a small LLM call."""
    preset_options = "\n".join(
        f"- {preset['id']}: {preset['label']} — {preset['prompt']}"
        for preset in NARRATIVE_FOCUS_PRESETS
    )
    prompt = (
        V2_NARRATIVE_FOCUS_SELECTION_PROMPT.replace("{preset_options}", preset_options)
        .replace("{title}", normalized_title)
        .replace("{content}", _llm_context_text(normalized_content))
        .replace(
            "{article_type}",
            json.dumps(classification, ensure_ascii=False),
        )
    )
    parsed, raw_response = dependencies.llm.invoke_json_tracked(
        prompt=prompt,
        stage_name="narrative_focus_selection",
        parse_metrics=json_parse_metrics,
        max_tokens=512,
        temperature=0.05,
        model_name=selected_model_name,
    )
    focus_id = _safe_str(parsed.get("focus_id")).strip().lower()
    preset = next(
        (item for item in NARRATIVE_FOCUS_PRESETS if item["id"] == focus_id), None
    )
    if not preset:
        logger.warning(
            "URL2Blog narrative focus selection returned unknown focus_id: %r",
            focus_id,
        )
        return None, raw_response, parsed
    selection = {
        "id": preset["id"],
        "label": preset["label"],
        "prompt": preset["prompt"],
        "reasoning": _safe_str(parsed.get("reasoning")),
        "source": "auto",
    }
    return selection, raw_response, parsed


async def _pipeline_v2_run_stage2(
    *,
    request: PipelineV2Request,
    run_id: str,
    selected_model_name: str,
    include_debug: bool,
    json_parse_metrics: dict[str, Any],
    stage_trace: list[dict[str, Any]],
    normalized_title: str,
    normalized_content: str,
    normalized_language: str,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Execute URL2Blog stage 2 classification."""
    dependencies.recorder.mark_running(run_id, "stage_2")

    with _json_parse_tracking_scope(json_parse_metrics, "stage2_classification"):
        stage2_response = await dependencies.classify_article_type(
            Stage2ClassifyRequest(
                title=normalized_title,
                content=normalized_content,
                source_url=_safe_str(request.url or ""),
                language=normalized_language,
                model_name=selected_model_name,
                include_debug=include_debug,
            ),
            dependencies.llm,
        )
    stage2_payload = json.loads(stage2_response.body.decode("utf-8"))

    narrative_focus_selection: dict[str, Any] | None = None
    selection_raw_response = ""
    selection_parsed: dict[str, Any] = {}
    selection_error: str | None = None
    should_auto_select_focus = not _safe_str(request.narrative_focus)
    if should_auto_select_focus:
        try:
            (
                narrative_focus_selection,
                selection_raw_response,
                selection_parsed,
            ) = _pipeline_v2_select_narrative_focus(
                normalized_title=normalized_title,
                normalized_content=normalized_content,
                classification=_safe_dict(stage2_payload.get("classification")),
                selected_model_name=selected_model_name,
                json_parse_metrics=json_parse_metrics,
                dependencies=dependencies,
            )
        except Exception as exc:  # best-effort: never fail the run on focus selection
            selection_error = str(exc)
            logger.warning(
                "URL2Blog narrative focus auto-selection failed: %s", selection_error
            )
        if narrative_focus_selection:
            stage2_payload["narrative_focus_selection"] = narrative_focus_selection

    dependencies.recorder.record_stage(run_id, "stage_2", stage2_payload)
    next_stage = "rewrite_quality"
    if (
        request.enable_editorial_augmentation
        and _use_editorial_blueprint()
        and _resolve_execution_profile(request.execution_profile) != "lean"
    ):
        next_stage = "editorial_blueprint"

    dependencies.recorder.mark_running(run_id, next_stage)

    trace = list(stage_trace)
    if include_debug:
        stage2_debug = _safe_dict(stage2_payload.get("debug"))
        stage2_trace = stage2_debug.get("trace")
        if isinstance(stage2_trace, list):
            for entry in stage2_trace:
                if isinstance(entry, dict):
                    trace.append(entry)

    if should_auto_select_focus:
        trace = append_stage_trace(
            stage_trace=trace,
            include_debug=include_debug,
            stage="narrative_focus_selection",
            model_name=selected_model_name,
            max_tokens=512,
            temperature=0.05,
            input_payload={
                "title": normalized_title,
                "article_type": _safe_dict(stage2_payload.get("classification")),
            },
            raw_response=selection_raw_response,
            parsed=selection_parsed,
            output=narrative_focus_selection,
            error=selection_error,
        )

    return {
        "stage2_payload": stage2_payload,
        "trace": trace,
        "classification": _safe_dict(stage2_payload.get("classification")),
    }
