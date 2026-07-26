"""Normalization and validation for editorial augmentation model output."""

from __future__ import annotations

import re
from typing import Any, Literal, TypedDict

from app.features.youtube2blog.content.editorial_blocks import (
    ensure_editorial_component_boxes,
)


class EditorialAugmentation(TypedDict):
    """Validated editorial augmentation data used by the stage facade."""

    augmented_content: str
    components_added: list[dict[str, str]]
    diagnostic: dict[str, Literal["strong", "weak"]]
    augmentation_summary: str
    augmentation_applied: bool


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _tokenize_words(value: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", _safe_str(value))


def _ensure_markdown_section_headers(content: str) -> str:
    cleaned = _safe_str(content)
    if not cleaned:
        return ""

    cleaned = re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()

    if re.search(r"(?m)^\s{0,3}#{2,6}\s+\S", cleaned):
        return cleaned

    paragraphs = [
        item.strip() for item in re.split(r"\n\s*\n", cleaned) if item.strip()
    ]
    if not paragraphs:
        return cleaned

    if len(paragraphs) == 1:
        return f"## Overview\n\n{paragraphs[0]}"

    headings = ["Overview", "Key Insights", "Practical Guidance", "Takeaways"]
    sections = []
    for index, paragraph in enumerate(paragraphs):
        heading = (
            headings[index]
            if index < len(headings)
            else f"Additional Insight {index - 3}"
        )
        sections.append(f"## {heading}\n\n{paragraph}")

    return "\n\n".join(sections)


def _normalize_editorial_component_name(value: str) -> str:
    normalized = re.sub(r"[\s\-]+", "_", value.strip().lower())
    aliases = {
        "pull_quote": "pull_quote",
        "quote": "pull_quote",
        "in_the_know_box": "in_the_know_box",
        "in_the_know": "in_the_know_box",
        "in_theknow_box": "in_the_know_box",
        "in_the_know_callout": "in_the_know_box",
        "key_takeaways_box": "key_takeaways_box",
        "key_takeaways": "key_takeaways_box",
        "takeaways": "key_takeaways_box",
        "highlight_callout": "highlight_callout",
        "highlight": "highlight_callout",
        "callout": "highlight_callout",
        "faq_block": "faq_block",
        "faq": "faq_block",
        "faqs": "faq_block",
        "qa_block": "faq_block",
        "q_and_a_block": "faq_block",
    }
    return aliases.get(normalized, "")


def _sanitize_editorial_diagnostic_axis(value: Any) -> Literal["strong", "weak"]:
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


def _normalize_markdown_for_comparison(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def sanitize_editorial_augmentation(
    parsed: dict[str, Any], *, fallback_content: str
) -> EditorialAugmentation:
    """Normalize untrusted model output and preserve the source article."""
    fallback_markdown = _ensure_markdown_section_headers(fallback_content)
    augmented_content = _safe_str(parsed.get("augmented_content"))
    if not augmented_content:
        augmented_content = fallback_markdown

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
        augmented_content = ensure_editorial_component_boxes(
            augmented_content,
            components_added,
        )

    if len(_tokenize_words(augmented_content)) < len(
        _tokenize_words(fallback_markdown)
    ):
        augmented_content = ensure_editorial_component_boxes(
            fallback_markdown,
            components_added,
        )

    diagnostic_raw = _safe_dict(parsed.get("diagnostic"))
    diagnostic = {
        axis: _sanitize_editorial_diagnostic_axis(diagnostic_raw.get(axis))
        for axis in (
            "cognitive_load",
            "narrative_density",
            "emphasis_clarity",
            "reading_behavior_risk",
        )
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

    augmentation_applied = bool(
        components_added
    ) and _normalize_markdown_for_comparison(
        augmented_content
    ) != _normalize_markdown_for_comparison(
        fallback_markdown
    )

    return {
        "augmented_content": augmented_content,
        "components_added": components_added,
        "diagnostic": diagnostic,
        "augmentation_summary": augmentation_summary,
        "augmentation_applied": augmentation_applied,
    }
