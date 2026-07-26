"""Rewrite quality setup steps for URL2Blog pipeline v2."""

import json
from typing import Any
from ..config import (
    DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
    FEATURE_NAME,
    SHORT_ARTICLE_WORD_THRESHOLD,
    URL2BLOG_COMPOSE_MODEL,
    URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT,
    URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
    _llm_context_text,
)
from ..prompts import (
    V2_SHORT_ARTICLE_ENRICHMENT_PROMPT,
    V2_SOURCE_FACTS_EXTRACTION_PROMPT,
)
from ..content.editorial_blocks import _format_editorial_blueprint_for_prompt
from ..routes import _now_iso, _pipeline_v2_append_stage_trace
from ..llm.coerce import _safe_bool, _safe_dict, _safe_int, _safe_str
from ..content.sanitizers import (
    _sanitize_v2_external_context,
    _sanitize_v2_source_facts,
)
from .. import routes
from app.core import write_stage_result, write_status


class _RewriteQualitySetup:

    def _initialize(self) -> None:
        self.run_id = _safe_str(self.context.get('run_id'))
        self.url = _safe_str(self.context.get('url'))
        self.selected_model_name = _safe_str(self.context.get('selected_model_name'))
        self.writing_model = (
            _safe_str(self.context.get('writing_model')) or URL2BLOG_COMPOSE_MODEL
        )
        self.include_debug = _safe_bool(
            self.context.get('include_debug'), default=False
        )
        self.narrative_focus = _safe_str(self.context.get('narrative_focus'))
        self.enable_web_enrichment = _safe_bool(
            self.context.get('enable_web_enrichment'), default=False
        )
        self.enable_editorial_augmentation = _safe_bool(
            self.context.get('enable_editorial_augmentation'), default=False
        )
        self.is_lean_profile = _safe_bool(
            self.context.get('is_lean_profile'), default=False
        )
        self.use_markdown_long_stages = _safe_bool(
            self.context.get('use_markdown_long_stages'),
            default=URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
        )
        self.use_editorial_blueprint = _safe_bool(
            self.context.get('use_editorial_blueprint'),
            default=URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT,
        )
        self.long_output_transport = (
            'markdown' if self.use_markdown_long_stages else 'json'
        )
        self.title_pass_applied_count = _safe_int(
            self.context.get('title_pass_applied_count'),
            default=0,
            min_value=0,
            max_value=99,
        )
        self.editorial_blueprint = _safe_dict(self.context.get('editorial_blueprint'))
        self.editorial_blueprint_for_prompt = _safe_str(
            self.context.get('editorial_blueprint_for_prompt')
        )
        if not self.editorial_blueprint_for_prompt:
            self.editorial_blueprint_for_prompt = (
                _format_editorial_blueprint_for_prompt(self.editorial_blueprint)
            )
        self.editorial_blueprint_raw_response = _safe_str(
            self.context.get('editorial_blueprint_raw_response')
        )
        self.editorial_blueprint_applied = _safe_bool(
            self.context.get('editorial_blueprint_applied'), default=False
        )
        self.json_parse_metrics = _safe_dict(self.context.get('json_parse_metrics'))
        if not self.json_parse_metrics:
            self.json_parse_metrics = {
                'total_parse_failures': 0,
                'recovered_calls': 0,
                'recovered_parse_failures': 0,
                'failures_by_stage': {},
            }
        self.max_external_context_items = _safe_int(
            self.context.get('max_external_context_items'),
            default=DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
            min_value=1,
            max_value=5,
        )
        self.rewrite_retry_count = _safe_int(
            self.context.get('rewrite_quality_retry_count'),
            default=0,
            min_value=0,
            max_value=10,
        )
        self.rewrite_retry_feedback = _safe_dict(
            self.context.get('rewrite_retry_feedback')
        )
        self.previous_quality = _safe_dict(self.context.get('quality'))
        self.normalized_title = _safe_str(self.context.get('normalized_title'))
        self.normalized_content = _safe_str(self.context.get('normalized_content'))
        self.source_word_count = _safe_int(
            self.context.get('source_word_count'),
            default=0,
            min_value=0,
            max_value=200000,
        )
        self.classification = _safe_dict(self.context.get('classification'))
        self.guideline_payload = _safe_dict(self.context.get('guideline_payload'))
        self.stage_trace = list(self.context.get('stage_trace') or [])
        self.should_generate_editorial_blueprint = (
            self.enable_editorial_augmentation
            and self.use_editorial_blueprint
            and (not self.is_lean_profile)
        )
        write_status(
            self.run_id,
            {
                'run_id': self.run_id,
                'state': 'running',
                'stage': (
                    'editorial_blueprint'
                    if self.should_generate_editorial_blueprint
                    else 'rewrite_quality'
                ),
                'error': None,
                'updated_at': _now_iso(),
            },
            feature=FEATURE_NAME,
        )
        self.external_context_points: list[dict[str, str]] = []
        self.external_context_usage_note = ''
        self.external_context_raw_response = ''
        self.external_context_grounded_urls: list[str] = []
        self.short_article_enrichment_applied = False
        self.external_context_parsed: dict[str, Any] = {}
        self.external_context: dict[str, Any] = {'context_points': [], 'usage_note': ''}
        self.should_enrich_short_article = (
            self.enable_web_enrichment
            and self.source_word_count < SHORT_ARTICLE_WORD_THRESHOLD
        )

    def _enrich_short_article(self) -> None:
        if self.should_enrich_short_article:
            self.enrichment_prompt = (
                V2_SHORT_ARTICLE_ENRICHMENT_PROMPT.replace(
                    '{max_points}', str(self.max_external_context_items)
                )
                .replace('{source_url}', self.url)
                .replace('{source_title}', self.normalized_title)
                .replace('{source_content}', _llm_context_text(self.normalized_content))
                .replace(
                    '{article_type}',
                    json.dumps(self.classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    '{narrative_focus}',
                    self.narrative_focus or 'No additional narrative focus provided.',
                )
            )
            (
                self.external_context_parsed,
                self.external_context_raw_response,
                self.external_context_grounded_urls,
            ) = routes._invoke_google_grounded_json(
                self.enrichment_prompt,
                max_tokens=1024,
                temperature=0.05,
                model_name=self.selected_model_name,
            )
            self.external_context = _sanitize_v2_external_context(
                self.external_context_parsed,
                max_points=self.max_external_context_items,
                fallback_urls=self.external_context_grounded_urls,
            )
            self.external_context_points = self.external_context['context_points']
            self.external_context_usage_note = self.external_context['usage_note']
            self.short_article_enrichment_applied = bool(self.external_context_points)
            self.stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='short_article_enrichment',
                model_name=self.selected_model_name,
                max_tokens=1024,
                temperature=0.05,
                input_payload={
                    'source_url': self.url,
                    'source_title': self.normalized_title,
                    'source_content': _llm_context_text(self.normalized_content),
                    'article_type': self.classification,
                    'narrative_focus': self.narrative_focus,
                    'max_external_context_items': self.max_external_context_items,
                },
                prompt=self.enrichment_prompt,
                raw_response=self.external_context_raw_response,
                parsed=self.external_context_parsed,
                output=self.external_context,
                grounded_urls=self.external_context_grounded_urls,
            )
        else:
            self.stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='short_article_enrichment',
                model_name=self.selected_model_name,
                max_tokens=1024,
                temperature=0.05,
                input_payload={
                    'source_word_count': self.source_word_count,
                    'threshold': SHORT_ARTICLE_WORD_THRESHOLD,
                    'enable_web_enrichment': self.enable_web_enrichment,
                },
                output={
                    'skipped': True,
                    'reason': 'Short-article enrichment conditions not met.',
                },
            )

    def _extract_source_facts(self) -> None:
        self.external_context_for_prompt = (
            json.dumps(self.external_context_points, ensure_ascii=False, indent=2)
            if self.external_context_points
            else 'No external context collected.'
        )
        self.source_facts_prompt = (
            V2_SOURCE_FACTS_EXTRACTION_PROMPT.replace('{max_facts}', '18')
            .replace('{source_title}', self.normalized_title)
            .replace('{source_content}', _llm_context_text(self.normalized_content))
        )
        self.source_facts_parsed, self.source_facts_raw_response = (
            routes._invoke_json_llm_tracked(
                prompt=self.source_facts_prompt,
                stage_name='source_facts_extraction',
                parse_metrics=self.json_parse_metrics,
                max_tokens=1536,
                temperature=0.05,
                model_name=self.selected_model_name,
            )
        )
        self.source_fact_anchors = _sanitize_v2_source_facts(
            self.source_facts_parsed, max_facts=18
        )
        self.stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=self.stage_trace,
            include_debug=self.include_debug,
            stage='source_facts_extraction',
            model_name=self.selected_model_name,
            max_tokens=1536,
            temperature=0.05,
            input_payload={
                'source_title': self.normalized_title,
                'source_content': _llm_context_text(self.normalized_content),
                'max_facts': 18,
            },
            prompt=self.source_facts_prompt,
            raw_response=self.source_facts_raw_response,
            parsed=self.source_facts_parsed,
            output={'source_fact_anchors': self.source_fact_anchors},
        )

    def _persist_result(self) -> None:
        write_stage_result(
            self.run_id,
            'rewrite_quality',
            {
                'created_at': _now_iso(),
                'data': {
                    'second_pass_applied': self.second_pass_applied,
                    'quality_scores': {
                        'overall': self.quality['overall_score'],
                        'guideline_coverage': self.quality['guideline_coverage_score'],
                        'informativeness': self.quality['informativeness_score'],
                        'originality': self.quality['originality_score'],
                    },
                    'quality_summary': self.quality.get('quality_summary'),
                    'required_revisions': list(
                        self.quality.get('required_revisions') or []
                    ),
                    'too_close_to_source': self.quality.get('too_close_to_source'),
                    'similarity_ngram_overlap': round(self.ngram_overlap, 3),
                    'short_article_enrichment_applied': self.short_article_enrichment_applied,
                    'external_context_points_used': len(self.external_context_points),
                    'source_facts_extracted_count': len(self.source_fact_anchors),
                    'editorial_blueprint_applied': self.editorial_blueprint_applied,
                    'editorial_blueprint_components_planned': [
                        _safe_str(item.get('component'))
                        for item in list(
                            self.editorial_blueprint.get('components') or []
                        )
                        if isinstance(item, dict)
                    ],
                    'long_output_transport': self.long_output_transport,
                    'title_pass_applied_count': self.title_pass_applied_count,
                },
            },
        )
        self.context.update(
            {
                'json_parse_metrics': self.json_parse_metrics,
                'stage_trace': self.stage_trace,
                'external_context_points': self.external_context_points,
                'external_context_usage_note': self.external_context_usage_note,
                'external_context_raw_response': self.external_context_raw_response,
                'external_context_grounded_urls': self.external_context_grounded_urls,
                'short_article_enrichment_applied': self.short_article_enrichment_applied,
                'external_context_for_prompt': self.external_context_for_prompt,
                'source_fact_anchors': self.source_fact_anchors,
                'source_facts_raw_response': self.source_facts_raw_response,
                'rewrite': self.rewrite,
                'rewrite_raw_response': self.rewrite_raw_response,
                'repair_raw_response': self.repair_raw_response,
                'quality': self.quality,
                'quality_raw_response': self.quality_raw_response,
                'source_words': self.source_words,
                'rewritten_words': self.rewritten_words,
                'ngram_overlap': self.ngram_overlap,
                'second_pass_applied': self.second_pass_applied,
                'rewrite_retry_count': self.rewrite_retry_count,
                'rewrite_retry_feedback': self.rewrite_retry_feedback,
                'long_output_transport': self.long_output_transport,
                'title_pass_applied_count': self.title_pass_applied_count,
                'use_markdown_long_stages': self.use_markdown_long_stages,
                'use_editorial_blueprint': self.use_editorial_blueprint,
                'editorial_blueprint': self.editorial_blueprint,
                'editorial_blueprint_raw_response': self.editorial_blueprint_raw_response,
                'editorial_blueprint_applied': self.editorial_blueprint_applied,
                'editorial_blueprint_for_prompt': self.editorial_blueprint_for_prompt,
            }
        )
