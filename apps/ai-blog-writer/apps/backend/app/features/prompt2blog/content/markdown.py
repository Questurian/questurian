from __future__ import annotations

import re

from ..support import _safe_str


_MARKDOWN_HEADING = re.compile(r"^\s{0,3}#{2,3}[ \t]+(.+?)\s*$")
_FENCE_MARKER = re.compile(r"^\s{0,3}(`{3,}|~{3,})(.*)$")


def extract_markdown_headings(content: str) -> list[str]:
    """Return H2/H3 text while ignoring headings inside fenced code."""
    headings: list[str] = []
    fence_character = ""
    fence_length = 0
    for line in _safe_str(content).splitlines():
        fence = _FENCE_MARKER.match(line)
        if fence:
            marker = fence.group(1)
            if not fence_character:
                fence_character = marker[0]
                fence_length = len(marker)
                continue
            if (
                marker[0] == fence_character
                and len(marker) >= fence_length
                and not fence.group(2).strip()
            ):
                fence_character = ""
                fence_length = 0
                continue
        if fence_character:
            continue
        heading = _MARKDOWN_HEADING.match(line)
        if heading:
            cleaned = re.sub(r"[ \t]+#+[ \t]*$", "", heading.group(1)).strip()
            if cleaned:
                headings.append(cleaned)
    return headings


def split_markdown_sections(content: str) -> dict[str, str]:
    """Split an article into its `##` sections, keyed by heading.

    Anything before the first heading is kept under an empty key, so the
    opening is never silently dropped by a round trip.
    """
    sections: dict[str, str] = {}
    heading = ""
    body: list[str] = []
    for line in (content or "").split("\n"):
        if line.startswith("## "):
            sections[heading] = "\n".join(body).strip()
            heading = line[3:].strip()
            body = []
            continue
        body.append(line)
    sections[heading] = "\n".join(body).strip()
    return sections


def sections_changed(before: str, after: str) -> list[str]:
    """Which sections differ between two drafts.

    Repair is allowed to change what the auditor named and nothing else. This
    is how that is checked rather than trusted: a repair pass that quietly
    rewrites a section nobody complained about has damaged working prose, and
    the whole reason for scoping repair is that it cannot.
    """
    old = split_markdown_sections(before)
    new = split_markdown_sections(after)
    names = set(old) | set(new)
    return sorted(
        name for name in names if old.get(name, "") != new.get(name, "")
    )


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
