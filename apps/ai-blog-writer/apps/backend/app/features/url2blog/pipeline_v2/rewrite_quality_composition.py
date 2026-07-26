"""Rewrite quality composition steps for URL2Blog pipeline v2."""

import json
from typing import Any
from ..prompts import (
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    V2_QUALITY_AUDIT_PROMPT,
    V2_TITLE_GENERATION_PROMPT,
)
from ..routes import (
    _build_v2_rewrite_from_markdown,
    _invoke_markdown_long_output,
    _invoke_title_generation,
    _pipeline_v2_append_stage_trace,
)
from ..config import _llm_context_text
from ..llm.coerce import _ngram_overlap_ratio, _safe_str, _tokenize_similarity_words
from ..content.sanitizers import (
    _sanitize_v2_guideline_rewrite,
    _sanitize_v2_quality_audit,
)
from .. import routes


class _RewriteQualityComposition:

    def _run_initial_rewrite(self) -> None:
        self.rewrite_temperature = 0.1 if self.rewrite_retry_count == 0 else 0.2
        self.rewrite_stage_transport = 'json'
        self.rewrite_title_raw_response = ''
        self.rewrite_parsed: dict[str, Any] = {}
        if self.use_markdown_long_stages:
            self.rewrite_long_output = _invoke_markdown_long_output(
                prompt=self.rewrite_prompt_markdown,
                stage_name='guideline_rewrite_initial',
                model_name=self.writing_model,
                temperature=self.rewrite_temperature,
                max_tokens=6144,
                fallback_content=self.normalized_content,
                parse_metrics=self.json_parse_metrics,
                legacy_json_prompt=self.rewrite_prompt,
                legacy_json_stage_name='guideline_rewrite_initial_legacy_json',
                legacy_content_key='improved_content',
                legacy_title_key='improved_title',
            )
            self.rewrite_raw_response = _safe_str(
                self.rewrite_long_output.get('raw_response')
            )
            self.rewrite_stage_transport = (
                _safe_str(self.rewrite_long_output.get('transport')) or 'markdown'
            )
            if self.rewrite_stage_transport == 'json_fallback':
                self.long_output_transport = 'json_fallback'
            self.rewrite_fallback_title = (
                _safe_str(self.rewrite_long_output.get('fallback_title'))
                or self.normalized_title
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
                        _safe_str(self.rewrite_long_output.get('content'))
                    ),
                )
            )
            self.generated_title, self.rewrite_title_raw_response = (
                _invoke_title_generation(
                    prompt=self.title_prompt,
                    model_name=self.selected_model_name,
                    fallback_title=self.rewrite_fallback_title,
                )
            )
            self.title_pass_applied_count += 1
            self.rewrite = _build_v2_rewrite_from_markdown(
                improved_title=self.generated_title,
                improved_content=_safe_str(self.rewrite_long_output.get('content')),
            )
        else:
            self.rewrite_parsed, self.rewrite_raw_response = (
                routes._invoke_json_llm_tracked(
                    prompt=self.rewrite_prompt,
                    stage_name='guideline_rewrite_initial',
                    parse_metrics=self.json_parse_metrics,
                    max_tokens=6144,
                    temperature=self.rewrite_temperature,
                    model_name=self.writing_model,
                )
            )
            self.rewrite = _sanitize_v2_guideline_rewrite(
                self.rewrite_parsed,
                fallback_title=self.normalized_title,
                fallback_content=self.normalized_content,
            )

    def _audit_initial_quality(self) -> None:
        self.stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=self.stage_trace,
            include_debug=self.include_debug,
            stage='guideline_rewrite_initial',
            model_name=self.writing_model,
            max_tokens=6144,
            temperature=self.rewrite_temperature,
            input_payload={
                'title': self.normalized_title,
                'content': _llm_context_text(self.normalized_content),
                'article_type': self.classification,
                'guideline': self.guideline_payload.get('guideline')
                or 'No guideline provided.',
                'title_guideline': self.guideline_payload.get('title_guideline')
                or 'No title guideline provided.',
                'narrative_focus': self.narrative_focus,
                'external_context': self.external_context_points,
                'rewrite_retry_count': self.rewrite_retry_count,
                'rewrite_retry_feedback': self.rewrite_retry_feedback,
                'transport': self.rewrite_stage_transport,
                'use_markdown_long_stages': self.use_markdown_long_stages,
            },
            prompt=(
                self.rewrite_prompt_markdown
                if self.use_markdown_long_stages
                else self.rewrite_prompt
            ),
            raw_response=self.rewrite_raw_response,
            parsed=self.rewrite_parsed if not self.use_markdown_long_stages else None,
            output={
                **self.rewrite,
                'transport': self.rewrite_stage_transport,
                'title_raw_response': self.rewrite_title_raw_response,
            },
        )
        self.source_words = _tokenize_similarity_words(self.normalized_content)
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
            routes._invoke_json_llm_tracked(
                prompt=self.quality_prompt,
                stage_name='quality_audit_initial',
                parse_metrics=self.json_parse_metrics,
                max_tokens=1024,
                temperature=0.05,
                model_name=self.selected_model_name,
            )
        )
        self.quality = _sanitize_v2_quality_audit(self.quality_parsed)
        self.stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=self.stage_trace,
            include_debug=self.include_debug,
            stage='quality_audit_initial',
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
        self.second_pass_applied = False
        self.repair_raw_response = ''
