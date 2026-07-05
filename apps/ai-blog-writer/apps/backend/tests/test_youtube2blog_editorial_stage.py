import importlib

from app.features.youtube2blog.config import Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS
from shared import Stage3Output

editorial_stage = importlib.import_module(
    "app.features.youtube2blog.stages.stage_editorial_augmentation"
)


def _sample_stage3_output() -> Stage3Output:
    return Stage3Output(
        video_id="vid-123",
        title="Sample Video",
        article_type="How-to Guides",
        coverage_sufficient=True,
        coverage_analysis="Coverage looks good.",
        missing_sections=[],
        supplemental_content=None,
        final_article="## Overview\n\nOriginal article body.",
        guideline_used="Use clear sections.",
    )


def test_editorial_augmentation_applies_components_and_markers(monkeypatch):
    stage3 = _sample_stage3_output()

    monkeypatch.setattr(
        editorial_stage,
        "_invoke_json_llm",
        lambda **_kwargs: (
            {
                "augmented_content": "## Overview\n\nImproved article body with stronger emphasis.",
                "components_added": [
                    {
                        "component": "in_the_know_box",
                        "justification": "Clarifies context for readers.",
                        "placement": "After opening section.",
                    }
                ],
                "diagnostic": {
                    "cognitive_load": "weak",
                    "narrative_density": "strong",
                    "emphasis_clarity": "strong",
                    "reading_behavior_risk": "weak",
                },
                "augmentation_summary": "Added a context block for clarity.",
            },
            '{"augmented_content":"ok"}',
        ),
    )

    output = editorial_stage.stage_editorial_augmentation(stage3)

    assert output.augmentation_applied is True
    assert len(output.components_added) == 1
    assert output.components_added[0]["component"] == "in_the_know_box"
    assert output.diagnostic["cognitive_load"] == "weak"
    assert "[!EDITORIAL-BLOCK-START|in_the_know_box]" in output.augmented_content
    assert "[!EDITORIAL-BLOCK-LABEL|In The Know]" in output.augmented_content
    assert "[!EDITORIAL-BOX|in_the_know_box]" in output.augmented_content
    assert "[!EDITORIAL-BLOCK-END|in_the_know_box]" in output.augmented_content
    assert output.error is None


def test_editorial_augmentation_falls_back_on_error(monkeypatch):
    stage3 = _sample_stage3_output()

    def raise_error(**_kwargs):
        raise RuntimeError("editorial service unavailable")

    monkeypatch.setattr(editorial_stage, "_invoke_json_llm", raise_error)

    output = editorial_stage.stage_editorial_augmentation(stage3)

    assert output.augmentation_applied is False
    assert output.components_added == []
    assert output.error == "editorial service unavailable"
    assert "Original article body." in output.augmented_content
    assert output.debug_prompt is not None


def test_editorial_augmentation_json_llm_uses_longform_output_cap(monkeypatch):
    captured: dict[str, object] = {}

    class StubLLM:
        def invoke(self, _prompt: str) -> str:
            return '{"augmented_content":"Body","components_added":[],"diagnostic":{},"augmentation_summary":""}'

    def fake_get_vertex_llm(**kwargs):
        captured.update(kwargs)
        return StubLLM()

    monkeypatch.setattr(editorial_stage, "get_vertex_llm", fake_get_vertex_llm)

    parsed, _raw = editorial_stage._invoke_json_llm(
        prompt="Return augmented article JSON.",
        model_name="editorial-model",
    )

    assert parsed["augmented_content"] == "Body"
    assert captured["model_name"] == "editorial-model"
    assert captured["max_tokens"] == Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS
