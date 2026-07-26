"""Editorial augmentation phase for URL2Blog pipeline v2."""

import json
import logging
from typing import Any
from ..config import (
    FEATURE_NAME,
    URL2BLOG_EDITORIAL_AUGMENTATION_MODEL,
    URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT,
    _llm_context_text,
)
from fastapi import HTTPException
from ..prompts import V2_EDITORIAL_AUGMENTATION_PROMPT
from ..content.editorial_blocks import _build_insert_only_editorial_augmentation
from ..content.markdown import _ensure_markdown_section_headers
from ..routes import _now_iso, _pipeline_v2_append_stage_trace
from ..llm.coerce import _safe_bool, _safe_dict, _safe_str, _tokenize_similarity_words
from ..content.sanitizers import _sanitize_v2_editorial_augmentation
from .. import routes
from app.core import write_stage_result, write_status

logger = logging.getLogger(__name__)


def _pipeline_v2_run_editorial_phase(context: dict[str, Any]) -> dict[str, Any]:
    run_id = _safe_str(context.get('run_id'))
    selected_model_name = _safe_str(context.get('selected_model_name'))
    writing_model = (
        _safe_str(context.get('writing_model')) or URL2BLOG_EDITORIAL_AUGMENTATION_MODEL
    )
    include_debug = _safe_bool(context.get('include_debug'), default=False)
    narrative_focus = _safe_str(context.get('narrative_focus'))
    enable_editorial_augmentation = _safe_bool(
        context.get('enable_editorial_augmentation'), default=False
    )
    use_editorial_insert_only_post = _safe_bool(
        context.get('use_editorial_insert_only_post'),
        default=URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT,
    )
    classification = _safe_dict(context.get('classification'))
    rewrite = _safe_dict(context.get('rewrite'))
    editorial_blueprint = _safe_dict(context.get('editorial_blueprint'))
    stage_trace = list(context.get('stage_trace') or [])
    json_parse_metrics = _safe_dict(context.get('json_parse_metrics'))
    if not json_parse_metrics:
        json_parse_metrics = {
            'total_parse_failures': 0,
            'recovered_calls': 0,
            'recovered_parse_failures': 0,
            'failures_by_stage': {},
        }
    write_status(
        run_id,
        {
            'run_id': run_id,
            'state': 'running',
            'stage': 'editorial_augmentation',
            'error': None,
            'updated_at': _now_iso(),
        },
        feature=FEATURE_NAME,
    )
    final_improved_content = _ensure_markdown_section_headers(
        rewrite.get('improved_content') or ''
    )
    pre_editorial_content = final_improved_content
    pre_editorial_word_count = len(_tokenize_similarity_words(pre_editorial_content))
    editorial_augmentation_raw_response = ''
    editorial_augmentation = _sanitize_v2_editorial_augmentation(
        {}, fallback_content=final_improved_content
    )
    editorial_insert_only_post_applied = False
    if enable_editorial_augmentation:
        if use_editorial_insert_only_post and _safe_bool(
            editorial_blueprint.get('apply_plan'), default=False
        ):
            editorial_insert_only_post_applied = True
            editorial_augmentation = _build_insert_only_editorial_augmentation(
                fallback_content=final_improved_content,
                editorial_blueprint=editorial_blueprint,
            )
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage='editorial_augmentation',
                model_name=selected_model_name,
                max_tokens=0,
                temperature=0.0,
                input_payload={
                    'article_title': _safe_str(rewrite.get('improved_title')),
                    'article_content': _llm_context_text(final_improved_content),
                    'article_type': classification,
                    'narrative_focus': narrative_focus,
                    'mode': 'insert_only',
                    'editorial_blueprint': editorial_blueprint,
                },
                output={**editorial_augmentation, 'mode': 'insert_only'},
            )
        else:
            augmentation_prompt = (
                V2_EDITORIAL_AUGMENTATION_PROMPT.replace(
                    '{article_title}', _safe_str(rewrite.get('improved_title'))
                )
                .replace('{article_content}', _llm_context_text(final_improved_content))
                .replace(
                    '{article_type}',
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    '{narrative_focus}',
                    narrative_focus or 'No additional narrative focus provided.',
                )
            )
            try:
                augmentation_parsed, editorial_augmentation_raw_response = (
                    routes._invoke_json_llm_tracked(
                        prompt=augmentation_prompt,
                        stage_name='editorial_augmentation',
                        parse_metrics=json_parse_metrics,
                        max_tokens=6144,
                        temperature=0.05,
                        model_name=writing_model,
                    )
                )
                editorial_augmentation = _sanitize_v2_editorial_augmentation(
                    augmentation_parsed, fallback_content=final_improved_content
                )
                stage_trace = _pipeline_v2_append_stage_trace(
                    stage_trace=stage_trace,
                    include_debug=include_debug,
                    stage='editorial_augmentation',
                    model_name=writing_model,
                    max_tokens=6144,
                    temperature=0.05,
                    input_payload={
                        'article_title': _safe_str(rewrite.get('improved_title')),
                        'article_content': _llm_context_text(final_improved_content),
                        'article_type': classification,
                        'narrative_focus': narrative_focus,
                        'mode': 'llm',
                    },
                    prompt=augmentation_prompt,
                    raw_response=editorial_augmentation_raw_response,
                    parsed=augmentation_parsed,
                    output={**editorial_augmentation, 'mode': 'llm'},
                )
            except HTTPException as exc:
                logger.warning('URL2Blog editorial augmentation failed: %s', exc.detail)
                stage_trace = _pipeline_v2_append_stage_trace(
                    stage_trace=stage_trace,
                    include_debug=include_debug,
                    stage='editorial_augmentation',
                    model_name=writing_model,
                    max_tokens=6144,
                    temperature=0.05,
                    input_payload={
                        'article_title': _safe_str(rewrite.get('improved_title')),
                        'article_content': _llm_context_text(final_improved_content),
                        'article_type': classification,
                        'narrative_focus': narrative_focus,
                        'mode': 'llm',
                    },
                    prompt=augmentation_prompt,
                    error=_safe_str(exc.detail),
                )
    else:
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage='editorial_augmentation',
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.05,
            output={
                'skipped': True,
                'reason': 'Editorial augmentation disabled for this run.',
            },
        )
    final_improved_content = editorial_augmentation['augmented_content']
    post_editorial_word_count = len(_tokenize_similarity_words(final_improved_content))
    write_stage_result(
        run_id,
        'editorial_augmentation_stage',
        {
            'created_at': _now_iso(),
            'data': {
                'editorial_augmentation_applied': editorial_augmentation[
                    'augmentation_applied'
                ],
                'pre_editorial_word_count': pre_editorial_word_count,
                'post_editorial_word_count': post_editorial_word_count,
                'editorial_components_added': [
                    item['component']
                    for item in editorial_augmentation['components_added']
                ],
                'editorial_augmentation_summary': editorial_augmentation[
                    'augmentation_summary'
                ],
                'editorial_insert_only_post_applied': editorial_insert_only_post_applied,
            },
        },
    )
    context.update(
        {
            'json_parse_metrics': json_parse_metrics,
            'stage_trace': stage_trace,
            'editorial_augmentation': editorial_augmentation,
            'editorial_augmentation_raw_response': editorial_augmentation_raw_response,
            'pre_editorial_content': pre_editorial_content,
            'pre_editorial_word_count': pre_editorial_word_count,
            'post_editorial_word_count': post_editorial_word_count,
            'final_improved_content': final_improved_content,
            'editorial_insert_only_post_applied': editorial_insert_only_post_applied,
        }
    )
    return context
