"""Fact length audit steps for URL2Blog pipeline v2."""

import json
from ..prompts import (
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    V2_FACT_COVERAGE_AUDIT_PROMPT,
    V2_QUALITY_AUDIT_PROMPT,
)
from ..config import _llm_context_text
from ..llm.coerce import _ngram_overlap_ratio
from ..observability import append_stage_trace
from ..content.sanitizers import _sanitize_v2_fact_coverage, _sanitize_v2_quality_audit


class _FactLengthAudit:

    def _audit_final_length(self) -> None:
        if self.length_expansion_applied:
            self.ngram_overlap = _ngram_overlap_ratio(
                self.source_words, self.rewritten_words, n=10
            )
            self.quality_prompt = (
                V2_QUALITY_AUDIT_PROMPT.replace('{source_title}', self.normalized_title)
                .replace('{source_content}', _llm_context_text(self.normalized_content))
                .replace('{rewritten_title}', self.rewrite['improved_title'])
                .replace(
                    '{rewritten_content}',
                    _llm_context_text(self.rewrite['improved_content']),
                )
                .replace(
                    '{article_type}',
                    json.dumps(self.classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    '{guideline}',
                    self.guideline_payload.get('guideline') or 'No guideline provided.',
                )
                .replace(
                    '{title_guideline}',
                    self.guideline_payload.get('title_guideline')
                    or 'No title guideline provided.',
                )
                .replace('{seo_guideline}', SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
                .replace('{ngram_overlap}', f'{self.ngram_overlap:.3f}')
                .replace(
                    '{narrative_focus}',
                    self.narrative_focus or 'No additional narrative focus provided.',
                )
                .replace('{external_context}', self.external_context_for_prompt)
            )
            self.quality_parsed, self.quality_raw_response = (
                self.llm.invoke_json_tracked(
                    prompt=self.quality_prompt,
                    stage_name='quality_audit_after_length_expansion',
                    parse_metrics=self.json_parse_metrics,
                    max_tokens=1024,
                    temperature=0.05,
                    model_name=self.selected_model_name,
                )
            )
            self.quality = _sanitize_v2_quality_audit(self.quality_parsed)
            self.stage_trace = append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='quality_audit_after_length_expansion',
                model_name=self.selected_model_name,
                max_tokens=1024,
                temperature=0.05,
                input_payload={
                    'source_title': self.normalized_title,
                    'source_content': _llm_context_text(self.normalized_content),
                    'rewritten_title': self.rewrite['improved_title'],
                    'rewritten_content': _llm_context_text(
                        self.rewrite['improved_content']
                    ),
                    'article_type': self.classification,
                    'guideline': self.guideline_payload.get('guideline')
                    or 'No guideline provided.',
                    'title_guideline': self.guideline_payload.get('title_guideline')
                    or 'No title guideline provided.',
                    'ngram_overlap': round(self.ngram_overlap, 3),
                    'narrative_focus': self.narrative_focus,
                    'external_context': self.external_context_points,
                },
                prompt=self.quality_prompt,
                raw_response=self.quality_raw_response,
                parsed=self.quality_parsed,
                output=self.quality,
            )
            if self.source_fact_anchors:
                self.fact_coverage_prompt = (
                    V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                        '{source_facts}',
                        json.dumps(
                            self.source_fact_anchors, ensure_ascii=False, indent=2
                        ),
                    )
                    .replace('{rewritten_title}', self.rewrite['improved_title'])
                    .replace(
                        '{rewritten_content}',
                        _llm_context_text(self.rewrite['improved_content']),
                    )
                )
                self.fact_coverage_parsed, self.fact_coverage_raw_response = (
                    self.llm.invoke_json_tracked(
                        prompt=self.fact_coverage_prompt,
                        stage_name='fact_coverage_audit_after_length_expansion',
                        parse_metrics=self.json_parse_metrics,
                        max_tokens=1536,
                        temperature=0.05,
                        model_name=self.selected_model_name,
                    )
                )
                self.fact_coverage = _sanitize_v2_fact_coverage(
                    self.fact_coverage_parsed, self.source_fact_anchors
                )
                self.stage_trace = append_stage_trace(
                    stage_trace=self.stage_trace,
                    include_debug=self.include_debug,
                    stage='fact_coverage_audit_after_length_expansion',
                    model_name=self.selected_model_name,
                    max_tokens=1536,
                    temperature=0.05,
                    input_payload={
                        'source_facts': self.source_fact_anchors,
                        'rewritten_title': self.rewrite['improved_title'],
                        'rewritten_content': _llm_context_text(
                            self.rewrite['improved_content']
                        ),
                    },
                    prompt=self.fact_coverage_prompt,
                    raw_response=self.fact_coverage_raw_response,
                    parsed=self.fact_coverage_parsed,
                    output=self.fact_coverage,
                )
        else:
            self.stage_trace = append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='length_expansion',
                model_name=self.selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                output={
                    'skipped': True,
                    'reason': 'Length target already met or expansion produced no growth.',
                    'current_word_count': self.rewritten_word_count,
                    'min_word_target': self.min_expanded_word_target,
                },
            )

    def _persist_result(self) -> None:
        self.recorder.record_stage(
            self.run_id,
            'fact_length',
            {
                'factual_coverage_score': self.fact_coverage['coverage_score'],
                'coverage_summary': self.fact_coverage['coverage_summary'],
                'missing_source_facts_count': self.fact_coverage['missing_count'],
                'missing_high_priority_facts_count': self.fact_coverage[
                    'missing_high_count'
                ],
                'missing_facts': self.fact_coverage['missing_facts'],
                'covered_fact_ids': self.fact_coverage['covered_fact_ids'],
                'source_fact_anchors': self.source_fact_anchors,
                'fact_repair_applied': self.fact_repair_applied,
                'length_expansion_applied': self.length_expansion_applied,
                'length_expansion_passes': self.length_expansion_passes,
                'length_expansion_summary': self.length_expansion_summary,
                'long_output_transport': self.long_output_transport,
                'title_pass_applied_count': self.title_pass_applied_count,
            },
        )
        self.context.update(
            {
                'json_parse_metrics': self.json_parse_metrics,
                'stage_trace': self.stage_trace,
                'rewrite': self.rewrite,
                'quality': self.quality,
                'quality_raw_response': self.quality_raw_response,
                'rewritten_words': self.rewritten_words,
                'ngram_overlap': self.ngram_overlap,
                'fact_coverage': self.fact_coverage,
                'fact_coverage_raw_response': self.fact_coverage_raw_response,
                'fact_repair_applied': self.fact_repair_applied,
                'fact_repair_raw_response': self.fact_repair_raw_response,
                'length_expansion_applied': self.length_expansion_applied,
                'length_expansion_passes': self.length_expansion_passes,
                'length_expansion_summary': self.length_expansion_summary,
                'length_expansion_raw_response': self.length_expansion_raw_response,
                'long_output_transport': self.long_output_transport,
                'title_pass_applied_count': self.title_pass_applied_count,
                'use_markdown_long_stages': self.use_markdown_long_stages,
                'editorial_blueprint': self.editorial_blueprint,
                'editorial_blueprint_for_prompt': self.editorial_blueprint_for_prompt,
            }
        )
