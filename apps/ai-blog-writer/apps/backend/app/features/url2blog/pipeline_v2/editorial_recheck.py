"""Post-editorial quality recheck phase for URL2Blog pipeline v2."""

import json
from typing import Any
from ..config import (
    URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT,
    URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE,
    URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE,
    URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN,
    _llm_context_text,
)
from ..prompts import (
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    V2_FACT_COVERAGE_AUDIT_PROMPT,
    V2_QUALITY_AUDIT_PROMPT,
)
from ..content.markdown import _ensure_markdown_section_headers
from ..dependencies import PipelineDependencies
from ..llm.coerce import (
    _ngram_overlap_ratio,
    _safe_bool,
    _safe_dict,
    _safe_str,
    _tokenize_similarity_words,
)
from ..observability import append_stage_trace
from ..content.sanitizers import _sanitize_v2_fact_coverage, _sanitize_v2_quality_audit


def _pipeline_v2_run_editorial_post_recheck_phase(
    context: dict[str, Any],
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Run post-editorial quality/fact recheck with rollback fallback."""
    run_id = _safe_str(context.get('run_id'))
    selected_model_name = _safe_str(context.get('selected_model_name'))
    include_debug = _safe_bool(context.get('include_debug'), default=False)
    narrative_focus = _safe_str(context.get('narrative_focus'))
    normalized_title = _safe_str(context.get('normalized_title'))
    normalized_content = _safe_str(context.get('normalized_content'))
    classification = _safe_dict(context.get('classification'))
    guideline_payload = _safe_dict(context.get('guideline_payload'))
    rewrite = _safe_dict(context.get('rewrite'))
    source_fact_anchors = list(context.get('source_fact_anchors') or [])
    external_context_for_prompt = (
        _safe_str(context.get('external_context_for_prompt'))
        or 'No external context collected.'
    )
    stage_trace = list(context.get('stage_trace') or [])
    json_parse_metrics = _safe_dict(context.get('json_parse_metrics'))
    if not json_parse_metrics:
        json_parse_metrics = {
            'total_parse_failures': 0,
            'recovered_calls': 0,
            'recovered_parse_failures': 0,
            'failures_by_stage': {},
        }
    use_editorial_post_recheck = _safe_bool(
        context.get('use_editorial_post_recheck'),
        default=URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT,
    )
    editorial_augmentation = _safe_dict(context.get('editorial_augmentation'))
    editorial_augmentation_applied = _safe_bool(
        editorial_augmentation.get('augmentation_applied'), default=False
    )
    final_improved_content = _safe_str(
        context.get('final_improved_content')
        or editorial_augmentation.get('augmented_content')
    )
    if not final_improved_content:
        final_improved_content = _ensure_markdown_section_headers(
            _safe_str(rewrite.get('improved_content'))
        )
    if not use_editorial_post_recheck or not editorial_augmentation_applied:
        editorial_post_recheck = {
            'decision': 'skipped',
            'pass_mode': 'skipped',
            'reason': (
                'Post-editorial recheck disabled.'
                if not use_editorial_post_recheck
                else 'Editorial augmentation not applied.'
            ),
        }
        stage_trace = append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage='editorial_post_recheck',
            model_name=selected_model_name,
            output=editorial_post_recheck,
        )
        context.update(
            {
                'stage_trace': stage_trace,
                'editorial_post_recheck': editorial_post_recheck,
            }
        )
        return context
    dependencies.recorder.mark_running(run_id, 'editorial_post_recheck')
    source_words = list(context.get('source_words') or [])
    if not source_words:
        source_words = _tokenize_similarity_words(normalized_content)
    post_editorial_words = _tokenize_similarity_words(final_improved_content)
    post_editorial_ngram_overlap = _ngram_overlap_ratio(
        source_words, post_editorial_words, n=10
    )
    quality_prompt = (
        V2_QUALITY_AUDIT_PROMPT.replace('{source_title}', normalized_title)
        .replace('{source_content}', _llm_context_text(normalized_content))
        .replace('{rewritten_title}', _safe_str(rewrite.get('improved_title')))
        .replace('{rewritten_content}', _llm_context_text(final_improved_content))
        .replace(
            '{article_type}', json.dumps(classification, ensure_ascii=False, indent=2)
        )
        .replace(
            '{guideline}',
            guideline_payload.get('guideline') or 'No guideline provided.',
        )
        .replace(
            '{title_guideline}',
            guideline_payload.get('title_guideline') or 'No title guideline provided.',
        )
        .replace('{seo_guideline}', SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
        .replace('{ngram_overlap}', f'{post_editorial_ngram_overlap:.3f}')
        .replace(
            '{narrative_focus}',
            narrative_focus or 'No additional narrative focus provided.',
        )
        .replace('{external_context}', external_context_for_prompt)
    )
    quality_parsed, editorial_post_quality_raw_response = (
        dependencies.llm.invoke_json_tracked(
            prompt=quality_prompt,
            stage_name='editorial_post_recheck_quality_audit',
            parse_metrics=json_parse_metrics,
            max_tokens=1024,
            temperature=0.05,
            model_name=selected_model_name,
        )
    )
    post_quality = _sanitize_v2_quality_audit(quality_parsed)
    fact_coverage_prompt = ''
    editorial_post_fact_coverage_raw_response = ''
    post_fact_coverage = _sanitize_v2_fact_coverage({}, source_fact_anchors)
    if source_fact_anchors:
        fact_coverage_prompt = (
            V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                '{source_facts}',
                json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
            )
            .replace('{rewritten_title}', _safe_str(rewrite.get('improved_title')))
            .replace('{rewritten_content}', _llm_context_text(final_improved_content))
        )
        fact_coverage_parsed, editorial_post_fact_coverage_raw_response = (
            dependencies.llm.invoke_json_tracked(
                prompt=fact_coverage_prompt,
                stage_name='editorial_post_recheck_fact_coverage',
                parse_metrics=json_parse_metrics,
                max_tokens=1536,
                temperature=0.05,
                model_name=selected_model_name,
            )
        )
        post_fact_coverage = _sanitize_v2_fact_coverage(
            fact_coverage_parsed, source_fact_anchors
        )
    quality_score = float(post_quality.get('overall_score') or 0.0)
    fact_score = float(post_fact_coverage.get('coverage_score') or 0.0)
    missing_high_count = int(post_fact_coverage.get('missing_high_count') or 0)
    too_close_to_source = _safe_bool(
        post_quality.get('too_close_to_source'), default=False
    )
    strict_pass = (
        quality_score >= URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE
        and fact_score >= URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE
        and (missing_high_count == 0)
        and (not too_close_to_source)
        and (post_editorial_ngram_overlap <= 0.9)
    )
    near_pass = (
        quality_score
        >= URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE
        - URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN
        and fact_score
        >= URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE
        - URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN
        and (missing_high_count == 0)
        and (not too_close_to_source)
        and (post_editorial_ngram_overlap <= 0.93)
    )
    if strict_pass:
        decision = 'pass'
        pass_mode = 'strict'
    elif near_pass:
        decision = 'pass'
        pass_mode = 'near_pass'
    else:
        decision = 'rollback'
        pass_mode = 'rollback_after_failed_recheck'
    rollback_data: dict[str, Any] = {}
    if decision == 'rollback':
        pre_editorial_content = _safe_str(context.get('pre_editorial_content'))
        if pre_editorial_content:
            restored_word_count = len(_tokenize_similarity_words(pre_editorial_content))
            context['final_improved_content'] = pre_editorial_content
            context['post_editorial_word_count'] = restored_word_count
            existing_summary = _safe_str(
                editorial_augmentation.get('augmentation_summary')
            )
            editorial_augmentation.update(
                {
                    'augmentation_applied': False,
                    'components_added': [],
                    'augmentation_summary': f'{existing_summary} Rolled back after post-editorial recheck.'.strip(),
                }
            )
            context['editorial_augmentation'] = editorial_augmentation
            rollback_data = {
                'restored_from': 'pre_editorial_content',
                'restored_word_count': restored_word_count,
            }
        else:
            rollback_data = {
                'restored_from': 'none',
                'reason': 'pre_editorial_content_missing',
            }
    else:
        context['quality'] = post_quality
        context['quality_raw_response'] = editorial_post_quality_raw_response
        context['fact_coverage'] = post_fact_coverage
        context['fact_coverage_raw_response'] = (
            editorial_post_fact_coverage_raw_response
        )
        context['ngram_overlap'] = post_editorial_ngram_overlap
    editorial_post_recheck = {
        'decision': decision,
        'pass_mode': pass_mode,
        'quality_score': quality_score,
        'fact_coverage_score': fact_score,
        'missing_high_count': missing_high_count,
        'too_close_to_source': too_close_to_source,
        'ngram_overlap': round(post_editorial_ngram_overlap, 3),
        'quality_threshold': URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE,
        'fact_threshold': URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE,
        'near_pass_margin': URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN,
        'rollback_data': rollback_data,
    }
    stage_trace = append_stage_trace(
        stage_trace=stage_trace,
        include_debug=include_debug,
        stage='editorial_post_recheck',
        model_name=selected_model_name,
        max_tokens=1536,
        temperature=0.05,
        input_payload={
            'rewritten_title': _safe_str(rewrite.get('improved_title')),
            'rewritten_content': _llm_context_text(final_improved_content),
            'article_type': classification,
            'narrative_focus': narrative_focus,
            'source_facts_count': len(source_fact_anchors),
        },
        output={
            **editorial_post_recheck,
            'quality_summary': _safe_str(post_quality.get('quality_summary')),
            'factual_coverage_summary': _safe_str(
                post_fact_coverage.get('coverage_summary')
            ),
        },
    )
    dependencies.recorder.record_stage(
        run_id, 'editorial_post_recheck', editorial_post_recheck
    )
    if rollback_data:
        dependencies.recorder.record_stage(
            run_id, 'editorial_post_recheck_rollback', rollback_data
        )
    context.update(
        {
            'json_parse_metrics': json_parse_metrics,
            'stage_trace': stage_trace,
            'editorial_post_recheck': editorial_post_recheck,
            'editorial_post_quality_raw_response': editorial_post_quality_raw_response,
            'editorial_post_fact_coverage_raw_response': editorial_post_fact_coverage_raw_response,
        }
    )
    return context
