"""Rewrite quality blueprint steps for URL2Blog pipeline v2."""

import json
from ..config import _llm_context_text
from ..prompts import (
    SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
    V2_EDITORIAL_BLUEPRINT_PROMPT,
    V2_GUIDELINE_REWRITE_MARKDOWN_PROMPT,
    V2_GUIDELINE_REWRITE_PROMPT,
)
from .gating import _build_v2_rewrite_retry_feedback
from ..content.editorial_blocks import _format_editorial_blueprint_for_prompt
from ..observability import append_stage_trace
from ..llm.coerce import _safe_bool, _safe_str
from ..content.sanitizers import _sanitize_v2_editorial_blueprint


class _RewriteQualityBlueprint:

    def _prepare_editorial_blueprint(self) -> None:
        if self.should_generate_editorial_blueprint:
            if not self.editorial_blueprint:
                self.editorial_blueprint_prompt = (
                    V2_EDITORIAL_BLUEPRINT_PROMPT.replace(
                        '{source_title}', self.normalized_title
                    )
                    .replace(
                        '{source_content}', _llm_context_text(self.normalized_content)
                    )
                    .replace(
                        '{article_type}',
                        json.dumps(self.classification, ensure_ascii=False, indent=2),
                    )
                    .replace(
                        '{guideline}',
                        self.guideline_payload.get('guideline')
                        or 'No guideline provided.',
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
                    .replace(
                        '{source_facts}',
                        (
                            json.dumps(
                                self.source_fact_anchors, ensure_ascii=False, indent=2
                            )
                            if self.source_fact_anchors
                            else 'No source facts extracted.'
                        ),
                    )
                )
                (
                    self.editorial_blueprint_parsed,
                    self.editorial_blueprint_raw_response,
                ) = self.llm.invoke_json_tracked(
                    prompt=self.editorial_blueprint_prompt,
                    stage_name='editorial_blueprint',
                    parse_metrics=self.json_parse_metrics,
                    max_tokens=1536,
                    temperature=0.05,
                    model_name=self.selected_model_name,
                )
                self.editorial_blueprint = _sanitize_v2_editorial_blueprint(
                    self.editorial_blueprint_parsed
                )
                self.editorial_blueprint_applied = _safe_bool(
                    self.editorial_blueprint.get('apply_plan'), default=False
                ) and bool(list(self.editorial_blueprint.get('components') or []))
                self.stage_trace = append_stage_trace(
                    stage_trace=self.stage_trace,
                    include_debug=self.include_debug,
                    stage='editorial_blueprint',
                    model_name=self.selected_model_name,
                    max_tokens=1536,
                    temperature=0.05,
                    input_payload={
                        'source_title': self.normalized_title,
                        'source_content': _llm_context_text(self.normalized_content),
                        'article_type': self.classification,
                        'guideline': self.guideline_payload.get('guideline')
                        or 'No guideline provided.',
                        'title_guideline': self.guideline_payload.get('title_guideline')
                        or 'No title guideline provided.',
                        'narrative_focus': self.narrative_focus,
                        'source_facts': self.source_fact_anchors,
                    },
                    prompt=self.editorial_blueprint_prompt,
                    raw_response=self.editorial_blueprint_raw_response,
                    parsed=self.editorial_blueprint_parsed,
                    output=self.editorial_blueprint,
                )
                self.recorder.record_stage(
                    self.run_id,
                    'editorial_blueprint',
                    self.editorial_blueprint,
                )
            else:
                self.editorial_blueprint = _sanitize_v2_editorial_blueprint(
                    self.editorial_blueprint
                )
                self.editorial_blueprint_applied = _safe_bool(
                    self.editorial_blueprint.get('apply_plan'), default=False
                ) and bool(list(self.editorial_blueprint.get('components') or []))
                self.stage_trace = append_stage_trace(
                    stage_trace=self.stage_trace,
                    include_debug=self.include_debug,
                    stage='editorial_blueprint',
                    model_name=self.selected_model_name,
                    max_tokens=1536,
                    temperature=0.05,
                    output={
                        'reused_from_context': True,
                        'editorial_blueprint_applied': self.editorial_blueprint_applied,
                        'components_planned': [
                            _safe_str(item.get('component'))
                            for item in list(
                                self.editorial_blueprint.get('components') or []
                            )
                            if isinstance(item, dict)
                        ],
                    },
                )
            self.recorder.mark_running(self.run_id, 'rewrite_quality')
        else:
            self.editorial_blueprint = _sanitize_v2_editorial_blueprint(
                self.editorial_blueprint
            )
            self.editorial_blueprint_applied = False
            self.stage_trace = append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='editorial_blueprint',
                model_name=self.selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                output={
                    'skipped': True,
                    'reason': 'Editorial blueprint disabled for this run.',
                },
            )

    def _build_rewrite_prompts(self) -> None:
        self.editorial_blueprint_for_prompt = _format_editorial_blueprint_for_prompt(
            self.editorial_blueprint
        )
        self.rewrite_prompt = (
            V2_GUIDELINE_REWRITE_PROMPT.replace('{title}', self.normalized_title)
            .replace('{content}', _llm_context_text(self.normalized_content))
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
        self.retry_feedback_prompt = _build_v2_rewrite_retry_feedback(
            retry_count=self.rewrite_retry_count,
            retry_feedback=self.rewrite_retry_feedback,
            previous_quality=self.previous_quality,
        )
        if self.retry_feedback_prompt:
            self.rewrite_prompt = (
                f'{self.rewrite_prompt}\n\n{self.retry_feedback_prompt}'.strip()
            )
        self.rewrite_prompt_markdown = (
            V2_GUIDELINE_REWRITE_MARKDOWN_PROMPT.replace(
                '{title}', self.normalized_title
            )
            .replace('{content}', _llm_context_text(self.normalized_content))
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
        if self.retry_feedback_prompt:
            self.rewrite_prompt_markdown = f'{self.rewrite_prompt_markdown}\n\n{self.retry_feedback_prompt}'.strip()
