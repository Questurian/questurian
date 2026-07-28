import pytest

from app.features.youtube2blog.config import (
    Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
)
from app.features.youtube2blog.stages import stage_seo
from app.features.youtube2blog.stages import stage_seo_brief as brief
from app.features.youtube2blog.stages import stage_seo_enrichment as enrichment
from app.features.youtube2blog.stages.stage_seo import stage_seo_evaluate_quality
from shared import Stage3Output


class _FakeLlm:
    def __init__(self, responses: list[str]):
        self.responses = responses
        self.prompts: list[str] = []

    def invoke(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.responses.pop(0)


def _stage3(article: str = "## Guide\n\nA useful article.") -> Stage3Output:
    return Stage3Output(
        video_id="vid-123",
        title="Practical City Travel Planning",
        article_type="How-to Guides",
        coverage_sufficient=True,
        coverage_analysis="Coverage looks good.",
        missing_sections=[],
        supplemental_content=None,
        final_article=article,
        guideline_used="Use clear sections.",
    )


def _repeat_sentence(sentence: str, repeat: int) -> str:
    return " ".join([sentence] * repeat)


def test_stage_seo_facade_preserves_public_functions_and_dependencies(monkeypatch):
    calls: dict[str, dict[str, object]] = {}

    def fake_brief(**kwargs):
        calls["brief"] = kwargs
        return {"source": "brief"}

    def fake_enrich(**kwargs):
        calls["enrich"] = kwargs
        return {"source": "enrich"}

    def fake_evaluate(**kwargs):
        calls["evaluate"] = kwargs
        return {"source": "evaluate"}

    fake_llm_factory = object()
    fake_json_parser = object()
    fake_enforcer = object()
    monkeypatch.setattr(stage_seo, "generate_seo_brief", fake_brief)
    monkeypatch.setattr(stage_seo, "enrich_seo_article", fake_enrich)
    monkeypatch.setattr(stage_seo, "evaluate_seo_quality", fake_evaluate)
    monkeypatch.setattr(stage_seo, "get_vertex_llm", fake_llm_factory)
    monkeypatch.setattr(stage_seo, "parse_json_response", fake_json_parser)
    monkeypatch.setattr(
        stage_seo,
        "enforce_anti_ai_tells_markdown",
        fake_enforcer,
    )

    stage3 = _stage3()
    assert stage_seo.stage_seo_generate_brief(stage3=stage3) == {"source": "brief"}
    assert stage_seo.stage_seo_enrich_article(
        stage3=stage3,
        seo_brief={"focus_keyword": "city travel"},
        mode="retry",
        feedback="Place the phrase naturally.",
        tone_guidance="Keep it direct.",
    ) == {"source": "enrich"}
    assert stage_seo.stage_seo_evaluate_quality(
        article="Article",
        seo_brief={"focus_keyword": "city travel"},
        baseline_article="Baseline",
    ) == {"source": "evaluate"}

    assert calls["brief"] == {
        "stage3": stage3,
        "model_name": stage_seo.Y2B_PRIMARY_MODEL,
        "llm_factory": fake_llm_factory,
        "json_parser": fake_json_parser,
    }
    assert calls["enrich"] == {
        "stage3": stage3,
        "seo_brief": {"focus_keyword": "city travel"},
        "mode": "retry",
        "feedback": "Place the phrase naturally.",
        "model_name": stage_seo.Y2B_PRIMARY_MODEL,
        "tone_guidance": "Keep it direct.",
        "llm_factory": fake_llm_factory,
        "anti_ai_enforcer": fake_enforcer,
    }
    assert calls["evaluate"] == {
        "article": "Article",
        "seo_brief": {"focus_keyword": "city travel"},
        "baseline_article": "Baseline",
    }


def test_seo_brief_normalizes_provider_response():
    llm = _FakeLlm(["provider payload"])
    llm_options: dict[str, object] = {}

    def fake_llm_factory(**kwargs):
        llm_options.update(kwargs)
        return llm

    result = brief.generate_seo_brief(
        stage3=_stage3("## Plan\n\nPlan a useful city break with local advice."),
        model_name="brief-model",
        llm_factory=fake_llm_factory,
        json_parser=lambda _response: {
            "search_intent": "COMMERCIAL INVESTIGATION",
            "focus_keyword": "city break planning",
            "secondary_keywords": [
                "",
                "city break planning",
                "local travel tips",
                "weekend itinerary",
            ],
            "seo_objective": "",
            "heading_hints": [],
        },
    )

    assert result["search_intent"] == "commercial investigation"
    assert result["focus_keyword"] == "city break planning"
    assert result["secondary_keywords"][:2] == [
        "local travel tips",
        "weekend itinerary",
    ]
    assert len(result["secondary_keywords"]) >= 5
    assert result["source"] == "llm"
    assert result["debug_seo_brief_response"] == "provider payload"
    assert "Practical City Travel Planning" in llm.prompts[0]
    assert llm_options == {
        "temperature": 0.1,
        "max_tokens": 2048,
        "model_name": "brief-model",
    }


def test_seo_brief_uses_deterministic_fallback_for_empty_response():
    result = brief.generate_seo_brief(
        stage3=_stage3(
            "## Plan\n\nCity routes and useful neighborhood advice for visitors."
        ),
        llm_factory=lambda **_kwargs: _FakeLlm([""]),
    )

    assert result["source"] == "heuristic_fallback"
    assert result["focus_keyword"] == "practical city"
    assert result["search_intent"] == "informational"
    assert result["error"] == "SEO brief returned empty response"
    assert result["debug_seo_brief_response"] == ""


def test_seo_enrichment_retries_equivalent_output_and_preserves_debug_data():
    original = "\n\n".join(
        [
            "# City Guide",
            _repeat_sentence(
                "Travelers can plan each neighborhood with realistic timing.",
                25,
            ),
            "## Choose an area",
            _repeat_sentence(
                "Local transit and walking routes shape a useful itinerary.",
                20,
            ),
        ]
    )
    improved = original.replace(
        "Travelers can plan each neighborhood",
        "City travel planning helps visitors explore each neighborhood",
        1,
    )
    llm = _FakeLlm([original.upper(), improved])
    llm_options: dict[str, object] = {}
    contexts: list[str] = []

    def fake_llm_factory(**kwargs):
        llm_options.update(kwargs)
        return llm

    def fake_enforcer(content, *, repair, context):
        del repair
        contexts.append(context)
        return content.strip()

    result = enrichment.enrich_seo_article(
        stage3=_stage3(original),
        seo_brief={
            "search_intent": "informational",
            "focus_keyword": "city travel planning",
            "secondary_keywords": ["local transit"],
            "seo_objective": "Help readers plan a city visit.",
            "heading_hints": ["Choose an area"],
        },
        mode="retry",
        feedback="Improve focus placement.",
        model_name="enrichment-model",
        tone_guidance="Keep a practical voice.",
        llm_factory=fake_llm_factory,
        anti_ai_enforcer=fake_enforcer,
    )

    assert result["seo_article"] == improved
    assert result["debug_seo_first_response"] == original.upper()
    assert result["debug_seo_response"] == improved
    assert "rewrite was too similar" in result["debug_seo_prompt"]
    assert "Improve focus placement." in llm.prompts[0]
    assert "Keep a practical voice." in llm.prompts[0]
    assert contexts == ["youtube2blog SEO enrich", "youtube2blog SEO retry"]
    assert llm_options == {
        "temperature": 0.2,
        "max_tokens": Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
        "model_name": "enrichment-model",
    }


def test_seo_enrichment_rejects_unsupported_mode_before_provider_call():
    with pytest.raises(ValueError, match="Unsupported SEO mode: aggressive"):
        enrichment.enrich_seo_article(
            stage3=_stage3(),
            seo_brief={},
            mode="aggressive",
            llm_factory=lambda **_kwargs: pytest.fail("provider was called"),
        )


def test_seo_enrichment_reverts_keyword_stuffing_to_source():
    original = _repeat_sentence(
        "A practical guide helps travelers compare routes and neighborhoods.",
        25,
    )
    stuffed = (
        _repeat_sentence("city travel planning", 8)
        + " "
        + _repeat_sentence(
            "A practical guide helps travelers compare routes and neighborhoods.",
            25,
        )
    )

    result = enrichment.enrich_seo_article(
        stage3=_stage3(original),
        seo_brief={
            "focus_keyword": "city travel planning",
            "secondary_keywords": [],
        },
        mode="primary",
        llm_factory=lambda **_kwargs: _FakeLlm([stuffed]),
        anti_ai_enforcer=lambda content, **_kwargs: content,
    )

    assert result["seo_article"] == original
    assert result["reverted_to_source"] is True
    assert result["focus_count_after"] == 0
    assert result["focus_count_increase"] == 0


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


def test_seo_enrichment_sends_the_whole_article_to_the_model():
    """The article was clipped to 24,000 chars before being sent. The model
    rewrote a fragment, the short result tripped the retention guard, and the
    whole SEO branch rolled back having spent its calls for nothing."""
    tail_marker = "FINAL PARAGRAPH MARKER"
    original = "\n\n".join(
        [
            "# City Guide",
            _repeat_sentence(
                "Travelers can plan each neighborhood with realistic timing.",
                700,
            ),
            "## Closing",
            f"{tail_marker} closes the guide with practical advice.",
        ]
    )
    assert len(original) > 24_000, "fixture must exceed the old truncation cap"

    llm = _FakeLlm([original + "\n\nCity travel planning tips."])

    result = enrichment.enrich_seo_article(
        stage3=_stage3(original),
        seo_brief={"focus_keyword": "city travel planning"},
        mode="primary",
        model_name="enrichment-model",
        llm_factory=lambda **_kwargs: llm,
        anti_ai_enforcer=lambda content, *, repair, context: content.strip(),
    )

    assert tail_marker in llm.prompts[0]
    assert result["seo_article"].endswith("City travel planning tips.")
