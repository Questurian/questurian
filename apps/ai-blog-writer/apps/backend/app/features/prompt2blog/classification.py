from __future__ import annotations

from typing import Any

from app.core import get_article_type_by_name

from .config import DEFAULT_MODEL
from .llm import _invoke_json_llm
from .models import ClassificationResult
from .prompts.preparation import CLASSIFY_PROMPT
from .support import (
    _json,
    _normalize_article_type_name,
    _safe_float,
    _safe_str,
)


def _classify_cleaned_material(
    *,
    cleaned_data: str,
    article_types: list[dict[str, str]],
    writing_brief: dict[str, Any],
    model_name: str | None,
) -> tuple[ClassificationResult, str, dict[str, Any], str]:
    """Classify cleaned material into one known article type."""
    if not cleaned_data:
        raise RuntimeError("cleaned_data is required for classification")
    if not article_types:
        raise RuntimeError("No article types available for classification")

    types_text = "\n".join(
        f"- {_safe_str(item.get('name'))}: {_safe_str(item.get('definition'))}"
        for item in article_types
    )
    prompt = CLASSIFY_PROMPT.format(
        cleaned_data=cleaned_data,
        article_types=types_text,
        writing_brief_json=_json(writing_brief),
    )
    parsed, raw_response = _invoke_json_llm(
        prompt=prompt,
        max_tokens=1024,
        temperature=0.1,
        model_name=model_name or DEFAULT_MODEL,
    )

    selected_name = _safe_str(parsed.get("classification"))
    if not selected_name:
        raise RuntimeError(
            "Classification response missing required 'classification' field."
        )

    selected_option = next(
        (
            item
            for item in article_types
            if _safe_str(item.get("name")) == selected_name
        ),
        None,
    )
    if not selected_option:
        normalized = _normalize_article_type_name(selected_name)
        selected_option = next(
            (
                item
                for item in article_types
                if _normalize_article_type_name(_safe_str(item.get("name")))
                == normalized
            ),
            None,
        )

    if not selected_option:
        raise RuntimeError(f"LLM selected unsupported article type: '{selected_name}'")

    article_type_row = get_article_type_by_name(_safe_str(selected_option.get("name")))
    if not article_type_row:
        raise RuntimeError(
            "Selected article type exists in options but was not found in internal storage."
        )

    confidence = max(0.0, min(1.0, _safe_float(parsed.get("confidence"), default=0.0)))
    reasoning = _safe_str(parsed.get("reasoning")) or "No reasoning provided."

    classification = ClassificationResult(
        id=article_type_row["id"],
        name=article_type_row["name"],
        definition=article_type_row["definition"],
        confidence=confidence,
        reasoning=reasoning,
    )
    result_text = (
        f"{classification.name}\n\n"
        f"Confidence: {classification.confidence:.2f}\n\n"
        f"{classification.reasoning}"
    )

    return classification, result_text, parsed, raw_response
