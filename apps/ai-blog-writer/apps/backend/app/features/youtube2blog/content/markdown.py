from __future__ import annotations

import re


def clean_title(title: str) -> str:
    cleaned = title.strip().strip("\"'")
    return cleaned.lstrip("#").strip()


def normalize_markdown_body(content: str) -> str:
    cleaned = content.strip()
    if not cleaned:
        return ""
    return re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()


def build_final_markdown(title: str, content: str) -> str:
    body = normalize_markdown_body(content)
    cleaned_title = clean_title(title)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{body}".strip()
    return body


def count_paragraphs(content: str) -> int:
    return len([chunk for chunk in re.split(r"\n\s*\n", content) if chunk.strip()])


def count_words(content: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", content))
