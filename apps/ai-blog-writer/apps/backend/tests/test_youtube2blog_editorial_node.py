"""Editorial augmentation node degradation contract."""

from types import SimpleNamespace

from shared import Stage3Output, StageEditorialAugmentationOutput

from app.features.youtube2blog.graph.nodes import editorial as editorial_nodes


def _stage3() -> Stage3Output:
    return Stage3Output(
        video_id="v1",
        title="A Title",
        article_type="News",
        coverage_sufficient=True,
        coverage_analysis="",
        missing_sections=[],
        supplemental_content=None,
        final_article="## Section\n\nOriginal article body.",
        guideline_used="guideline",
    )


def _context():
    return SimpleNamespace(
        run_id="run-1",
        active_model="base-model",
        writing_model="writing-model",
        tone_guidance="",
        start_stage=lambda _stage: None,
        record_stage=lambda state, **_kwargs: dict(state.get("stage_results") or {}),
        stage_ref=lambda run_id, stage: f"data/runs/{run_id}/{stage}.json",
        dependencies=SimpleNamespace(),
    )


def test_editorial_node_leaves_the_stage_fallback_enabled(monkeypatch):
    """Augmentation is additive decoration on a finished article and already
    degrades to the un-augmented draft. fail_fast=True turned that off, so a
    malformed callout response destroyed a run that had already paid for
    composition, SEO and every quality loop."""
    captured: dict[str, object] = {}

    def spy(stage3, **kwargs):
        captured.update(kwargs)
        return StageEditorialAugmentationOutput(
            video_id=stage3.video_id,
            title=stage3.title,
            article_type=stage3.article_type,
            augmented_content=stage3.final_article,
            components_added=[],
            diagnostic={
                "cognitive_load": "strong",
                "narrative_density": "strong",
                "emphasis_clarity": "strong",
                "reading_behavior_risk": "strong",
            },
            augmentation_summary="",
            augmentation_applied=False,
            debug_prompt="",
            debug_raw_response="",
            error="editorial service unavailable",
        )

    monkeypatch.setattr(editorial_nodes, "stage_editorial_augmentation", spy)
    node = editorial_nodes.build_editorial_nodes(_context())[
        "stage_editorial_augmentation"
    ]

    result = node({"stage3_for_editorial": _stage3().model_dump()})

    assert captured["fail_fast"] is False
    # A failed augmentation still hands the finished article to the title stage.
    assert "Original article body." in result["stage3_for_title"]["final_article"]
    assert result["stage_editorial"]["error"] == "editorial service unavailable"
