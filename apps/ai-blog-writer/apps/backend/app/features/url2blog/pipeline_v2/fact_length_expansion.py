"""Fact length expansion steps for URL2Blog pipeline v2."""

import json
import logging
from typing import Any
from fastapi import HTTPException
from ..prompts import (
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    V2_LENGTH_EXPANSION_MARKDOWN_PROMPT,
    V2_LENGTH_EXPANSION_PROMPT,
    V2_TITLE_GENERATION_PROMPT,
)
from ..observability import append_stage_trace
from ..config import _llm_context_text
from ..llm.coerce import _safe_str, _tokenize_similarity_words
from ..content.sanitizers import _sanitize_v2_length_expansion

logger = logging.getLogger(__name__)


class _FactLengthExpansion:

    def _prepare_length_expansion(self) -> None:
        self.rewritten_words = _tokenize_similarity_words(
            self.rewrite['improved_content']
        )
        self.rewritten_word_count = len(self.rewritten_words)
        self.source_facts_for_prompt = (
            json.dumps(self.source_fact_anchors, ensure_ascii=False, indent=2)
            if self.source_fact_anchors
            else 'No source facts extracted.'
        )

    def _expand_to_target_length(self) -> None:
        while (
            self.rewritten_word_count < self.min_expanded_word_target
            and self.length_expansion_passes < self.max_length_expansion_passes
        ):
            self.expansion_prompt = (
                V2_LENGTH_EXPANSION_PROMPT.replace(
                    '{source_title}', self.normalized_title
                )
                .replace('{source_content}', _llm_context_text(self.normalized_content))
                .replace('{rewritten_title}', self.rewrite['improved_title'])
                .replace(
                    '{rewritten_content}',
                    _llm_context_text(self.rewrite['improved_content']),
                )
                .replace('{current_word_count}', str(self.rewritten_word_count))
                .replace('{source_word_count}', str(self.source_word_count))
                .replace('{min_word_target}', str(self.min_expanded_word_target))
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
                .replace('{source_facts}', self.source_facts_for_prompt)
                .replace(
                    '{editorial_blueprint_directives}',
                    self.editorial_blueprint_for_prompt,
                )
            )
            self.expansion_prompt_markdown = (
                V2_LENGTH_EXPANSION_MARKDOWN_PROMPT.replace(
                    '{source_title}', self.normalized_title
                )
                .replace('{source_content}', _llm_context_text(self.normalized_content))
                .replace('{rewritten_title}', self.rewrite['improved_title'])
                .replace(
                    '{rewritten_content}',
                    _llm_context_text(self.rewrite['improved_content']),
                )
                .replace('{current_word_count}', str(self.rewritten_word_count))
                .replace('{source_word_count}', str(self.source_word_count))
                .replace('{min_word_target}', str(self.min_expanded_word_target))
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
                .replace('{source_facts}', self.source_facts_for_prompt)
                .replace(
                    '{editorial_blueprint_directives}',
                    self.editorial_blueprint_for_prompt,
                )
            )
            self.stage_name = (
                f'length_expansion_pass_{self.length_expansion_passes + 1}'
            )
            self.expansion_stage_transport = 'json'
            self.expansion_parsed: dict[str, Any] = {}
            try:
                if self.use_markdown_long_stages:
                    self.expansion_long_output = self.llm.invoke_markdown(
                        prompt=self.expansion_prompt_markdown,
                        stage_name=self.stage_name,
                        model_name=self.selected_model_name,
                        temperature=0.1,
                        max_tokens=6144,
                        fallback_content=self.rewrite['improved_content'],
                        parse_metrics=self.json_parse_metrics,
                        legacy_json_prompt=self.expansion_prompt,
                        legacy_json_stage_name=f'{self.stage_name}_legacy_json',
                        legacy_content_key='expanded_content',
                    )
                    self.length_expansion_raw_response = _safe_str(
                        self.expansion_long_output.get('raw_response')
                    )
                    self.expansion_stage_transport = (
                        _safe_str(self.expansion_long_output.get('transport'))
                        or 'markdown'
                    )
                    if self.expansion_stage_transport == 'json_fallback':
                        self.long_output_transport = 'json_fallback'
                    self.expansion = {
                        'expanded_content': _safe_str(
                            self.expansion_long_output.get('content')
                        ),
                        'expansion_summary': 'Expanded article depth while preserving factual integrity and structure.',
                    }
                else:
                    self.expansion_parsed, self.length_expansion_raw_response = (
                        self.llm.invoke_json_tracked(
                            prompt=self.expansion_prompt,
                            stage_name=self.stage_name,
                            parse_metrics=self.json_parse_metrics,
                            max_tokens=6144,
                            temperature=0.1,
                            model_name=self.selected_model_name,
                        )
                    )
                    self.expansion = _sanitize_v2_length_expansion(
                        self.expansion_parsed,
                        fallback_content=self.rewrite['improved_content'],
                    )
            except HTTPException as exc:
                logger.warning('URL2Blog length expansion failed: %s', exc.detail)
                self.stage_trace = append_stage_trace(
                    stage_trace=self.stage_trace,
                    include_debug=self.include_debug,
                    stage=self.stage_name,
                    model_name=self.selected_model_name,
                    max_tokens=6144,
                    temperature=0.1,
                    input_payload={
                        'source_title': self.normalized_title,
                        'source_content': _llm_context_text(self.normalized_content),
                        'rewritten_title': self.rewrite['improved_title'],
                        'rewritten_content': _llm_context_text(
                            self.rewrite['improved_content']
                        ),
                        'current_word_count': self.rewritten_word_count,
                        'source_word_count': self.source_word_count,
                        'min_word_target': self.min_expanded_word_target,
                        'article_type': self.classification,
                        'guideline': self.guideline_payload.get('guideline')
                        or 'No guideline provided.',
                        'title_guideline': self.guideline_payload.get('title_guideline')
                        or 'No title guideline provided.',
                        'narrative_focus': self.narrative_focus,
                        'external_context': self.external_context_points,
                        'source_facts': self.source_fact_anchors,
                    },
                    prompt=(
                        self.expansion_prompt_markdown
                        if self.use_markdown_long_stages
                        else self.expansion_prompt
                    ),
                    error=_safe_str(exc.detail),
                )
                break
            self.expanded_content = self.expansion['expanded_content']
            self.expanded_words = _tokenize_similarity_words(self.expanded_content)
            self.expanded_word_count = len(self.expanded_words)
            self.stage_trace = append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage=self.stage_name,
                model_name=self.selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                input_payload={
                    'source_title': self.normalized_title,
                    'source_content': _llm_context_text(self.normalized_content),
                    'rewritten_title': self.rewrite['improved_title'],
                    'rewritten_content': _llm_context_text(
                        self.rewrite['improved_content']
                    ),
                    'current_word_count': self.rewritten_word_count,
                    'source_word_count': self.source_word_count,
                    'min_word_target': self.min_expanded_word_target,
                    'article_type': self.classification,
                    'guideline': self.guideline_payload.get('guideline')
                    or 'No guideline provided.',
                    'title_guideline': self.guideline_payload.get('title_guideline')
                    or 'No title guideline provided.',
                    'narrative_focus': self.narrative_focus,
                    'external_context': self.external_context_points,
                    'source_facts': self.source_fact_anchors,
                    'transport': self.expansion_stage_transport,
                },
                prompt=(
                    self.expansion_prompt_markdown
                    if self.use_markdown_long_stages
                    else self.expansion_prompt
                ),
                raw_response=self.length_expansion_raw_response,
                parsed=(
                    self.expansion_parsed if not self.use_markdown_long_stages else None
                ),
                output={
                    'expansion_summary': self.expansion['expansion_summary'],
                    'expanded_word_count': self.expanded_word_count,
                    'transport': self.expansion_stage_transport,
                },
            )
            if self.expanded_word_count <= self.rewritten_word_count:
                break
            self.rewrite['improved_content'] = self.expanded_content
            if self.use_markdown_long_stages:
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
                        self.narrative_focus
                        or 'No additional narrative focus provided.',
                    )
                    .replace('{source_title}', self.normalized_title)
                    .replace(
                        '{rewritten_content}', _llm_context_text(self.expanded_content)
                    )
                )
                self.generated_title, self._ = self.llm.invoke_title(
                    prompt=self.title_prompt,
                    model_name=self.selected_model_name,
                    fallback_title=_safe_str(self.rewrite.get('improved_title'))
                    or self.normalized_title,
                )
                self.rewrite['improved_title'] = self.generated_title
                self.title_pass_applied_count += 1
            self.rewritten_words = self.expanded_words
            self.rewritten_word_count = self.expanded_word_count
            self.length_expansion_summary = self.expansion['expansion_summary']
            self.length_expansion_passes += 1
            self.length_expansion_applied = True
