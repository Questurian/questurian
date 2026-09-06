from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import (
    PROMPT2BLOG_WRITING_CONVENTIONS_FILE,
    PROMPT2BLOG_CREATIVITY_LEVELS,
    PROMPT2BLOG_LENGTHS_DIR,
    PROMPT2BLOG_VOICE_FILE,
)
from .support import (
    _normalize_article_type_name,
    _safe_bool,
    _safe_dict,
    _safe_int,
    _safe_str,
)

logger = logging.getLogger(__name__)


def _coerce_frontmatter_value(value: str) -> Any:
    raw = value.strip()
    lower = raw.lower()
    if lower in {"true", "false"}:
        return lower == "true"
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d+\.\d+", raw):
        try:
            return float(raw)
        except ValueError:
            return raw
    return raw


def _parse_markdown_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    stripped = content.lstrip()
    if not stripped.startswith("---"):
        return {}, content.strip()

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", stripped, flags=re.S)
    if not match:
        return {}, content.strip()

    frontmatter_raw, body = match.groups()
    metadata: dict[str, Any] = {}
    for line in frontmatter_raw.splitlines():
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        metadata[key.strip()] = _coerce_frontmatter_value(raw_value)
    return metadata, body.strip()


def _markdown_heading_label(body: str, fallback: str) -> str:
    for line in body.splitlines():
        trimmed = line.strip()
        if trimmed.startswith("#"):
            return trimmed.lstrip("#").strip() or fallback
    return fallback


def _read_markdown_option_file(path: Path) -> list[dict[str, Any]]:
    """One file, returned in the shape the catalog expects.

    Questurian has one voice and one set of writing conventions, so these are
    single files rather than directories of choices. The list wrapper stays
    because the request contract still validates an id against a list; it just
    never has more than one member to pick from.
    """
    if not path.exists():
        return []
    return [
        option
        for option in _read_markdown_option_files(path.parent)
        if option["id"] == path.stem
    ]


def _read_markdown_option_files(directory: Path) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    if not directory.exists():
        return options

    for path in sorted(directory.glob("*.md")):
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            logger.warning("Unable to read Prompt2Blog option file: %s", path)
            continue

        metadata, body = _parse_markdown_frontmatter(content)
        default_id = _normalize_article_type_name(path.stem)
        option_id = _safe_str(metadata.get("id")) or default_id
        if not option_id:
            continue

        label = _safe_str(metadata.get("label")) or _markdown_heading_label(
            body, path.stem
        )
        description = _safe_str(metadata.get("description"))
        option = {
            "id": option_id,
            "label": label or option_id,
            "description": description,
            "instructions": body,
            "default": _safe_bool(metadata.get("default"), default=False),
            "order": _safe_int(metadata.get("order"), default=9999),
        }
        if "target_word_count" in metadata:
            option["target_word_count"] = _safe_int(
                metadata.get("target_word_count"), default=0
            )
        if "paragraph_length" in metadata:
            option["paragraph_length"] = _safe_str(metadata.get("paragraph_length"))
        options.append(option)

    options.sort(key=lambda item: (item.get("order", 9999), item["label"].lower()))
    return options


def _default_prompt2blog_options() -> dict[str, list[dict[str, Any]]]:
    """Fallbacks used only when the option files cannot be read."""
    return {
        "tones": [
            {
                "id": "questurian-voice",
                "label": "Questurian Voice",
                "description": "What Questurian is like.",
                "instructions": "Write as Questurian.",
                "default": True,
                "order": 1,
            }
        ],
        "lengths": [
            {
                "id": "medium",
                "label": "Medium",
                "description": "Balanced depth.",
                "instructions": "Target balanced depth and readability.",
                "paragraph_length": "Medium (3\u20135 sentences per paragraph)",
                "target_word_count": 900,
                "default": True,
                "order": 1,
            }
        ],
        "brand_voices": [
            {
                "id": "writing-conventions",
                "label": "Writing conventions",
                "description": "Mechanical conventions the voice cannot imply.",
                "instructions": "Follow the writing conventions.",
                "default": True,
                "order": 1,
            }
        ],
    }


@lru_cache(maxsize=1)
def _load_prompt2blog_option_catalog() -> dict[str, list[dict[str, Any]]]:
    defaults = _default_prompt2blog_options()
    # Questurian has one voice, so "tones" is a single fixed entry rather than
    # a menu (ADR 0032). The field survives only because the v3 request contract
    # still requires a tone_id; stage 2 removes it.
    tones = _read_markdown_option_file(PROMPT2BLOG_VOICE_FILE) or defaults["tones"]
    lengths = (
        _read_markdown_option_files(PROMPT2BLOG_LENGTHS_DIR) or defaults["lengths"]
    )
    brand_voices = (
        _read_markdown_option_file(PROMPT2BLOG_WRITING_CONVENTIONS_FILE)
        or defaults["brand_voices"]
    )
    return {
        "tones": tones,
        "lengths": lengths,
        "brand_voices": brand_voices,
    }


def _find_option_or_raise(
    options: list[dict[str, Any]],
    option_id: str,
    *,
    field_name: str,
) -> dict[str, Any]:
    normalized = _normalize_article_type_name(option_id)
    for option in options:
        if _normalize_article_type_name(_safe_str(option.get("id"))) == normalized:
            return option
    raise RuntimeError(f"Unsupported {field_name}: '{option_id}'")


def default_target_word_count() -> int:
    """How long the article the pipeline is about to write is meant to be.

    Nothing chooses a length: `writing_request` takes the default, so this is
    the number compose will actually write to. Evidence selection needs it
    before the writing request exists, to know how many facts a piece this size
    can carry, and reading it from the same catalog entry is what stops the two
    numbers drifting apart.
    """
    length = _default_option(_load_prompt2blog_option_catalog().get("lengths", []))
    return _safe_int(_safe_dict(length).get("target_word_count"), default=0)


def _default_option(options: list[dict[str, Any]]) -> dict[str, Any] | None:
    for option in options:
        if _safe_bool(option.get("default"), default=False):
            return option
    return options[0] if options else None


def _read_article_type_markdown(
    *,
    article_type_name: str,
    directory: Path,
    fallback: str,
    aliases: dict[str, str],
) -> tuple[str, str | None]:
    if not directory.exists():
        return fallback, None

    normalized_target = _normalize_article_type_name(article_type_name)
    files_by_key: dict[str, Path] = {}
    for file_path in directory.glob("*.md"):
        files_by_key[_normalize_article_type_name(file_path.stem)] = file_path

    lookup_keys = [normalized_target]
    alias_value = aliases.get(normalized_target)
    if alias_value:
        lookup_keys.append(alias_value)

    for key in lookup_keys:
        file_path = files_by_key.get(key)
        if not file_path:
            continue
        try:
            return file_path.read_text(encoding="utf-8").strip(), file_path.name
        except Exception:
            logger.warning("Failed to read guideline markdown file: %s", file_path)
            break

    return fallback, None
