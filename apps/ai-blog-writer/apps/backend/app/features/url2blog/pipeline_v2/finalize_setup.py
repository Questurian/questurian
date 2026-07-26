"""Finalize setup steps for URL2Blog pipeline v2."""

from fastapi import HTTPException
from ..config import (
    MAX_LENGTH_EXPANSION_PASSES,
    URL2BLOG_COMPOSE_MODEL,
    URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT,
    URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT,
    URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT,
    URL2BLOG_MAX_TOKENS_FLOOR_DEFAULT,
    URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
)
from ..routes import _build_markdown, _pipeline_v2_append_stage_trace
from ..content.markdown import _ensure_markdown_section_headers
from ..llm.coerce import (
    _safe_bool,
    _safe_dict,
    _safe_int,
    _safe_str,
    _tokenize_similarity_words,
)
from ..content.sanitizers import (
    _sanitize_v2_editorial_augmentation,
    _sanitize_v2_fact_coverage,
    _sanitize_v2_quality_audit,
)
from app.shared.text import enforce_anti_ai_tells_markdown, normalize_dashes
from .. import routes


class _FinalizeSetup:

    def _initialize(self) -> None:
        self.run_id = _safe_str(self.context.get('run_id'))
        self.url = _safe_str(self.context.get('url'))
        self.include_debug = _safe_bool(
            self.context.get('include_debug'), default=False
        )
        self.narrative_focus = _safe_str(self.context.get('narrative_focus'))
        self.selected_model_name = _safe_str(self.context.get('selected_model_name'))
        self.execution_profile = _safe_str(self.context.get('execution_profile'))
        self.parsed_article = _safe_dict(self.context.get('parsed_article'))
        self.was_translated = _safe_bool(
            self.context.get('was_translated'), default=False
        )
        self.normalized_title = _safe_str(self.context.get('normalized_title'))
        self.normalized_content = _safe_str(self.context.get('normalized_content'))
        self.normalized_language = _safe_str(self.context.get('normalized_language'))
        self.source_word_count = _safe_int(
            self.context.get('source_word_count'),
            default=0,
            min_value=0,
            max_value=200000,
        )
        self.min_expanded_word_target = _safe_int(
            self.context.get('min_expanded_word_target'),
            default=0,
            min_value=0,
            max_value=300000,
        )
        self.classification = _safe_dict(self.context.get('classification'))
        self.guideline_payload = _safe_dict(self.context.get('guideline_payload'))
        self.rewrite_quality_gate = _safe_dict(self.context.get('rewrite_quality_gate'))
        self.fact_gate = _safe_dict(self.context.get('fact_gate'))
        self.editorial_gate = _safe_dict(self.context.get('editorial_gate'))
        self.stage1_payload = _safe_dict(self.context.get('stage1_payload'))
        self.stage2_payload = _safe_dict(self.context.get('stage2_payload'))
        self.rewrite = _safe_dict(self.context.get('rewrite'))
        self.quality = _safe_dict(self.context.get('quality'))
        self.fact_coverage = _safe_dict(self.context.get('fact_coverage'))
        self.editorial_augmentation = _safe_dict(
            self.context.get('editorial_augmentation')
        )
        self.editorial_blueprint = _safe_dict(self.context.get('editorial_blueprint'))
        self.editorial_post_recheck = _safe_dict(
            self.context.get('editorial_post_recheck')
        )
        if not self.rewrite:
            raise HTTPException(status_code=500, detail='Rewrite output missing')
        if not self.quality:
            self.quality = _sanitize_v2_quality_audit({})
        if not self.fact_coverage:
            self.fact_coverage = _sanitize_v2_fact_coverage({}, [])
        if not self.editorial_augmentation:
            self.fallback_content = _ensure_markdown_section_headers(
                _safe_str(self.rewrite.get('improved_content'))
            )
            self.editorial_augmentation = _sanitize_v2_editorial_augmentation(
                {}, fallback_content=self.fallback_content
            )

    def _build_markdown_and_excerpt(self) -> None:
        self.final_improved_content = enforce_anti_ai_tells_markdown(
            _safe_str(
                self.context.get('final_improved_content')
                or self.editorial_augmentation.get('augmented_content')
            ),
            repair=lambda repair_prompt: _safe_str(
                routes.get_vertex_llm(
                    temperature=0.1,
                    max_tokens=URL2BLOG_MAX_TOKENS_FLOOR_DEFAULT,
                    model_name=self.selected_model_name or URL2BLOG_COMPOSE_MODEL,
                ).invoke(repair_prompt)
            ),
            context='url2blog final content',
        )
        if self.rewrite.get('improved_title'):
            self.rewrite['improved_title'] = normalize_dashes(
                _safe_str(self.rewrite['improved_title'])
            )
        self.rewrite_raw_response = _safe_str(self.context.get('rewrite_raw_response'))
        self.repair_raw_response = _safe_str(self.context.get('repair_raw_response'))
        self.quality_raw_response = _safe_str(self.context.get('quality_raw_response'))
        self.source_facts_raw_response = _safe_str(
            self.context.get('source_facts_raw_response')
        )
        self.fact_coverage_raw_response = _safe_str(
            self.context.get('fact_coverage_raw_response')
        )
        self.fact_repair_raw_response = _safe_str(
            self.context.get('fact_repair_raw_response')
        )
        self.length_expansion_raw_response = _safe_str(
            self.context.get('length_expansion_raw_response')
        )
        self.editorial_augmentation_raw_response = _safe_str(
            self.context.get('editorial_augmentation_raw_response')
        )
        self.editorial_blueprint_raw_response = _safe_str(
            self.context.get('editorial_blueprint_raw_response')
        )
        self.editorial_post_quality_raw_response = _safe_str(
            self.context.get('editorial_post_quality_raw_response')
        )
        self.editorial_post_fact_coverage_raw_response = _safe_str(
            self.context.get('editorial_post_fact_coverage_raw_response')
        )

    def _collect_stage_metadata(self) -> None:
        self.stage_trace = list(self.context.get('stage_trace') or [])
        self.json_parse_metrics = _safe_dict(self.context.get('json_parse_metrics'))
        self.external_context_points = list(
            self.context.get('external_context_points') or []
        )
        self.external_context_usage_note = _safe_str(
            self.context.get('external_context_usage_note')
        )
        self.external_context_raw_response = _safe_str(
            self.context.get('external_context_raw_response')
        )
        self.external_context_grounded_urls = list(
            self.context.get('external_context_grounded_urls') or []
        )
        self.short_article_enrichment_applied = _safe_bool(
            self.context.get('short_article_enrichment_applied'), default=False
        )
        self.source_fact_anchors = list(self.context.get('source_fact_anchors') or [])
        self.length_expansion_applied = _safe_bool(
            self.context.get('length_expansion_applied'), default=False
        )
        self.length_expansion_passes = _safe_int(
            self.context.get('length_expansion_passes'),
            default=0,
            min_value=0,
            max_value=MAX_LENGTH_EXPANSION_PASSES,
        )
        self.length_expansion_summary = _safe_str(
            self.context.get('length_expansion_summary')
        )
        self.fact_repair_applied = _safe_bool(
            self.context.get('fact_repair_applied'), default=False
        )
        self.second_pass_applied = _safe_bool(
            self.context.get('second_pass_applied'), default=False
        )
        self.use_markdown_long_stages = _safe_bool(
            self.context.get('use_markdown_long_stages'),
            default=URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
        )
        self.use_editorial_blueprint = _safe_bool(
            self.context.get('use_editorial_blueprint'),
            default=URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT,
        )
        self.use_editorial_insert_only_post = _safe_bool(
            self.context.get('use_editorial_insert_only_post'),
            default=URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT,
        )
        self.use_editorial_post_recheck = _safe_bool(
            self.context.get('use_editorial_post_recheck'),
            default=URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT,
        )
        self.editorial_blueprint_applied = _safe_bool(
            self.context.get('editorial_blueprint_applied'),
            default=_safe_bool(
                self.editorial_blueprint.get('apply_plan'), default=False
            )
            and bool(list(self.editorial_blueprint.get('components') or [])),
        )
        self.editorial_insert_only_post_applied = _safe_bool(
            self.context.get('editorial_insert_only_post_applied'), default=False
        )
        self.long_output_transport = _safe_str(
            self.context.get('long_output_transport')
        ) or ('markdown' if self.use_markdown_long_stages else 'json')
        self.title_pass_applied_count = _safe_int(
            self.context.get('title_pass_applied_count'),
            default=0,
            min_value=0,
            max_value=99,
        )
        self.ngram_overlap = float(self.context.get('ngram_overlap') or 0.0)
        self.final_word_count = len(
            _tokenize_similarity_words(self.final_improved_content)
        )
        self.length_requirement_met = (
            self.final_word_count >= self.min_expanded_word_target
        )
        self.pipeline_status = (
            'ready_for_drafting' if self.length_requirement_met else 'needs_revision'
        )
        self.length_requirement_blocking_reason = ''
        if not self.length_requirement_met:
            self.length_requirement_blocking_reason = f'Final article length is below minimum expansion target ({self.final_word_count} < {self.min_expanded_word_target} words).'
        self.final_markdown = _build_markdown(
            _safe_str(self.rewrite.get('improved_title')), self.final_improved_content
        )
        self.stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=self.stage_trace,
            include_debug=self.include_debug,
            stage='finalize_output',
            output={
                'improved_title': _safe_str(self.rewrite.get('improved_title')),
                'improved_content': self.final_improved_content,
                'final_markdown': self.final_markdown,
                'pipeline_status': self.pipeline_status,
                'final_word_count': self.final_word_count,
                'min_expanded_word_target': self.min_expanded_word_target,
                'length_requirement_met': self.length_requirement_met,
                'length_requirement_blocking_reason': self.length_requirement_blocking_reason,
            },
        )
