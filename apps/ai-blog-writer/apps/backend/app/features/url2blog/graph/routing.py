"""Pure Quality Gate and rollback policy for URL2Blog."""

from __future__ import annotations

from typing import Any

from ..llm.coerce import _tokenize_similarity_words

URL2BLOG_REWRITE_GATE_MIN_SCORE = 8.0
URL2BLOG_REWRITE_GATE_NEAR_PASS_MARGIN = 0.5
URL2BLOG_REWRITE_GATE_MAX_NGRAM = 0.88
URL2BLOG_REWRITE_GATE_MAX_RETRIES = 2
URL2BLOG_REWRITE_GATE_FALLBACK_MIN_SCORE = 6.0
URL2BLOG_REWRITE_GATE_FALLBACK_MAX_REQUIRED_REVISIONS = 3
URL2BLOG_FACT_GATE_MIN_SCORE = 8.0
URL2BLOG_FACT_GATE_NEAR_PASS_MARGIN = 0.5
URL2BLOG_FACT_GATE_MAX_RETRIES = 1
URL2BLOG_EDITORIAL_MIN_WORD_RETENTION_RATIO = 0.85


def evaluate_rewrite_gate(
    *,
    context: dict[str, Any],
    retry_count: int,
) -> tuple[str, dict[str, Any]]:
    quality = dict(context.get("quality") or {})
    required_revisions = quality.get("required_revisions")
    required_revision_count = (
        len(required_revisions) if isinstance(required_revisions, list) else 0
    )
    overall_score = float(quality.get("overall_score") or 0.0)
    too_close_to_source = bool(quality.get("too_close_to_source"))
    ngram_overlap = float(context.get("ngram_overlap") or 0.0)

    strict_pass = (
        overall_score >= URL2BLOG_REWRITE_GATE_MIN_SCORE
        and not too_close_to_source
        and ngram_overlap <= URL2BLOG_REWRITE_GATE_MAX_NGRAM
        and required_revision_count == 0
    )
    near_pass = (
        overall_score
        >= (URL2BLOG_REWRITE_GATE_MIN_SCORE - URL2BLOG_REWRITE_GATE_NEAR_PASS_MARGIN)
        and not too_close_to_source
        and ngram_overlap <= (URL2BLOG_REWRITE_GATE_MAX_NGRAM + 0.03)
    )
    fallback_pass = (
        retry_count >= URL2BLOG_REWRITE_GATE_MAX_RETRIES
        and overall_score >= URL2BLOG_REWRITE_GATE_FALLBACK_MIN_SCORE
        and required_revision_count
        <= URL2BLOG_REWRITE_GATE_FALLBACK_MAX_REQUIRED_REVISIONS
        and not too_close_to_source
        and ngram_overlap <= (URL2BLOG_REWRITE_GATE_MAX_NGRAM + 0.08)
    )

    if strict_pass:
        decision, pass_mode = "pass", "strict"
    elif retry_count < URL2BLOG_REWRITE_GATE_MAX_RETRIES:
        decision, pass_mode = "retry", "retry_required"
    elif near_pass:
        decision, pass_mode = "pass", "near_pass"
    elif fallback_pass:
        decision, pass_mode = "pass", "fallback_after_failed_gate"
    else:
        decision, pass_mode = "fail", "failed_after_retries"

    gate_data = {
        "decision": decision,
        "pass_mode": pass_mode,
        "retry_count": retry_count,
        "max_retries": URL2BLOG_REWRITE_GATE_MAX_RETRIES,
        "overall_score": overall_score,
        "score_threshold": URL2BLOG_REWRITE_GATE_MIN_SCORE,
        "near_pass_margin": URL2BLOG_REWRITE_GATE_NEAR_PASS_MARGIN,
        "fallback_min_score": URL2BLOG_REWRITE_GATE_FALLBACK_MIN_SCORE,
        "fallback_max_required_revisions": (
            URL2BLOG_REWRITE_GATE_FALLBACK_MAX_REQUIRED_REVISIONS
        ),
        "ngram_overlap": round(ngram_overlap, 3),
        "max_ngram_overlap": URL2BLOG_REWRITE_GATE_MAX_NGRAM,
        "required_revision_count": required_revision_count,
        "too_close_to_source": too_close_to_source,
    }
    if decision == "fail":
        gate_data["failure_reason"] = (
            "URL2Blog rewrite quality gate failed after retries; "
            f"score={overall_score:.2f}, "
            f"threshold={URL2BLOG_REWRITE_GATE_MIN_SCORE:.2f}, "
            f"ngram_overlap={ngram_overlap:.3f}, "
            f"required_revisions={required_revision_count}, "
            f"too_close_to_source={too_close_to_source}"
        )
    return decision, gate_data


def evaluate_fact_gate(
    *,
    context: dict[str, Any],
    retry_count: int,
) -> tuple[str, dict[str, Any]]:
    fact_coverage = dict(context.get("fact_coverage") or {})
    coverage_score = float(fact_coverage.get("coverage_score") or 0.0)
    missing_high_count = int(fact_coverage.get("missing_high_count") or 0)
    missing_count = int(fact_coverage.get("missing_count") or 0)
    strict_pass = (
        coverage_score >= URL2BLOG_FACT_GATE_MIN_SCORE and missing_high_count == 0
    )
    near_pass = (
        coverage_score
        >= (URL2BLOG_FACT_GATE_MIN_SCORE - URL2BLOG_FACT_GATE_NEAR_PASS_MARGIN)
        and missing_high_count == 0
    )

    if strict_pass:
        decision, pass_mode = "pass", "strict"
    elif retry_count < URL2BLOG_FACT_GATE_MAX_RETRIES:
        decision, pass_mode = "retry", "retry_required"
    elif near_pass:
        decision, pass_mode = "pass", "near_pass"
    else:
        decision, pass_mode = "pass", "fallback_unverified_facts"

    gate_data = {
        "decision": decision,
        "pass_mode": pass_mode,
        "retry_count": retry_count,
        "max_retries": URL2BLOG_FACT_GATE_MAX_RETRIES,
        "coverage_score": coverage_score,
        "coverage_threshold": URL2BLOG_FACT_GATE_MIN_SCORE,
        "near_pass_margin": URL2BLOG_FACT_GATE_NEAR_PASS_MARGIN,
        "missing_high_count": missing_high_count,
        "missing_count": missing_count,
    }
    if pass_mode == "fallback_unverified_facts":
        gate_data["fact_warning"] = (
            "Fact coverage could not be fully verified after retries; "
            f"coverage_score={coverage_score:.2f}, "
            f"threshold={URL2BLOG_FACT_GATE_MIN_SCORE:.2f}, "
            f"missing_high_count={missing_high_count}, "
            f"missing_count={missing_count}"
        )
        gate_data["missing_facts"] = list(fact_coverage.get("missing_facts") or [])
        gate_data["coverage_summary"] = str(fact_coverage.get("coverage_summary") or "")
    return decision, gate_data


def evaluate_editorial_gate(*, context: dict[str, Any]) -> dict[str, Any]:
    pre_word_count = int(context.get("pre_editorial_word_count") or 0)
    post_word_count = int(context.get("post_editorial_word_count") or 0)
    editorial_data = dict(context.get("editorial_augmentation") or {})
    augmentation_applied = bool(editorial_data.get("augmentation_applied"))

    if not augmentation_applied:
        decision, reason = "pass", "editorial_augmentation_not_applied"
    else:
        min_retained_words = max(
            1,
            int(round(pre_word_count * URL2BLOG_EDITORIAL_MIN_WORD_RETENTION_RATIO)),
        )
        if post_word_count < min_retained_words:
            decision = "rollback"
            reason = (
                "editorial_output_shrank_too_much "
                f"({post_word_count} < {min_retained_words})"
            )
        else:
            decision, reason = "pass", "editorial_quality_preserved"

    return {
        "decision": decision,
        "reason": reason,
        "augmentation_applied": augmentation_applied,
        "pre_editorial_word_count": pre_word_count,
        "post_editorial_word_count": post_word_count,
        "min_word_retention_ratio": URL2BLOG_EDITORIAL_MIN_WORD_RETENTION_RATIO,
    }


def apply_editorial_rollback(
    *, context: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    pre_editorial_content = str(context.get("pre_editorial_content") or "")
    restored_word_count = len(_tokenize_similarity_words(pre_editorial_content))
    if pre_editorial_content:
        context["final_improved_content"] = pre_editorial_content
        context["post_editorial_word_count"] = restored_word_count
        editorial_data = dict(context.get("editorial_augmentation") or {})
        existing_summary = str(editorial_data.get("augmentation_summary") or "").strip()
        editorial_data.update(
            {
                "augmentation_applied": False,
                "components_added": [],
                "augmentation_summary": (
                    f"{existing_summary} Rolled back by editorial gate."
                ).strip(),
            }
        )
        context["editorial_augmentation"] = editorial_data
    return context, {
        "restored_from": "pre_editorial_content",
        "restored_word_count": restored_word_count,
        "had_pre_editorial_content": bool(pre_editorial_content),
    }
