"""Pure Markdown marker handling for editorial augmentation blocks."""

from __future__ import annotations

import re

EDITORIAL_COMPONENT_LABELS = {
    "pull_quote": "Pull Quote",
    "in_the_know_box": "In The Know",
    "key_takeaways_box": "Key Takeaways",
    "highlight_callout": "Highlight Callout",
    "faq_block": "FAQ Block",
}


def _safe_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


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
        label_marker_idx = insert_after + 1
        if display_label_idx > insert_after:
            display_label_idx += 1

    if display_label_idx == -1:
        lines.insert(label_marker_idx + 1, f"> {display_label_line}")

    return "\n".join(lines)


def ensure_editorial_component_boxes(
    content: str, components_added: list[dict[str, str]]
) -> str:
    """Repair marker envelopes and append metadata-only fallbacks when absent."""
    if not content or not components_added:
        return content

    updated_content = content
    for component_entry in components_added:
        component = component_entry["component"]
        updated_content = _wrap_existing_editorial_box_with_markers(
            updated_content,
            component,
        )
        updated_content = _ensure_editorial_block_labels(updated_content, component)

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
