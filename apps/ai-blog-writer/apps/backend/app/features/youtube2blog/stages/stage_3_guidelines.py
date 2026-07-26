"""Guideline retrieval policy for YouTube2Blog Stage 3."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def load_general_guidelines(path: Path) -> str:
    """Load the cross-article composition guidelines."""
    try:
        if path.exists():
            content = path.read_text(encoding="utf-8").strip()
            if content:
                return f"\n\n---\n\nGENERAL GUIDELINES:\n\n{content}"
        logger.warning("General guidelines file not found: %s", path)
        return ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load general guidelines: %s", exc)
        return ""


def normalize_guideline_key(value: str) -> str:
    """Normalize article-type names for filename matching."""
    normalized = value.replace("’", "'").replace("`", "'")
    normalized = normalized.lower()
    normalized = re.sub(r"\.md$", "", normalized)
    normalized = normalized.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "", normalized)


def load_guideline_from_file(
    article_type: str,
    *,
    guidelines_dir: Path,
    normalize_key: Callable[[str], str] = normalize_guideline_key,
) -> str:
    """Load guideline markdown when an exact or normalized file exists."""
    if not guidelines_dir.exists():
        return ""

    exact_path = guidelines_dir / f"{article_type}.md"
    if exact_path.exists():
        try:
            return exact_path.read_text(encoding="utf-8").strip()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed reading guideline file %s: %s", exact_path, exc)
            return ""

    target_key = normalize_key(article_type)
    if not target_key:
        return ""

    for candidate in guidelines_dir.glob("*.md"):
        if normalize_key(candidate.stem) == target_key:
            try:
                return candidate.read_text(encoding="utf-8").strip()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed reading guideline file %s: %s", candidate, exc)
                return ""
    return ""


def retrieve_guideline(
    article_type: str,
    *,
    load_file_guideline: Callable[[str], str],
    article_type_lookup: Callable[[str], dict[str, Any] | None],
) -> str:
    """Fetch an article guideline from Markdown first and the database second."""
    file_guideline = load_file_guideline(article_type)
    if file_guideline:
        return file_guideline

    article_type_data = article_type_lookup(article_type)
    if not article_type_data:
        logger.warning("No article type found for: %s", article_type)
        return ""
    return article_type_data.get("guideline", "") or ""
