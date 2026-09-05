from __future__ import annotations

import json
import re
import unicodedata
from typing import Any


def _safe_str(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if isinstance(value, bool):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if isinstance(value, bool):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
        return "{}"


def _tokenize_words(value: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", value.lower())


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _normalize_article_type_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = (
        normalized.replace("’", "'")
        .replace("‘", "'")
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace("\xa0", " ")
    )
    return re.sub(r"[^a-z0-9]+", "", normalized.lower())


def _format_raw_sources(raw_sources: list[str]) -> str:
    cleaned = []
    for index, source in enumerate(raw_sources, start=1):
        text = _safe_str(source)
        if not text:
            continue
        cleaned.append(f"Source {index}:\n{text}")

    if not cleaned:
        return "No raw sources provided."
    return "\n\n---\n\n".join(cleaned)


def _format_hard_constraints(writing_brief: dict[str, Any]) -> str:
    """Render must-include and must-avoid items as an explicit requirement
    block. These are hard constraints and must never be presented to a model
    as optional narrative colour."""
    must_include = _clean_string_list(_safe_dict(writing_brief).get("must_include") or [])
    negative = _clean_string_list(
        _safe_dict(writing_brief).get("negative_instructions") or []
    )

    sections: list[str] = []
    if must_include:
        sections.append(
            "MUST INCLUDE - every item below has to appear in the article:\n"
            + "\n".join(f"- {item}" for item in must_include)
        )
    if negative:
        sections.append(
            "MUST AVOID - none of the following may appear:\n"
            + "\n".join(f"- {item}" for item in negative)
        )

    if not sections:
        return "No hard constraints were supplied."
    return "\n\n".join(sections)


# Compose writes an opening and a closing takeaways section that the outline
# does not plan and nobody budgets. The outline used to be told to subtract
# this itself, in a rule that contradicted its own template -- see
# `_section_budget`.
UNPLANNED_WORDS = 165


def _section_budget(option_context: dict[str, Any]) -> int:
    """What the outline's sections must total, reserve already removed.

    The outline template asked for section budgets totalling the target while
    the injected planning rules asked for the target minus the reserve. Run
    95a74dce planned 730 against a 900 target in both passes -- 900 - 165 = 735
    -- so it was obeying the more specific of two conflicting instructions and
    getting it right. Doing the subtraction here leaves one number in the
    prompt and none of the arithmetic with the model.
    """
    target = _target_word_count(option_context)
    return max(0, target - UNPLANNED_WORDS) if target else 0


def _target_word_count(option_context: dict[str, Any]) -> int:
    """The whole-article word target the outline plans to and compose writes to.

    Both stages need the same number from the same place. Compose used to see
    only the per-section budgets inside the plan, and on run 95a74dce it wrote
    377 words against a 900 target -- roughly half of every section -- leaving
    repair to finish the article instead of improve it.
    """
    return _safe_int(_safe_dict(option_context.get("length")).get("target_word_count"))


def _format_style_directive(
    option_context: dict[str, Any], *, keys: tuple[str, ...] | None = None
) -> str:
    """Render the resolved tone, length, and brand voice guides as a required
    style block. These used to travel inside ``editorial_instructions``, which
    every prompt renders under the header "NARRATIVE FOCUS (OPTIONAL)" -- so the
    whole tone guide reached the model labelled optional. Built from
    ``option_context`` rather than the writing brief so the runtime-run path
    gets the same directive as a full run.

    ``keys`` narrows what is rendered. Compose passes ``("length",)`` because
    its stage context already carries the voice and the writing conventions as
    their own sections, and this block was repeating both of them -- 3,474
    duplicated characters in run 95a74dce. Audit and repair pass nothing and
    keep the whole directive: neither has a `voice` section, so for those two
    this block is the only place the voice reaches the model at all.
    """
    context = _safe_dict(option_context)

    sections: list[str] = []
    for key, heading in (
        ("tone", "Tone"),
        ("length", "Length"),
        ("brand_voice", "Brand voice"),
    ):
        if keys is not None and key not in keys:
            continue
        option = _safe_dict(context.get(key))
        instructions = _safe_str(option.get("instructions"))
        if not instructions:
            continue
        label = _safe_str(option.get("label")) or _safe_str(option.get("id"))
        sections.append(f"{heading} profile ({label}):\n{instructions}")

    if not sections:
        return "No style profiles were resolved. Use clear, neutral editorial prose."
    return "\n\n".join(sections)


def _clean_string_list(items: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        text = _safe_str(item)
        if text:
            cleaned.append(text)
    return cleaned


def _safe_str_list(value: Any) -> list[str]:
    """The strings in a field the model was told to send as a list of strings.

    A bare string is the failure that actually happens. Run b78a9fe8 got a
    `must_name` of "Standout developments in the hospitality sector..." instead
    of a list, and every caller iterating it walked it one character at a time:
    the brief came back naming "S", "t", "a", "n", "d" as things the article
    had to mention, and the plan built on it was worthless.

    Iterating a string is silent and never raises, so nothing downstream can
    catch it. It is caught here, once, for every list-of-strings field.

    A multi-line string is one item per line, with a bullet dash stripped --
    that is a model writing a list in prose rather than in JSON, and the lines
    are the entries it meant.
    """
    if isinstance(value, str):
        lines = [
            re.sub(r"^[-*•]\s*", "", line).strip()
            for line in value.splitlines()
        ]
        return [line for line in lines if line]
    if isinstance(value, list):
        return _clean_string_list(value)
    return []
