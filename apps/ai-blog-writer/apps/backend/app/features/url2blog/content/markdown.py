"""Pure markdown/text shaping helpers (section headers, conclusion phrasing).

Leaf module — depends only on stdlib + coerce. Extracted from url2blog/routes.py.
"""

import re

from ..llm.coerce import _safe_str


def _ensure_markdown_section_headers(content: str) -> str:
    """Ensure article body contains markdown section headers."""
    cleaned = content.strip()
    if not cleaned:
        return cleaned

    fenced_match = re.match(
        r"^```(?:markdown|md)?\s*(.*?)\s*```$",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if fenced_match:
        cleaned = _safe_str(fenced_match.group(1))

    # Final markdown already prepends an H1 title, so demote any body H1 headings.
    cleaned = re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()

    if re.search(r"(?m)^\s{0,3}#{2,6}\s+\S", cleaned):
        return cleaned

    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", cleaned) if item.strip()]
    if not paragraphs:
        return cleaned

    if len(paragraphs) == 1:
        sentences = [
            segment.strip()
            for segment in re.split(r"(?<=[.!?])\s+", paragraphs[0])
            if segment.strip()
        ]
        if len(sentences) >= 3:
            split_index = max(1, len(sentences) // 2)
            first_half = " ".join(sentences[:split_index]).strip()
            second_half = " ".join(sentences[split_index:]).strip()
            return (
                "## Overview\n\n"
                f"{first_half}\n\n"
                "## Key Takeaways\n\n"
                f"{second_half}"
            ).strip()
        return f"## Overview\n\n{paragraphs[0]}".strip()

    section_titles = [
        "Overview",
        "Key Insights",
        "Practical Implications",
        "Takeaway",
    ]
    sections: list[str] = []
    for idx, paragraph in enumerate(paragraphs, start=1):
        if idx <= len(section_titles):
            heading = section_titles[idx - 1]
        else:
            heading = f"Additional Insight {idx - len(section_titles)}"
        sections.append(f"## {heading}\n\n{paragraph}")

    return "\n\n".join(sections).strip()


def _remove_academic_conclusion_phrases(text: str) -> str:
    """Replace academic closing signposts with neutral editorial transitions."""
    if not text:
        return text

    cleaned = re.sub(
        r"\bin conclusion\b\s*[,:\-]?\s*",
        "Overall, ",
        text,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bto conclude\b\s*[,:\-]?\s*",
        "Overall, ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"(Overall,\s*){2,}", "Overall, ", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


__all__ = ['_ensure_markdown_section_headers', '_remove_academic_conclusion_phrases']
