from __future__ import annotations

from typing import Any

from .models import Prompt2BlogInputRequest
from .support import _clean_string_list, _safe_dict, _safe_int, _safe_str


def _build_writing_brief_from_input(
    request: Prompt2BlogInputRequest,
    *,
    option_context: dict[str, Any],
    cleaned_sources: list[str],
) -> dict[str, Any]:
    tone = _safe_dict(option_context.get("tone"))
    length = _safe_dict(option_context.get("length"))
    brand_voice = _safe_dict(option_context.get("brand_voice"))
    creativity_level = _safe_str(option_context.get("creativity_level")) or "medium"

    secondary_keywords = _clean_string_list(request.secondary_keywords)
    must_include = _clean_string_list(request.must_include)
    negative_instructions = _clean_string_list(request.negative_instructions)

    profile_lines = [
        f"Tone profile ({_safe_str(tone.get('label'))}):",
        _safe_str(tone.get("instructions")),
        "",
        f"Length profile ({_safe_str(length.get('label'))}):",
        _safe_str(length.get("instructions")),
        "",
        f"Brand voice ({_safe_str(brand_voice.get('label'))}):",
        _safe_str(brand_voice.get("instructions")),
        "",
        f"Destination context: {_safe_str(request.destination_context)}",
        f"Audience intent: {_safe_str(request.target_reader)}",
        f"Creativity level: {creativity_level}",
    ]
    if must_include:
        profile_lines.extend(
            [
                "",
                "Must include:",
                *[f"- {item}" for item in must_include],
            ]
        )
    if negative_instructions:
        profile_lines.extend(
            [
                "",
                "Avoid:",
                *[f"- {item}" for item in negative_instructions],
            ]
        )
    if request.prompt_enhance:
        profile_lines.append(
            "\nPrompt enhancement enabled: prefer stronger transitions and clearer sections."
        )
    if request.audience_profile:
        profile_lines.append(f"Audience profile: {_safe_str(request.audience_profile)}")

    paragraph_length = _safe_str(length.get("paragraph_length"))
    if not paragraph_length:
        paragraph_length = _safe_str(length.get("label")) or "Medium"
    target_word_count = _safe_int(length.get("target_word_count"), default=0)
    if target_word_count <= 0:
        target_word_count = 900

    writing_brief: dict[str, Any] = {
        "topic": _safe_str(request.article_goal),
        "goal": _safe_str(request.article_goal),
        "audience": _safe_str(request.target_reader),
        "perspective": _safe_str(request.destination_context),
        "audience_profile": _safe_str(request.audience_profile),
        "voice": {
            "publication_style_reference": _safe_str(brand_voice.get("label")),
            "tone": _safe_str(tone.get("label")),
            "brand_identity": _safe_str(brand_voice.get("label")),
        },
        "formatting": {
            "paragraph_length": paragraph_length,
            "target_word_count": target_word_count,
        },
        "call_to_action": "",
        "seo": {
            "primary_keyword": _safe_str(request.primary_keyword),
            "secondary_keywords": secondary_keywords,
        },
        "editorial_instructions": "\n".join(
            line for line in profile_lines if _safe_str(line)
        ).strip(),
        "must_include": must_include,
        "negative_instructions": negative_instructions,
        "raw_input": {
            "blobs": [{"content": source} for source in cleaned_sources],
        },
    }
    return writing_brief
