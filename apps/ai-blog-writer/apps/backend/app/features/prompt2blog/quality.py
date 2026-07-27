from __future__ import annotations

import re
from typing import Any

from .content.markdown import _clean_title
from .support import (
    _safe_bool,
    _safe_dict,
    _safe_int,
    _safe_str,
    _tokenize_words,
)

# Share of secondary keywords that must appear before the check passes.
SECONDARY_KEYWORD_COVERAGE_THRESHOLD = 0.6

# must_include items are hard requirements, so the bar is near-total. The
# per-item test is fuzzy (an item is a phrase, not a keyword), hence not 1.0.
MUST_INCLUDE_COVERAGE_THRESHOLD = 0.9

# The audit rubric calls 7-8 "acceptable with edits" and <=6 "requires a hard
# rewrite". Repair therefore fires below 7, not at or below it.
REPAIR_SCORE_THRESHOLD = 7

# Used when the auditor omitted a score. Neutral, and above the repair
# threshold, so a gap in the response is never itself a repair trigger.
NEUTRAL_QUALITY_SCORE = 7


def _extract_narrative_focus(writing_brief: dict[str, Any]) -> str:
    editorial = _safe_str(writing_brief.get("editorial_instructions"))
    if editorial:
        return editorial
    goal = _safe_str(writing_brief.get("goal"))
    if goal:
        return goal
    perspective = _safe_str(writing_brief.get("perspective"))
    return perspective or "No additional narrative focus provided."


# A brief asking for "flights to Lima" is satisfied by prose saying "flight to
# Lima". Raw substring matching failed those, which drove keyword checks false
# and bought a full repair rewrite for a plural.
def _canonical_tokens(value: str) -> list[str]:
    tokens: list[str] = []
    for token in _tokenize_words(value):
        token = token.removesuffix("'s").rstrip("'")
        if len(token) > 4 and token.endswith(("ses", "xes", "zes", "ches", "shes")):
            token = token[:-2]
        elif len(token) > 3 and token.endswith("s"):
            token = token[:-1]
        if token:
            tokens.append(token)
    return tokens


def _contains_phrase(text: str, phrase: str) -> bool:
    phrase_tokens = _canonical_tokens(phrase)
    if not phrase_tokens:
        return True

    text_tokens = _canonical_tokens(text)
    window = len(phrase_tokens)
    for start in range(len(text_tokens) - window + 1):
        if text_tokens[start : start + window] == phrase_tokens:
            return True
    return False


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

    # Requiring every secondary keyword verbatim made the check fail on almost
    # any realistic keyword set, and repair is told to satisfy it "naturally" --
    # which is a direct instruction to keyword-stuff against the SEO guidance.
    secondary_keyword_coverage = 1.0
    if secondary_keywords:
        matched = sum(1 for kw in secondary_keywords if _contains_phrase(combined, kw))
        secondary_keyword_coverage = matched / len(secondary_keywords)
    secondary_keywords_present = (
        secondary_keyword_coverage >= SECONDARY_KEYWORD_COVERAGE_THRESHOLD
    )

    # must_include items are user-stated hard requirements. Nothing used to
    # verify them, so "must mention visa-on-arrival" was silently droppable.
    must_include = [
        _safe_str(item)
        for item in (writing_brief.get("must_include") or [])
        if _safe_str(item)
    ]
    must_include_coverage = 1.0
    if must_include:
        matched = sum(
            1 for item in must_include if _keyword_overlap_ratio(item, combined) >= 0.6
        )
        must_include_coverage = matched / len(must_include)

    # audience_match and tone_match are deliberately absent. They are semantic
    # judgements and belong to the quality auditor; the token-overlap heuristic
    # that used to compute them here overrode the model on the two questions it
    # is actually good at. See _audit_rewrite.
    return {
        "must_include_covered": must_include_coverage >= MUST_INCLUDE_COVERAGE_THRESHOLD,
        "must_include_coverage": round(must_include_coverage, 3),
        "target_word_count_met": target_word_count_met,
        "paragraph_length_met": paragraph_length_met,
        "cta_present": cta_present,
        "primary_keyword_present": primary_keyword_present,
        "secondary_keywords_present": secondary_keywords_present,
        "secondary_keyword_coverage": round(secondary_keyword_coverage, 3),
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

    # Only the semantic checks are read from the auditor. Word count, paragraph
    # length, CTA and keyword presence are measured deterministically in
    # _build_constraint_checks and overwrite anything the model claims, so the
    # prompt no longer asks for them.
    checks_raw = _safe_dict(parsed.get("constraint_checks"))
    checks = {
        "audience_match": _safe_bool(checks_raw.get("audience_match"), default=True),
        "tone_match": _safe_bool(checks_raw.get("tone_match"), default=True),
    }

    # A missing or unparseable score used to default to 6, which sits below the
    # repair threshold -- so a malformed audit response silently bought a full
    # article rewrite. Absent scores now default to neutral and are reported as
    # incomplete, and _should_run_repair ignores the score signal entirely when
    # the audit did not actually produce one.
    audit_complete = _safe_int(parsed.get("overall_score"), default=0) > 0

    def _score(key: str) -> int:
        return max(
            1, min(10, _safe_int(parsed.get(key), default=NEUTRAL_QUALITY_SCORE))
        )

    return {
        "audit_complete": audit_complete,
        "overall_score": _score("overall_score"),
        "guideline_coverage_score": _score("guideline_coverage_score"),
        "informativeness_score": _score("informativeness_score"),
        "originality_score": _score("originality_score"),
        "brief_adherence_score": _score("brief_adherence_score"),
        "seo_score": _score("seo_score"),
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


def _sanitize_groundedness(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalise the grounding check.

    The audit scored `too_close_to_source`, the plagiarism direction. Nothing
    checked the opposite direction: claims in the draft that the sources do not
    support. For travel content -- visa rules, prices, safety guidance -- that
    is the more consequential failure.
    """
    claims_raw = parsed.get("unsupported_claims")
    claims: list[dict[str, str]] = []
    if isinstance(claims_raw, list):
        for item in claims_raw:
            record = _safe_dict(item)
            claim = _safe_str(record.get("claim"))
            if not claim:
                continue
            severity = _safe_str(record.get("severity")).lower()
            claims.append(
                {
                    "claim": claim,
                    "reason": _safe_str(record.get("reason")) or "Reason not stated.",
                    "severity": "high" if severity == "high" else "low",
                }
            )

    high_severity = [claim for claim in claims if claim["severity"] == "high"]
    return {
        "checked": True,
        "grounded": not high_severity,
        "assessment": _safe_str(parsed.get("assessment"))
        or "Grounding assessment not provided.",
        "unsupported_claims": claims,
        "high_severity_count": len(high_severity),
    }


def unchecked_groundedness() -> dict[str, Any]:
    """Result used when the grounding check could not run.

    Treated as grounded so a checker outage degrades the signal rather than
    blocking the run, but recorded as unchecked so it is visible.
    """
    return {
        "checked": False,
        "grounded": True,
        "assessment": "Grounding check did not run.",
        "unsupported_claims": [],
        "high_severity_count": 0,
    }


def _should_run_repair(quality: dict[str, Any], checks: dict[str, Any]) -> bool:
    # Only trust the score when the auditor actually returned one.
    if _safe_bool(quality.get("audit_complete"), default=True):
        if quality.get("overall_score", NEUTRAL_QUALITY_SCORE) < REPAIR_SCORE_THRESHOLD:
            return True
    if _safe_bool(quality.get("too_close_to_source"), default=False):
        return True

    for key in (
        "target_word_count_met",
        "cta_present",
        "primary_keyword_present",
        "secondary_keywords_present",
        "must_include_covered",
        "claims_grounded",
    ):
        if not _safe_bool(checks.get(key), default=True):
            return True

    return False
