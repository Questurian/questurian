from __future__ import annotations

import re
from typing import Any

from ..config import EDITORIAL_COMPONENT_LABELS
from ..support import _safe_dict, _safe_str, _tokenize_words
from .markdown import _ensure_markdown_section_headers


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


def _sanitize_editorial_diagnostic_axis(value: Any) -> str:
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


def _normalize_markdown_for_comparison(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def _editorial_box_marker(component: str) -> str:
    return f"[!EDITORIAL-BOX|{component}]"


def _editorial_block_start_marker(component: str) -> str:
    return f"[!EDITORIAL-BLOCK-START|{component}]"


def _editorial_block_end_marker(component: str) -> str:
    return f"[!EDITORIAL-BLOCK-END|{component}]"


def _editorial_block_label_marker(component: str) -> str:
    label = EDITORIAL_COMPONENT_LABELS.get(component, component)
    return f"[!EDITORIAL-BLOCK-LABEL|{label}]"


def _line_matches_editorial_marker(line: str, marker: str) -> bool:
    return bool(
        re.match(
            rf"^\s*>\s*{re.escape(marker)}\s*$",
            line,
            flags=re.IGNORECASE,
        )
    )


def _find_editorial_block_range(
    lines: list[str], component: str
) -> tuple[int, int] | None:
    start_marker = _editorial_block_start_marker(component)
    end_marker = _editorial_block_end_marker(component)
    start_idx = -1

    for idx, line in enumerate(lines):
        if start_idx == -1:
            if _line_matches_editorial_marker(line, start_marker):
                start_idx = idx
            continue

        if _line_matches_editorial_marker(line, end_marker):
            return start_idx, idx

    return None


def _content_has_editorial_block(content: str, component: str) -> bool:
    start_marker = re.escape(_editorial_block_start_marker(component))
    end_marker = re.escape(_editorial_block_end_marker(component))
    pattern = rf"(?mis)^\s*>\s*{start_marker}\s*$.*?^\s*>\s*{end_marker}\s*$"
    return bool(re.search(pattern, content))


def _build_editorial_metadata_box(component_entry: dict[str, str]) -> str:
    component = component_entry["component"]
    label = EDITORIAL_COMPONENT_LABELS.get(component, component)
    lines = [
        f"> {_editorial_block_start_marker(component)}",
        f"> {_editorial_block_label_marker(component)}",
        f"> {_editorial_box_marker(component)}",
        f"> **Component:** {label}",
    ]
    placement = _safe_str(component_entry.get("placement"))
    if placement:
        lines.append(f"> **Placement:** {placement}")
    justification = _safe_str(component_entry.get("justification"))
    if justification:
        lines.append(f"> **Why:** {justification}")
    lines.append(f"> {_editorial_block_end_marker(component)}")
    return "\n".join(lines)


def _wrap_existing_editorial_box_with_markers(content: str, component: str) -> str:
    if not content:
        return content
    if _content_has_editorial_block(content, component):
        return content

    marker_line_re = re.compile(
        rf"^\s*>\s*{re.escape(_editorial_box_marker(component))}\s*$",
        flags=re.IGNORECASE,
    )
    start_line = f"> {_editorial_block_start_marker(component)}"
    end_line = f"> {_editorial_block_end_marker(component)}"

    lines = content.splitlines()
    for idx, line in enumerate(lines):
        if not marker_line_re.match(line):
            continue

        if idx > 0 and lines[idx - 1].strip().lower() == start_line.lower():
            return content

        block_end = idx
        while block_end + 1 < len(lines) and lines[block_end + 1].lstrip().startswith(
            ">"
        ):
            block_end += 1

        lines.insert(idx, start_line)
        lines.insert(block_end + 2, end_line)
        return "\n".join(lines)

    return content


def _ensure_editorial_block_labels(content: str, component: str) -> str:
    if not content:
        return content

    lines = content.splitlines()
    block_range = _find_editorial_block_range(lines, component)
    if not block_range:
        return content

    start_idx, end_idx = block_range
    box_marker = _editorial_box_marker(component)
    label_marker = _editorial_block_label_marker(component)
    label_text = EDITORIAL_COMPONENT_LABELS.get(component, component)
    display_label_line = f"**Component:** {label_text}"

    box_idx = next(
        (
            idx
            for idx in range(start_idx, end_idx + 1)
            if _line_matches_editorial_marker(lines[idx], box_marker)
        ),
        -1,
    )
    label_marker_idx = next(
        (
            idx
            for idx in range(start_idx, end_idx + 1)
            if _line_matches_editorial_marker(lines[idx], label_marker)
        ),
        -1,
    )
    display_label_idx = next(
        (
            idx
            for idx in range(start_idx, end_idx + 1)
            if _line_matches_editorial_marker(lines[idx], display_label_line)
        ),
        -1,
    )

    if label_marker_idx == -1:
        insert_after = box_idx if box_idx != -1 else start_idx
        lines.insert(insert_after + 1, f"> {label_marker}")
        end_idx += 1
        label_marker_idx = insert_after + 1
        if box_idx > insert_after:
            box_idx += 1
        if display_label_idx > insert_after:
            display_label_idx += 1

    if display_label_idx == -1:
        lines.insert(label_marker_idx + 1, f"> {display_label_line}")
        end_idx += 1

    return "\n".join(lines)


def _ensure_editorial_component_boxes(
    content: str, components_added: list[dict[str, str]]
) -> str:
    if not content or not components_added:
        return content

    updated_content = content
    for component_entry in components_added:
        updated_content = _wrap_existing_editorial_box_with_markers(
            updated_content,
            component_entry["component"],
        )
        updated_content = _ensure_editorial_block_labels(
            updated_content,
            component_entry["component"],
        )

    missing_components = [
        component_entry
        for component_entry in components_added
        if not _content_has_editorial_block(
            updated_content, component_entry["component"]
        )
    ]
    if not missing_components:
        return updated_content

    fallback_boxes = "\n\n".join(
        _build_editorial_metadata_box(component_entry)
        for component_entry in missing_components
    ).strip()
    if not fallback_boxes:
        return updated_content

    return f"{updated_content.strip()}\n\n{fallback_boxes}".strip()


def _sanitize_editorial_augmentation(
    parsed: dict[str, Any], *, fallback_content: str
) -> dict[str, Any]:
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
        augmented_content = _ensure_editorial_component_boxes(
            augmented_content,
            components_added,
        )

    fallback_word_count = len(_tokenize_words(fallback_markdown))
    augmented_word_count = len(_tokenize_words(augmented_content))
    if augmented_word_count < fallback_word_count:
        augmented_content = _ensure_editorial_component_boxes(
            fallback_markdown,
            components_added,
        )

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
