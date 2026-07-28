"""Stable facade for YouTube2Blog Stage 3 composition."""

from __future__ import annotations

from pathlib import Path

from app.config import ARTICLE_GUIDELINES_DIR
from app.core import get_article_type_by_name
from app.features.youtube2blog.config import (
    Y2B_COMPOSE_MODEL,
    Y2B_PRIMARY_MODEL,
    Y2B_STAGE3_MAX_OUTPUT_TOKENS,
)
from utils import get_vertex_llm

from .stage_3_composition import compose_article
from .stage_3_coverage import check_coverage
from .stage_3_guidelines import (
    load_general_guidelines,
    load_guideline_from_file,
    normalize_guideline_key,
    retrieve_guideline,
)
from .stage_3_supplement import gather_missing_info

GENERAL_GUIDELINES_PATH = Path(__file__).resolve().parents[4] / "data" / "general.md"


def _stage3_llm(model_name: str = Y2B_PRIMARY_MODEL):
    """Create the Stage 3 LLM through the shared provider boundary."""
    return get_vertex_llm(
        temperature=0.3,
        max_tokens=Y2B_STAGE3_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )


# Keep these private wrappers in the facade: existing callers and tests patch
# them directly, and the wrappers pass the facade's current dependencies into
# the extracted implementations.
def _load_general_guidelines() -> str:
    return load_general_guidelines(GENERAL_GUIDELINES_PATH)


def _normalize_guideline_key(value: str) -> str:
    return normalize_guideline_key(value)


def _load_guideline_from_file(article_type: str) -> str:
    return load_guideline_from_file(
        article_type,
        guidelines_dir=ARTICLE_GUIDELINES_DIR,
        normalize_key=_normalize_guideline_key,
    )


def _retrieve_guideline(article_type: str) -> str:
    return retrieve_guideline(
        article_type,
        load_file_guideline=_load_guideline_from_file,
        article_type_lookup=get_article_type_by_name,
    )


def _check_coverage(
    transcript: str,
    guideline: str,
    llm,
) -> tuple[bool, str, list[str], str, str]:
    return check_coverage(
        transcript,
        guideline,
        llm,
        load_general_guidelines=_load_general_guidelines,
    )


def _gather_missing_info(
    transcript: str,
    missing_sections: list[str],
    article_type: str,
    llm,
    tone_guidance: str | None = None,
) -> tuple[str, str, str]:
    return gather_missing_info(
        transcript,
        missing_sections,
        article_type,
        llm,
        tone_guidance,
        load_general_guidelines=_load_general_guidelines,
    )


def _compose_article(
    transcript: str,
    supplemental: str | None,
    guideline: str,
    article_type: str,
    title: str,
    llm,
    tone_guidance: str | None = None,
) -> tuple[str, str, str]:
    return compose_article(
        transcript,
        supplemental,
        guideline,
        article_type,
        title,
        llm,
        tone_guidance,
        load_general_guidelines=_load_general_guidelines,
    )


def stage_3_retrieve_guideline(article_type: str) -> str:
    """Fetch an article guideline, falling back to a generic instruction."""
    guideline = _retrieve_guideline(article_type)
    if guideline:
        return guideline
    return f"Write a {article_type} article based on the provided content."


def stage_3_coverage_check(
    *,
    transcript: str,
    guideline: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, object]:
    """Run Coverage Analysis as an explicit graph branch node."""
    (
        coverage_sufficient,
        analysis,
        missing_sections,
        coverage_prompt,
        coverage_response,
    ) = _check_coverage(transcript, guideline, _stage3_llm(model_name))
    return {
        "coverage_sufficient": bool(coverage_sufficient),
        "coverage_analysis": analysis,
        "missing_sections": list(missing_sections),
        "debug_coverage_prompt": coverage_prompt,
        "debug_coverage_response": coverage_response,
    }


def stage_3_generate_supplement(
    *,
    transcript: str,
    missing_sections: list[str],
    article_type: str,
    model_name: str = Y2B_PRIMARY_MODEL,
    tone_guidance: str | None = None,
) -> dict[str, str]:
    """Generate supplemental Markdown for missing sections."""
    content, prompt, response = _gather_missing_info(
        transcript,
        missing_sections,
        article_type,
        _stage3_llm(model_name),
        tone_guidance,
    )
    return {
        "supplemental_content": content or "",
        "debug_supplement_prompt": prompt or "",
        "debug_supplement_response": response or "",
    }


def stage_3_compose_from_parts(
    *,
    transcript: str,
    supplemental: str | None,
    guideline: str,
    article_type: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
    writing_model: str | None = None,
    tone_guidance: str | None = None,
) -> dict[str, str]:
    """Compose an article from the explicit inputs used by graph nodes."""
    _ = model_name
    article, prompt, response = _compose_article(
        transcript,
        supplemental,
        guideline,
        article_type,
        title,
        _stage3_llm(writing_model or Y2B_COMPOSE_MODEL),
        tone_guidance,
    )
    return {
        "final_article": article,
        "debug_composition_prompt": prompt,
        "debug_composition_response": response,
    }
