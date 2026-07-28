"""Keep-best behaviour for the Stage 3 and Stage 5 improvement loops."""

from types import SimpleNamespace

from shared import Stage3Output, Stage4Output

from app.features.youtube2blog.graph.nodes import composition as composition_nodes
from app.features.youtube2blog.graph.nodes import title as title_nodes
from app.features.youtube2blog.quality.policies import (
    article_quality_rank,
    is_better_article,
    is_better_title,
    title_quality_rank,
)


def _assessment(overall, clarity=8.0):
    return {
        "overall_quality_score": overall,
        "dimension_scores": {
            "clarity": clarity,
            "structure_coherence": 8.0,
            "usefulness_actionability": 8.0,
        },
    }


def test_article_rank_prefers_score_then_weakest_critical_dimension():
    assert article_quality_rank(_assessment(7.0)) == (7.0, 8.0)
    assert is_better_article(_assessment(8.0), _assessment(7.0))
    assert not is_better_article(_assessment(6.0), _assessment(7.0))
    assert is_better_article(_assessment(7.0), None)
    # Same overall score: the draft without a severely weak dimension wins.
    assert is_better_article(
        _assessment(7.0, clarity=8.0), _assessment(7.0, clarity=3.0)
    )


def test_article_rank_tolerates_a_malformed_assessment():
    assert article_quality_rank({}) == (0.0, 0.0)
    assert article_quality_rank({"overall_quality_score": "n/a"}) == (0.0, 0.0)


def test_title_rank_puts_the_length_requirement_above_score():
    inside = {"score": 5.0, "checks": {"length_range": True}}
    outside = {"score": 9.0, "checks": {"length_range": False}}

    assert title_quality_rank(inside) > title_quality_rank(outside)
    assert is_better_title(inside, outside)
    assert not is_better_title(outside, inside)


def _stage3(body: str) -> Stage3Output:
    return Stage3Output(
        video_id="v1",
        title="A Title",
        article_type="News",
        coverage_sufficient=True,
        coverage_analysis="",
        missing_sections=[],
        supplemental_content=None,
        final_article=body,
        guideline_used="guideline",
    )


def _composition_context(assessment):
    return SimpleNamespace(
        run_id="run-1",
        active_model="base-model",
        writing_model="writing-model",
        tone_guidance="",
        start_stage=lambda _stage: None,
        record_stage=lambda state, **_kwargs: dict(state.get("stage_results") or {}),
        stage_ref=lambda run_id, stage: f"data/runs/{run_id}/{stage}.json",
        dependencies=SimpleNamespace(),
    ), assessment


def test_stage_3_gate_settles_on_the_best_draft_not_the_last(monkeypatch):
    """A rewrite that scored worse than the draft it replaced used to ship,
    because stage_3_improve overwrote final_article unconditionally."""
    context, _ = _composition_context(None)
    monkeypatch.setattr(
        composition_nodes,
        "stage_3_assess_article_quality",
        lambda **_kwargs: _assessment(4.0),
    )
    node = composition_nodes.build_composition_nodes(context)["stage_3_quality_gate"]

    result = node(
        {
            "stage3": _stage3("A worse rewrite.").model_dump(),
            "stage3_best": _stage3("The good original.").model_dump(),
            "stage3_best_quality": _assessment(8.5),
            "stage3_quality_retry_count": 99,
        }
    )

    assert result["stage3_quality_gate_decision"] == "pass"
    assert result["stage3"]["final_article"] == "The good original."
    assert result["stage3_quality_gate"]["kept_earlier_draft"] is True
    assert result["stage3_quality_gate"]["candidate_overall_quality_score"] == 4.0


def test_stage_3_gate_adopts_a_genuine_improvement(monkeypatch):
    context, _ = _composition_context(None)
    monkeypatch.setattr(
        composition_nodes,
        "stage_3_assess_article_quality",
        lambda **_kwargs: _assessment(9.0),
    )
    node = composition_nodes.build_composition_nodes(context)["stage_3_quality_gate"]

    result = node(
        {
            "stage3": _stage3("A better rewrite.").model_dump(),
            "stage3_best": _stage3("The weaker original.").model_dump(),
            "stage3_best_quality": _assessment(6.0),
            "stage3_quality_retry_count": 99,
        }
    )

    assert result["stage3"]["final_article"] == "A better rewrite."
    assert result["stage3_quality_gate"]["kept_earlier_draft"] is False


def test_stage_5_gate_settles_on_the_best_title_not_the_last(monkeypatch):
    context = SimpleNamespace(
        run_id="run-1",
        active_model="base-model",
        start_stage=lambda _stage: None,
        record_stage=lambda state, **_kwargs: dict(state.get("stage_results") or {}),
        stage_ref=lambda run_id, stage: f"data/runs/{run_id}/{stage}.json",
        dependencies=SimpleNamespace(),
    )
    monkeypatch.setattr(
        title_nodes,
        "stage_5_evaluate_title_quality",
        lambda **_kwargs: {"score": 2.0, "checks": {"length_range": False}},
    )
    node = title_nodes.build_title_nodes(context)["stage_5_quality_gate"]

    good = Stage4Output(
        video_id="v1",
        title="A Perfectly Reasonable Generated Headline",
        content="Body",
        article_type="News",
        title_guideline_used="g",
    )
    result = node(
        {
            "stage4": Stage4Output(
                video_id="v1",
                title="bad",
                content="Body",
                article_type="News",
                title_guideline_used="g",
            ).model_dump(),
            "stage4_best": good.model_dump(),
            "stage5_best_evaluation": {
                "score": 8.0,
                "checks": {"length_range": True},
            },
            "stage3_for_title": _stage3("Body").model_dump(),
            "stage5_retry_count": 99,
        }
    )

    assert result["stage5_gate_decision"] == "pass"
    assert result["stage4"]["title"] == "A Perfectly Reasonable Generated Headline"
    assert result["stage5_gate"]["kept_earlier_title"] is True
    assert result["stage5_gate"]["candidate_title"] == "bad"
