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

    profile_lines = []
    # The angle leads the block. Several tones -- editorial-comparison and
    # practical-authority especially -- require the piece to take a stance, and
    # until now the brief had nowhere to put one, so the model invented its own
    # or defaulted to fake balance.
    if request.angle:
        profile_lines.append(
            f"Editorial angle - the piece must argue this: {_safe_str(request.angle)}"
        )
    profile_lines += [
        f"Destination context: {_safe_str(request.destination_context)}",
        f"Audience intent: {_safe_str(request.target_reader)}",
        f"Creativity level: {creativity_level}",
    ]
    # must_include and negative_instructions are deliberately absent here. They
    # are hard requirements and get their own prompt block; folding them into
    # editorial_instructions buried them inside a field every prompt renders
    # under the header "NARRATIVE FOCUS (OPTIONAL)".
    #
    # The tone, length, and brand voice guides left for the same reason. They
    # are style requirements, not optional colour, and now render as their own
    # STYLE DIRECTIVE block built from option_context in the orchestrator.
    # What stays here is genuine steering: context, intent, and creativity.
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
        # `topic` used to duplicate `goal` verbatim, and `perspective` was fed
        # destination_context -- in a JSON brief "perspective" reads as point of
        # view, so the model was handed a city name under a POV key. Both keys
        # are named for what they actually carry now.
        "goal": _safe_str(request.article_goal),
        "audience": _safe_str(request.target_reader),
        "destination_context": _safe_str(request.destination_context),
        "angle": _safe_str(request.angle),
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
        "call_to_action": _safe_str(request.call_to_action),
        "seo": {
            "primary_keyword": _safe_str(request.primary_keyword),
            "secondary_keywords": secondary_keywords,
        },
        "editorial_instructions": "\n".join(
            line for line in profile_lines if _safe_str(line)
        ).strip(),
        "must_include": must_include,
        "negative_instructions": negative_instructions,
    }
    # The brief is serialized into every prompt. It used to carry the full
    # cleaned sources under raw_input.blobs, so each call received the sources
    # three times over: once as {raw_sources}, once as {cleaned_data} and again
    # inside the brief JSON. Nothing read raw_input.
    return writing_brief
