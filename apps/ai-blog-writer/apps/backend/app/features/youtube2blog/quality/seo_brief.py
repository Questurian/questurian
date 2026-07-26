"""Pure normalization and fallback policy for YouTube2Blog SEO briefs."""

from __future__ import annotations

from typing import Any

from app.features.youtube2blog.content.seo_metrics import safe_text, tokenize_terms
from shared import Stage3Output

COMMON_STOPWORDS = {
    "about",
    "after",
    "also",
    "among",
    "and",
    "are",
    "because",
    "been",
    "before",
    "being",
    "between",
    "could",
    "does",
    "from",
    "have",
    "into",
    "like",
    "more",
    "most",
    "over",
    "should",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "under",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
    "your",
}

DEFAULT_SEO_OBJECTIVE = (
    "Improve discoverability for relevant search intent while keeping "
    "content natural and useful."
)

VALID_SEARCH_INTENTS = {
    "informational",
    "commercial investigation",
    "navigational",
    "transactional",
}


def _fallback_search_intent(article_type: str) -> str:
    article_type_lower = article_type.lower()
    if "comparison" in article_type_lower or "versus" in article_type_lower:
        return "commercial investigation"
    if "review" in article_type_lower or "best of" in article_type_lower:
        return "commercial investigation"
    if "buy" in article_type_lower or "deal" in article_type_lower:
        return "transactional"
    return "informational"


def _fallback_focus_keyword(stage3: Stage3Output) -> str:
    title_terms = [
        token for token in tokenize_terms(stage3.title) if token not in COMMON_STOPWORDS
    ]
    if len(title_terms) >= 2:
        return f"{title_terms[0]} {title_terms[1]}"
    if title_terms:
        return title_terms[0]
    article_type_terms = tokenize_terms(stage3.article_type)
    if len(article_type_terms) >= 2:
        return f"{article_type_terms[0]} {article_type_terms[1]}"
    if article_type_terms:
        return article_type_terms[0]
    return "practical guide"


def _fallback_secondary_keywords(
    stage3: Stage3Output,
    focus_keyword: str,
) -> list[str]:
    focus_tokens = set(tokenize_terms(focus_keyword))
    counts: dict[str, int] = {}
    for token in tokenize_terms(stage3.final_article):
        if token in COMMON_STOPWORDS or token in focus_tokens:
            continue
        counts[token] = counts.get(token, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    return [token for token, _ in ranked[:8]]


def build_fallback_seo_brief(stage3: Stage3Output) -> dict[str, Any]:
    """Build a complete deterministic SEO brief."""
    focus_keyword = _fallback_focus_keyword(stage3)
    return {
        "search_intent": _fallback_search_intent(stage3.article_type),
        "focus_keyword": focus_keyword,
        "secondary_keywords": _fallback_secondary_keywords(
            stage3,
            focus_keyword,
        )[:8],
        "seo_objective": DEFAULT_SEO_OBJECTIVE,
        "heading_hints": [
            f"What to Know About {focus_keyword.title()}",
            f"How to Apply {focus_keyword.title()}",
            "Key Takeaways and Practical Guidance",
        ],
        "source": "heuristic_fallback",
    }


def normalize_seo_brief(
    parsed: dict[str, Any],
    *,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    """Normalize an untrusted provider payload into the SEO brief contract."""
    fallback_intent = str(fallback["search_intent"])
    fallback_focus = str(fallback["focus_keyword"])
    fallback_secondary = list(fallback["secondary_keywords"])

    search_intent = safe_text(parsed.get("search_intent")).lower()
    search_intent = search_intent or fallback_intent
    if search_intent not in VALID_SEARCH_INTENTS:
        search_intent = fallback_intent

    focus_keyword = safe_text(parsed.get("focus_keyword")) or fallback_focus
    raw_secondary = parsed.get("secondary_keywords")
    secondary_keywords = []
    if isinstance(raw_secondary, list):
        for item in raw_secondary:
            candidate = safe_text(item)
            if not candidate:
                continue
            if candidate.lower() == focus_keyword.lower():
                continue
            if candidate in secondary_keywords:
                continue
            secondary_keywords.append(candidate)
            if len(secondary_keywords) >= 8:
                break
    if len(secondary_keywords) < 5:
        for fallback_kw in fallback_secondary:
            if fallback_kw.lower() == focus_keyword.lower():
                continue
            if fallback_kw in secondary_keywords:
                continue
            secondary_keywords.append(fallback_kw)
            if len(secondary_keywords) >= 8:
                break

    raw_hints = parsed.get("heading_hints")
    heading_hints = []
    if isinstance(raw_hints, list):
        for item in raw_hints:
            hint = safe_text(item)
            if not hint:
                continue
            heading_hints.append(hint)
            if len(heading_hints) >= 5:
                break
    if not heading_hints:
        heading_hints = [
            f"What to Know About {focus_keyword.title()}",
            f"How to Use {focus_keyword.title()} Effectively",
            "Common Mistakes and Better Approaches",
        ]

    return {
        "search_intent": search_intent,
        "focus_keyword": focus_keyword,
        "secondary_keywords": secondary_keywords,
        "seo_objective": safe_text(parsed.get("seo_objective"))
        or DEFAULT_SEO_OBJECTIVE,
        "heading_hints": heading_hints,
        "source": "llm",
    }
