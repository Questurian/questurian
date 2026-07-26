"""Pure deterministic assessment for the YouTube2Blog SEO quality gate."""

from __future__ import annotations

import re
from statistics import mean
from typing import Any

from app.features.youtube2blog.config import (
    Y2B_SEO_MAX_FOCUS_DENSITY,
    Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
    Y2B_SEO_MAX_FOCUS_OCCURRENCES,
)
from app.features.youtube2blog.content.markdown import count_words
from app.features.youtube2blog.content.seo_metrics import (
    extract_headings,
    keyword_occurrence_count,
    safe_text,
    split_paragraphs,
)

SEO_CHECK_WEIGHTS = {
    "focus_present": 1.25,
    "focus_placement_healthy": 0.75,
    "secondary_coverage": 0.75,
    "no_keyword_stuffing": 2.5,
    "article_length_retained": 2.0,
    "heading_structure": 1.0,
    "readability_balance": 1.25,
}


def evaluate_seo_quality(
    *,
    article: str,
    seo_brief: dict[str, Any],
    baseline_article: str | None = None,
) -> dict[str, Any]:
    """Evaluate enriched article SEO quality for graph gating."""
    focus_keyword = safe_text(seo_brief.get("focus_keyword"))
    secondary_keywords = [
        safe_text(item)
        for item in (seo_brief.get("secondary_keywords") or [])
        if safe_text(item)
    ]

    word_count = count_words(article)
    baseline_word_count = count_words(baseline_article or "")
    headings = extract_headings(article)
    paragraphs = split_paragraphs(article)
    intro = paragraphs[0] if paragraphs else ""
    baseline_focus_occurrences = (
        keyword_occurrence_count(baseline_article or "", focus_keyword)
        if focus_keyword
        else 0
    )
    dynamic_max_focus_occurrences = max(
        Y2B_SEO_MAX_FOCUS_OCCURRENCES,
        baseline_focus_occurrences + Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
    )

    focus_present = (
        bool(focus_keyword) and keyword_occurrence_count(article, focus_keyword) > 0
    )
    focus_in_intro = (
        bool(focus_keyword) and keyword_occurrence_count(intro, focus_keyword) > 0
    )
    focus_in_heading = bool(
        focus_keyword
        and any(
            keyword_occurrence_count(heading, focus_keyword) > 0 for heading in headings
        )
    )
    focus_occurrences = keyword_occurrence_count(article, focus_keyword)
    focus_density = focus_occurrences / max(1, word_count)
    focus_occurrence_increase = max(
        0,
        focus_occurrences - baseline_focus_occurrences,
    )

    secondary_hits = [
        keyword
        for keyword in secondary_keywords
        if keyword_occurrence_count(article, keyword) > 0
    ]
    if secondary_keywords:
        secondary_target = min(2, len(secondary_keywords))
        secondary_coverage = len(secondary_hits) >= secondary_target
    else:
        secondary_coverage = True

    sentence_like = re.split(r"(?<=[.!?])\s+", article.strip())
    sentence_lengths = [
        len(re.findall(r"[A-Za-z0-9']+", sentence))
        for sentence in sentence_like
        if sentence.strip()
    ]
    avg_sentence_len = mean(sentence_lengths) if sentence_lengths else 0.0
    if baseline_word_count > 0:
        min_retained_words = max(220, int(baseline_word_count * 0.80))
        article_length_retained = word_count >= min_retained_words
    else:
        min_retained_words = 260
        article_length_retained = word_count >= min_retained_words

    checks: dict[str, bool] = {
        "focus_present": focus_present,
        "focus_placement_healthy": focus_in_intro or focus_in_heading,
        "secondary_coverage": secondary_coverage,
        "no_keyword_stuffing": (
            focus_density <= Y2B_SEO_MAX_FOCUS_DENSITY
            and focus_occurrences <= dynamic_max_focus_occurrences
            and focus_occurrence_increase <= Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE
        ),
        "article_length_retained": article_length_retained,
        "heading_structure": len(headings) >= 2,
        "readability_balance": 9.0 <= avg_sentence_len <= 30.0,
    }

    weighted_total = sum(SEO_CHECK_WEIGHTS.values())
    weighted_score = sum(
        weight for key, weight in SEO_CHECK_WEIGHTS.items() if checks[key]
    )
    score = round((weighted_score / weighted_total) * 10.0, 2)

    failures = [name for name, passed in checks.items() if not passed]
    if failures:
        feedback = "Improve SEO by fixing: " + ", ".join(failures) + "."
    else:
        feedback = "SEO checks passed."

    return {
        "score": score,
        "checks": checks,
        "feedback": feedback,
        "metrics": {
            "word_count": word_count,
            "baseline_word_count": baseline_word_count,
            "min_retained_words": min_retained_words,
            "focus_occurrences": focus_occurrences,
            "baseline_focus_occurrences": baseline_focus_occurrences,
            "focus_occurrence_increase": focus_occurrence_increase,
            "max_focus_occurrences_allowed": dynamic_max_focus_occurrences,
            "max_focus_density_allowed": Y2B_SEO_MAX_FOCUS_DENSITY,
            "focus_density": round(focus_density, 4),
            "secondary_hits": secondary_hits[:8],
            "heading_count": len(headings),
            "avg_sentence_length": round(avg_sentence_len, 2),
        },
        "focus_keyword": focus_keyword,
        "secondary_keywords": secondary_keywords,
    }
