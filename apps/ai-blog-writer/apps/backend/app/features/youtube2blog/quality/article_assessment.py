"""Pure Stage 3 article assessment policy."""

from __future__ import annotations

import re
from statistics import mean
from typing import Any

QUALITY_DIMENSIONS = (
    "clarity",
    "structure_coherence",
    "specificity",
    "usefulness_actionability",
    "repetition_control",
    "audience_fit",
)

_DEFAULT_REWRITE_BRIEF = [
    "Reduce filler and repetition while preserving meaning.",
    "Increase specificity with concrete wording.",
    "Improve structure and transitions for smoother reading.",
]


def clamp_score(value: Any, *, default: float = 5.0) -> float:
    """Coerce an assessment score into the supported zero-to-ten range."""
    try:
        score = float(value)
    except (TypeError, ValueError):
        return default
    return round(max(0.0, min(10.0, score)), 2)


def _safe_list_of_strings(value: Any, *, max_items: int) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for raw in value:
        text = str(raw).strip()
        if not text:
            continue
        items.append(text)
        if len(items) >= max_items:
            break
    return items


def tokenize_words(value: str) -> list[str]:
    """Return normalized words for quality metrics and rewrite safeguards."""
    return re.findall(r"[A-Za-z0-9']+", value.lower())


def normalize_llm_assessment(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalize an untrusted assessment payload into the Quality Gate contract."""
    raw_dimensions = parsed.get("dimension_scores", {})
    dimension_scores = {
        key: clamp_score(raw_dimensions.get(key), default=5.0)
        for key in QUALITY_DIMENSIONS
    }
    overall_quality_score = clamp_score(
        parsed.get("overall_quality_score"),
        default=mean(dimension_scores.values()),
    )
    top_issues = _safe_list_of_strings(parsed.get("top_issues"), max_items=3)
    rewrite_brief = _safe_list_of_strings(parsed.get("rewrite_brief"), max_items=5)

    if not top_issues:
        sorted_dimensions = sorted(
            dimension_scores.items(),
            key=lambda item: item[1],
        )
        top_issues = [
            f"Improve {name.replace('_', ' ')}." for name, _ in sorted_dimensions[:3]
        ]
    if not rewrite_brief:
        rewrite_brief = list(_DEFAULT_REWRITE_BRIEF)

    return {
        "dimension_scores": dimension_scores,
        "overall_quality_score": overall_quality_score,
        "top_issues": top_issues,
        "rewrite_brief": rewrite_brief,
        "evaluation_source": "llm",
    }


def assess_article_heuristically(article: str) -> dict[str, Any]:
    """Provide a deterministic assessment when the provider cannot evaluate."""
    words = tokenize_words(article)
    word_count = len(words)
    unique_ratio = (len(set(words)) / max(1, word_count)) if word_count else 0.0
    paragraphs = [part for part in re.split(r"\n\s*\n", article) if part.strip()]
    paragraph_count = len(paragraphs)
    headings_count = len(re.findall(r"(?m)^\s{0,3}#{1,6}\s+\S", article))
    sentence_like = re.split(r"(?<=[.!?])\s+", article.strip())
    sentence_lengths = [
        len(tokenize_words(sentence)) for sentence in sentence_like if sentence
    ]
    avg_sentence_len = mean(sentence_lengths) if sentence_lengths else 0.0
    actionable_markers = len(
        re.findall(
            r"\b(step|steps|how to|should|can|need to|tip|tips|checklist|action)\b",
            article.lower(),
        )
    )
    numeric_markers = len(re.findall(r"\b\d+(?:\.\d+)?\b", article))

    clarity = 7.0
    if avg_sentence_len > 28:
        clarity -= 1.2
    elif avg_sentence_len < 8:
        clarity -= 0.8
    if paragraph_count < 3:
        clarity -= 1.0

    structure = 6.8
    if headings_count >= 2:
        structure += 0.8
    if paragraph_count < 4:
        structure -= 0.9

    specificity = 6.5
    if numeric_markers >= 3:
        specificity += 0.7
    if unique_ratio < 0.42:
        specificity -= 1.0

    usefulness = 6.3
    if actionable_markers >= 3:
        usefulness += 0.9
    if word_count < 220:
        usefulness -= 0.8

    repetition = 7.0
    if unique_ratio < 0.36:
        repetition -= 1.6
    elif unique_ratio < 0.42:
        repetition -= 0.9

    audience_fit = 6.9
    if headings_count >= 2 and actionable_markers >= 2:
        audience_fit += 0.6

    dimension_scores = {
        "clarity": clamp_score(clarity),
        "structure_coherence": clamp_score(structure),
        "specificity": clamp_score(specificity),
        "usefulness_actionability": clamp_score(usefulness),
        "repetition_control": clamp_score(repetition),
        "audience_fit": clamp_score(audience_fit),
    }
    sorted_dimensions = sorted(
        dimension_scores.items(),
        key=lambda item: item[1],
    )
    return {
        "dimension_scores": dimension_scores,
        "overall_quality_score": round(mean(dimension_scores.values()), 2),
        "top_issues": [
            f"Improve {name.replace('_', ' ')} (current {score:.1f}/10)."
            for name, score in sorted_dimensions[:3]
        ],
        "rewrite_brief": [
            "Tighten verbose sentences and remove redundant phrasing.",
            "Increase concrete detail and examples where sections are generic.",
            "Strengthen transitions between sections for clearer flow.",
            "Preserve factual content while improving reader usefulness.",
        ],
        "evaluation_source": "heuristic_fallback",
    }
