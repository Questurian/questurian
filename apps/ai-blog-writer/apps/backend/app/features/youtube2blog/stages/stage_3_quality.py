"""Stage 3 quality assessment and improvement helpers."""

from __future__ import annotations

import logging
import re
from statistics import mean
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from shared import Stage3Output
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)

QUALITY_DIMENSIONS = (
    "clarity",
    "structure_coherence",
    "specificity",
    "usefulness_actionability",
    "repetition_control",
    "audience_fit",
)

ARTICLE_QUALITY_ASSESSMENT_PROMPT = """You are evaluating article readiness for publication.

Task:
- Evaluate whether the draft is high quality for its article type and guideline.
- Do NOT classify tone or label it as "AI sounding."
- Focus on practical quality signals that impact reader value.

ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

DRAFT ARTICLE (MARKDOWN):
{article}

Return strict JSON only:
{{
  "dimension_scores": {{
    "clarity": <0-10>,
    "structure_coherence": <0-10>,
    "specificity": <0-10>,
    "usefulness_actionability": <0-10>,
    "repetition_control": <0-10>,
    "audience_fit": <0-10>
  }},
  "overall_quality_score": <0-10>,
  "top_issues": ["<max 3 concrete issues>"],
  "rewrite_brief": ["<3-5 specific rewrite instructions>"]
}}

Scoring intent:
- clarity: easy to understand without ambiguity
- structure_coherence: logical flow and section sequencing
- specificity: concrete details/examples vs generic filler
- usefulness_actionability: reader can do something with it
- repetition_control: low redundancy and low fluff
- audience_fit: aligns with intent of article type + guideline
"""

ARTICLE_QUALITY_IMPROVEMENT_PROMPT = """You are improving an article draft for publication quality.

Rewrite mode: {mode}
Article type: {article_type}
Guideline: {guideline}
Priority quality dimensions:
{focus_dimensions}

Quality issues to fix:
{top_issues}

Rewrite brief:
{rewrite_brief}

Rules:
1. Preserve factual meaning from the source draft.
2. Do NOT add new factual claims, numbers, dates, or entities not supported by source draft.
3. Improve clarity, specificity, flow, and usefulness.
4. Reduce generic filler and repetition.
5. Preserve markdown format and section structure.
6. Keep roughly similar coverage depth (do not collapse into a short summary).
7. Respect rewrite mode:
   - light: tighten wording and improve transitions with minimal structural changes
   - medium: rephrase and reorganize sections for clarity and usefulness
   - strong: substantial rewrite for clarity/specificity while keeping factual meaning

SOURCE DRAFT:
{article}

Output only the improved markdown article. No JSON, no explanations.
"""


def _clamp_score(value: Any, *, default: float = 5.0) -> float:
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


def _tokenize_words(value: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", value.lower())


def _normalize_for_similarity(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def _derive_focus_dimensions(dimension_scores: dict[str, float]) -> list[str]:
    ranked = sorted(dimension_scores.items(), key=lambda item: item[1])
    focused = [name for name, _ in ranked[:3]]
    return focused


def _heuristic_quality_assessment(article: str) -> dict[str, Any]:
    words = _tokenize_words(article)
    word_count = len(words)
    unique_ratio = (len(set(words)) / max(1, word_count)) if word_count else 0.0
    paragraphs = [part for part in re.split(r"\n\s*\n", article) if part.strip()]
    paragraph_count = len(paragraphs)
    headings_count = len(re.findall(r"(?m)^\s{0,3}#{1,6}\s+\S", article))
    sentence_like = re.split(r"(?<=[.!?])\s+", article.strip())
    sentence_lengths = [len(_tokenize_words(sentence)) for sentence in sentence_like if sentence]
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
        "clarity": _clamp_score(clarity),
        "structure_coherence": _clamp_score(structure),
        "specificity": _clamp_score(specificity),
        "usefulness_actionability": _clamp_score(usefulness),
        "repetition_control": _clamp_score(repetition),
        "audience_fit": _clamp_score(audience_fit),
    }
    overall_quality_score = round(mean(dimension_scores.values()), 2)

    sorted_dimensions = sorted(
        dimension_scores.items(),
        key=lambda item: item[1],
    )
    top_issues = [
        f"Improve {name.replace('_', ' ')} (current {score:.1f}/10)."
        for name, score in sorted_dimensions[:3]
    ]
    rewrite_brief = [
        "Tighten verbose sentences and remove redundant phrasing.",
        "Increase concrete detail and examples where sections are generic.",
        "Strengthen transitions between sections for clearer flow.",
        "Preserve factual content while improving reader usefulness.",
    ]
    return {
        "dimension_scores": dimension_scores,
        "overall_quality_score": overall_quality_score,
        "top_issues": top_issues,
        "rewrite_brief": rewrite_brief,
        "evaluation_source": "heuristic_fallback",
    }


def stage_3_assess_article_quality(
    *,
    stage3: Stage3Output,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Assess Stage 3 article quality against publication-readiness dimensions."""
    llm = get_vertex_llm(
        temperature=0.05,
        max_tokens=2048,
        model_name=model_name,
    )
    prompt = PromptTemplate(
        input_variables=["article_type", "guideline", "article"],
        template=ARTICLE_QUALITY_ASSESSMENT_PROMPT,
    )
    full_prompt = prompt.format(
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        article=stage3.final_article[:20000],
    )

    try:
        raw_response = llm.invoke(full_prompt)
        if not raw_response or not str(raw_response).strip():
            raise RuntimeError("Quality assessment returned empty response")
        parsed = parse_json_response(str(raw_response))
        raw_dimensions = parsed.get("dimension_scores", {})
        dimension_scores = {
            key: _clamp_score(raw_dimensions.get(key), default=5.0)
            for key in QUALITY_DIMENSIONS
        }
        overall_quality_score = _clamp_score(
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
                f"Improve {name.replace('_', ' ')}."
                for name, _ in sorted_dimensions[:3]
            ]
        if not rewrite_brief:
            rewrite_brief = [
                "Reduce filler and repetition while preserving meaning.",
                "Increase specificity with concrete wording.",
                "Improve structure and transitions for smoother reading.",
            ]

        return {
            "dimension_scores": dimension_scores,
            "overall_quality_score": overall_quality_score,
            "top_issues": top_issues,
            "rewrite_brief": rewrite_brief,
            "evaluation_source": "llm",
            "debug_quality_prompt": full_prompt,
            "debug_quality_response": str(raw_response),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stage 3 quality assessment fallback triggered: %s", exc)
        heuristic = _heuristic_quality_assessment(stage3.final_article)
        heuristic["debug_quality_prompt"] = full_prompt
        heuristic["debug_quality_response"] = ""
        heuristic["error"] = str(exc)
        return heuristic


def stage_3_pick_improvement_mode(
    *,
    overall_quality_score: float,
    retry_count: int,
) -> str:
    """Select rewrite intensity based on score and retry count."""
    if retry_count >= 2:
        return "strong"
    if overall_quality_score >= 7.3:
        return "light"
    if overall_quality_score >= 6.2:
        return "medium"
    return "strong"


def stage_3_improve_article(
    *,
    stage3: Stage3Output,
    top_issues: list[str],
    rewrite_brief: list[str],
    mode: str,
    focus_dimensions: list[str] | None = None,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Rewrite article draft to improve quality while preserving facts."""
    if mode not in {"light", "medium", "strong"}:
        raise ValueError(f"Unsupported rewrite mode: {mode}")

    llm = get_vertex_llm(
        temperature=0.2,
        max_tokens=8192,
        model_name=model_name,
    )
    prompt = PromptTemplate(
        input_variables=[
            "mode",
            "article_type",
            "guideline",
            "focus_dimensions",
            "top_issues",
            "rewrite_brief",
            "article",
        ],
        template=ARTICLE_QUALITY_IMPROVEMENT_PROMPT,
    )
    full_prompt = prompt.format(
        mode=mode,
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        focus_dimensions=", ".join(focus_dimensions or []) or "clarity, specificity, structure",
        top_issues="\n".join(f"- {item}" for item in top_issues[:3]) or "- Improve overall quality.",
        rewrite_brief="\n".join(f"- {item}" for item in rewrite_brief[:5])
        or "- Improve clarity and usefulness while preserving facts.",
        article=stage3.final_article[:24000],
    )

    raw_response = llm.invoke(full_prompt)
    if not raw_response or not str(raw_response).strip():
        raise RuntimeError("Stage 3 quality improvement returned empty response")

    improved_article = str(raw_response).strip()
    first_response_text = str(raw_response)

    # If the rewrite is effectively unchanged, force a stronger second attempt.
    if _normalize_for_similarity(improved_article) == _normalize_for_similarity(
        stage3.final_article
    ):
        stronger_mode = "strong" if mode != "strong" else mode
        fallback_prompt = (
            full_prompt
            + "\n\nThe prior rewrite was too similar. Rewrite more decisively while preserving facts."
        )
        second_raw = llm.invoke(fallback_prompt)
        if second_raw and str(second_raw).strip():
            improved_article = str(second_raw).strip()
            raw_response = second_raw
            mode = stronger_mode
            full_prompt = fallback_prompt

    original_word_count = len(_tokenize_words(stage3.final_article))
    improved_word_count = len(_tokenize_words(improved_article))
    min_allowed_words = max(120, int(original_word_count * 0.55))
    if improved_word_count < min_allowed_words:
        logger.warning(
            "Stage 3 quality improvement too short (%d < %d); keeping original draft",
            improved_word_count,
            min_allowed_words,
        )
        improved_article = stage3.final_article
        improved_word_count = original_word_count

    return {
        "mode": mode,
        "focus_dimensions": list(focus_dimensions or []),
        "improved_article": improved_article,
        "word_count_before": original_word_count,
        "word_count_after": improved_word_count,
        "debug_improve_prompt": full_prompt,
        "debug_improve_response": str(raw_response),
        "debug_improve_first_response": first_response_text,
    }


def stage_3_build_targeted_feedback(
    *,
    dimension_scores: dict[str, float],
    top_issues: list[str],
    rewrite_brief: list[str],
) -> dict[str, Any]:
    """Derive focused rewrite instructions from weak quality dimensions."""
    focus_dimensions = _derive_focus_dimensions(dimension_scores)

    dimension_hints = {
        "clarity": "Shorten dense sentences and resolve ambiguous phrasing.",
        "structure_coherence": "Reorder sections for clearer progression and add stronger transitions.",
        "specificity": "Replace generic wording with concrete examples/details already present in source.",
        "usefulness_actionability": "Make guidance more actionable with explicit reader takeaways.",
        "repetition_control": "Remove repetitive statements and redundant filler phrases.",
        "audience_fit": "Align framing and depth with the intended reader and article type.",
    }

    enhanced_brief = list(rewrite_brief)
    for key in focus_dimensions:
        hint = dimension_hints.get(key)
        if hint and hint not in enhanced_brief:
            enhanced_brief.append(hint)

    enhanced_issues = list(top_issues)
    for key in focus_dimensions:
        issue = f"Raise {key.replace('_', ' ')} with targeted rewrite."
        if issue not in enhanced_issues:
            enhanced_issues.append(issue)

    return {
        "focus_dimensions": focus_dimensions,
        "top_issues": enhanced_issues[:5],
        "rewrite_brief": enhanced_brief[:7],
    }
