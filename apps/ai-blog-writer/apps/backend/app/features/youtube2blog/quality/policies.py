from __future__ import annotations

from typing import Any

from ..config import (
    Y2B_EDITORIAL_GATE_MIN_PARAGRAPHS,
    Y2B_EDITORIAL_GATE_MIN_WORDS,
    Y2B_SEO_MAX_RETRIES,
    Y2B_SEO_MIN_SCORE,
    Y2B_SEO_NEAR_PASS_MARGIN,
    Y2B_STAGE1_LONG_TRANSCRIPT_CHAR_THRESHOLD,
    Y2B_STAGE1_LONG_TRANSCRIPT_MAX_RETENTION_RATIO,
    Y2B_STAGE1_LONG_TRANSCRIPT_MIN_RETENTION_RATIO,
    Y2B_STAGE1_MAX_RETENTION_RATIO,
    Y2B_STAGE1_MEDIUM_TRANSCRIPT_CHAR_THRESHOLD,
    Y2B_STAGE1_MEDIUM_TRANSCRIPT_MAX_RETENTION_RATIO,
    Y2B_STAGE1_MEDIUM_TRANSCRIPT_MIN_RETENTION_RATIO,
    Y2B_STAGE1_MIN_CLEANED_CHARS,
    Y2B_STAGE1_MIN_RETENTION_RATIO,
    Y2B_STAGE1_REPAIR_MAX_RETRIES,
    Y2B_STAGE1_TRANSLATED_MAX_RETENTION_RATIO,
    Y2B_STAGE1_TRANSLATED_MIN_RETENTION_RATIO,
    Y2B_STAGE2_CLASSIFICATION_MAX_RETRIES,
    Y2B_STAGE2_MIN_CONFIDENCE,
    Y2B_STAGE3_MIN_CRITICAL_DIMENSION_SCORE,
    Y2B_STAGE3_MIN_QUALITY_SCORE,
    Y2B_STAGE3_NEAR_PASS_MARGIN,
    Y2B_STAGE3_QUALITY_MAX_RETRIES,
    Y2B_STAGE5_MIN_TITLE_SCORE,
    Y2B_STAGE5_TITLE_MAX_RETRIES,
)


def transcript_retention_policy(
    original_chars: int,
    *,
    translated_source: bool = False,
) -> tuple[str, float, float]:
    if translated_source:
        return (
            "translated",
            Y2B_STAGE1_TRANSLATED_MIN_RETENTION_RATIO,
            Y2B_STAGE1_TRANSLATED_MAX_RETENTION_RATIO,
        )
    if original_chars >= Y2B_STAGE1_LONG_TRANSCRIPT_CHAR_THRESHOLD:
        return (
            "long_form",
            Y2B_STAGE1_LONG_TRANSCRIPT_MIN_RETENTION_RATIO,
            Y2B_STAGE1_LONG_TRANSCRIPT_MAX_RETENTION_RATIO,
        )
    if original_chars >= Y2B_STAGE1_MEDIUM_TRANSCRIPT_CHAR_THRESHOLD:
        return (
            "medium_form",
            Y2B_STAGE1_MEDIUM_TRANSCRIPT_MIN_RETENTION_RATIO,
            Y2B_STAGE1_MEDIUM_TRANSCRIPT_MAX_RETENTION_RATIO,
        )
    return "standard", Y2B_STAGE1_MIN_RETENTION_RATIO, Y2B_STAGE1_MAX_RETENTION_RATIO


def evaluate_transcript_gate(
    *,
    cleaned_chars: int,
    original_chars: int,
    retry_count: int,
    translated_source: bool = False,
) -> tuple[str, dict[str, Any]]:
    profile, minimum_ratio, maximum_ratio = transcript_retention_policy(
        original_chars,
        translated_source=translated_source,
    )
    retention_ratio = cleaned_chars / max(1, original_chars)
    checks = {
        "minimum_cleaned_chars": cleaned_chars >= Y2B_STAGE1_MIN_CLEANED_CHARS,
        "minimum_retention_ratio": retention_ratio >= minimum_ratio,
        "maximum_retention_ratio": retention_ratio <= maximum_ratio,
    }
    passed = all(checks.values())
    if passed:
        decision = "pass"
    elif retry_count < Y2B_STAGE1_REPAIR_MAX_RETRIES:
        decision = "retry"
    else:
        failed_checks = [name for name, ok in checks.items() if not ok]
        raise RuntimeError(
            "Stage 1 quality gate failed after retries; "
            f"checks_failed={failed_checks}, cleaned_chars={cleaned_chars}, "
            f"retention_ratio={retention_ratio:.3f}, "
            f"minimum_retention_ratio={minimum_ratio:.3f}, "
            f"maximum_retention_ratio={maximum_ratio:.3f}, "
            f"profile={profile}"
        )
    return decision, {
        "passed": passed,
        "decision": decision,
        "retry_count": retry_count,
        "max_retries": Y2B_STAGE1_REPAIR_MAX_RETRIES,
        "checks": checks,
        "metrics": {
            "cleaned_chars": cleaned_chars,
            "original_chars": original_chars,
            "retention_ratio": round(retention_ratio, 4),
            "minimum_retention_ratio_threshold": round(minimum_ratio, 4),
            "maximum_retention_ratio_threshold": round(maximum_ratio, 4),
            "transcript_length_profile": profile,
            "translated_source": translated_source,
        },
    }


def evaluate_classification_gate(
    *,
    confidence: float,
    classification: str,
    reasoning: str,
    retry_count: int,
) -> tuple[str, dict[str, Any]]:
    passed = confidence >= Y2B_STAGE2_MIN_CONFIDENCE
    if passed:
        decision = "pass"
    elif retry_count < Y2B_STAGE2_CLASSIFICATION_MAX_RETRIES:
        decision = "retry"
    else:
        raise RuntimeError(
            "Stage 2 quality gate failed after retries; "
            f"confidence={confidence:.3f}, threshold={Y2B_STAGE2_MIN_CONFIDENCE:.3f}, "
            f"classification={classification!r}"
        )
    return decision, {
        "passed": passed,
        "decision": decision,
        "retry_count": retry_count,
        "max_retries": Y2B_STAGE2_CLASSIFICATION_MAX_RETRIES,
        "metrics": {
            "confidence": confidence,
            "threshold": Y2B_STAGE2_MIN_CONFIDENCE,
        },
        "classification": classification,
        "reasoning": reasoning,
    }


def evaluate_article_quality_gate(
    assessment: dict[str, Any],
    *,
    retry_count: int,
) -> tuple[str, dict[str, Any]]:
    raw_scores = assessment.get("dimension_scores")
    dimension_scores = dict(raw_scores) if isinstance(raw_scores, dict) else {}
    overall_score = float(assessment.get("overall_quality_score", 0.0))
    critical_dimensions = (
        "clarity",
        "structure_coherence",
        "usefulness_actionability",
    )
    critical_failed = [
        key
        for key in critical_dimensions
        if float(dimension_scores.get(key, 0.0))
        < Y2B_STAGE3_MIN_CRITICAL_DIMENSION_SCORE
    ]
    strict_pass = (
        overall_score >= Y2B_STAGE3_MIN_QUALITY_SCORE and not critical_failed
    )
    near_pass = not critical_failed and overall_score >= (
        Y2B_STAGE3_MIN_QUALITY_SCORE - Y2B_STAGE3_NEAR_PASS_MARGIN
    )
    if strict_pass:
        decision, pass_mode = "pass", "strict"
    elif retry_count < Y2B_STAGE3_QUALITY_MAX_RETRIES:
        decision, pass_mode = "retry", "retry_required"
    elif near_pass:
        decision, pass_mode = "pass", "near_pass"
    elif not critical_failed:
        decision, pass_mode = "pass", "best_effort"
    else:
        raise RuntimeError(
            "Stage 3 quality gate failed after retries; "
            f"score={overall_score:.2f}, "
            f"threshold={Y2B_STAGE3_MIN_QUALITY_SCORE:.2f}, "
            f"critical_failed={critical_failed}"
        )
    return decision, {
        **assessment,
        "decision": decision,
        "passed": decision == "pass",
        "pass_mode": pass_mode,
        "retry_count": retry_count,
        "max_retries": Y2B_STAGE3_QUALITY_MAX_RETRIES,
        "score_threshold": Y2B_STAGE3_MIN_QUALITY_SCORE,
        "near_pass_margin": Y2B_STAGE3_NEAR_PASS_MARGIN,
        "critical_dimension_threshold": Y2B_STAGE3_MIN_CRITICAL_DIMENSION_SCORE,
        "critical_dimensions": list(critical_dimensions),
        "critical_failed": critical_failed,
    }


def evaluate_seo_gate(
    evaluation: dict[str, Any],
    *,
    retry_count: int,
) -> tuple[str, dict[str, Any]]:
    score = float(evaluation.get("score", 0.0))
    checks = evaluation.get("checks", {})
    checks_dict = dict(checks) if isinstance(checks, dict) else {}
    critical_checks = ("no_keyword_stuffing", "article_length_retained")
    critical_failed = [
        key for key in critical_checks if not bool(checks_dict.get(key))
    ]
    strict_pass = score >= Y2B_SEO_MIN_SCORE and not critical_failed
    near_pass = (
        score >= (Y2B_SEO_MIN_SCORE - Y2B_SEO_NEAR_PASS_MARGIN)
        and not critical_failed
    )
    if strict_pass:
        decision, pass_mode = "pass", "strict"
    elif retry_count < Y2B_SEO_MAX_RETRIES:
        decision, pass_mode = "retry", "retry_required"
    elif near_pass:
        decision, pass_mode = "pass", "near_pass"
    else:
        decision, pass_mode = "rollback", "rollback_after_failed_gate"
    return decision, {
        **evaluation,
        "decision": decision,
        "pass_mode": pass_mode,
        "retry_count": retry_count,
        "max_retries": Y2B_SEO_MAX_RETRIES,
        "score_threshold": Y2B_SEO_MIN_SCORE,
        "near_pass_margin": Y2B_SEO_NEAR_PASS_MARGIN,
        "critical_checks": list(critical_checks),
        "critical_failed": critical_failed,
    }


def evaluate_editorial_gate(*, words: int, paragraphs: int) -> tuple[str, dict[str, Any]]:
    decision = (
        "augment"
        if words >= Y2B_EDITORIAL_GATE_MIN_WORDS
        and paragraphs >= Y2B_EDITORIAL_GATE_MIN_PARAGRAPHS
        else "skip"
    )
    return decision, {
        "decision": decision,
        "thresholds": {
            "min_words": Y2B_EDITORIAL_GATE_MIN_WORDS,
            "min_paragraphs": Y2B_EDITORIAL_GATE_MIN_PARAGRAPHS,
        },
        "metrics": {"word_count": words, "paragraph_count": paragraphs},
    }


def evaluate_title_gate(
    evaluation: dict[str, Any],
    *,
    retry_count: int,
    title: str,
) -> tuple[str, dict[str, Any]]:
    score = float(evaluation.get("score", 0.0))
    checks = evaluation.get("checks", {})
    length_range_ok = (
        bool(checks.get("length_range")) if isinstance(checks, dict) else False
    )
    passed = score >= Y2B_STAGE5_MIN_TITLE_SCORE and length_range_ok
    if passed:
        decision = "pass"
    elif retry_count < Y2B_STAGE5_TITLE_MAX_RETRIES:
        decision = "retry"
    else:
        raise RuntimeError(
            "Stage 5 quality gate failed after retries; "
            f"score={score:.2f}, threshold={Y2B_STAGE5_MIN_TITLE_SCORE:.2f}, "
            f"title={title!r}"
        )
    return decision, {
        **evaluation,
        "decision": decision,
        "retry_count": retry_count,
        "max_retries": Y2B_STAGE5_TITLE_MAX_RETRIES,
        "score_threshold": Y2B_STAGE5_MIN_TITLE_SCORE,
        "title": title,
    }
