"""Rewrite quality repair steps for URL2Blog pipeline v2."""

import json
from typing import Any
from ..prompts import (
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    V2_QUALITY_AUDIT_PROMPT,
    V2_REWRITE_REPAIR_MARKDOWN_PROMPT,
    V2_REWRITE_REPAIR_PROMPT,
    V2_TITLE_GENERATION_PROMPT,
)
from ..llm.invocation import _build_v2_rewrite_from_markdown
from ..observability import append_stage_trace
from ..config import _llm_context_text
from ..llm.coerce import _ngram_overlap_ratio, _safe_str, _tokenize_similarity_words
from ..content.sanitizers import (
    _sanitize_v2_guideline_rewrite,
    _sanitize_v2_quality_audit,
)
from .gating import _should_force_v2_second_pass


class _RewriteQualityRepair:

    def _run_second_pass_if_needed(self) -> None:
        if not self.is_lean_profile and _should_force_v2_second_pass(
            self.quality, self.ngram_overlap
        ):
            self._prepare_second_pass_rewrite()
            self._audit_second_pass_rewrite()
        else:
            self.stage_trace = append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='rewrite_repair_second_pass',
                model_name=self.selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                output={
                    'skipped': True,
                    'reason': 'Initial quality/originality checks passed.',
                },
            )

    def _prepare_second_pass_rewrite(self) -> None:
        self.second_pass_applied = True
        self.previous_title = self.rewrite['improved_title']
        self.previous_content = self.rewrite['improved_content']
        self.repair_prompt = (
            V2_REWRITE_REPAIR_PROMPT.replace('{source_title}', self.normalized_title)
            .replace('{source_content}', _llm_context_text(self.normalized_content))
            .replace('{previous_title}', self.previous_title)
            .replace('{previous_content}', _llm_context_text(self.previous_content))
            .replace(
                '{required_revisions}',
                json.dumps(
                    self.quality['required_revisions'], ensure_ascii=False, indent=2
                ),
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
            .replace(
                '{narrative_focus}',
                self.narrative_focus or 'No additional narrative focus provided.',
            )
            .replace('{external_context}', self.external_context_for_prompt)
            .replace(
                '{editorial_blueprint_directives}', self.editorial_blueprint_for_prompt
            )
        )
        self.repair_prompt_markdown = (
            V2_REWRITE_REPAIR_MARKDOWN_PROMPT.replace(
                '{source_title}', self.normalized_title
            )
            .replace('{source_content}', _llm_context_text(self.normalized_content))
            .replace('{previous_title}', self.previous_title)
            .replace('{previous_content}', _llm_context_text(self.previous_content))
            .replace(
                '{required_revisions}',
                json.dumps(
                    self.quality['required_revisions'], ensure_ascii=False, indent=2
                ),
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
            .replace(
                '{narrative_focus}',
                self.narrative_focus or 'No additional narrative focus provided.',
            )
            .replace('{external_context}', self.external_context_for_prompt)
            .replace(
                '{editorial_blueprint_directives}', self.editorial_blueprint_for_prompt
            )
        )
        self.repair_stage_transport = 'json'
        self.repair_title_raw_response = ''
        self.repair_parsed: dict[str, Any] = {}
        if self.use_markdown_long_stages:
            self.repair_long_output = self.llm.invoke_markdown(
                prompt=self.repair_prompt_markdown,
                stage_name='rewrite_repair_second_pass',
                model_name=self.selected_model_name,
                temperature=0.1,
                max_tokens=6144,
                fallback_content=self.previous_content,
                parse_metrics=self.json_parse_metrics,
                legacy_json_prompt=self.repair_prompt,
                legacy_json_stage_name='rewrite_repair_second_pass_legacy_json',
                legacy_content_key='improved_content',
                legacy_title_key='improved_title',
            )
            self.repair_raw_response = _safe_str(
                self.repair_long_output.get('raw_response')
            )
            self.repair_stage_transport = (
                _safe_str(self.repair_long_output.get('transport')) or 'markdown'
            )
            if self.repair_stage_transport == 'json_fallback':
                self.long_output_transport = 'json_fallback'
            self.repair_fallback_title = (
                _safe_str(self.repair_long_output.get('fallback_title'))
                or self.previous_title
            )
            self.title_prompt = (
                V2_TITLE_GENERATION_PROMPT.replace(
                    '{article_type}',
                    json.dumps(self.classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    '{title_guideline}',
                    self.guideline_payload.get('title_guideline')
                    or 'No title guideline provided.',
                )
                .replace(
                    '{narrative_focus}',
                    self.narrative_focus or 'No additional narrative focus provided.',
                )
                .replace('{source_title}', self.normalized_title)
                .replace(
                    '{rewritten_content}',
                    _llm_context_text(
                        _safe_str(self.repair_long_output.get('content'))
                    ),
                )
            )
            self.generated_title, self.repair_title_raw_response = (
                self.llm.invoke_title(
                    prompt=self.title_prompt,
                    model_name=self.selected_model_name,
                    fallback_title=self.repair_fallback_title,
                )
            )
            self.title_pass_applied_count += 1
            self.rewrite = _build_v2_rewrite_from_markdown(
                improved_title=self.generated_title,
                improved_content=_safe_str(self.repair_long_output.get('content')),
                previous_rewrite=self.rewrite,
                guideline_alignment_summary='Second-pass hard rewrite improved structure, originality, and guideline alignment.',
                improvements_applied=[
                    'Applied required revisions from the failed quality audit.',
                    'Restructured sections for stronger originality and flow.',
                ],
                remaining_gaps=[],
            )
        else:
            self.repair_parsed, self.repair_raw_response = (
                self.llm.invoke_json_tracked(
                    prompt=self.repair_prompt,
                    stage_name='rewrite_repair_second_pass',
                    parse_metrics=self.json_parse_metrics,
                    max_tokens=6144,
                    temperature=0.1,
                    model_name=self.selected_model_name,
                )
            )
            self.rewrite = _sanitize_v2_guideline_rewrite(
                self.repair_parsed,
                fallback_title=self.previous_title,
                fallback_content=self.previous_content,
            )

    def _audit_second_pass_rewrite(self) -> None:
        self.stage_trace = append_stage_trace(
            stage_trace=self.stage_trace,
            include_debug=self.include_debug,
            stage='rewrite_repair_second_pass',
            model_name=self.selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            input_payload={
                'source_title': self.normalized_title,
                'source_content': _llm_context_text(self.normalized_content),
                'previous_title': self.previous_title,
                'previous_content': _llm_context_text(self.previous_content),
                'required_revisions': self.quality['required_revisions'],
                'article_type': self.classification,
                'guideline': self.guideline_payload.get('guideline')
                or 'No guideline provided.',
                'title_guideline': self.guideline_payload.get('title_guideline')
                or 'No title guideline provided.',
                'narrative_focus': self.narrative_focus,
                'external_context': self.external_context_points,
                'transport': self.repair_stage_transport,
            },
            prompt=(
                self.repair_prompt_markdown
                if self.use_markdown_long_stages
                else self.repair_prompt
            ),
            raw_response=self.repair_raw_response,
            parsed=self.repair_parsed if not self.use_markdown_long_stages else None,
            output={
                **self.rewrite,
                'transport': self.repair_stage_transport,
                'title_raw_response': self.repair_title_raw_response,
            },
        )
        self.rewritten_words = _tokenize_similarity_words(
            self.rewrite['improved_content']
        )
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
                stage_name='quality_audit_after_second_pass',
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
            stage='quality_audit_after_second_pass',
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
