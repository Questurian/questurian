from app.features.youtube2blog.stages.stage_seo import stage_seo_evaluate_quality


def _repeat_sentence(sentence: str, repeat: int) -> str:
    return " ".join([sentence] * repeat)


def test_stage_seo_quality_flags_keyword_stuffing_and_length_regression():
    focus = "ai writing workflow"
    baseline_article = "\n\n".join(
        [
            "# Practical AI Writing Guide",
            _repeat_sentence(
                "This guide explains how teams build an ai writing workflow with planning, drafting, and review.",
                18,
            ),
            "## Build a repeatable process",
            _repeat_sentence(
                "A repeatable process keeps writing quality stable across drafts and editors.",
                12,
            ),
            "## Review for clarity",
            _repeat_sentence(
                "Editors should review structure, evidence, and transitions before publication.",
                12,
            ),
        ]
    )

    stuffed_article = "\n\n".join(
        [
            "# AI Writing Workflow AI Writing Workflow",
            _repeat_sentence(
                "An ai writing workflow ai writing workflow ai writing workflow ai writing workflow drives growth.",
                8,
            ),
            "## AI Writing Workflow Checklist",
            _repeat_sentence(
                "Use this checklist to improve drafts quickly.",
                4,
            ),
        ]
    )

    result = stage_seo_evaluate_quality(
        article=stuffed_article,
        seo_brief={
            "focus_keyword": focus,
            "secondary_keywords": ["editorial workflow", "content review checklist"],
        },
        baseline_article=baseline_article,
    )

    checks = result["checks"]
    assert checks["no_keyword_stuffing"] is False
    assert checks["article_length_retained"] is False
    assert result["metrics"]["focus_occurrence_increase"] > 0


def test_stage_seo_quality_accepts_balanced_enrichment():
    focus = "ai writing workflow"
    baseline_article = "\n\n".join(
        [
            "# Practical AI Writing Guide",
            _repeat_sentence(
                "This guide explains how teams build an ai writing workflow with planning, drafting, and review.",
                18,
            ),
            "## Build a repeatable process",
            _repeat_sentence(
                "A repeatable process keeps writing quality stable across drafts and editors.",
                12,
            ),
            "## Review for clarity",
            _repeat_sentence(
                "Editors should review structure, evidence, and transitions before publication.",
                12,
            ),
        ]
    )

    enriched_article = "\n\n".join(
        [
            "# Practical AI Writing Guide",
            (
                "Teams use an ai writing workflow to keep drafts accurate, consistent, and useful. "
                + _repeat_sentence(
                    "A simple process improves draft quality and keeps collaboration smooth.",
                    18,
                )
            ),
            "## Build a repeatable process",
            _repeat_sentence(
                "A repeatable process keeps writing quality stable across drafts and editors.",
                12,
            ),
            "## Improve editorial workflow",
            _repeat_sentence(
                "A stronger editorial workflow and content review checklist help teams publish cleaner articles.",
                12,
            ),
        ]
    )

    result = stage_seo_evaluate_quality(
        article=enriched_article,
        seo_brief={
            "focus_keyword": focus,
            "secondary_keywords": ["editorial workflow", "content review checklist"],
        },
        baseline_article=baseline_article,
    )

    checks = result["checks"]
    assert checks["focus_present"] is True
    assert checks["no_keyword_stuffing"] is True
    assert checks["article_length_retained"] is True
    assert result["score"] >= 7.0
