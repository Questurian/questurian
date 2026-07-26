"""URL2Blog pipeline context assembly."""

from typing import Any

from fastapi import HTTPException

from app.shared.tone_profiles import build_tone_guidance, resolve_tone_profile
from app.shared.writer_models import resolve_writer_model

from ..config import (
    DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
    MAX_LENGTH_EXPANSION_PASSES,
    URL2BLOG_COMPOSE_MODEL,
    _use_editorial_blueprint,
    _use_editorial_insert_only_post,
    _use_editorial_post_recheck,
    _use_markdown_long_stages,
)
from ..dependencies import PipelineDependencies
from ..content.sanitizers import _resolve_min_expanded_word_target
from ..llm.coerce import (
    _normalize_language_name,
    _safe_bool,
    _safe_dict,
    _safe_int,
    _safe_str,
    _tokenize_similarity_words,
)
from ..models import PipelineV2Request


def _pipeline_v2_prepare_context(
    *,
    request: PipelineV2Request,
    run_id: str,
    selected_model_name: str,
    execution_profile: str,
    stage1_payload: dict[str, Any],
    stage2_payload: dict[str, Any],
    stage_trace: list[dict[str, Any]] | None,
    json_parse_metrics: dict[str, Any] | None,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    url = _safe_str(request.url or "")

    include_debug = request.include_debug
    is_lean_profile = execution_profile == "lean"
    narrative_focus = _safe_str(request.narrative_focus)
    narrative_focus_source = "user" if narrative_focus else "default"
    narrative_focus_selection = _safe_dict(
        _safe_dict(stage2_payload).get("narrative_focus_selection")
    )
    if not narrative_focus and narrative_focus_selection:
        narrative_focus = _safe_str(narrative_focus_selection.get("prompt"))
        if narrative_focus:
            narrative_focus_source = "auto"
    tone_profile = resolve_tone_profile(request.tone_id)
    tone_guidance = build_tone_guidance(str(tone_profile.get("id") or ""))
    if tone_guidance:
        narrative_focus = (
            f"{narrative_focus}\n\n{tone_guidance}".strip()
            if narrative_focus
            else tone_guidance
        )
    use_markdown_long_stages = _use_markdown_long_stages()
    use_editorial_blueprint = _use_editorial_blueprint()
    use_editorial_insert_only_post = _use_editorial_insert_only_post()
    use_editorial_post_recheck = _use_editorial_post_recheck()
    enable_web_enrichment = request.enable_web_enrichment and not is_lean_profile
    enable_editorial_augmentation = (
        request.enable_editorial_augmentation and not is_lean_profile
    )

    parse_metrics = (
        json_parse_metrics
        if isinstance(json_parse_metrics, dict)
        else {
            "total_parse_failures": 0,
            "recovered_calls": 0,
            "recovered_parse_failures": 0,
            "failures_by_stage": {},
        }
    )

    max_external_context_items = _safe_int(
        request.max_external_context_items,
        default=DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
        min_value=1,
        max_value=5,
    )
    max_length_expansion_passes = 1 if is_lean_profile else MAX_LENGTH_EXPANSION_PASSES

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

    classification = _safe_dict(stage2_payload.get("classification"))
    article_type_id: int | None = None
    raw_type_id = classification.get("id")
    if isinstance(raw_type_id, int):
        article_type_id = raw_type_id
    elif isinstance(raw_type_id, str) and raw_type_id.strip().isdigit():
        article_type_id = int(raw_type_id.strip())

    guideline_payload = {
        "id": article_type_id or 0,
        "name": _safe_str(classification.get("name")),
        "guideline": "",
        "title_guideline": "",
    }

    if article_type_id is not None:
        article_type_row = dependencies.get_article_type(article_type_id)
        if article_type_row:
            guideline_payload = {
                "id": article_type_row["id"],
                "name": article_type_row["name"],
                "guideline": article_type_row.get("guideline") or "",
                "title_guideline": article_type_row.get("title_guideline") or "",
            }

    writing_model = resolve_writer_model(
        request.writing_model, default=URL2BLOG_COMPOSE_MODEL
    )

    return {
        "run_id": run_id,
        "url": url,
        "selected_model_name": selected_model_name,
        "writing_model": writing_model,
        "execution_profile": execution_profile,
        "is_lean_profile": is_lean_profile,
        "include_debug": include_debug,
        "narrative_focus": narrative_focus,
        "narrative_focus_source": narrative_focus_source,
        "narrative_focus_selection": narrative_focus_selection,
        "tone_profile": tone_profile,
        "tone_guidance": tone_guidance,
        "use_markdown_long_stages": use_markdown_long_stages,
        "use_editorial_blueprint": use_editorial_blueprint,
        "use_editorial_insert_only_post": use_editorial_insert_only_post,
        "use_editorial_post_recheck": use_editorial_post_recheck,
        "enable_web_enrichment": enable_web_enrichment,
        "enable_editorial_augmentation": enable_editorial_augmentation,
        "json_parse_metrics": parse_metrics,
        "max_external_context_items": max_external_context_items,
        "max_length_expansion_passes": max_length_expansion_passes,
        "stage_trace": list(stage_trace or []),
        "stage1_payload": _safe_dict(stage1_payload),
        "stage2_payload": _safe_dict(stage2_payload),
        "parsed_article": parsed_article,
        "was_translated": was_translated,
        "normalized_title": normalized_title,
        "normalized_content": normalized_content,
        "normalized_language": normalized_language,
        "source_word_count": source_word_count,
        "min_expanded_word_target": min_expanded_word_target,
        "classification": classification,
        "guideline_payload": guideline_payload,
    }
