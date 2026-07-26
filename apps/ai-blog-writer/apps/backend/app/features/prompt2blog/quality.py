from __future__ import annotations

import re
from typing import Any

from .content.markdown import _clean_title
from .support import (
    _safe_bool,
    _safe_int,
    _safe_str,
    _tokenize_words,
    _normalize_text,
)


def _extract_narrative_focus(writing_brief: dict[str, Any]) -> str:
    editorial = _safe_str(writing_brief.get("editorial_instructions"))
    if editorial:
        return editorial
    goal = _safe_str(writing_brief.get("goal"))
    if goal:
        return goal
    perspective = _safe_str(writing_brief.get("perspective"))
    return perspective or "No additional narrative focus provided."


def _contains_phrase(text: str, phrase: str) -> bool:
    normalized_text = _normalize_text(text)
    normalized_phrase = _normalize_text(phrase)
    if not normalized_phrase:
        return True
    return normalized_phrase in normalized_text


def _estimate_paragraph_sentence_average(content: str) -> float:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
    if not paragraphs:
        return 0.0

    sentence_counts = []
    for paragraph in paragraphs:
        count = len(re.findall(r"[.!?](?:\s|$)", paragraph))
        sentence_counts.append(max(1, count))

    return sum(sentence_counts) / max(1, len(sentence_counts))


def _keyword_overlap_ratio(reference: str, text: str) -> float:
    ref_tokens = {token for token in _tokenize_words(reference) if len(token) > 3}
    if not ref_tokens:
        return 1.0

    content_tokens = set(_tokenize_words(text))
    overlap = ref_tokens & content_tokens
    return len(overlap) / len(ref_tokens)


def _build_constraint_checks(
    title: str,
    content: str,
    writing_brief: dict[str, Any],
) -> dict[str, Any]:
    combined = f"{title}\n\n{content}".strip()
    word_count = len(_tokenize_words(content))

    formatting = writing_brief.get("formatting") or {}
    paragraph_length_pref = _safe_str(formatting.get("paragraph_length"))
    target_word_count = _safe_int(formatting.get("target_word_count"), default=0)

    target_word_count_met = True
    if target_word_count > 0:
        tolerance = max(100, int(target_word_count * 0.1))
        target_word_count_met = (
            target_word_count - tolerance <= word_count <= target_word_count + tolerance
        )

    avg_sentences = _estimate_paragraph_sentence_average(content)
    paragraph_length_met = True
    if paragraph_length_pref.lower().startswith("short"):
        paragraph_length_met = avg_sentences <= 2.5
    elif paragraph_length_pref.lower().startswith("medium"):
        paragraph_length_met = 2.5 <= avg_sentences <= 5.5
    elif paragraph_length_pref.lower().startswith("long"):
        paragraph_length_met = avg_sentences >= 5.0

    cta = _safe_str(writing_brief.get("call_to_action"))
    cta_present = _keyword_overlap_ratio(cta, combined) >= 0.35 if cta else True

    seo = writing_brief.get("seo") or {}
    primary_keyword = _safe_str(seo.get("primary_keyword"))
    primary_keyword_present = _contains_phrase(combined, primary_keyword)

    secondary_raw = seo.get("secondary_keywords")
    secondary_keywords: list[str] = []
    if isinstance(secondary_raw, list):
        secondary_keywords = [
            _safe_str(item) for item in secondary_raw if _safe_str(item)
        ]

    secondary_keywords_present = True
    if secondary_keywords:
        secondary_keywords_present = all(
            _contains_phrase(combined, kw) for kw in secondary_keywords
        )

    audience = _safe_str(writing_brief.get("audience"))
    tone = _safe_str((writing_brief.get("voice") or {}).get("tone"))
    audience_match = (
        _keyword_overlap_ratio(audience, combined) >= 0.2 if audience else True
    )
    tone_match = _keyword_overlap_ratio(tone, combined) >= 0.2 if tone else True

    return {
        "target_word_count_met": target_word_count_met,
        "paragraph_length_met": paragraph_length_met,
        "cta_present": cta_present,
        "primary_keyword_present": primary_keyword_present,
        "secondary_keywords_present": secondary_keywords_present,
        "audience_match": audience_match,
        "tone_match": tone_match,
        "word_count_estimate": word_count,
    }


def _sanitize_coverage(parsed: dict[str, Any]) -> dict[str, Any]:
    missing_sections_raw = parsed.get("missing_sections")
    missing_sections: list[str] = []
    if isinstance(missing_sections_raw, list):
        missing_sections = [
            _safe_str(item) for item in missing_sections_raw if _safe_str(item)
        ]

    return {
        "coverage_sufficient": _safe_bool(
            parsed.get("coverage_sufficient"), default=False
        ),
        "analysis": _safe_str(parsed.get("analysis"))
        or "Coverage analysis not provided.",
        "missing_sections": missing_sections,
    }


def _sanitize_rewrite(
    parsed: dict[str, Any],
    *,
    fallback_title: str,
    fallback_content: str,
) -> dict[str, Any]:
    improvements_raw = parsed.get("improvements_applied")
    improvements = []
    if isinstance(improvements_raw, list):
        improvements = [_safe_str(item) for item in improvements_raw if _safe_str(item)]

    remaining_raw = parsed.get("remaining_gaps")
    remaining = []
    if isinstance(remaining_raw, list):
        remaining = [_safe_str(item) for item in remaining_raw if _safe_str(item)]

    improved_title = _clean_title(_safe_str(parsed.get("improved_title")))
    improved_content = _safe_str(parsed.get("improved_content"))

    return {
        "improved_title": improved_title or _clean_title(fallback_title),
        "improved_content": improved_content or fallback_content,
        "guideline_alignment_summary": _safe_str(
            parsed.get("guideline_alignment_summary")
        )
        or "Guideline alignment summary not provided.",
        "improvements_applied": improvements,
        "remaining_gaps": remaining,
    }


def _sanitize_quality(parsed: dict[str, Any]) -> dict[str, Any]:
    required_revisions_raw = parsed.get("required_revisions")
    required_revisions = []
    if isinstance(required_revisions_raw, list):
        required_revisions = [
            _safe_str(item) for item in required_revisions_raw if _safe_str(item)
        ]

    checks_raw = parsed.get("constraint_checks")
    checks = {}
    if isinstance(checks_raw, dict):
        checks = {
            "target_word_count_met": _safe_bool(
                checks_raw.get("target_word_count_met"), default=True
            ),
            "paragraph_length_met": _safe_bool(
                checks_raw.get("paragraph_length_met"), default=True
            ),
            "cta_present": _safe_bool(checks_raw.get("cta_present"), default=True),
            "primary_keyword_present": _safe_bool(
                checks_raw.get("primary_keyword_present"), default=True
            ),
            "secondary_keywords_present": _safe_bool(
                checks_raw.get("secondary_keywords_present"), default=True
            ),
            "audience_match": _safe_bool(
                checks_raw.get("audience_match"), default=True
            ),
            "tone_match": _safe_bool(checks_raw.get("tone_match"), default=True),
        }

    return {
        "overall_score": max(
            1, min(10, _safe_int(parsed.get("overall_score"), default=6))
        ),
        "guideline_coverage_score": max(
            1, min(10, _safe_int(parsed.get("guideline_coverage_score"), default=6))
        ),
        "informativeness_score": max(
            1, min(10, _safe_int(parsed.get("informativeness_score"), default=6))
        ),
        "originality_score": max(
            1, min(10, _safe_int(parsed.get("originality_score"), default=6))
        ),
        "brief_adherence_score": max(
            1, min(10, _safe_int(parsed.get("brief_adherence_score"), default=6))
        ),
        "seo_score": max(1, min(10, _safe_int(parsed.get("seo_score"), default=6))),
        "too_close_to_source": _safe_bool(
            parsed.get("too_close_to_source"), default=False
        ),
        "word_count_estimate": max(
            0, _safe_int(parsed.get("word_count_estimate"), default=0)
        ),
        "constraint_checks": checks,
        "required_revisions": required_revisions,
        "quality_summary": _safe_str(parsed.get("quality_summary"))
        or "Quality summary not provided.",
    }


def _should_run_repair(quality: dict[str, Any], checks: dict[str, Any]) -> bool:
    if quality.get("overall_score", 0) <= 7:
        return True
    if _safe_bool(quality.get("too_close_to_source"), default=False):
        return True

    for key in (
        "target_word_count_met",
        "cta_present",
        "primary_keyword_present",
        "secondary_keywords_present",
    ):
        if not _safe_bool(checks.get(key), default=True):
            return True

    return False
