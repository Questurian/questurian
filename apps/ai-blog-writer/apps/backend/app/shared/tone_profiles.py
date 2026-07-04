"""Shared tone profile loader for article pipelines."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any


TONES_DIR = Path(__file__).resolve().parents[2] / "data" / "prompt2blog" / "tones"
DEFAULT_TONE_ID = "practical"


def _safe_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _safe_bool(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
    return default


def _safe_int(value: Any, *, default: int = 9999) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_markdown_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    if not content.startswith("---"):
        return {}, content.strip()
    marker = "\n---"
    end = content.find(marker, 3)
    if end == -1:
        return {}, content.strip()
    frontmatter = content[3:end].strip()
    body = content[end + len(marker):].strip()
    metadata: dict[str, Any] = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip()
    return metadata, body


def _normalize_id(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


@lru_cache(maxsize=1)
def load_tone_profiles() -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    if not TONES_DIR.exists():
        return profiles

    for path in sorted(TONES_DIR.glob("*.md")):
        metadata, body = _parse_markdown_frontmatter(path.read_text(encoding="utf-8"))
        profile_id = _safe_str(metadata.get("id")) or path.stem
        if not profile_id:
            continue
        profiles.append(
            {
                "id": profile_id,
                "label": _safe_str(metadata.get("label")) or profile_id,
                "description": _safe_str(metadata.get("description")),
                "instructions": body,
                "default": _safe_bool(metadata.get("default"), default=False),
                "order": _safe_int(metadata.get("order")),
            }
        )

    profiles.sort(key=lambda item: (item.get("order", 9999), item["label"].lower()))
    return profiles


def resolve_tone_profile(tone_id: str | None) -> dict[str, Any]:
    profiles = load_tone_profiles()
    requested = _safe_str(tone_id) or DEFAULT_TONE_ID
    requested_key = _normalize_id(requested)
    for profile in profiles:
        if _normalize_id(_safe_str(profile.get("id"))) == requested_key:
            return profile
    raise ValueError(f"Unsupported tone_id: '{requested}'")


def build_tone_guidance(tone_id: str | None) -> str:
    profile = resolve_tone_profile(tone_id)
    label = _safe_str(profile.get("label"))
    instructions = _safe_str(profile.get("instructions"))
    if not instructions:
        return ""
    return f"TONE PROFILE ({label}):\n{instructions}".strip()
