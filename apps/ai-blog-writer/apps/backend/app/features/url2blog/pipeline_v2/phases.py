"""URL2Blog pipeline v2 — heavy stage phases.

rewrite/quality, fact/length, editorial, editorial post-recheck, and response
finalization. Each takes and returns the mutable pipeline `context` dict.

The Vertex-call wrappers (`_invoke_json_llm_tracked`, markdown/title/grounded)
and a few build helpers stay in routes.py because the test-suite monkeypatches
`url2blog_routes._invoke_json_llm`; they are imported here from routes. routes.py
imports these phases at the bottom of its module body to close the cycle.

Extracted verbatim from url2blog/routes.py.
"""

import json
import logging
from typing import Any

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.core import write_artifact, write_stage_result, write_status

from ..config import *  # noqa: F401,F403  (constants, FEATURE_NAME, _llm_context_text)
from ..prompts import *  # noqa: F401,F403  (V2_* + SEO guidelines)
from ..llm.coerce import *  # noqa: F401,F403
from ..content.markdown import *  # noqa: F401,F403
from ..content.sanitizers import *  # noqa: F401,F403
from ..content.editorial_blocks import *  # noqa: F401,F403
from .gating import *  # noqa: F401,F403

# These build/invoke wrappers stay in routes.py. The non-monkeypatched ones are
# safe to bind directly. `_invoke_json_llm_tracked` and `_invoke_google_grounded_json`
# ARE monkeypatched on `url2blog_routes` by the test-suite, so they must be looked up
# on the live `routes` module at call time (see routes.* references below) rather than
# bound here at import time.
from .. import routes  # noqa: E402
from ..routes import (  # noqa: E402
    _build_excerpt,
    _build_markdown,
    _build_v2_rewrite_from_markdown,
    _invoke_markdown_long_output,
    _invoke_title_generation,
    _now_iso,
    _pipeline_v2_append_stage_trace,
)

logger = logging.getLogger(__name__)


def _pipeline_v2_run_rewrite_quality_phase(
    context: dict[str, Any],
) -> dict[str, Any]:
    run_id = _safe_str(context.get("run_id"))
    url = _safe_str(context.get("url"))
    selected_model_name = _safe_str(context.get("selected_model_name"))
    include_debug = _safe_bool(context.get("include_debug"), default=False)
    narrative_focus = _safe_str(context.get("narrative_focus"))
    enable_web_enrichment = _safe_bool(
        context.get("enable_web_enrichment"), default=False
    )
    enable_editorial_augmentation = _safe_bool(
        context.get("enable_editorial_augmentation"), default=False
    )
    is_lean_profile = _safe_bool(context.get("is_lean_profile"), default=False)
    use_markdown_long_stages = _safe_bool(
        context.get("use_markdown_long_stages"),
        default=URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
    )
    use_editorial_blueprint = _safe_bool(
        context.get("use_editorial_blueprint"),
        default=URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT,
    )
    long_output_transport = "markdown" if use_markdown_long_stages else "json"
    title_pass_applied_count = _safe_int(
        context.get("title_pass_applied_count"),
        default=0,
        min_value=0,
        max_value=99,
    )
    editorial_blueprint = _safe_dict(context.get("editorial_blueprint"))
    editorial_blueprint_for_prompt = _safe_str(
        context.get("editorial_blueprint_for_prompt")
    )
    if not editorial_blueprint_for_prompt:
        editorial_blueprint_for_prompt = _format_editorial_blueprint_for_prompt(
            editorial_blueprint
        )
    editorial_blueprint_raw_response = _safe_str(
        context.get("editorial_blueprint_raw_response")
    )
    editorial_blueprint_applied = _safe_bool(
        context.get("editorial_blueprint_applied"),
        default=False,
    )

    json_parse_metrics = _safe_dict(context.get("json_parse_metrics"))
    if not json_parse_metrics:
        json_parse_metrics = {
            "total_parse_failures": 0,
            "recovered_calls": 0,
            "recovered_parse_failures": 0,
            "failures_by_stage": {},
        }

    max_external_context_items = _safe_int(
        context.get("max_external_context_items"),
        default=DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
        min_value=1,
        max_value=5,
    )
    rewrite_retry_count = _safe_int(
        context.get("rewrite_quality_retry_count"),
        default=0,
        min_value=0,
        max_value=10,
    )
    rewrite_retry_feedback = _safe_dict(context.get("rewrite_retry_feedback"))
    previous_quality = _safe_dict(context.get("quality"))

    normalized_title = _safe_str(context.get("normalized_title"))
    normalized_content = _safe_str(context.get("normalized_content"))
    source_word_count = _safe_int(
        context.get("source_word_count"),
        default=0,
        min_value=0,
        max_value=200_000,
    )
    classification = _safe_dict(context.get("classification"))
    guideline_payload = _safe_dict(context.get("guideline_payload"))
    stage_trace = list(context.get("stage_trace") or [])

    should_generate_editorial_blueprint = (
        enable_editorial_augmentation and use_editorial_blueprint and not is_lean_profile
    )

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": (
                "editorial_blueprint"
                if should_generate_editorial_blueprint
                else "rewrite_quality"
            ),
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    external_context_points: list[dict[str, str]] = []
    external_context_usage_note = ""
    external_context_raw_response = ""
    external_context_grounded_urls: list[str] = []
    short_article_enrichment_applied = False
    external_context_parsed: dict[str, Any] = {}
    external_context: dict[str, Any] = {
        "context_points": [],
        "usage_note": "",
    }

    should_enrich_short_article = (
        enable_web_enrichment and source_word_count < SHORT_ARTICLE_WORD_THRESHOLD
    )
    if should_enrich_short_article:
        enrichment_prompt = (
            V2_SHORT_ARTICLE_ENRICHMENT_PROMPT.replace(
                "{max_points}", str(max_external_context_items)
            )
            .replace("{source_url}", url)
            .replace("{source_title}", normalized_title)
            .replace("{source_content}", _llm_context_text(normalized_content))
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
        )
        (
            external_context_parsed,
            external_context_raw_response,
            external_context_grounded_urls,
        ) = routes._invoke_google_grounded_json(
            enrichment_prompt,
            max_tokens=1024,
            temperature=0.05,
            model_name=selected_model_name,
        )
        external_context = _sanitize_v2_external_context(
            external_context_parsed,
            max_points=max_external_context_items,
            fallback_urls=external_context_grounded_urls,
        )
        external_context_points = external_context["context_points"]
        external_context_usage_note = external_context["usage_note"]
        short_article_enrichment_applied = bool(external_context_points)
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="short_article_enrichment",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_url": url,
                "source_title": normalized_title,
                "source_content": _llm_context_text(normalized_content),
                "article_type": classification,
                "narrative_focus": narrative_focus,
                "max_external_context_items": max_external_context_items,
            },
            prompt=enrichment_prompt,
            raw_response=external_context_raw_response,
            parsed=external_context_parsed,
            output=external_context,
            grounded_urls=external_context_grounded_urls,
        )
    else:
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="short_article_enrichment",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_word_count": source_word_count,
                "threshold": SHORT_ARTICLE_WORD_THRESHOLD,
                "enable_web_enrichment": enable_web_enrichment,
            },
            output={
                "skipped": True,
                "reason": "Short-article enrichment conditions not met.",
            },
        )

    external_context_for_prompt = (
        json.dumps(external_context_points, ensure_ascii=False, indent=2)
        if external_context_points
        else "No external context collected."
    )

    source_facts_prompt = (
        V2_SOURCE_FACTS_EXTRACTION_PROMPT.replace("{max_facts}", "18")
        .replace("{source_title}", normalized_title)
        .replace("{source_content}", _llm_context_text(normalized_content))
    )
    source_facts_parsed, source_facts_raw_response = routes._invoke_json_llm_tracked(
        prompt=source_facts_prompt,
        stage_name="source_facts_extraction",
        parse_metrics=json_parse_metrics,
        max_tokens=1536,
        temperature=0.05,
        model_name=selected_model_name,
    )
    source_fact_anchors = _sanitize_v2_source_facts(source_facts_parsed, max_facts=18)
    stage_trace = _pipeline_v2_append_stage_trace(
        stage_trace=stage_trace,
        include_debug=include_debug,
        stage="source_facts_extraction",
        model_name=selected_model_name,
        max_tokens=1536,
        temperature=0.05,
        input_payload={
            "source_title": normalized_title,
            "source_content": _llm_context_text(normalized_content),
            "max_facts": 18,
        },
        prompt=source_facts_prompt,
        raw_response=source_facts_raw_response,
        parsed=source_facts_parsed,
        output={"source_fact_anchors": source_fact_anchors},
    )

    if should_generate_editorial_blueprint:
        if not editorial_blueprint:
            editorial_blueprint_prompt = (
                V2_EDITORIAL_BLUEPRINT_PROMPT.replace("{source_title}", normalized_title)
                .replace("{source_content}", _llm_context_text(normalized_content))
                .replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{guideline}",
                    guideline_payload.get("guideline") or "No guideline provided.",
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                )
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace(
                    "{source_facts}",
                    json.dumps(source_fact_anchors, ensure_ascii=False, indent=2)
                    if source_fact_anchors
                    else "No source facts extracted.",
                )
            )
            editorial_blueprint_parsed, editorial_blueprint_raw_response = (
                routes._invoke_json_llm_tracked(
                    prompt=editorial_blueprint_prompt,
                    stage_name="editorial_blueprint",
                    parse_metrics=json_parse_metrics,
                    max_tokens=1536,
                    temperature=0.05,
                    model_name=selected_model_name,
                )
            )
            editorial_blueprint = _sanitize_v2_editorial_blueprint(
                editorial_blueprint_parsed
            )
            editorial_blueprint_applied = _safe_bool(
                editorial_blueprint.get("apply_plan"), default=False
            ) and bool(list(editorial_blueprint.get("components") or []))
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="editorial_blueprint",
                model_name=selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                input_payload={
                    "source_title": normalized_title,
                    "source_content": _llm_context_text(normalized_content),
                    "article_type": classification,
                    "guideline": guideline_payload.get("guideline")
                    or "No guideline provided.",
                    "title_guideline": guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                    "narrative_focus": narrative_focus,
                    "source_facts": source_fact_anchors,
                },
                prompt=editorial_blueprint_prompt,
                raw_response=editorial_blueprint_raw_response,
                parsed=editorial_blueprint_parsed,
                output=editorial_blueprint,
            )
            write_stage_result(
                run_id,
                "editorial_blueprint",
                {"created_at": _now_iso(), "data": editorial_blueprint},
            )
        else:
            editorial_blueprint = _sanitize_v2_editorial_blueprint(editorial_blueprint)
            editorial_blueprint_applied = _safe_bool(
                editorial_blueprint.get("apply_plan"), default=False
            ) and bool(list(editorial_blueprint.get("components") or []))
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="editorial_blueprint",
                model_name=selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                output={
                    "reused_from_context": True,
                    "editorial_blueprint_applied": editorial_blueprint_applied,
                    "components_planned": [
                        _safe_str(item.get("component"))
                        for item in list(editorial_blueprint.get("components") or [])
                        if isinstance(item, dict)
                    ],
                },
            )
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": "rewrite_quality",
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
    else:
        editorial_blueprint = _sanitize_v2_editorial_blueprint(editorial_blueprint)
        editorial_blueprint_applied = False
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="editorial_blueprint",
            model_name=selected_model_name,
            max_tokens=1536,
            temperature=0.05,
            output={
                "skipped": True,
                "reason": "Editorial blueprint disabled for this run.",
            },
        )

    editorial_blueprint_for_prompt = _format_editorial_blueprint_for_prompt(
        editorial_blueprint
    )

    rewrite_prompt = (
        V2_GUIDELINE_REWRITE_PROMPT.replace("{title}", normalized_title)
        .replace("{content}", _llm_context_text(normalized_content))
        .replace(
            "{article_type}",
            json.dumps(classification, ensure_ascii=False, indent=2),
        )
        .replace(
            "{guideline}",
            guideline_payload.get("guideline") or "No guideline provided.",
        )
        .replace(
            "{title_guideline}",
            guideline_payload.get("title_guideline")
            or "No title guideline provided.",
        )
        .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
        .replace(
            "{narrative_focus}",
            narrative_focus or "No additional narrative focus provided.",
        )
        .replace("{external_context}", external_context_for_prompt)
        .replace(
            "{editorial_blueprint_directives}",
            editorial_blueprint_for_prompt,
        )
    )
    retry_feedback_prompt = _build_v2_rewrite_retry_feedback(
        retry_count=rewrite_retry_count,
        retry_feedback=rewrite_retry_feedback,
        previous_quality=previous_quality,
    )
    if retry_feedback_prompt:
        rewrite_prompt = f"{rewrite_prompt}\n\n{retry_feedback_prompt}".strip()

    rewrite_prompt_markdown = (
        V2_GUIDELINE_REWRITE_MARKDOWN_PROMPT.replace("{title}", normalized_title)
        .replace("{content}", _llm_context_text(normalized_content))
        .replace(
            "{article_type}",
            json.dumps(classification, ensure_ascii=False, indent=2),
        )
        .replace(
            "{guideline}",
            guideline_payload.get("guideline") or "No guideline provided.",
        )
        .replace(
            "{title_guideline}",
            guideline_payload.get("title_guideline")
            or "No title guideline provided.",
        )
        .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
        .replace(
            "{narrative_focus}",
            narrative_focus or "No additional narrative focus provided.",
        )
        .replace("{external_context}", external_context_for_prompt)
        .replace(
            "{editorial_blueprint_directives}",
            editorial_blueprint_for_prompt,
        )
    )
    if retry_feedback_prompt:
        rewrite_prompt_markdown = (
            f"{rewrite_prompt_markdown}\n\n{retry_feedback_prompt}".strip()
        )

    rewrite_temperature = 0.1 if rewrite_retry_count == 0 else 0.2
    rewrite_stage_transport = "json"
    rewrite_title_raw_response = ""
    rewrite_parsed: dict[str, Any] = {}
    if use_markdown_long_stages:
        rewrite_long_output = _invoke_markdown_long_output(
            prompt=rewrite_prompt_markdown,
            stage_name="guideline_rewrite_initial",
            model_name=URL2BLOG_COMPOSE_MODEL,
            temperature=rewrite_temperature,
            max_tokens=6144,
            fallback_content=normalized_content,
            parse_metrics=json_parse_metrics,
            legacy_json_prompt=rewrite_prompt,
            legacy_json_stage_name="guideline_rewrite_initial_legacy_json",
            legacy_content_key="improved_content",
            legacy_title_key="improved_title",
        )
        rewrite_raw_response = _safe_str(rewrite_long_output.get("raw_response"))
        rewrite_stage_transport = _safe_str(rewrite_long_output.get("transport")) or "markdown"
        if rewrite_stage_transport == "json_fallback":
            long_output_transport = "json_fallback"
        rewrite_fallback_title = _safe_str(
            rewrite_long_output.get("fallback_title")
        ) or normalized_title
        title_prompt = (
            V2_TITLE_GENERATION_PROMPT.replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{title_guideline}",
                guideline_payload.get("title_guideline")
                or "No title guideline provided.",
            )
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{source_title}", normalized_title)
            .replace(
                "{rewritten_content}",
                _llm_context_text(_safe_str(rewrite_long_output.get("content"))),
            )
        )
        generated_title, rewrite_title_raw_response = _invoke_title_generation(
            prompt=title_prompt,
            model_name=selected_model_name,
            fallback_title=rewrite_fallback_title,
        )
        title_pass_applied_count += 1
        rewrite = _build_v2_rewrite_from_markdown(
            improved_title=generated_title,
            improved_content=_safe_str(rewrite_long_output.get("content")),
        )
    else:
        rewrite_parsed, rewrite_raw_response = routes._invoke_json_llm_tracked(
            prompt=rewrite_prompt,
            stage_name="guideline_rewrite_initial",
            parse_metrics=json_parse_metrics,
            max_tokens=6144,
            temperature=rewrite_temperature,
            model_name=URL2BLOG_COMPOSE_MODEL,
        )
        rewrite = _sanitize_v2_guideline_rewrite(
            rewrite_parsed,
            fallback_title=normalized_title,
            fallback_content=normalized_content,
        )

    stage_trace = _pipeline_v2_append_stage_trace(
        stage_trace=stage_trace,
        include_debug=include_debug,
        stage="guideline_rewrite_initial",
        model_name=URL2BLOG_COMPOSE_MODEL,
        max_tokens=6144,
        temperature=rewrite_temperature,
        input_payload={
            "title": normalized_title,
            "content": _llm_context_text(normalized_content),
            "article_type": classification,
            "guideline": guideline_payload.get("guideline") or "No guideline provided.",
            "title_guideline": guideline_payload.get("title_guideline")
            or "No title guideline provided.",
            "narrative_focus": narrative_focus,
            "external_context": external_context_points,
            "rewrite_retry_count": rewrite_retry_count,
            "rewrite_retry_feedback": rewrite_retry_feedback,
            "transport": rewrite_stage_transport,
            "use_markdown_long_stages": use_markdown_long_stages,
        },
        prompt=rewrite_prompt_markdown if use_markdown_long_stages else rewrite_prompt,
        raw_response=rewrite_raw_response,
        parsed=rewrite_parsed if not use_markdown_long_stages else None,
        output={
            **rewrite,
            "transport": rewrite_stage_transport,
            "title_raw_response": rewrite_title_raw_response,
        },
    )

    source_words = _tokenize_similarity_words(normalized_content)
    rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
    ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)

    quality_prompt = (
        V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
        .replace("{source_content}", _llm_context_text(normalized_content))
        .replace("{rewritten_title}", rewrite["improved_title"])
        .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
        .replace(
            "{article_type}",
            json.dumps(classification, ensure_ascii=False, indent=2),
        )
        .replace(
            "{guideline}",
            guideline_payload.get("guideline") or "No guideline provided.",
        )
        .replace(
            "{title_guideline}",
            guideline_payload.get("title_guideline")
            or "No title guideline provided.",
        )
        .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
        .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
        .replace(
            "{narrative_focus}",
            narrative_focus or "No additional narrative focus provided.",
        )
        .replace("{external_context}", external_context_for_prompt)
    )
    quality_parsed, quality_raw_response = routes._invoke_json_llm_tracked(
        prompt=quality_prompt,
        stage_name="quality_audit_initial",
        parse_metrics=json_parse_metrics,
        max_tokens=1024,
        temperature=0.05,
        model_name=selected_model_name,
    )
    quality = _sanitize_v2_quality_audit(quality_parsed)
    stage_trace = _pipeline_v2_append_stage_trace(
        stage_trace=stage_trace,
        include_debug=include_debug,
        stage="quality_audit_initial",
        model_name=selected_model_name,
        max_tokens=1024,
        temperature=0.05,
        input_payload={
            "source_title": normalized_title,
            "source_content": _llm_context_text(normalized_content),
            "rewritten_title": rewrite["improved_title"],
            "rewritten_content": _llm_context_text(rewrite["improved_content"]),
            "article_type": classification,
            "guideline": guideline_payload.get("guideline") or "No guideline provided.",
            "title_guideline": guideline_payload.get("title_guideline")
            or "No title guideline provided.",
            "ngram_overlap": round(ngram_overlap, 3),
            "narrative_focus": narrative_focus,
            "external_context": external_context_points,
        },
        prompt=quality_prompt,
        raw_response=quality_raw_response,
        parsed=quality_parsed,
        output=quality,
    )

    second_pass_applied = False
    repair_raw_response = ""

    if not is_lean_profile and _should_force_v2_second_pass(quality, ngram_overlap):
        second_pass_applied = True
        previous_title = rewrite["improved_title"]
        previous_content = rewrite["improved_content"]
        repair_prompt = (
            V2_REWRITE_REPAIR_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", _llm_context_text(normalized_content))
            .replace("{previous_title}", previous_title)
            .replace("{previous_content}", _llm_context_text(previous_content))
            .replace(
                "{required_revisions}",
                json.dumps(
                    quality["required_revisions"],
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload.get("guideline") or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload.get("title_guideline")
                or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
            .replace(
                "{editorial_blueprint_directives}",
                editorial_blueprint_for_prompt,
            )
        )
        repair_prompt_markdown = (
            V2_REWRITE_REPAIR_MARKDOWN_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", _llm_context_text(normalized_content))
            .replace("{previous_title}", previous_title)
            .replace("{previous_content}", _llm_context_text(previous_content))
            .replace(
                "{required_revisions}",
                json.dumps(
                    quality["required_revisions"],
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload.get("guideline") or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload.get("title_guideline")
                or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
            .replace(
                "{editorial_blueprint_directives}",
                editorial_blueprint_for_prompt,
            )
        )
        repair_stage_transport = "json"
        repair_title_raw_response = ""
        repair_parsed: dict[str, Any] = {}
        if use_markdown_long_stages:
            repair_long_output = _invoke_markdown_long_output(
                prompt=repair_prompt_markdown,
                stage_name="rewrite_repair_second_pass",
                model_name=selected_model_name,
                temperature=0.1,
                max_tokens=6144,
                fallback_content=previous_content,
                parse_metrics=json_parse_metrics,
                legacy_json_prompt=repair_prompt,
                legacy_json_stage_name="rewrite_repair_second_pass_legacy_json",
                legacy_content_key="improved_content",
                legacy_title_key="improved_title",
            )
            repair_raw_response = _safe_str(repair_long_output.get("raw_response"))
            repair_stage_transport = (
                _safe_str(repair_long_output.get("transport")) or "markdown"
            )
            if repair_stage_transport == "json_fallback":
                long_output_transport = "json_fallback"
            repair_fallback_title = _safe_str(
                repair_long_output.get("fallback_title")
            ) or previous_title
            title_prompt = (
                V2_TITLE_GENERATION_PROMPT.replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                )
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace("{source_title}", normalized_title)
                .replace(
                    "{rewritten_content}",
                    _llm_context_text(_safe_str(repair_long_output.get("content"))),
                )
            )
            generated_title, repair_title_raw_response = _invoke_title_generation(
                prompt=title_prompt,
                model_name=selected_model_name,
                fallback_title=repair_fallback_title,
            )
            title_pass_applied_count += 1
            rewrite = _build_v2_rewrite_from_markdown(
                improved_title=generated_title,
                improved_content=_safe_str(repair_long_output.get("content")),
                previous_rewrite=rewrite,
                guideline_alignment_summary=(
                    "Second-pass hard rewrite improved structure, originality, and "
                    "guideline alignment."
                ),
                improvements_applied=[
                    "Applied required revisions from the failed quality audit.",
                    "Restructured sections for stronger originality and flow.",
                ],
                remaining_gaps=[],
            )
        else:
            repair_parsed, repair_raw_response = routes._invoke_json_llm_tracked(
                prompt=repair_prompt,
                stage_name="rewrite_repair_second_pass",
                parse_metrics=json_parse_metrics,
                max_tokens=6144,
                temperature=0.1,
                model_name=selected_model_name,
            )
            rewrite = _sanitize_v2_guideline_rewrite(
                repair_parsed,
                fallback_title=previous_title,
                fallback_content=previous_content,
            )

        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="rewrite_repair_second_pass",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            input_payload={
                "source_title": normalized_title,
                "source_content": _llm_context_text(normalized_content),
                "previous_title": previous_title,
                "previous_content": _llm_context_text(previous_content),
                "required_revisions": quality["required_revisions"],
                "article_type": classification,
                "guideline": guideline_payload.get("guideline")
                or "No guideline provided.",
                "title_guideline": guideline_payload.get("title_guideline")
                or "No title guideline provided.",
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
                "transport": repair_stage_transport,
            },
            prompt=repair_prompt_markdown if use_markdown_long_stages else repair_prompt,
            raw_response=repair_raw_response,
            parsed=repair_parsed if not use_markdown_long_stages else None,
            output={
                **rewrite,
                "transport": repair_stage_transport,
                "title_raw_response": repair_title_raw_response,
            },
        )

        rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
        ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)

        quality_prompt = (
            V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", _llm_context_text(normalized_content))
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload.get("guideline") or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload.get("title_guideline")
                or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
        )
        quality_parsed, quality_raw_response = routes._invoke_json_llm_tracked(
            prompt=quality_prompt,
            stage_name="quality_audit_after_second_pass",
            parse_metrics=json_parse_metrics,
            max_tokens=1024,
            temperature=0.05,
            model_name=selected_model_name,
        )
        quality = _sanitize_v2_quality_audit(quality_parsed)
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="quality_audit_after_second_pass",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_title": normalized_title,
                "source_content": _llm_context_text(normalized_content),
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": _llm_context_text(rewrite["improved_content"]),
                "article_type": classification,
                "guideline": guideline_payload.get("guideline")
                or "No guideline provided.",
                "title_guideline": guideline_payload.get("title_guideline")
                or "No title guideline provided.",
                "ngram_overlap": round(ngram_overlap, 3),
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
            },
            prompt=quality_prompt,
            raw_response=quality_raw_response,
            parsed=quality_parsed,
            output=quality,
        )
    else:
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="rewrite_repair_second_pass",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            output={
                "skipped": True,
                "reason": "Initial quality/originality checks passed.",
            },
        )

    write_stage_result(
        run_id,
        "rewrite_quality",
        {
            "created_at": _now_iso(),
            "data": {
                "second_pass_applied": second_pass_applied,
                "quality_scores": {
                    "overall": quality["overall_score"],
                    "guideline_coverage": quality["guideline_coverage_score"],
                    "informativeness": quality["informativeness_score"],
                    "originality": quality["originality_score"],
                },
                "similarity_ngram_overlap": round(ngram_overlap, 3),
                "short_article_enrichment_applied": short_article_enrichment_applied,
                "external_context_points_used": len(external_context_points),
                "source_facts_extracted_count": len(source_fact_anchors),
                "editorial_blueprint_applied": editorial_blueprint_applied,
                "editorial_blueprint_components_planned": [
                    _safe_str(item.get("component"))
                    for item in list(editorial_blueprint.get("components") or [])
                    if isinstance(item, dict)
                ],
                "long_output_transport": long_output_transport,
                "title_pass_applied_count": title_pass_applied_count,
            },
        },
    )

    context.update(
        {
            "json_parse_metrics": json_parse_metrics,
            "stage_trace": stage_trace,
            "external_context_points": external_context_points,
            "external_context_usage_note": external_context_usage_note,
            "external_context_raw_response": external_context_raw_response,
            "external_context_grounded_urls": external_context_grounded_urls,
            "short_article_enrichment_applied": short_article_enrichment_applied,
            "external_context_for_prompt": external_context_for_prompt,
            "source_fact_anchors": source_fact_anchors,
            "source_facts_raw_response": source_facts_raw_response,
            "rewrite": rewrite,
            "rewrite_raw_response": rewrite_raw_response,
            "repair_raw_response": repair_raw_response,
            "quality": quality,
            "quality_raw_response": quality_raw_response,
            "source_words": source_words,
            "rewritten_words": rewritten_words,
            "ngram_overlap": ngram_overlap,
            "second_pass_applied": second_pass_applied,
            "rewrite_retry_count": rewrite_retry_count,
            "rewrite_retry_feedback": rewrite_retry_feedback,
            "long_output_transport": long_output_transport,
            "title_pass_applied_count": title_pass_applied_count,
            "use_markdown_long_stages": use_markdown_long_stages,
            "use_editorial_blueprint": use_editorial_blueprint,
            "editorial_blueprint": editorial_blueprint,
            "editorial_blueprint_raw_response": editorial_blueprint_raw_response,
            "editorial_blueprint_applied": editorial_blueprint_applied,
            "editorial_blueprint_for_prompt": editorial_blueprint_for_prompt,
        }
    )

    return context


def _pipeline_v2_run_fact_length_phase(
    context: dict[str, Any],
) -> dict[str, Any]:
    run_id = _safe_str(context.get("run_id"))
    selected_model_name = _safe_str(context.get("selected_model_name"))
    include_debug = _safe_bool(context.get("include_debug"), default=False)
    narrative_focus = _safe_str(context.get("narrative_focus"))
    is_lean_profile = _safe_bool(context.get("is_lean_profile"), default=False)
    use_markdown_long_stages = _safe_bool(
        context.get("use_markdown_long_stages"),
        default=URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
    )

    json_parse_metrics = _safe_dict(context.get("json_parse_metrics"))
    if not json_parse_metrics:
        json_parse_metrics = {
            "total_parse_failures": 0,
            "recovered_calls": 0,
            "recovered_parse_failures": 0,
            "failures_by_stage": {},
        }

    stage_trace = list(context.get("stage_trace") or [])
    normalized_title = _safe_str(context.get("normalized_title"))
    normalized_content = _safe_str(context.get("normalized_content"))
    source_word_count = _safe_int(
        context.get("source_word_count"),
        default=0,
        min_value=0,
        max_value=200_000,
    )
    min_expanded_word_target = _safe_int(
        context.get("min_expanded_word_target"),
        default=0,
        min_value=0,
        max_value=300_000,
    )
    max_length_expansion_passes = _safe_int(
        context.get("max_length_expansion_passes"),
        default=MAX_LENGTH_EXPANSION_PASSES,
        min_value=1,
        max_value=MAX_LENGTH_EXPANSION_PASSES,
    )
    classification = _safe_dict(context.get("classification"))
    guideline_payload = _safe_dict(context.get("guideline_payload"))
    source_words = list(context.get("source_words") or [])
    rewritten_words = list(context.get("rewritten_words") or [])
    ngram_overlap = float(context.get("ngram_overlap") or 0.0)
    rewrite = _safe_dict(context.get("rewrite"))
    quality = _safe_dict(context.get("quality"))
    quality_raw_response = _safe_str(context.get("quality_raw_response"))
    long_output_transport = _safe_str(context.get("long_output_transport")) or (
        "markdown" if use_markdown_long_stages else "json"
    )
    title_pass_applied_count = _safe_int(
        context.get("title_pass_applied_count"),
        default=0,
        min_value=0,
        max_value=99,
    )
    editorial_blueprint = _safe_dict(context.get("editorial_blueprint"))
    editorial_blueprint_for_prompt = _safe_str(
        context.get("editorial_blueprint_for_prompt")
    )
    if not editorial_blueprint_for_prompt:
        editorial_blueprint_for_prompt = _format_editorial_blueprint_for_prompt(
            editorial_blueprint
        )

    external_context_points = list(context.get("external_context_points") or [])
    external_context_for_prompt = _safe_str(
        context.get("external_context_for_prompt")
    ) or "No external context collected."
    source_fact_anchors = list(context.get("source_fact_anchors") or [])

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "fact_length",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    fact_coverage = _sanitize_v2_fact_coverage({}, source_fact_anchors)
    fact_coverage_raw_response = ""
    fact_repair_applied = False
    fact_repair_raw_response = ""
    length_expansion_applied = False
    length_expansion_passes = 0
    length_expansion_summary = ""
    length_expansion_raw_response = ""

    if source_fact_anchors:
        fact_coverage_prompt = (
            V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                "{source_facts}",
                json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
            )
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
        )
        fact_coverage_parsed, fact_coverage_raw_response = routes._invoke_json_llm_tracked(
            prompt=fact_coverage_prompt,
            stage_name="fact_coverage_audit_initial",
            parse_metrics=json_parse_metrics,
            max_tokens=1536,
            temperature=0.05,
            model_name=selected_model_name,
        )
        fact_coverage = _sanitize_v2_fact_coverage(
            fact_coverage_parsed, source_fact_anchors
        )
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="fact_coverage_audit_initial",
            model_name=selected_model_name,
            max_tokens=1536,
            temperature=0.05,
            input_payload={
                "source_facts": source_fact_anchors,
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": _llm_context_text(rewrite["improved_content"]),
            },
            prompt=fact_coverage_prompt,
            raw_response=fact_coverage_raw_response,
            parsed=fact_coverage_parsed,
            output=fact_coverage,
        )

        if not is_lean_profile and _should_force_v2_fact_repair(fact_coverage):
            fact_repair_applied = True
            previous_title = rewrite["improved_title"]
            previous_content = rewrite["improved_content"]
            fact_repair_prompt = (
                V2_FACT_REPAIR_PROMPT.replace("{source_title}", normalized_title)
                .replace("{source_content}", _llm_context_text(normalized_content))
                .replace("{rewritten_title}", previous_title)
                .replace("{rewritten_content}", _llm_context_text(previous_content))
                .replace(
                    "{missing_facts}",
                    json.dumps(
                        fact_coverage["missing_facts"],
                        ensure_ascii=False,
                        indent=2,
                    ),
                )
                .replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{guideline}",
                    guideline_payload.get("guideline") or "No guideline provided.",
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                )
                .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace("{external_context}", external_context_for_prompt)
                .replace(
                    "{editorial_blueprint_directives}",
                    editorial_blueprint_for_prompt,
                )
            )
            fact_repair_prompt_markdown = (
                V2_FACT_REPAIR_MARKDOWN_PROMPT.replace("{source_title}", normalized_title)
                .replace("{source_content}", _llm_context_text(normalized_content))
                .replace("{rewritten_title}", previous_title)
                .replace("{rewritten_content}", _llm_context_text(previous_content))
                .replace(
                    "{missing_facts}",
                    json.dumps(
                        fact_coverage["missing_facts"],
                        ensure_ascii=False,
                        indent=2,
                    ),
                )
                .replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{guideline}",
                    guideline_payload.get("guideline") or "No guideline provided.",
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                )
                .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace("{external_context}", external_context_for_prompt)
                .replace(
                    "{editorial_blueprint_directives}",
                    editorial_blueprint_for_prompt,
                )
            )
            fact_repair_stage_transport = "json"
            fact_repair_title_raw_response = ""
            fact_repair_parsed: dict[str, Any] = {}
            if use_markdown_long_stages:
                fact_repair_long_output = _invoke_markdown_long_output(
                    prompt=fact_repair_prompt_markdown,
                    stage_name="fact_repair",
                    model_name=selected_model_name,
                    temperature=0.1,
                    max_tokens=6144,
                    fallback_content=previous_content,
                    parse_metrics=json_parse_metrics,
                    legacy_json_prompt=fact_repair_prompt,
                    legacy_json_stage_name="fact_repair_legacy_json",
                    legacy_content_key="improved_content",
                    legacy_title_key="improved_title",
                )
                fact_repair_raw_response = _safe_str(
                    fact_repair_long_output.get("raw_response")
                )
                fact_repair_stage_transport = (
                    _safe_str(fact_repair_long_output.get("transport"))
                    or "markdown"
                )
                if fact_repair_stage_transport == "json_fallback":
                    long_output_transport = "json_fallback"
                fact_repair_fallback_title = _safe_str(
                    fact_repair_long_output.get("fallback_title")
                ) or previous_title
                title_prompt = (
                    V2_TITLE_GENERATION_PROMPT.replace(
                        "{article_type}",
                        json.dumps(classification, ensure_ascii=False, indent=2),
                    )
                    .replace(
                        "{title_guideline}",
                        guideline_payload.get("title_guideline")
                        or "No title guideline provided.",
                    )
                    .replace(
                        "{narrative_focus}",
                        narrative_focus or "No additional narrative focus provided.",
                    )
                    .replace("{source_title}", normalized_title)
                    .replace(
                        "{rewritten_content}",
                        _llm_context_text(_safe_str(fact_repair_long_output.get("content"))),
                    )
                )
                generated_title, fact_repair_title_raw_response = _invoke_title_generation(
                    prompt=title_prompt,
                    model_name=selected_model_name,
                    fallback_title=fact_repair_fallback_title,
                )
                title_pass_applied_count += 1
                rewrite = _build_v2_rewrite_from_markdown(
                    improved_title=generated_title,
                    improved_content=_safe_str(fact_repair_long_output.get("content")),
                    previous_rewrite=rewrite,
                    guideline_alignment_summary=(
                        "Fact repair restored missing source-grounded details while "
                        "preserving readability."
                    ),
                    improvements_applied=[
                        "Restored missing source facts identified by factual coverage audit.",
                        "Preserved structure and reader-facing clarity.",
                    ],
                    remaining_gaps=[],
                )
            else:
                fact_repair_parsed, fact_repair_raw_response = routes._invoke_json_llm_tracked(
                    prompt=fact_repair_prompt,
                    stage_name="fact_repair",
                    parse_metrics=json_parse_metrics,
                    max_tokens=6144,
                    temperature=0.1,
                    model_name=selected_model_name,
                )
                rewrite = _sanitize_v2_guideline_rewrite(
                    fact_repair_parsed,
                    fallback_title=previous_title,
                    fallback_content=previous_content,
                )

            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="fact_repair",
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                input_payload={
                    "source_title": normalized_title,
                    "source_content": _llm_context_text(normalized_content),
                    "rewritten_title": previous_title,
                    "rewritten_content": _llm_context_text(previous_content),
                    "missing_facts": fact_coverage["missing_facts"],
                    "article_type": classification,
                    "guideline": guideline_payload.get("guideline")
                    or "No guideline provided.",
                    "title_guideline": guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                    "narrative_focus": narrative_focus,
                    "external_context": external_context_points,
                    "transport": fact_repair_stage_transport,
                },
                prompt=(
                    fact_repair_prompt_markdown
                    if use_markdown_long_stages
                    else fact_repair_prompt
                ),
                raw_response=fact_repair_raw_response,
                parsed=fact_repair_parsed if not use_markdown_long_stages else None,
                output={
                    **rewrite,
                    "transport": fact_repair_stage_transport,
                    "title_raw_response": fact_repair_title_raw_response,
                },
            )

            rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
            ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)

            quality_prompt = (
                V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
                .replace("{source_content}", _llm_context_text(normalized_content))
                .replace("{rewritten_title}", rewrite["improved_title"])
                .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
                .replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{guideline}",
                    guideline_payload.get("guideline") or "No guideline provided.",
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                )
                .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
                .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace("{external_context}", external_context_for_prompt)
            )
            quality_parsed, quality_raw_response = routes._invoke_json_llm_tracked(
                prompt=quality_prompt,
                stage_name="quality_audit_after_fact_repair",
                parse_metrics=json_parse_metrics,
                max_tokens=1024,
                temperature=0.05,
                model_name=selected_model_name,
            )
            quality = _sanitize_v2_quality_audit(quality_parsed)
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="quality_audit_after_fact_repair",
                model_name=selected_model_name,
                max_tokens=1024,
                temperature=0.05,
                input_payload={
                    "source_title": normalized_title,
                    "source_content": _llm_context_text(normalized_content),
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": _llm_context_text(rewrite["improved_content"]),
                    "article_type": classification,
                    "guideline": guideline_payload.get("guideline")
                    or "No guideline provided.",
                    "title_guideline": guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                    "ngram_overlap": round(ngram_overlap, 3),
                    "narrative_focus": narrative_focus,
                    "external_context": external_context_points,
                },
                prompt=quality_prompt,
                raw_response=quality_raw_response,
                parsed=quality_parsed,
                output=quality,
            )

            fact_coverage_prompt = (
                V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                    "{source_facts}",
                    json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
                )
                .replace("{rewritten_title}", rewrite["improved_title"])
                .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
            )
            fact_coverage_parsed, fact_coverage_raw_response = routes._invoke_json_llm_tracked(
                prompt=fact_coverage_prompt,
                stage_name="fact_coverage_audit_after_fact_repair",
                parse_metrics=json_parse_metrics,
                max_tokens=1536,
                temperature=0.05,
                model_name=selected_model_name,
            )
            fact_coverage = _sanitize_v2_fact_coverage(
                fact_coverage_parsed, source_fact_anchors
            )
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="fact_coverage_audit_after_fact_repair",
                model_name=selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                input_payload={
                    "source_facts": source_fact_anchors,
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": _llm_context_text(rewrite["improved_content"]),
                },
                prompt=fact_coverage_prompt,
                raw_response=fact_coverage_raw_response,
                parsed=fact_coverage_parsed,
                output=fact_coverage,
            )
        else:
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="fact_repair",
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                output={
                    "skipped": True,
                    "reason": "Factual coverage met threshold.",
                    "fact_coverage_score": fact_coverage["coverage_score"],
                },
            )
    else:
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="fact_coverage_audit_initial",
            model_name=selected_model_name,
            max_tokens=1536,
            temperature=0.05,
            output={
                "skipped": True,
                "reason": "No source facts extracted.",
            },
        )

    rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
    rewritten_word_count = len(rewritten_words)
    source_facts_for_prompt = (
        json.dumps(source_fact_anchors, ensure_ascii=False, indent=2)
        if source_fact_anchors
        else "No source facts extracted."
    )

    while (
        rewritten_word_count < min_expanded_word_target
        and length_expansion_passes < max_length_expansion_passes
    ):
        expansion_prompt = (
            V2_LENGTH_EXPANSION_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", _llm_context_text(normalized_content))
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
            .replace("{current_word_count}", str(rewritten_word_count))
            .replace("{source_word_count}", str(source_word_count))
            .replace("{min_word_target}", str(min_expanded_word_target))
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload.get("guideline") or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload.get("title_guideline")
                or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
            .replace("{source_facts}", source_facts_for_prompt)
            .replace(
                "{editorial_blueprint_directives}",
                editorial_blueprint_for_prompt,
            )
        )
        expansion_prompt_markdown = (
            V2_LENGTH_EXPANSION_MARKDOWN_PROMPT.replace(
                "{source_title}", normalized_title
            )
            .replace("{source_content}", _llm_context_text(normalized_content))
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
            .replace("{current_word_count}", str(rewritten_word_count))
            .replace("{source_word_count}", str(source_word_count))
            .replace("{min_word_target}", str(min_expanded_word_target))
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload.get("guideline") or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload.get("title_guideline")
                or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
            .replace("{source_facts}", source_facts_for_prompt)
            .replace(
                "{editorial_blueprint_directives}",
                editorial_blueprint_for_prompt,
            )
        )
        stage_name = f"length_expansion_pass_{length_expansion_passes + 1}"
        expansion_stage_transport = "json"
        expansion_parsed: dict[str, Any] = {}
        try:
            if use_markdown_long_stages:
                expansion_long_output = _invoke_markdown_long_output(
                    prompt=expansion_prompt_markdown,
                    stage_name=stage_name,
                    model_name=selected_model_name,
                    temperature=0.1,
                    max_tokens=6144,
                    fallback_content=rewrite["improved_content"],
                    parse_metrics=json_parse_metrics,
                    legacy_json_prompt=expansion_prompt,
                    legacy_json_stage_name=f"{stage_name}_legacy_json",
                    legacy_content_key="expanded_content",
                )
                length_expansion_raw_response = _safe_str(
                    expansion_long_output.get("raw_response")
                )
                expansion_stage_transport = (
                    _safe_str(expansion_long_output.get("transport"))
                    or "markdown"
                )
                if expansion_stage_transport == "json_fallback":
                    long_output_transport = "json_fallback"
                expansion = {
                    "expanded_content": _safe_str(expansion_long_output.get("content")),
                    "expansion_summary": (
                        "Expanded article depth while preserving factual integrity and "
                        "structure."
                    ),
                }
            else:
                expansion_parsed, length_expansion_raw_response = routes._invoke_json_llm_tracked(
                    prompt=expansion_prompt,
                    stage_name=stage_name,
                    parse_metrics=json_parse_metrics,
                    max_tokens=6144,
                    temperature=0.1,
                    model_name=selected_model_name,
                )
                expansion = _sanitize_v2_length_expansion(
                    expansion_parsed,
                    fallback_content=rewrite["improved_content"],
                )
        except HTTPException as exc:
            logger.warning("URL2Blog length expansion failed: %s", exc.detail)
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage=stage_name,
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                input_payload={
                    "source_title": normalized_title,
                    "source_content": _llm_context_text(normalized_content),
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": _llm_context_text(rewrite["improved_content"]),
                    "current_word_count": rewritten_word_count,
                    "source_word_count": source_word_count,
                    "min_word_target": min_expanded_word_target,
                    "article_type": classification,
                    "guideline": guideline_payload.get("guideline")
                    or "No guideline provided.",
                    "title_guideline": guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                    "narrative_focus": narrative_focus,
                    "external_context": external_context_points,
                    "source_facts": source_fact_anchors,
                },
                prompt=(
                    expansion_prompt_markdown
                    if use_markdown_long_stages
                    else expansion_prompt
                ),
                error=_safe_str(exc.detail),
            )
            break

        expanded_content = expansion["expanded_content"]
        expanded_words = _tokenize_similarity_words(expanded_content)
        expanded_word_count = len(expanded_words)

        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage=stage_name,
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            input_payload={
                "source_title": normalized_title,
                "source_content": _llm_context_text(normalized_content),
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": _llm_context_text(rewrite["improved_content"]),
                "current_word_count": rewritten_word_count,
                "source_word_count": source_word_count,
                "min_word_target": min_expanded_word_target,
                "article_type": classification,
                "guideline": guideline_payload.get("guideline")
                or "No guideline provided.",
                "title_guideline": guideline_payload.get("title_guideline")
                or "No title guideline provided.",
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
                "source_facts": source_fact_anchors,
                "transport": expansion_stage_transport,
            },
            prompt=(
                expansion_prompt_markdown
                if use_markdown_long_stages
                else expansion_prompt
            ),
            raw_response=length_expansion_raw_response,
            parsed=expansion_parsed if not use_markdown_long_stages else None,
            output={
                "expansion_summary": expansion["expansion_summary"],
                "expanded_word_count": expanded_word_count,
                "transport": expansion_stage_transport,
            },
        )

        if expanded_word_count <= rewritten_word_count:
            break

        rewrite["improved_content"] = expanded_content
        if use_markdown_long_stages:
            title_prompt = (
                V2_TITLE_GENERATION_PROMPT.replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload.get("title_guideline")
                    or "No title guideline provided.",
                )
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace("{source_title}", normalized_title)
                .replace("{rewritten_content}", _llm_context_text(expanded_content))
            )
            generated_title, _ = _invoke_title_generation(
                prompt=title_prompt,
                model_name=selected_model_name,
                fallback_title=_safe_str(rewrite.get("improved_title")) or normalized_title,
            )
            rewrite["improved_title"] = generated_title
            title_pass_applied_count += 1
        rewritten_words = expanded_words
        rewritten_word_count = expanded_word_count
        length_expansion_summary = expansion["expansion_summary"]
        length_expansion_passes += 1
        length_expansion_applied = True

    if length_expansion_applied:
        ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)
        quality_prompt = (
            V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", _llm_context_text(normalized_content))
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload.get("guideline") or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload.get("title_guideline")
                or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
        )
        quality_parsed, quality_raw_response = routes._invoke_json_llm_tracked(
            prompt=quality_prompt,
            stage_name="quality_audit_after_length_expansion",
            parse_metrics=json_parse_metrics,
            max_tokens=1024,
            temperature=0.05,
            model_name=selected_model_name,
        )
        quality = _sanitize_v2_quality_audit(quality_parsed)
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="quality_audit_after_length_expansion",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_title": normalized_title,
                "source_content": _llm_context_text(normalized_content),
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": _llm_context_text(rewrite["improved_content"]),
                "article_type": classification,
                "guideline": guideline_payload.get("guideline")
                or "No guideline provided.",
                "title_guideline": guideline_payload.get("title_guideline")
                or "No title guideline provided.",
                "ngram_overlap": round(ngram_overlap, 3),
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
            },
            prompt=quality_prompt,
            raw_response=quality_raw_response,
            parsed=quality_parsed,
            output=quality,
        )

        if source_fact_anchors:
            fact_coverage_prompt = (
                V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                    "{source_facts}",
                    json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
                )
                .replace("{rewritten_title}", rewrite["improved_title"])
                .replace("{rewritten_content}", _llm_context_text(rewrite["improved_content"]))
            )
            fact_coverage_parsed, fact_coverage_raw_response = routes._invoke_json_llm_tracked(
                prompt=fact_coverage_prompt,
                stage_name="fact_coverage_audit_after_length_expansion",
                parse_metrics=json_parse_metrics,
                max_tokens=1536,
                temperature=0.05,
                model_name=selected_model_name,
            )
            fact_coverage = _sanitize_v2_fact_coverage(
                fact_coverage_parsed, source_fact_anchors
            )
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="fact_coverage_audit_after_length_expansion",
                model_name=selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                input_payload={
                    "source_facts": source_fact_anchors,
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": _llm_context_text(rewrite["improved_content"]),
                },
                prompt=fact_coverage_prompt,
                raw_response=fact_coverage_raw_response,
                parsed=fact_coverage_parsed,
                output=fact_coverage,
            )
    else:
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="length_expansion",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            output={
                "skipped": True,
                "reason": "Length target already met or expansion produced no growth.",
                "current_word_count": rewritten_word_count,
                "min_word_target": min_expanded_word_target,
            },
        )

    write_stage_result(
        run_id,
        "fact_length",
        {
            "created_at": _now_iso(),
            "data": {
                "factual_coverage_score": fact_coverage["coverage_score"],
                "missing_source_facts_count": fact_coverage["missing_count"],
                "missing_high_priority_facts_count": fact_coverage[
                    "missing_high_count"
                ],
                "fact_repair_applied": fact_repair_applied,
                "length_expansion_applied": length_expansion_applied,
                "length_expansion_passes": length_expansion_passes,
                "length_expansion_summary": length_expansion_summary,
                "long_output_transport": long_output_transport,
                "title_pass_applied_count": title_pass_applied_count,
            },
        },
    )

    context.update(
        {
            "json_parse_metrics": json_parse_metrics,
            "stage_trace": stage_trace,
            "rewrite": rewrite,
            "quality": quality,
            "quality_raw_response": quality_raw_response,
            "rewritten_words": rewritten_words,
            "ngram_overlap": ngram_overlap,
            "fact_coverage": fact_coverage,
            "fact_coverage_raw_response": fact_coverage_raw_response,
            "fact_repair_applied": fact_repair_applied,
            "fact_repair_raw_response": fact_repair_raw_response,
            "length_expansion_applied": length_expansion_applied,
            "length_expansion_passes": length_expansion_passes,
            "length_expansion_summary": length_expansion_summary,
            "length_expansion_raw_response": length_expansion_raw_response,
            "long_output_transport": long_output_transport,
            "title_pass_applied_count": title_pass_applied_count,
            "use_markdown_long_stages": use_markdown_long_stages,
            "editorial_blueprint": editorial_blueprint,
            "editorial_blueprint_for_prompt": editorial_blueprint_for_prompt,
        }
    )

    return context


def _pipeline_v2_run_editorial_phase(
    context: dict[str, Any],
) -> dict[str, Any]:
    run_id = _safe_str(context.get("run_id"))
    selected_model_name = _safe_str(context.get("selected_model_name"))
    include_debug = _safe_bool(context.get("include_debug"), default=False)
    narrative_focus = _safe_str(context.get("narrative_focus"))
    enable_editorial_augmentation = _safe_bool(
        context.get("enable_editorial_augmentation"), default=False
    )
    use_editorial_insert_only_post = _safe_bool(
        context.get("use_editorial_insert_only_post"),
        default=URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT,
    )
    classification = _safe_dict(context.get("classification"))
    rewrite = _safe_dict(context.get("rewrite"))
    editorial_blueprint = _safe_dict(context.get("editorial_blueprint"))
    stage_trace = list(context.get("stage_trace") or [])

    json_parse_metrics = _safe_dict(context.get("json_parse_metrics"))
    if not json_parse_metrics:
        json_parse_metrics = {
            "total_parse_failures": 0,
            "recovered_calls": 0,
            "recovered_parse_failures": 0,
            "failures_by_stage": {},
        }

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "editorial_augmentation",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    final_improved_content = _ensure_markdown_section_headers(
        rewrite.get("improved_content") or ""
    )
    pre_editorial_content = final_improved_content
    pre_editorial_word_count = len(_tokenize_similarity_words(pre_editorial_content))
    editorial_augmentation_raw_response = ""
    editorial_augmentation = _sanitize_v2_editorial_augmentation(
        {},
        fallback_content=final_improved_content,
    )
    editorial_insert_only_post_applied = False

    if enable_editorial_augmentation:
        if use_editorial_insert_only_post and _safe_bool(
            editorial_blueprint.get("apply_plan"), default=False
        ):
            editorial_insert_only_post_applied = True
            editorial_augmentation = _build_insert_only_editorial_augmentation(
                fallback_content=final_improved_content,
                editorial_blueprint=editorial_blueprint,
            )
            stage_trace = _pipeline_v2_append_stage_trace(
                stage_trace=stage_trace,
                include_debug=include_debug,
                stage="editorial_augmentation",
                model_name=selected_model_name,
                max_tokens=0,
                temperature=0.0,
                input_payload={
                    "article_title": _safe_str(rewrite.get("improved_title")),
                    "article_content": _llm_context_text(final_improved_content),
                    "article_type": classification,
                    "narrative_focus": narrative_focus,
                    "mode": "insert_only",
                    "editorial_blueprint": editorial_blueprint,
                },
                output={
                    **editorial_augmentation,
                    "mode": "insert_only",
                },
            )
        else:
            augmentation_prompt = (
                V2_EDITORIAL_AUGMENTATION_PROMPT.replace(
                    "{article_title}", _safe_str(rewrite.get("improved_title"))
                )
                .replace("{article_content}", _llm_context_text(final_improved_content))
                .replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
            )

            try:
                augmentation_parsed, editorial_augmentation_raw_response = (
                    routes._invoke_json_llm_tracked(
                        prompt=augmentation_prompt,
                        stage_name="editorial_augmentation",
                        parse_metrics=json_parse_metrics,
                        max_tokens=6144,
                        temperature=0.05,
                        model_name=URL2BLOG_EDITORIAL_AUGMENTATION_MODEL,
                    )
                )
                editorial_augmentation = _sanitize_v2_editorial_augmentation(
                    augmentation_parsed,
                    fallback_content=final_improved_content,
                )
                stage_trace = _pipeline_v2_append_stage_trace(
                    stage_trace=stage_trace,
                    include_debug=include_debug,
                    stage="editorial_augmentation",
                    model_name=URL2BLOG_EDITORIAL_AUGMENTATION_MODEL,
                    max_tokens=6144,
                    temperature=0.05,
                    input_payload={
                        "article_title": _safe_str(rewrite.get("improved_title")),
                        "article_content": _llm_context_text(final_improved_content),
                        "article_type": classification,
                        "narrative_focus": narrative_focus,
                        "mode": "llm",
                    },
                    prompt=augmentation_prompt,
                    raw_response=editorial_augmentation_raw_response,
                    parsed=augmentation_parsed,
                    output={
                        **editorial_augmentation,
                        "mode": "llm",
                    },
                )
            except HTTPException as exc:
                logger.warning(
                    "URL2Blog editorial augmentation failed: %s",
                    exc.detail,
                )
                stage_trace = _pipeline_v2_append_stage_trace(
                    stage_trace=stage_trace,
                    include_debug=include_debug,
                    stage="editorial_augmentation",
                    model_name=URL2BLOG_EDITORIAL_AUGMENTATION_MODEL,
                    max_tokens=6144,
                    temperature=0.05,
                    input_payload={
                        "article_title": _safe_str(rewrite.get("improved_title")),
                        "article_content": _llm_context_text(final_improved_content),
                        "article_type": classification,
                        "narrative_focus": narrative_focus,
                        "mode": "llm",
                    },
                    prompt=augmentation_prompt,
                    error=_safe_str(exc.detail),
                )
    else:
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="editorial_augmentation",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.05,
            output={
                "skipped": True,
                "reason": "Editorial augmentation disabled for this run.",
            },
        )

    final_improved_content = editorial_augmentation["augmented_content"]
    post_editorial_word_count = len(_tokenize_similarity_words(final_improved_content))

    write_stage_result(
        run_id,
        "editorial_augmentation_stage",
        {
            "created_at": _now_iso(),
            "data": {
                "editorial_augmentation_applied": editorial_augmentation[
                    "augmentation_applied"
                ],
                "pre_editorial_word_count": pre_editorial_word_count,
                "post_editorial_word_count": post_editorial_word_count,
                "editorial_components_added": [
                    item["component"]
                    for item in editorial_augmentation["components_added"]
                ],
                "editorial_augmentation_summary": editorial_augmentation[
                    "augmentation_summary"
                ],
                "editorial_insert_only_post_applied": editorial_insert_only_post_applied,
            },
        },
    )

    context.update(
        {
            "json_parse_metrics": json_parse_metrics,
            "stage_trace": stage_trace,
            "editorial_augmentation": editorial_augmentation,
            "editorial_augmentation_raw_response": editorial_augmentation_raw_response,
            "pre_editorial_content": pre_editorial_content,
            "pre_editorial_word_count": pre_editorial_word_count,
            "post_editorial_word_count": post_editorial_word_count,
            "final_improved_content": final_improved_content,
            "editorial_insert_only_post_applied": editorial_insert_only_post_applied,
        }
    )

    return context


def _pipeline_v2_run_editorial_post_recheck_phase(
    context: dict[str, Any],
) -> dict[str, Any]:
    """Run post-editorial quality/fact recheck with rollback fallback."""
    run_id = _safe_str(context.get("run_id"))
    selected_model_name = _safe_str(context.get("selected_model_name"))
    include_debug = _safe_bool(context.get("include_debug"), default=False)
    narrative_focus = _safe_str(context.get("narrative_focus"))
    normalized_title = _safe_str(context.get("normalized_title"))
    normalized_content = _safe_str(context.get("normalized_content"))
    classification = _safe_dict(context.get("classification"))
    guideline_payload = _safe_dict(context.get("guideline_payload"))
    rewrite = _safe_dict(context.get("rewrite"))
    source_fact_anchors = list(context.get("source_fact_anchors") or [])
    external_context_for_prompt = _safe_str(
        context.get("external_context_for_prompt")
    ) or "No external context collected."
    stage_trace = list(context.get("stage_trace") or [])
    json_parse_metrics = _safe_dict(context.get("json_parse_metrics"))
    if not json_parse_metrics:
        json_parse_metrics = {
            "total_parse_failures": 0,
            "recovered_calls": 0,
            "recovered_parse_failures": 0,
            "failures_by_stage": {},
        }

    use_editorial_post_recheck = _safe_bool(
        context.get("use_editorial_post_recheck"),
        default=URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT,
    )
    editorial_augmentation = _safe_dict(context.get("editorial_augmentation"))
    editorial_augmentation_applied = _safe_bool(
        editorial_augmentation.get("augmentation_applied"),
        default=False,
    )
    final_improved_content = _safe_str(
        context.get("final_improved_content")
        or editorial_augmentation.get("augmented_content")
    )
    if not final_improved_content:
        final_improved_content = _ensure_markdown_section_headers(
            _safe_str(rewrite.get("improved_content"))
        )

    if not use_editorial_post_recheck or not editorial_augmentation_applied:
        editorial_post_recheck = {
            "decision": "skipped",
            "pass_mode": "skipped",
            "reason": (
                "Post-editorial recheck disabled."
                if not use_editorial_post_recheck
                else "Editorial augmentation not applied."
            ),
        }
        stage_trace = _pipeline_v2_append_stage_trace(
            stage_trace=stage_trace,
            include_debug=include_debug,
            stage="editorial_post_recheck",
            model_name=selected_model_name,
            output=editorial_post_recheck,
        )
        context.update(
            {
                "stage_trace": stage_trace,
                "editorial_post_recheck": editorial_post_recheck,
            }
        )
        return context

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "editorial_post_recheck",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    source_words = list(context.get("source_words") or [])
    if not source_words:
        source_words = _tokenize_similarity_words(normalized_content)
    post_editorial_words = _tokenize_similarity_words(final_improved_content)
    post_editorial_ngram_overlap = _ngram_overlap_ratio(
        source_words, post_editorial_words, n=10
    )

    quality_prompt = (
        V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
        .replace("{source_content}", _llm_context_text(normalized_content))
        .replace("{rewritten_title}", _safe_str(rewrite.get("improved_title")))
        .replace("{rewritten_content}", _llm_context_text(final_improved_content))
        .replace(
            "{article_type}",
            json.dumps(classification, ensure_ascii=False, indent=2),
        )
        .replace(
            "{guideline}",
            guideline_payload.get("guideline") or "No guideline provided.",
        )
        .replace(
            "{title_guideline}",
            guideline_payload.get("title_guideline")
            or "No title guideline provided.",
        )
        .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
        .replace("{ngram_overlap}", f"{post_editorial_ngram_overlap:.3f}")
        .replace(
            "{narrative_focus}",
            narrative_focus or "No additional narrative focus provided.",
        )
        .replace("{external_context}", external_context_for_prompt)
    )
    quality_parsed, editorial_post_quality_raw_response = routes._invoke_json_llm_tracked(
        prompt=quality_prompt,
        stage_name="editorial_post_recheck_quality_audit",
        parse_metrics=json_parse_metrics,
        max_tokens=1024,
        temperature=0.05,
        model_name=selected_model_name,
    )
    post_quality = _sanitize_v2_quality_audit(quality_parsed)

    fact_coverage_prompt = ""
    editorial_post_fact_coverage_raw_response = ""
    post_fact_coverage = _sanitize_v2_fact_coverage({}, source_fact_anchors)
    if source_fact_anchors:
        fact_coverage_prompt = (
            V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                "{source_facts}",
                json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
            )
            .replace("{rewritten_title}", _safe_str(rewrite.get("improved_title")))
            .replace("{rewritten_content}", _llm_context_text(final_improved_content))
        )
        (
            fact_coverage_parsed,
            editorial_post_fact_coverage_raw_response,
        ) = routes._invoke_json_llm_tracked(
            prompt=fact_coverage_prompt,
            stage_name="editorial_post_recheck_fact_coverage",
            parse_metrics=json_parse_metrics,
            max_tokens=1536,
            temperature=0.05,
            model_name=selected_model_name,
        )
        post_fact_coverage = _sanitize_v2_fact_coverage(
            fact_coverage_parsed, source_fact_anchors
        )

    quality_score = float(post_quality.get("overall_score") or 0.0)
    fact_score = float(post_fact_coverage.get("coverage_score") or 0.0)
    missing_high_count = int(post_fact_coverage.get("missing_high_count") or 0)
    too_close_to_source = _safe_bool(
        post_quality.get("too_close_to_source"), default=False
    )

    strict_pass = (
        quality_score >= URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE
        and fact_score >= URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE
        and missing_high_count == 0
        and not too_close_to_source
        and post_editorial_ngram_overlap <= 0.90
    )
    near_pass = (
        quality_score
        >= (
            URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE
            - URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN
        )
        and fact_score
        >= (
            URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE
            - URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN
        )
        and missing_high_count == 0
        and not too_close_to_source
        and post_editorial_ngram_overlap <= 0.93
    )

    if strict_pass:
        decision = "pass"
        pass_mode = "strict"
    elif near_pass:
        decision = "pass"
        pass_mode = "near_pass"
    else:
        decision = "rollback"
        pass_mode = "rollback_after_failed_recheck"

    rollback_data: dict[str, Any] = {}
    if decision == "rollback":
        pre_editorial_content = _safe_str(context.get("pre_editorial_content"))
        if pre_editorial_content:
            restored_word_count = len(_tokenize_similarity_words(pre_editorial_content))
            context["final_improved_content"] = pre_editorial_content
            context["post_editorial_word_count"] = restored_word_count
            existing_summary = _safe_str(editorial_augmentation.get("augmentation_summary"))
            editorial_augmentation.update(
                {
                    "augmentation_applied": False,
                    "components_added": [],
                    "augmentation_summary": (
                        f"{existing_summary} Rolled back after post-editorial recheck."
                    ).strip(),
                }
            )
            context["editorial_augmentation"] = editorial_augmentation
            rollback_data = {
                "restored_from": "pre_editorial_content",
                "restored_word_count": restored_word_count,
            }
        else:
            rollback_data = {
                "restored_from": "none",
                "reason": "pre_editorial_content_missing",
            }
    else:
        context["quality"] = post_quality
        context["quality_raw_response"] = editorial_post_quality_raw_response
        context["fact_coverage"] = post_fact_coverage
        context["fact_coverage_raw_response"] = editorial_post_fact_coverage_raw_response
        context["ngram_overlap"] = post_editorial_ngram_overlap

    editorial_post_recheck = {
        "decision": decision,
        "pass_mode": pass_mode,
        "quality_score": quality_score,
        "fact_coverage_score": fact_score,
        "missing_high_count": missing_high_count,
        "too_close_to_source": too_close_to_source,
        "ngram_overlap": round(post_editorial_ngram_overlap, 3),
        "quality_threshold": URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE,
        "fact_threshold": URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE,
        "near_pass_margin": URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN,
        "rollback_data": rollback_data,
    }

    stage_trace = _pipeline_v2_append_stage_trace(
        stage_trace=stage_trace,
        include_debug=include_debug,
        stage="editorial_post_recheck",
        model_name=selected_model_name,
        max_tokens=1536,
        temperature=0.05,
        input_payload={
            "rewritten_title": _safe_str(rewrite.get("improved_title")),
            "rewritten_content": _llm_context_text(final_improved_content),
            "article_type": classification,
            "narrative_focus": narrative_focus,
            "source_facts_count": len(source_fact_anchors),
        },
        output={
            **editorial_post_recheck,
            "quality_summary": _safe_str(post_quality.get("quality_summary")),
            "factual_coverage_summary": _safe_str(
                post_fact_coverage.get("coverage_summary")
            ),
        },
    )
    write_stage_result(
        run_id,
        "editorial_post_recheck",
        {"created_at": _now_iso(), "data": editorial_post_recheck},
    )
    if rollback_data:
        write_stage_result(
            run_id,
            "editorial_post_recheck_rollback",
            {"created_at": _now_iso(), "data": rollback_data},
        )

    context.update(
        {
            "json_parse_metrics": json_parse_metrics,
            "stage_trace": stage_trace,
            "editorial_post_recheck": editorial_post_recheck,
            "editorial_post_quality_raw_response": editorial_post_quality_raw_response,
            "editorial_post_fact_coverage_raw_response": (
                editorial_post_fact_coverage_raw_response
            ),
        }
    )
    return context


def _pipeline_v2_finalize_response(
    context: dict[str, Any],
) -> JSONResponse:
    run_id = _safe_str(context.get("run_id"))
    url = _safe_str(context.get("url"))
    include_debug = _safe_bool(context.get("include_debug"), default=False)
    narrative_focus = _safe_str(context.get("narrative_focus"))
    selected_model_name = _safe_str(context.get("selected_model_name"))
    execution_profile = _safe_str(context.get("execution_profile"))

    parsed_article = _safe_dict(context.get("parsed_article"))
    was_translated = _safe_bool(context.get("was_translated"), default=False)
    normalized_title = _safe_str(context.get("normalized_title"))
    normalized_content = _safe_str(context.get("normalized_content"))
    normalized_language = _safe_str(context.get("normalized_language"))

    source_word_count = _safe_int(
        context.get("source_word_count"),
        default=0,
        min_value=0,
        max_value=200_000,
    )
    min_expanded_word_target = _safe_int(
        context.get("min_expanded_word_target"),
        default=0,
        min_value=0,
        max_value=300_000,
    )

    classification = _safe_dict(context.get("classification"))
    guideline_payload = _safe_dict(context.get("guideline_payload"))
    rewrite_quality_gate = _safe_dict(context.get("rewrite_quality_gate"))
    fact_gate = _safe_dict(context.get("fact_gate"))
    editorial_gate = _safe_dict(context.get("editorial_gate"))

    stage1_payload = _safe_dict(context.get("stage1_payload"))
    stage2_payload = _safe_dict(context.get("stage2_payload"))

    rewrite = _safe_dict(context.get("rewrite"))
    quality = _safe_dict(context.get("quality"))
    fact_coverage = _safe_dict(context.get("fact_coverage"))
    editorial_augmentation = _safe_dict(context.get("editorial_augmentation"))
    editorial_blueprint = _safe_dict(context.get("editorial_blueprint"))
    editorial_post_recheck = _safe_dict(context.get("editorial_post_recheck"))

    if not rewrite:
        raise HTTPException(status_code=500, detail="Rewrite output missing")

    if not quality:
        quality = _sanitize_v2_quality_audit({})

    if not fact_coverage:
        fact_coverage = _sanitize_v2_fact_coverage({}, [])

    if not editorial_augmentation:
        fallback_content = _ensure_markdown_section_headers(
            _safe_str(rewrite.get("improved_content"))
        )
        editorial_augmentation = _sanitize_v2_editorial_augmentation(
            {},
            fallback_content=fallback_content,
        )

    final_improved_content = _safe_str(
        context.get("final_improved_content")
        or editorial_augmentation.get("augmented_content")
    )

    rewrite_raw_response = _safe_str(context.get("rewrite_raw_response"))
    repair_raw_response = _safe_str(context.get("repair_raw_response"))
    quality_raw_response = _safe_str(context.get("quality_raw_response"))
    source_facts_raw_response = _safe_str(context.get("source_facts_raw_response"))
    fact_coverage_raw_response = _safe_str(context.get("fact_coverage_raw_response"))
    fact_repair_raw_response = _safe_str(context.get("fact_repair_raw_response"))
    length_expansion_raw_response = _safe_str(
        context.get("length_expansion_raw_response")
    )
    editorial_augmentation_raw_response = _safe_str(
        context.get("editorial_augmentation_raw_response")
    )
    editorial_blueprint_raw_response = _safe_str(
        context.get("editorial_blueprint_raw_response")
    )
    editorial_post_quality_raw_response = _safe_str(
        context.get("editorial_post_quality_raw_response")
    )
    editorial_post_fact_coverage_raw_response = _safe_str(
        context.get("editorial_post_fact_coverage_raw_response")
    )

    stage_trace = list(context.get("stage_trace") or [])
    json_parse_metrics = _safe_dict(context.get("json_parse_metrics"))

    external_context_points = list(context.get("external_context_points") or [])
    external_context_usage_note = _safe_str(context.get("external_context_usage_note"))
    external_context_raw_response = _safe_str(context.get("external_context_raw_response"))
    external_context_grounded_urls = list(
        context.get("external_context_grounded_urls") or []
    )
    short_article_enrichment_applied = _safe_bool(
        context.get("short_article_enrichment_applied"), default=False
    )
    source_fact_anchors = list(context.get("source_fact_anchors") or [])

    length_expansion_applied = _safe_bool(
        context.get("length_expansion_applied"), default=False
    )
    length_expansion_passes = _safe_int(
        context.get("length_expansion_passes"),
        default=0,
        min_value=0,
        max_value=MAX_LENGTH_EXPANSION_PASSES,
    )
    length_expansion_summary = _safe_str(context.get("length_expansion_summary"))
    fact_repair_applied = _safe_bool(context.get("fact_repair_applied"), default=False)
    second_pass_applied = _safe_bool(context.get("second_pass_applied"), default=False)
    use_markdown_long_stages = _safe_bool(
        context.get("use_markdown_long_stages"),
        default=URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
    )
    use_editorial_blueprint = _safe_bool(
        context.get("use_editorial_blueprint"),
        default=URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT,
    )
    use_editorial_insert_only_post = _safe_bool(
        context.get("use_editorial_insert_only_post"),
        default=URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT,
    )
    use_editorial_post_recheck = _safe_bool(
        context.get("use_editorial_post_recheck"),
        default=URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT,
    )
    editorial_blueprint_applied = _safe_bool(
        context.get("editorial_blueprint_applied"),
        default=(
            _safe_bool(editorial_blueprint.get("apply_plan"), default=False)
            and bool(list(editorial_blueprint.get("components") or []))
        ),
    )
    editorial_insert_only_post_applied = _safe_bool(
        context.get("editorial_insert_only_post_applied"), default=False
    )
    long_output_transport = _safe_str(context.get("long_output_transport")) or (
        "markdown" if use_markdown_long_stages else "json"
    )
    title_pass_applied_count = _safe_int(
        context.get("title_pass_applied_count"),
        default=0,
        min_value=0,
        max_value=99,
    )

    ngram_overlap = float(context.get("ngram_overlap") or 0.0)

    final_word_count = len(_tokenize_similarity_words(final_improved_content))
    length_requirement_met = final_word_count >= min_expanded_word_target
    pipeline_status = (
        "ready_for_drafting" if length_requirement_met else "needs_revision"
    )
    length_requirement_blocking_reason = ""
    if not length_requirement_met:
        length_requirement_blocking_reason = (
            "Final article length is below minimum expansion target "
            f"({final_word_count} < {min_expanded_word_target} words)."
        )

    final_markdown = _build_markdown(
        _safe_str(rewrite.get("improved_title")),
        final_improved_content,
    )

    stage_trace = _pipeline_v2_append_stage_trace(
        stage_trace=stage_trace,
        include_debug=include_debug,
        stage="finalize_output",
        output={
            "improved_title": _safe_str(rewrite.get("improved_title")),
            "improved_content": final_improved_content,
            "final_markdown": final_markdown,
            "pipeline_status": pipeline_status,
            "final_word_count": final_word_count,
            "min_expanded_word_target": min_expanded_word_target,
            "length_requirement_met": length_requirement_met,
            "length_requirement_blocking_reason": length_requirement_blocking_reason,
        },
    )

    response_payload: dict[str, Any] = {
        "message": "URL2Blog simple pipeline completed",
        "run_id": run_id,
        "pipeline_status": pipeline_status,
        "article": {
            "source_url": url,
            "original_title": normalized_title,
            "original_excerpt": _build_excerpt(normalized_content),
            "language": normalized_language,
            "original_language": _safe_str(parsed_article.get("language")),
            "translated": was_translated,
        },
        "selected_article_type": {
            "id": classification.get("id"),
            "name": _safe_str(classification.get("name")),
            "confidence": classification.get("confidence"),
            "reasoning": _safe_str(classification.get("reasoning")),
        },
        "guideline_meta": {
            "id": guideline_payload.get("id"),
            "name": guideline_payload.get("name"),
        },
        "improved_article": {
            "title": _safe_str(rewrite.get("improved_title")),
            "content": final_improved_content,
        },
        "final_markdown": final_markdown,
        "guideline_review": {
            "alignment_summary": _safe_str(rewrite.get("guideline_alignment_summary")),
            "improvements_applied": list(rewrite.get("improvements_applied") or []),
            "remaining_gaps": list(rewrite.get("remaining_gaps") or []),
            "narrative_focus_applied": narrative_focus,
            "model_used": selected_model_name,
            "execution_profile": execution_profile,
            "source_word_count": source_word_count,
            "final_word_count": final_word_count,
            "min_expanded_word_target": min_expanded_word_target,
            "length_requirement_met": length_requirement_met,
            "length_requirement_blocking_reason": length_requirement_blocking_reason,
            "length_expansion_applied": length_expansion_applied,
            "length_expansion_passes": length_expansion_passes,
            "length_expansion_summary": length_expansion_summary,
            "short_article_enrichment_applied": short_article_enrichment_applied,
            "external_context_points_used": len(external_context_points),
            "external_context_usage_note": external_context_usage_note,
            "source_facts_extracted_count": len(source_fact_anchors),
            "factual_coverage_summary": _safe_str(fact_coverage.get("coverage_summary")),
            "factual_coverage_score": fact_coverage.get("coverage_score"),
            "missing_source_facts_count": fact_coverage.get("missing_count"),
            "missing_high_priority_facts_count": fact_coverage.get("missing_high_count"),
            "fact_repair_applied": fact_repair_applied,
            "quality_summary": _safe_str(quality.get("quality_summary")),
            "editorial_blueprint_applied": editorial_blueprint_applied,
            "editorial_blueprint_components_planned": [
                _safe_str(item.get("component"))
                for item in list(editorial_blueprint.get("components") or [])
                if isinstance(item, dict)
            ],
            "editorial_insert_only_post_applied": editorial_insert_only_post_applied,
            "editorial_augmentation_applied": _safe_bool(
                editorial_augmentation.get("augmentation_applied"), default=False
            ),
            "editorial_components_added": [
                item.get("component")
                for item in list(editorial_augmentation.get("components_added") or [])
                if isinstance(item, dict)
            ],
            "editorial_augmentation_summary": _safe_str(
                editorial_augmentation.get("augmentation_summary")
            ),
            "editorial_diagnostic": _safe_dict(
                editorial_augmentation.get("diagnostic")
            ),
            "quality_scores": {
                "overall": quality.get("overall_score"),
                "guideline_coverage": quality.get("guideline_coverage_score"),
                "informativeness": quality.get("informativeness_score"),
                "originality": quality.get("originality_score"),
            },
            "second_pass_applied": second_pass_applied,
            "long_output_transport": long_output_transport,
            "title_pass_applied_count": title_pass_applied_count,
            "similarity_ngram_overlap": round(ngram_overlap, 3),
            "json_parse_failures_total": _safe_int(
                json_parse_metrics.get("total_parse_failures"),
                default=0,
                min_value=0,
                max_value=9999,
            ),
            "json_parse_recovered_calls": _safe_int(
                json_parse_metrics.get("recovered_calls"),
                default=0,
                min_value=0,
                max_value=9999,
            ),
            "json_parse_recovered_failures": _safe_int(
                json_parse_metrics.get("recovered_parse_failures"),
                default=0,
                min_value=0,
                max_value=9999,
            ),
            "json_parse_failures_by_stage": _safe_dict(
                json_parse_metrics.get("failures_by_stage")
            ),
            "rewrite_quality_gate_decision": _safe_str(
                rewrite_quality_gate.get("decision")
            )
            or "pass",
            "rewrite_quality_gate_pass_mode": _safe_str(
                rewrite_quality_gate.get("pass_mode")
            )
            or "strict",
            "fact_gate_decision": _safe_str(fact_gate.get("decision")) or "pass",
            "fact_gate_pass_mode": _safe_str(fact_gate.get("pass_mode")) or "strict",
            "editorial_gate_decision": _safe_str(editorial_gate.get("decision"))
            or "pass",
            "editorial_post_recheck_decision": _safe_str(
                editorial_post_recheck.get("decision")
            )
            or "skipped",
            "editorial_post_recheck_pass_mode": _safe_str(
                editorial_post_recheck.get("pass_mode")
            )
            or "skipped",
            "editorial_post_recheck_quality_score": editorial_post_recheck.get(
                "quality_score"
            ),
            "editorial_post_recheck_fact_coverage_score": editorial_post_recheck.get(
                "fact_coverage_score"
            ),
        },
    }

    translation_error = _safe_str(stage1_payload.get("translation_error"))
    if translation_error:
        response_payload["article"]["translation_error"] = translation_error

    if include_debug:
        response_payload["debug"] = {
            "pipeline_input": {
                "url": url,
                "include_debug": include_debug,
                "narrative_focus": narrative_focus,
                "execution_profile": execution_profile,
                "enable_web_enrichment": _safe_bool(
                    context.get("enable_web_enrichment"), default=False
                ),
                "enable_editorial_augmentation": _safe_bool(
                    context.get("enable_editorial_augmentation"), default=False
                ),
                "max_external_context_items": _safe_int(
                    context.get("max_external_context_items"),
                    default=DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
                    min_value=1,
                    max_value=5,
                ),
                "model_name": selected_model_name,
                "use_markdown_long_stages": use_markdown_long_stages,
                "long_output_transport": long_output_transport,
                "use_editorial_blueprint": use_editorial_blueprint,
                "use_editorial_insert_only_post": use_editorial_insert_only_post,
                "use_editorial_post_recheck": use_editorial_post_recheck,
            },
            "guideline": guideline_payload,
            "article_original_content": normalized_content,
            "stage1": stage1_payload,
            "stage2": stage2_payload,
            "pipeline_trace": stage_trace,
            "rewrite_raw_response": rewrite_raw_response,
            "repair_raw_response": repair_raw_response,
            "quality_raw_response": quality_raw_response,
            "quality_required_revisions": list(quality.get("required_revisions") or []),
            "narrative_focus": narrative_focus,
            "model_name": selected_model_name,
            "external_context_points": external_context_points,
            "external_context_usage_note": external_context_usage_note,
            "external_context_raw_response": external_context_raw_response,
            "external_context_grounded_urls": external_context_grounded_urls,
            "source_fact_anchors": source_fact_anchors,
            "source_facts_raw_response": source_facts_raw_response,
            "fact_coverage_raw_response": fact_coverage_raw_response,
            "fact_coverage_missing_facts": list(fact_coverage.get("missing_facts") or []),
            "fact_repair_raw_response": fact_repair_raw_response,
            "length_expansion_raw_response": length_expansion_raw_response,
            "editorial_blueprint_raw_response": editorial_blueprint_raw_response,
            "editorial_blueprint": editorial_blueprint,
            "editorial_augmentation_raw_response": editorial_augmentation_raw_response,
            "editorial_components_added": list(
                editorial_augmentation.get("components_added") or []
            ),
            "editorial_diagnostic": _safe_dict(editorial_augmentation.get("diagnostic")),
            "editorial_post_quality_raw_response": editorial_post_quality_raw_response,
            "editorial_post_fact_coverage_raw_response": (
                editorial_post_fact_coverage_raw_response
            ),
            "editorial_post_recheck": editorial_post_recheck,
            "json_parse_metrics": json_parse_metrics,
            "title_pass_applied_count": title_pass_applied_count,
            "long_output_transport": long_output_transport,
            "graph_gates": {
                "rewrite_quality_gate": rewrite_quality_gate,
                "fact_gate": fact_gate,
                "editorial_gate": editorial_gate,
                "editorial_post_recheck": editorial_post_recheck,
            },
        }

    write_stage_result(
        run_id,
        "pipeline_v2",
        {"created_at": _now_iso(), "data": response_payload},
    )
    write_artifact(
        run_id,
        {
            "markdown": final_markdown,
            "pipeline_v2": response_payload,
            "stages": {
                "stage_1": stage1_payload,
                "stage_2": stage2_payload,
            },
        },
    )
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    return JSONResponse(response_payload)

