"""Fact length setup steps for URL2Blog pipeline v2."""

import json
from ..config import (
    MAX_LENGTH_EXPANSION_PASSES,
    URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
    _llm_context_text,
)
from ..prompts import V2_FACT_COVERAGE_AUDIT_PROMPT
from ..content.editorial_blocks import _format_editorial_blueprint_for_prompt
from ..observability import append_stage_trace
from ..llm.coerce import _safe_bool, _safe_dict, _safe_int, _safe_str
from ..content.sanitizers import _sanitize_v2_fact_coverage
from .gating import _should_force_v2_fact_repair


class _FactLengthSetup:

    def _initialize(self) -> None:
        self.run_id = _safe_str(self.context.get('run_id'))
        self.selected_model_name = _safe_str(self.context.get('selected_model_name'))
        self.include_debug = _safe_bool(
            self.context.get('include_debug'), default=False
        )
        self.narrative_focus = _safe_str(self.context.get('narrative_focus'))
        self.is_lean_profile = _safe_bool(
            self.context.get('is_lean_profile'), default=False
        )
        self.use_markdown_long_stages = _safe_bool(
            self.context.get('use_markdown_long_stages'),
            default=URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
        )
        self.json_parse_metrics = _safe_dict(self.context.get('json_parse_metrics'))
        if not self.json_parse_metrics:
            self.json_parse_metrics = {
                'total_parse_failures': 0,
                'recovered_calls': 0,
                'recovered_parse_failures': 0,
                'failures_by_stage': {},
            }
        self.stage_trace = list(self.context.get('stage_trace') or [])
        self.normalized_title = _safe_str(self.context.get('normalized_title'))
        self.normalized_content = _safe_str(self.context.get('normalized_content'))
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
        self.max_length_expansion_passes = _safe_int(
            self.context.get('max_length_expansion_passes'),
            default=MAX_LENGTH_EXPANSION_PASSES,
            min_value=1,
            max_value=MAX_LENGTH_EXPANSION_PASSES,
        )
        self.classification = _safe_dict(self.context.get('classification'))
        self.guideline_payload = _safe_dict(self.context.get('guideline_payload'))
        self.source_words = list(self.context.get('source_words') or [])
        self.rewritten_words = list(self.context.get('rewritten_words') or [])
        self.ngram_overlap = float(self.context.get('ngram_overlap') or 0.0)
        self.rewrite = _safe_dict(self.context.get('rewrite'))
        self.quality = _safe_dict(self.context.get('quality'))
        self.quality_raw_response = _safe_str(self.context.get('quality_raw_response'))
        self.long_output_transport = _safe_str(
            self.context.get('long_output_transport')
        ) or ('markdown' if self.use_markdown_long_stages else 'json')
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
        self.external_context_points = list(
            self.context.get('external_context_points') or []
        )
        self.external_context_for_prompt = (
            _safe_str(self.context.get('external_context_for_prompt'))
            or 'No external context collected.'
        )
        self.source_fact_anchors = list(self.context.get('source_fact_anchors') or [])
        self.recorder.mark_running(self.run_id, 'fact_length')
        self.fact_coverage = _sanitize_v2_fact_coverage({}, self.source_fact_anchors)
        self.fact_coverage_raw_response = ''
        self.fact_repair_applied = False
        self.fact_repair_raw_response = ''
        self.length_expansion_applied = False
        self.length_expansion_passes = 0
        self.length_expansion_summary = ''
        self.length_expansion_raw_response = ''

    def _audit_and_repair_facts(self) -> None:
        if self.source_fact_anchors:
            self.fact_coverage_prompt = (
                V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                    '{source_facts}',
                    json.dumps(self.source_fact_anchors, ensure_ascii=False, indent=2),
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
                    stage_name='fact_coverage_audit_initial',
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
                stage='fact_coverage_audit_initial',
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
            self._repair_facts_if_needed()
        else:
            self.stage_trace = append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='fact_coverage_audit_initial',
                model_name=self.selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                output={'skipped': True, 'reason': 'No source facts extracted.'},
            )

    def _repair_facts_if_needed(self) -> None:
        if not self.is_lean_profile and _should_force_v2_fact_repair(
            self.fact_coverage
        ):
            self._prepare_fact_repair()
            self._apply_fact_repair()
            self._reaudit_fact_coverage()
        else:
            self.stage_trace = append_stage_trace(
                stage_trace=self.stage_trace,
                include_debug=self.include_debug,
                stage='fact_repair',
                model_name=self.selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                output={
                    'skipped': True,
                    'reason': 'Factual coverage met threshold.',
                    'fact_coverage_score': self.fact_coverage['coverage_score'],
                },
            )
