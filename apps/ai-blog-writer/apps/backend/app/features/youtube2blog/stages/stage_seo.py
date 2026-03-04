"""SEO brief, enrichment, and quality-gate helpers for YouTube2Blog."""

from __future__ import annotations

import logging
import re
from statistics import mean
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.config import (
    Y2B_PRIMARY_MODEL,
    Y2B_SEO_MAX_FOCUS_DENSITY,
    Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
    Y2B_SEO_MAX_FOCUS_OCCURRENCES,
)
from shared import Stage3Output
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)

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

SEO_BRIEF_PROMPT = """You are an SEO strategist for editorial content.

Task:
- Infer on-page SEO direction from the article draft and article type.
- Choose keywords automatically (no user-supplied keyword list).
- Keep choices realistic and semantically aligned with the draft.

ARTICLE TITLE:
{title}

ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

ARTICLE DRAFT (MARKDOWN):
{article}

Return strict JSON only:
{{
  "search_intent": "<informational|commercial investigation|navigational|transactional>",
  "focus_keyword": "<1 short phrase>",
  "secondary_keywords": ["<5 to 8 related phrases>"],
  "seo_objective": "<1 concise sentence>",
  "heading_hints": ["<3 to 5 SEO-friendly heading ideas>"]
}}

Constraints:
- Focus keyword must be naturally supported by the draft.
- Secondary keywords must be semantically related and non-duplicative.
- Avoid vague generic keywords.
"""

SEO_ENRICH_PROMPT = """You are improving on-page SEO quality of an article draft.

Mode: {mode}
Search intent: {search_intent}
Focus keyword: {focus_keyword}
Focus keyword count in source: {focus_count_before}
Max focus keyword count in output: {max_focus_occurrences}
Max focus keyword increase vs source: {max_focus_increase}
Max focus keyword density: {max_focus_density_pct}%
Secondary keywords: {secondary_keywords}
SEO objective: {seo_objective}
Heading hints: {heading_hints}

Article type: {article_type}
Guideline: {guideline}

Rules:
1. Preserve factual meaning from the source draft.
2. Do NOT invent facts, numbers, names, dates, or claims.
3. Keep the writing natural and useful (human-first). SEO is secondary to quality.
4. Use the focus keyword naturally, without forcing repetition.
5. Prefer subtle optimization over aggressive rewriting.
6. Do not overuse secondary keywords; include only when they fit naturally.
7. Preserve markdown structure and readability.
8. Keep overall coverage depth; do not collapse the article.
9. Hard safety limits:
   - Never exceed the max focus keyword count.
   - Never exceed the max focus keyword increase.
   - Keep focus keyword density below the max density.

Retry feedback (if present):
{feedback}

SOURCE ARTICLE:
{article}

Output only improved markdown. No JSON. No explanations.
"""


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _tokenize_terms(value: str) -> list[str]:
    return re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", value.lower())


def _word_count(value: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", value))


def _normalize_for_similarity(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def _split_paragraphs(content: str) -> list[str]:
    return [part.strip() for part in re.split(r"\n\s*\n", content) if part.strip()]


def _extract_headings(content: str) -> list[str]:
    headings: list[str] = []
    for line in content.splitlines():
        if re.match(r"^\s{0,3}#{1,6}\s+\S", line):
            cleaned = re.sub(r"^\s{0,3}#{1,6}\s+", "", line).strip()
            if cleaned:
                headings.append(cleaned)
    return headings


def _keyword_occurrence_count(content: str, keyword: str) -> int:
    clean_keyword = keyword.strip()
    if not clean_keyword:
        return 0
    escaped = re.escape(clean_keyword.lower())
    return len(re.findall(rf"\b{escaped}\b", content.lower()))


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
        token for token in _tokenize_terms(stage3.title) if token not in COMMON_STOPWORDS
    ]
    if len(title_terms) >= 2:
        return f"{title_terms[0]} {title_terms[1]}"
    if title_terms:
        return title_terms[0]
    article_type_terms = _tokenize_terms(stage3.article_type)
    if len(article_type_terms) >= 2:
        return f"{article_type_terms[0]} {article_type_terms[1]}"
    if article_type_terms:
        return article_type_terms[0]
    return "practical guide"


def _fallback_secondary_keywords(stage3: Stage3Output, focus_keyword: str) -> list[str]:
    focus_tokens = set(_tokenize_terms(focus_keyword))
    counts: dict[str, int] = {}
    for token in _tokenize_terms(stage3.final_article):
        if token in COMMON_STOPWORDS or token in focus_tokens:
            continue
        counts[token] = counts.get(token, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    return [token for token, _ in ranked[:8]]


def stage_seo_generate_brief(*, stage3: Stage3Output) -> dict[str, Any]:
    """Generate SEO brief (intent + focus/secondary keywords) from article content."""
    llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=2048,
        model_name=Y2B_PRIMARY_MODEL,
    )
    prompt = PromptTemplate(
        input_variables=["title", "article_type", "guideline", "article"],
        template=SEO_BRIEF_PROMPT,
    )
    full_prompt = prompt.format(
        title=stage3.title[:500],
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        article=stage3.final_article[:20_000],
    )

    fallback_focus = _fallback_focus_keyword(stage3)
    fallback_secondary = _fallback_secondary_keywords(stage3, fallback_focus)
    fallback_intent = _fallback_search_intent(stage3.article_type)

    try:
        raw_response = llm.invoke(full_prompt)
        if not raw_response or not str(raw_response).strip():
            raise RuntimeError("SEO brief returned empty response")
        parsed = parse_json_response(str(raw_response))

        search_intent = _safe_str(parsed.get("search_intent")).lower() or fallback_intent
        if search_intent not in {
            "informational",
            "commercial investigation",
            "navigational",
            "transactional",
        }:
            search_intent = fallback_intent

        focus_keyword = _safe_str(parsed.get("focus_keyword")) or fallback_focus
        raw_secondary = parsed.get("secondary_keywords")
        secondary_keywords = []
        if isinstance(raw_secondary, list):
            for item in raw_secondary:
                candidate = _safe_str(item)
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
                hint = _safe_str(item)
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

        seo_objective = _safe_str(parsed.get("seo_objective"))
        if not seo_objective:
            seo_objective = (
                "Improve discoverability for relevant search intent while keeping "
                "content natural and useful."
            )

        return {
            "search_intent": search_intent,
            "focus_keyword": focus_keyword,
            "secondary_keywords": secondary_keywords,
            "seo_objective": seo_objective,
            "heading_hints": heading_hints,
            "source": "llm",
            "debug_seo_brief_prompt": full_prompt,
            "debug_seo_brief_response": str(raw_response),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("SEO brief fallback triggered: %s", exc)
        return {
            "search_intent": fallback_intent,
            "focus_keyword": fallback_focus,
            "secondary_keywords": fallback_secondary[:8],
            "seo_objective": (
                "Improve discoverability for relevant search intent while keeping "
                "content natural and useful."
            ),
            "heading_hints": [
                f"What to Know About {fallback_focus.title()}",
                f"How to Apply {fallback_focus.title()}",
                "Key Takeaways and Practical Guidance",
            ],
            "source": "heuristic_fallback",
            "error": str(exc),
            "debug_seo_brief_prompt": full_prompt,
            "debug_seo_brief_response": "",
        }


def stage_seo_enrich_article(
    *,
    stage3: Stage3Output,
    seo_brief: dict[str, Any],
    mode: str,
    feedback: str | None = None,
) -> dict[str, Any]:
    """Rewrite article to improve SEO quality while preserving factual integrity."""
    if mode not in {"primary", "retry"}:
        raise ValueError(f"Unsupported SEO mode: {mode}")

    llm = get_vertex_llm(
        temperature=0.2,
        max_tokens=8192,
        model_name=Y2B_PRIMARY_MODEL,
    )
    prompt = PromptTemplate(
        input_variables=[
            "mode",
            "search_intent",
            "focus_keyword",
            "focus_count_before",
            "max_focus_occurrences",
            "max_focus_increase",
            "max_focus_density_pct",
            "secondary_keywords",
            "seo_objective",
            "heading_hints",
            "article_type",
            "guideline",
            "feedback",
            "article",
        ],
        template=SEO_ENRICH_PROMPT,
    )
    focus_keyword = _safe_str(seo_brief.get("focus_keyword"))
    focus_count_before = _keyword_occurrence_count(stage3.final_article, focus_keyword)
    max_focus_occurrences = max(
        Y2B_SEO_MAX_FOCUS_OCCURRENCES,
        focus_count_before + Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
    )
    full_prompt = prompt.format(
        mode=mode,
        search_intent=_safe_str(seo_brief.get("search_intent")) or "informational",
        focus_keyword=focus_keyword,
        focus_count_before=focus_count_before,
        max_focus_occurrences=max_focus_occurrences,
        max_focus_increase=Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
        max_focus_density_pct=round(Y2B_SEO_MAX_FOCUS_DENSITY * 100, 2),
        secondary_keywords=", ".join(
            [_safe_str(item) for item in (seo_brief.get("secondary_keywords") or []) if _safe_str(item)]
        ),
        seo_objective=_safe_str(seo_brief.get("seo_objective")),
        heading_hints=", ".join(
            [_safe_str(item) for item in (seo_brief.get("heading_hints") or []) if _safe_str(item)]
        ),
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        feedback=_safe_str(feedback) if mode == "retry" else "N/A",
        article=stage3.final_article[:24_000],
    )

    raw_response = llm.invoke(full_prompt)
    if not raw_response or not str(raw_response).strip():
        raise RuntimeError("SEO enrich returned empty response")

    seo_article = str(raw_response).strip()
    first_response_text = str(raw_response)

    if _normalize_for_similarity(seo_article) == _normalize_for_similarity(stage3.final_article):
        retry_prompt = (
            full_prompt
            + "\n\nThe rewrite was too similar. Make targeted improvements while keeping keyword usage restrained."
        )
        second_raw = llm.invoke(retry_prompt)
        if second_raw and str(second_raw).strip():
            seo_article = str(second_raw).strip()
            raw_response = second_raw
            full_prompt = retry_prompt

    words_before = _word_count(stage3.final_article)
    words_after = _word_count(seo_article)
    min_allowed_words = max(140, int(words_before * 0.60))
    if words_after < min_allowed_words:
        logger.warning(
            "SEO enrich output too short (%d < %d); keeping previous article",
            words_after,
            min_allowed_words,
        )
        seo_article = stage3.final_article
        words_after = words_before

    focus_count_after = _keyword_occurrence_count(seo_article, focus_keyword)
    focus_density_after = focus_count_after / max(1, words_after)
    focus_count_increase = max(0, focus_count_after - focus_count_before)
    reverted_to_source = False
    if focus_keyword and (
        focus_count_after > max_focus_occurrences
        or focus_count_increase > Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE
        or focus_density_after > Y2B_SEO_MAX_FOCUS_DENSITY
    ):
        logger.warning(
            "SEO enrich output exceeded keyword safety limits; "
            "reverting to source article (after=%d, before=%d, density=%.4f)",
            focus_count_after,
            focus_count_before,
            focus_density_after,
        )
        seo_article = stage3.final_article
        words_after = words_before
        focus_count_after = focus_count_before
        focus_density_after = focus_count_before / max(1, words_before)
        focus_count_increase = 0
        reverted_to_source = True

    return {
        "mode": mode,
        "seo_article": seo_article,
        "word_count_before": words_before,
        "word_count_after": words_after,
        "focus_keyword": focus_keyword,
        "focus_count_before": focus_count_before,
        "focus_count_after": focus_count_after,
        "focus_density_after": round(focus_density_after, 4),
        "focus_count_increase": focus_count_increase,
        "reverted_to_source": reverted_to_source,
        "safety_limits": {
            "max_focus_occurrences": max_focus_occurrences,
            "max_focus_density": Y2B_SEO_MAX_FOCUS_DENSITY,
            "max_focus_occurrence_increase": Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
        },
        "secondary_keywords": [
            _safe_str(item)
            for item in (seo_brief.get("secondary_keywords") or [])
            if _safe_str(item)
        ],
        "debug_seo_prompt": full_prompt,
        "debug_seo_response": str(raw_response),
        "debug_seo_first_response": first_response_text,
    }


def stage_seo_evaluate_quality(
    *,
    article: str,
    seo_brief: dict[str, Any],
    baseline_article: str | None = None,
) -> dict[str, Any]:
    """Deterministic SEO quality evaluation used by graph gating."""
    focus_keyword = _safe_str(seo_brief.get("focus_keyword"))
    secondary_keywords = [
        _safe_str(item)
        for item in (seo_brief.get("secondary_keywords") or [])
        if _safe_str(item)
    ]

    word_count = _word_count(article)
    baseline_word_count = _word_count(baseline_article or "")
    headings = _extract_headings(article)
    paragraphs = _split_paragraphs(article)
    intro = paragraphs[0] if paragraphs else ""
    baseline_focus_occurrences = (
        _keyword_occurrence_count(baseline_article or "", focus_keyword)
        if focus_keyword
        else 0
    )
    dynamic_max_focus_occurrences = max(
        Y2B_SEO_MAX_FOCUS_OCCURRENCES,
        baseline_focus_occurrences + Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
    )

    focus_present = bool(focus_keyword) and _keyword_occurrence_count(article, focus_keyword) > 0
    focus_in_intro = bool(focus_keyword) and _keyword_occurrence_count(intro, focus_keyword) > 0
    focus_in_heading = bool(
        focus_keyword
        and any(
            _keyword_occurrence_count(heading, focus_keyword) > 0
            for heading in headings
        )
    )
    focus_occurrences = _keyword_occurrence_count(article, focus_keyword)
    focus_density = focus_occurrences / max(1, word_count)
    focus_occurrence_increase = max(0, focus_occurrences - baseline_focus_occurrences)

    secondary_hits = [
        keyword
        for keyword in secondary_keywords
        if _keyword_occurrence_count(article, keyword) > 0
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

    weights = {
        "focus_present": 1.25,
        "focus_placement_healthy": 0.75,
        "secondary_coverage": 0.75,
        "no_keyword_stuffing": 2.5,
        "article_length_retained": 2.0,
        "heading_structure": 1.0,
        "readability_balance": 1.25,
    }
    weighted_total = sum(weights.values())
    weighted_score = sum(weight for key, weight in weights.items() if checks[key])
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
