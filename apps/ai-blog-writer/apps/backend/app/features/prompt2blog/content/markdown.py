from __future__ import annotations

import re

from ..support import _safe_str


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
        return f"## Overview\n\n{paragraphs[0]}\n\n## Key Takeaways\n\n{paragraphs[0]}"

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


def _clean_title(title: str) -> str:
    cleaned = _safe_str(title)
    cleaned = cleaned.strip('"\'')
    cleaned = cleaned.lstrip("#").strip()
    return cleaned


def _build_markdown(title: str, content: str) -> str:
    body = _ensure_markdown_section_headers(content)
    cleaned_title = _clean_title(title)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{body}".strip()
    return body.strip()
