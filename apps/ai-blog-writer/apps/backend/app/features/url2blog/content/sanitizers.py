"""Sanitizers that normalize raw LLM JSON for each pipeline v2 stage.

Extracted verbatim from url2blog/routes.py.
"""

import math
from typing import Any

from ..llm.coerce import *  # noqa: F401,F403
from ..config import *  # noqa: F401,F403
from ..prompts import *  # noqa: F401,F403
from .markdown import (  # noqa: F401
    _ensure_markdown_section_headers,
    _remove_academic_conclusion_phrases,
)
from .editorial_blocks import *  # noqa: F401,F403


def _sanitize_v2_guideline_rewrite(
    parsed: dict[str, Any],
    *,
    fallback_title: str,
    fallback_content: str,
) -> dict[str, Any]:
    """Normalize simplified guideline rewrite output."""
    improved_title = _safe_str(parsed.get("improved_title")) or fallback_title
    improved_content = _safe_str(parsed.get("improved_content")) or fallback_content
    improved_content = _remove_academic_conclusion_phrases(improved_content)
    guideline_alignment_summary = _safe_str(parsed.get("guideline_alignment_summary"))
    if not guideline_alignment_summary:
        guideline_alignment_summary = (
            "Article was revised for stronger guideline alignment, clearer flow, and "
            "more consistent editorial tone."
        )
    guideline_alignment_summary = _remove_academic_conclusion_phrases(
        guideline_alignment_summary
    )

    improvements_applied = _safe_string_list(parsed.get("improvements_applied"))
    if not improvements_applied:
        improvements_applied = [
            "Tightened structure and transitions between sections.",
            "Improved editorial clarity and consistency.",
            "Adjusted wording to better match article-type guidance.",
        ]

    return {
        "improved_title": improved_title,
        "improved_content": improved_content,
        "guideline_alignment_summary": guideline_alignment_summary,
        "improvements_applied": improvements_applied,
        "remaining_gaps": _safe_string_list(parsed.get("remaining_gaps")),
    }


def _resolve_min_expanded_word_target(source_word_count: int) -> int:
    """Return minimum required word count for expanded output."""
    baseline = max(source_word_count + 1, source_word_count + MIN_EXPANDED_WORD_DELTA)
    ratio_target = int(math.ceil(source_word_count * MIN_EXPANDED_WORD_RATIO))
    return max(baseline, ratio_target)


def _sanitize_v2_length_expansion(
    parsed: dict[str, Any], *, fallback_content: str
) -> dict[str, str]:
    """Normalize length-expansion output."""
    expanded_content = _safe_str(parsed.get("expanded_content")) or fallback_content
    expanded_content = _remove_academic_conclusion_phrases(expanded_content)
    expanded_content = _ensure_markdown_section_headers(expanded_content)

    expansion_summary = _safe_str(parsed.get("expansion_summary"))
    if not expansion_summary:
        expansion_summary = (
            "Expanded article depth while preserving factual integrity and structure."
        )

    return {
        "expanded_content": expanded_content,
        "expansion_summary": expansion_summary,
    }


def _sanitize_v2_editorial_blueprint(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalize editorial blueprint planning output."""
    components: list[dict[str, str]] = []
    seen_components: set[str] = set()
    raw_components = parsed.get("components")
    if isinstance(raw_components, list):
        for item in raw_components:
            if not isinstance(item, dict):
                continue
            component = _normalize_editorial_component_name(_safe_str(item.get("component")))
            if not component or component in seen_components:
                continue
            seen_components.add(component)

            priority_raw = _safe_str(item.get("priority")).lower()
            priority = "high" if priority_raw == "high" else "medium"
            components.append(
                {
                    "component": component,
                    "placement": _safe_str(item.get("placement")),
                    "objective": _safe_str(item.get("objective")),
                    "priority": priority,
                }
            )
            if len(components) >= URL2BLOG_EDITORIAL_BLUEPRINT_MAX_COMPONENTS:
                break

    apply_plan = _safe_bool(parsed.get("apply_plan"), default=bool(components))
    if not apply_plan:
        components = []

    summary = _safe_str(parsed.get("summary"))
    if not summary:
        summary = (
            "No editorial blueprint needed before drafting."
            if not apply_plan
            else "Apply a restrained editorial blueprint during drafting."
        )

    drafting_directives = _safe_string_list(parsed.get("drafting_directives"))[:8]
    if apply_plan and not drafting_directives:
        drafting_directives = [
            "Integrate planned editorial components naturally in relevant sections.",
            "Preserve factual scope and avoid introducing new claims.",
            "Keep component content concise and non-redundant with nearby prose.",
        ]

    guardrails = _safe_string_list(parsed.get("guardrails"))[:8]
    if not guardrails:
        guardrails = [
            "Do not add facts not present in source or approved context.",
            "Use editorial blocks only when they improve clarity or skimmability.",
            "Avoid duplicating the same insight in prose and component boxes.",
        ]

    return {
        "apply_plan": apply_plan,
        "summary": summary,
        "components": components,
        "drafting_directives": drafting_directives,
        "guardrails": guardrails,
    }


def _sanitize_editorial_diagnostic_axis(value: Any) -> str:
    """Normalize diagnostic axis values for editorial augmentation."""
    if isinstance(value, bool):
        return "weak" if value else "strong"

    normalized = _safe_str(value).lower()
    weak_values = {
        "weak",
        "needs_support",
        "needs support",
        "high",
        "high_risk",
        "at_risk",
        "risky",
        "yes",
    }
    if normalized in weak_values:
        return "weak"
    return "strong"


def _sanitize_v2_editorial_augmentation(
    parsed: dict[str, Any], *, fallback_content: str
) -> dict[str, Any]:
    """Normalize final editorial augmentation output."""
    fallback_markdown = _ensure_markdown_section_headers(fallback_content)
    augmented_content = _safe_str(parsed.get("augmented_content"))
    if not augmented_content:
        augmented_content = fallback_markdown

    augmented_content = _remove_academic_conclusion_phrases(augmented_content)
    augmented_content = _ensure_markdown_section_headers(augmented_content)

    components_added: list[dict[str, str]] = []
    raw_components = parsed.get("components_added")
    if isinstance(raw_components, list):
        for item in raw_components:
            if not isinstance(item, dict):
                continue
            component = _normalize_editorial_component_name(
                _safe_str(item.get("component"))
            )
            if not component:
                continue
            components_added.append(
                {
                    "component": component,
                    "justification": _safe_str(item.get("justification")),
                    "placement": _safe_str(item.get("placement")),
                }
            )
            if len(components_added) >= 5:
                break

    if components_added:
        augmented_content = _ensure_editorial_component_boxes(
            augmented_content,
            components_added,
        )

    # Editorial augmentation should not collapse the core article body.
    fallback_word_count = len(_tokenize_similarity_words(fallback_markdown))
    augmented_word_count = len(_tokenize_similarity_words(augmented_content))
    if augmented_word_count < fallback_word_count:
        augmented_content = _ensure_editorial_component_boxes(
            fallback_markdown,
            components_added,
        )
        augmented_word_count = len(_tokenize_similarity_words(augmented_content))

    diagnostic_raw = _safe_dict(parsed.get("diagnostic"))
    diagnostic = {
        "cognitive_load": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("cognitive_load")
        ),
        "narrative_density": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("narrative_density")
        ),
        "emphasis_clarity": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("emphasis_clarity")
        ),
        "reading_behavior_risk": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("reading_behavior_risk")
        ),
    }

    augmentation_summary = _safe_str(parsed.get("augmentation_summary"))
    if not augmentation_summary:
        if components_added:
            component_names = ", ".join(item["component"] for item in components_added)
            augmentation_summary = (
                "Applied restrained editorial augmentation: " f"{component_names}."
            )
        else:
            augmentation_summary = (
                "No editorial augmentation added; the draft already read clearly."
            )

    augmentation_applied = (
        bool(components_added)
        and _normalize_markdown_for_comparison(augmented_content)
        != _normalize_markdown_for_comparison(fallback_markdown)
    )

    return {
        "augmented_content": augmented_content,
        "components_added": components_added,
        "diagnostic": diagnostic,
        "augmentation_summary": augmentation_summary,
        "augmentation_applied": augmentation_applied,
    }


def _sanitize_v2_quality_audit(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalize quality audit output."""
    overall_score = _safe_int(
        parsed.get("overall_score"), default=6, min_value=1, max_value=10
    )
    guideline_coverage_score = _safe_int(
        parsed.get("guideline_coverage_score"), default=6, min_value=1, max_value=10
    )
    informativeness_score = _safe_int(
        parsed.get("informativeness_score"), default=6, min_value=1, max_value=10
    )
    originality_score = _safe_int(
        parsed.get("originality_score"), default=6, min_value=1, max_value=10
    )
    too_close_to_source = _safe_bool(parsed.get("too_close_to_source"), default=False)

    required_revisions = _safe_string_list(parsed.get("required_revisions"))
    if not required_revisions and (
        overall_score < 8
        or guideline_coverage_score < 8
        or informativeness_score < 8
        or originality_score < 8
        or too_close_to_source
    ):
        required_revisions = [
            "Strengthen guideline alignment with clearer section-level intent.",
            "Add more concrete reader value and practical utility.",
            "Increase structural and phrasing distance from source.",
        ]

    quality_summary = _safe_str(parsed.get("quality_summary"))
    if not quality_summary:
        quality_summary = (
            "Quality audit completed with focus on guideline fit, informativeness, "
            "and structural originality."
        )

    return {
        "overall_score": overall_score,
        "guideline_coverage_score": guideline_coverage_score,
        "informativeness_score": informativeness_score,
        "originality_score": originality_score,
        "too_close_to_source": too_close_to_source,
        "required_revisions": required_revisions,
        "quality_summary": quality_summary,
    }


def _sanitize_v2_external_context(
    parsed: dict[str, Any],
    *,
    max_points: int,
    fallback_urls: list[str] | None = None,
) -> dict[str, Any]:
    """Normalize externally grounded context points for short-article enrichment."""
    points: list[dict[str, str]] = []
    raw_points = parsed.get("context_points")
    if isinstance(raw_points, list):
        for item in raw_points:
            if not isinstance(item, dict):
                continue
            insight = _safe_str(item.get("insight"))
            why_it_matters = _safe_str(item.get("why_it_matters"))
            source_url = _safe_str(item.get("source_url"))
            confidence = _safe_str(item.get("confidence")).lower()
            if confidence not in {"high", "medium"}:
                confidence = "medium"

            if not insight:
                continue
            points.append(
                {
                    "insight": insight,
                    "why_it_matters": why_it_matters,
                    "source_url": source_url,
                    "confidence": confidence,
                }
            )
            if len(points) >= max_points:
                break

    if not points and fallback_urls:
        for url in fallback_urls[:max_points]:
            if not _safe_str(url):
                continue
            points.append(
                {
                    "insight": "Supplemental external context was identified.",
                    "why_it_matters": "Can provide additional reader-facing depth for short source articles.",
                    "source_url": url,
                    "confidence": "medium",
                }
            )

    usage_note = _safe_str(parsed.get("usage_note"))
    if not usage_note:
        usage_note = (
            "Use external context sparingly and only where it clearly deepens reader value."
        )

    return {
        "context_points": points,
        "usage_note": usage_note,
    }


def _sanitize_v2_source_facts(
    parsed: dict[str, Any], *, max_facts: int = 18
) -> list[dict[str, str]]:
    """Normalize extracted source facts used for retention checks."""
    allowed_categories = {
        "numbers",
        "names",
        "amenities",
        "policies",
        "pricing",
        "logistics",
        "other",
    }
    facts: list[dict[str, str]] = []
    seen: set[str] = set()

    raw_facts = parsed.get("facts")
    if isinstance(raw_facts, list):
        for idx, item in enumerate(raw_facts, start=1):
            if not isinstance(item, dict):
                continue
            fact = _safe_str(item.get("fact"))
            if not fact:
                continue
            dedupe_key = fact.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            priority = _safe_str(item.get("priority")).lower()
            if priority not in {"high", "medium"}:
                priority = "medium"

            category = _safe_str(item.get("category")).lower()
            if category not in allowed_categories:
                category = "other"

            facts.append(
                {
                    "fact_id": _safe_str(item.get("fact_id")) or f"F{idx}",
                    "fact": fact,
                    "priority": priority,
                    "category": category,
                }
            )
            if len(facts) >= max_facts:
                break

    return facts


def _sanitize_v2_fact_coverage(
    parsed: dict[str, Any], source_facts: list[dict[str, str]]
) -> dict[str, Any]:
    """Normalize factual coverage audit output."""
    if not source_facts:
        return {
            "coverage_score": 10,
            "coverage_summary": "No source fact anchors were extracted for audit.",
            "covered_fact_ids": [],
            "missing_facts": [],
            "missing_count": 0,
            "missing_high_count": 0,
        }

    facts_by_id = {
        _safe_str(item.get("fact_id")): item
        for item in source_facts
        if _safe_str(item.get("fact_id"))
    }
    source_ids = set(facts_by_id.keys())

    covered_ids = {
        _safe_str(fact_id)
        for fact_id in parsed.get("covered_fact_ids", [])
        if _safe_str(fact_id)
    }
    covered_ids = {fact_id for fact_id in covered_ids if fact_id in source_ids}

    missing_facts: list[dict[str, str]] = []
    raw_missing = parsed.get("missing_facts")
    if isinstance(raw_missing, list):
        for item in raw_missing:
            if not isinstance(item, dict):
                continue
            fact_id = _safe_str(item.get("fact_id"))
            fact_text = _safe_str(item.get("fact"))
            priority = _safe_str(item.get("priority")).lower()
            if priority not in {"high", "medium"}:
                priority = "medium"
            reason = _safe_str(item.get("reason"))

            if not fact_text and fact_id in facts_by_id:
                fact_text = _safe_str(facts_by_id[fact_id].get("fact"))
            if not fact_id and fact_text:
                matched = next(
                    (
                        source_fact_id
                        for source_fact_id, source_fact in facts_by_id.items()
                        if _safe_str(source_fact.get("fact")) == fact_text
                    ),
                    "",
                )
                fact_id = matched
            if not fact_id:
                continue
            if not reason:
                reason = "Not clearly represented in rewritten draft."
            missing_facts.append(
                {
                    "fact_id": fact_id,
                    "fact": fact_text,
                    "priority": priority,
                    "reason": reason,
                }
            )

    missing_ids = {item["fact_id"] for item in missing_facts if item.get("fact_id")}
    uncovered_source_ids = source_ids - covered_ids
    for source_id in uncovered_source_ids:
        if source_id in missing_ids:
            continue
        source_fact = facts_by_id[source_id]
        if _safe_str(source_fact.get("priority")) != "high":
            continue
        missing_facts.append(
            {
                "fact_id": source_id,
                "fact": _safe_str(source_fact.get("fact")),
                "priority": "high",
                "reason": "High-priority source fact is not clearly retained.",
            }
        )

    coverage_score = _safe_int(
        parsed.get("coverage_score"), default=7, min_value=1, max_value=10
    )
    if not missing_facts and coverage_score < 8:
        coverage_score = 8

    coverage_summary = _safe_str(parsed.get("coverage_summary"))
    if not coverage_summary:
        coverage_summary = (
            "Fact coverage audit completed to ensure key source details were preserved."
        )

    missing_high_count = sum(
        1
        for item in missing_facts
        if _safe_str(item.get("priority")).lower() == "high"
    )

    return {
        "coverage_score": coverage_score,
        "coverage_summary": coverage_summary,
        "covered_fact_ids": sorted(covered_ids),
        "missing_facts": missing_facts,
        "missing_count": len(missing_facts),
        "missing_high_count": missing_high_count,
    }


__all__ = [
    "_sanitize_v2_guideline_rewrite",
    "_resolve_min_expanded_word_target",
    "_sanitize_v2_length_expansion",
    "_sanitize_v2_editorial_blueprint",
    "_sanitize_editorial_diagnostic_axis",
    "_sanitize_v2_editorial_augmentation",
    "_sanitize_v2_quality_audit",
    "_sanitize_v2_external_context",
    "_sanitize_v2_source_facts",
    "_sanitize_v2_fact_coverage",
]
