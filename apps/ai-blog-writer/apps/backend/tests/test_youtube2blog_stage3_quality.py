import pytest

from app.features.youtube2blog.config import (
    Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
)
from app.features.youtube2blog.quality.article_assessment import QUALITY_DIMENSIONS
from app.features.youtube2blog.quality.article_revision import (
    build_targeted_feedback,
    pick_improvement_mode,
)
from app.features.youtube2blog.stages import stage_3_quality
from app.features.youtube2blog.stages import stage_3_quality_assessment as assessment
from app.features.youtube2blog.stages import stage_3_quality_rewrite as rewrite
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
        title="Sample Video",
        article_type="How-to Guides",
        coverage_sufficient=True,
        coverage_analysis="Coverage looks good.",
        missing_sections=[],
        supplemental_content=None,
        final_article=article,
        guideline_used="Use clear sections.",
    )


def test_quality_facade_preserves_public_stage_functions(monkeypatch):
    captured: dict[str, object] = {}

    def fake_assess(**kwargs):
        captured.update(kwargs)
        return {"overall_quality_score": 8.0}

    monkeypatch.setattr(
        stage_3_quality,
        "assess_article_quality",
        fake_assess,
    )
    fake_llm_factory = object()
    fake_json_parser = object()
    monkeypatch.setattr(stage_3_quality, "get_vertex_llm", fake_llm_factory)
    monkeypatch.setattr(stage_3_quality, "parse_json_response", fake_json_parser)

    stage3 = _stage3()
    assert stage_3_quality.stage_3_assess_article_quality(stage3=stage3) == {
        "overall_quality_score": 8.0
    }
    assert captured == {
        "stage3": stage3,
        "model_name": stage_3_quality.Y2B_PRIMARY_MODEL,
        "llm_factory": fake_llm_factory,
        "json_parser": fake_json_parser,
    }
    assert (
        stage_3_quality.stage_3_pick_improvement_mode(
            overall_quality_score=7.3,
            retry_count=0,
        )
        == "light"
    )


def test_assessment_normalizes_provider_payload(monkeypatch):
    raw_response = """{
      "dimension_scores": {
        "clarity": 12,
        "structure_coherence": "invalid",
        "specificity": -3,
        "usefulness_actionability": 8.25,
        "repetition_control": 7,
        "audience_fit": 6
      },
      "top_issues": ["", "Be concrete", 2, "Improve flow", "Ignored"]
    }"""
    llm = _FakeLlm([raw_response])
    llm_options: dict[str, object] = {}

    def fake_get_vertex_llm(**kwargs):
        llm_options.update(kwargs)
        return llm

    monkeypatch.setattr(assessment, "get_vertex_llm", fake_get_vertex_llm)

    result = assessment.assess_article_quality(
        stage3=_stage3(),
        model_name="assessment-model",
    )

    assert result["dimension_scores"] == {
        "clarity": 10.0,
        "structure_coherence": 5.0,
        "specificity": 0.0,
        "usefulness_actionability": 8.25,
        "repetition_control": 7.0,
        "audience_fit": 6.0,
    }
    assert result["overall_quality_score"] == pytest.approx(6.0416666667)
    assert result["top_issues"] == ["Be concrete", "2", "Improve flow"]
    assert len(result["rewrite_brief"]) == 3
    assert result["evaluation_source"] == "llm"
    assert result["debug_quality_response"] == raw_response
    assert "How-to Guides" in llm.prompts[0]
    assert llm_options == {
        "temperature": 0.05,
        "max_tokens": 2048,
        "model_name": "assessment-model",
    }


def test_assessment_falls_back_to_heuristics_on_provider_failure(monkeypatch):
    monkeypatch.setattr(
        assessment,
        "get_vertex_llm",
        lambda **_kwargs: _FakeLlm([""]),
    )

    result = assessment.assess_article_quality(
        stage3=_stage3(
            "## Start\n\nTake these 3 steps. You should check item 2.\n\n"
            "## Finish\n\nUse tip 1 to complete the action."
        )
    )

    assert result["evaluation_source"] == "heuristic_fallback"
    assert tuple(result["dimension_scores"]) == QUALITY_DIMENSIONS
    assert result["debug_quality_response"] == ""
    assert result["error"] == "Quality assessment returned empty response"


@pytest.mark.parametrize(
    ("score", "retry_count", "expected"),
    [
        (7.3, 0, "light"),
        (6.2, 0, "medium"),
        (6.19, 0, "strong"),
        (9.5, 2, "strong"),
    ],
)
def test_revision_mode_policy_keeps_score_and_retry_boundaries(
    score,
    retry_count,
    expected,
):
    assert (
        pick_improvement_mode(
            overall_quality_score=score,
            retry_count=retry_count,
        )
        == expected
    )


def test_targeted_feedback_prioritizes_three_weakest_dimensions():
    result = build_targeted_feedback(
        dimension_scores={
            "clarity": 7.0,
            "specificity": 4.0,
            "audience_fit": 6.0,
            "repetition_control": 5.0,
        },
        top_issues=["Existing issue."],
        rewrite_brief=["Existing instruction."],
    )

    assert result["focus_dimensions"] == [
        "specificity",
        "repetition_control",
        "audience_fit",
    ]
    assert result["top_issues"][0] == "Existing issue."
    assert "concrete examples/details already present" in result["rewrite_brief"][1]


def test_rewrite_retries_an_unchanged_article_with_strong_mode(monkeypatch):
    original = " ".join(f"original{index}" for index in range(130))
    second_article = " ".join(f"improved{index}" for index in range(130))
    llm = _FakeLlm([f"  {original.upper()}  ", second_article])
    llm_options: dict[str, object] = {}
    enforcement_contexts: list[str] = []

    def fake_get_vertex_llm(**kwargs):
        llm_options.update(kwargs)
        return llm

    def fake_enforce(content, *, repair, context):
        del repair
        enforcement_contexts.append(context)
        return content.strip()

    monkeypatch.setattr(rewrite, "get_vertex_llm", fake_get_vertex_llm)
    monkeypatch.setattr(rewrite, "enforce_anti_ai_tells_markdown", fake_enforce)

    result = rewrite.improve_article(
        stage3=_stage3(original),
        top_issues=["Improve specificity."],
        rewrite_brief=["Use concrete wording."],
        mode="light",
        focus_dimensions=["specificity"],
        model_name="rewrite-model",
        tone_guidance="Keep it direct.",
    )

    assert result["mode"] == "strong"
    assert result["improved_article"] == second_article
    assert result["debug_improve_first_response"] == f"  {original.upper()}  "
    assert "prior rewrite was too similar" in result["debug_improve_prompt"]
    assert "Keep it direct." in llm.prompts[0]
    assert enforcement_contexts == [
        "youtube2blog quality improvement",
        "youtube2blog quality fallback",
    ]
    assert llm_options == {
        "temperature": 0.2,
        "max_tokens": Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
        "model_name": "rewrite-model",
    }


def test_rewrite_rolls_back_an_output_that_loses_too_much_content(monkeypatch):
    original = " ".join(f"source{index}" for index in range(220))
    llm = _FakeLlm(["Far too short."])
    monkeypatch.setattr(rewrite, "get_vertex_llm", lambda **_kwargs: llm)
    monkeypatch.setattr(
        rewrite,
        "enforce_anti_ai_tells_markdown",
        lambda content, **_kwargs: content,
    )

    result = rewrite.improve_article(
        stage3=_stage3(original),
        top_issues=[],
        rewrite_brief=[],
        mode="medium",
    )

    assert result["improved_article"] == original
    assert result["word_count_before"] == 220
    assert result["word_count_after"] == 220


def test_rewrite_rejects_an_unknown_mode_before_requesting_an_llm(monkeypatch):
    def fail_if_called(**_kwargs):
        raise AssertionError("LLM should not be requested")

    monkeypatch.setattr(rewrite, "get_vertex_llm", fail_if_called)

    with pytest.raises(ValueError, match="Unsupported rewrite mode: invalid"):
        rewrite.improve_article(
            stage3=_stage3(),
            top_issues=[],
            rewrite_brief=[],
            mode="invalid",
        )
