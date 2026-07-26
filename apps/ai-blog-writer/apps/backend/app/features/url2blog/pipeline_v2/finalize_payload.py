"""Finalize payload steps for URL2Blog pipeline v2."""

from typing import Any
from ..config import DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS
from ..llm.invocation import _build_excerpt
from ..llm.coerce import _safe_bool, _safe_dict, _safe_int, _safe_str


class _FinalizePayload:

    def _build_response_payload(self) -> None:
        self.response_payload: dict[str, Any] = {
            'message': 'URL2Blog simple pipeline completed',
            'run_id': self.run_id,
            'pipeline_status': self.pipeline_status,
            'article': {
                'source_url': self.url,
                'original_title': self.normalized_title,
                'original_excerpt': _build_excerpt(self.normalized_content),
                'language': self.normalized_language,
                'original_language': _safe_str(self.parsed_article.get('language')),
                'translated': self.was_translated,
            },
            'selected_article_type': {
                'id': self.classification.get('id'),
                'name': _safe_str(self.classification.get('name')),
                'confidence': self.classification.get('confidence'),
                'reasoning': _safe_str(self.classification.get('reasoning')),
            },
            'guideline_meta': {
                'id': self.guideline_payload.get('id'),
                'name': self.guideline_payload.get('name'),
            },
            'improved_article': {
                'title': _safe_str(self.rewrite.get('improved_title')),
                'content': self.final_improved_content,
            },
            'final_markdown': self.final_markdown,
            'guideline_review': {
                'alignment_summary': _safe_str(
                    self.rewrite.get('guideline_alignment_summary')
                ),
                'improvements_applied': list(
                    self.rewrite.get('improvements_applied') or []
                ),
                'remaining_gaps': list(self.rewrite.get('remaining_gaps') or []),
                'narrative_focus_applied': self.narrative_focus,
                'narrative_focus_source': _safe_str(
                    self.context.get('narrative_focus_source')
                )
                or ('user' if self.narrative_focus else 'default'),
                'narrative_focus_label': _safe_str(
                    _safe_dict(self.context.get('narrative_focus_selection')).get(
                        'label'
                    )
                ),
                'tone_profile': _safe_str(
                    _safe_dict(self.context.get('tone_profile')).get('label')
                ),
                'model_used': self.selected_model_name,
                'execution_profile': self.execution_profile,
                'source_word_count': self.source_word_count,
                'final_word_count': self.final_word_count,
                'min_expanded_word_target': self.min_expanded_word_target,
                'length_requirement_met': self.length_requirement_met,
                'length_requirement_blocking_reason': self.length_requirement_blocking_reason,
                'length_expansion_applied': self.length_expansion_applied,
                'length_expansion_passes': self.length_expansion_passes,
                'length_expansion_summary': self.length_expansion_summary,
                'short_article_enrichment_applied': self.short_article_enrichment_applied,
                'external_context_points_used': len(self.external_context_points),
                'external_context_usage_note': self.external_context_usage_note,
                'source_facts_extracted_count': len(self.source_fact_anchors),
                'factual_coverage_summary': _safe_str(
                    self.fact_coverage.get('coverage_summary')
                ),
                'factual_coverage_score': self.fact_coverage.get('coverage_score'),
                'missing_source_facts_count': self.fact_coverage.get('missing_count'),
                'missing_high_priority_facts_count': self.fact_coverage.get(
                    'missing_high_count'
                ),
                'fact_coverage_warning': _safe_dict(
                    self.context.get('fact_coverage_warning')
                )
                or None,
                'fact_repair_applied': self.fact_repair_applied,
                'quality_summary': _safe_str(self.quality.get('quality_summary')),
                'editorial_blueprint_applied': self.editorial_blueprint_applied,
                'editorial_blueprint_components_planned': [
                    _safe_str(item.get('component'))
                    for item in list(self.editorial_blueprint.get('components') or [])
                    if isinstance(item, dict)
                ],
                'editorial_insert_only_post_applied': self.editorial_insert_only_post_applied,
                'editorial_augmentation_applied': _safe_bool(
                    self.editorial_augmentation.get('augmentation_applied'),
                    default=False,
                ),
                'editorial_components_added': [
                    item.get('component')
                    for item in list(
                        self.editorial_augmentation.get('components_added') or []
                    )
                    if isinstance(item, dict)
                ],
                'editorial_augmentation_summary': _safe_str(
                    self.editorial_augmentation.get('augmentation_summary')
                ),
                'editorial_diagnostic': _safe_dict(
                    self.editorial_augmentation.get('diagnostic')
                ),
                'quality_scores': {
                    'overall': self.quality.get('overall_score'),
                    'guideline_coverage': self.quality.get('guideline_coverage_score'),
                    'informativeness': self.quality.get('informativeness_score'),
                    'originality': self.quality.get('originality_score'),
                },
                'second_pass_applied': self.second_pass_applied,
                'long_output_transport': self.long_output_transport,
                'title_pass_applied_count': self.title_pass_applied_count,
                'similarity_ngram_overlap': round(self.ngram_overlap, 3),
                'json_parse_failures_total': _safe_int(
                    self.json_parse_metrics.get('total_parse_failures'),
                    default=0,
                    min_value=0,
                    max_value=9999,
                ),
                'json_parse_recovered_calls': _safe_int(
                    self.json_parse_metrics.get('recovered_calls'),
                    default=0,
                    min_value=0,
                    max_value=9999,
                ),
                'json_parse_recovered_failures': _safe_int(
                    self.json_parse_metrics.get('recovered_parse_failures'),
                    default=0,
                    min_value=0,
                    max_value=9999,
                ),
                'json_parse_failures_by_stage': _safe_dict(
                    self.json_parse_metrics.get('failures_by_stage')
                ),
                'rewrite_quality_gate_decision': _safe_str(
                    self.rewrite_quality_gate.get('decision')
                )
                or 'pass',
                'rewrite_quality_gate_pass_mode': _safe_str(
                    self.rewrite_quality_gate.get('pass_mode')
                )
                or 'strict',
                'fact_gate_decision': _safe_str(self.fact_gate.get('decision'))
                or 'pass',
                'fact_gate_pass_mode': _safe_str(self.fact_gate.get('pass_mode'))
                or 'strict',
                'editorial_gate_decision': _safe_str(
                    self.editorial_gate.get('decision')
                )
                or 'pass',
                'editorial_post_recheck_decision': _safe_str(
                    self.editorial_post_recheck.get('decision')
                )
                or 'skipped',
                'editorial_post_recheck_pass_mode': _safe_str(
                    self.editorial_post_recheck.get('pass_mode')
                )
                or 'skipped',
                'editorial_post_recheck_quality_score': self.editorial_post_recheck.get(
                    'quality_score'
                ),
                'editorial_post_recheck_fact_coverage_score': self.editorial_post_recheck.get(
                    'fact_coverage_score'
                ),
            },
        }

    def _attach_optional_debug(self) -> None:
        self.translation_error = _safe_str(self.stage1_payload.get('translation_error'))
        if self.translation_error:
            self.response_payload['article'][
                'translation_error'
            ] = self.translation_error
        if self.include_debug:
            self.response_payload['debug'] = {
                'pipeline_input': {
                    'url': self.url,
                    'include_debug': self.include_debug,
                    'narrative_focus': self.narrative_focus,
                    'execution_profile': self.execution_profile,
                    'enable_web_enrichment': _safe_bool(
                        self.context.get('enable_web_enrichment'), default=False
                    ),
                    'enable_editorial_augmentation': _safe_bool(
                        self.context.get('enable_editorial_augmentation'), default=False
                    ),
                    'max_external_context_items': _safe_int(
                        self.context.get('max_external_context_items'),
                        default=DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
                        min_value=1,
                        max_value=5,
                    ),
                    'model_name': self.selected_model_name,
                    'use_markdown_long_stages': self.use_markdown_long_stages,
                    'long_output_transport': self.long_output_transport,
                    'use_editorial_blueprint': self.use_editorial_blueprint,
                    'use_editorial_insert_only_post': self.use_editorial_insert_only_post,
                    'use_editorial_post_recheck': self.use_editorial_post_recheck,
                },
                'guideline': self.guideline_payload,
                'article_original_content': self.normalized_content,
                'stage1': self.stage1_payload,
                'stage2': self.stage2_payload,
                'pipeline_trace': self.stage_trace,
                'rewrite_raw_response': self.rewrite_raw_response,
                'repair_raw_response': self.repair_raw_response,
                'quality_raw_response': self.quality_raw_response,
                'quality_required_revisions': list(
                    self.quality.get('required_revisions') or []
                ),
                'narrative_focus': self.narrative_focus,
                'model_name': self.selected_model_name,
                'external_context_points': self.external_context_points,
                'external_context_usage_note': self.external_context_usage_note,
                'external_context_raw_response': self.external_context_raw_response,
                'external_context_grounded_urls': self.external_context_grounded_urls,
                'source_fact_anchors': self.source_fact_anchors,
                'source_facts_raw_response': self.source_facts_raw_response,
                'fact_coverage_raw_response': self.fact_coverage_raw_response,
                'fact_coverage_missing_facts': list(
                    self.fact_coverage.get('missing_facts') or []
                ),
                'fact_repair_raw_response': self.fact_repair_raw_response,
                'length_expansion_raw_response': self.length_expansion_raw_response,
                'editorial_blueprint_raw_response': self.editorial_blueprint_raw_response,
                'editorial_blueprint': self.editorial_blueprint,
                'editorial_augmentation_raw_response': self.editorial_augmentation_raw_response,
                'editorial_components_added': list(
                    self.editorial_augmentation.get('components_added') or []
                ),
                'editorial_diagnostic': _safe_dict(
                    self.editorial_augmentation.get('diagnostic')
                ),
                'editorial_post_quality_raw_response': self.editorial_post_quality_raw_response,
                'editorial_post_fact_coverage_raw_response': self.editorial_post_fact_coverage_raw_response,
                'editorial_post_recheck': self.editorial_post_recheck,
                'json_parse_metrics': self.json_parse_metrics,
                'title_pass_applied_count': self.title_pass_applied_count,
                'long_output_transport': self.long_output_transport,
                'graph_gates': {
                    'rewrite_quality_gate': self.rewrite_quality_gate,
                    'fact_gate': self.fact_gate,
                    'editorial_gate': self.editorial_gate,
                    'editorial_post_recheck': self.editorial_post_recheck,
                },
            }

    def _persist_artifact_and_status(self) -> None:
        self.recorder.record_stage(self.run_id, 'pipeline_v2', self.response_payload)
        self.recorder.record_artifact(
            self.run_id,
            {
                'markdown': self.final_markdown,
                'pipeline_v2': self.response_payload,
                'stages': {
                    'stage_1': self.stage1_payload,
                    'stage_2': self.stage2_payload,
                },
            },
        )
        self.recorder.mark_completed(self.run_id)
