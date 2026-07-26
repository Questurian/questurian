import importlib

from app.features.youtube2blog.config import (
    Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS,
)
from app.features.youtube2blog.content.editorial_blocks import (
    ensure_editorial_component_boxes,
)
from app.features.youtube2blog.stages.editorial_augmentation_prompts import (
    build_editorial_augmentation_prompt,
)
from app.features.youtube2blog.stages.editorial_augmentation_validation import (
    sanitize_editorial_augmentation,
)
from app.shared.prompts import ANTI_AI_TELLS_FULL
from shared import Stage3Output

editorial_stage = importlib.import_module(
    "app.features.youtube2blog.stages.stage_editorial_augmentation"
)
editorial_llm = importlib.import_module(
    "app.features.youtube2blog.stages.editorial_augmentation_llm"
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
        "enforce_editorial_anti_ai_tells",
        lambda content, **_kwargs: content,
    )
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


def test_editorial_prompt_bounds_source_fields_and_appends_guidance():
    prompt = build_editorial_augmentation_prompt(
        article_title=f"{'T' * 500}EXCLUDED",
        article_content=f"{'C' * 20_000}EXCLUDED",
        article_type="How-to Guides",
        tone_guidance="  Keep the tone direct.  ",
    )

    assert "T" * 500 in prompt
    assert "C" * 20_000 in prompt
    assert "EXCLUDED" not in prompt
    assert "Keep the tone direct." in prompt
    assert prompt.endswith(ANTI_AI_TELLS_FULL)


def test_editorial_markers_wrap_existing_box_without_appending_metadata_only_box():
    content = (
        "## Overview\n\n"
        "> [!EDITORIAL-BOX|highlight_callout]\n"
        "> Dense ideas become easier to scan."
    )

    updated = ensure_editorial_component_boxes(
        content,
        [
            {
                "component": "highlight_callout",
                "justification": "Improves pacing.",
                "placement": "After overview.",
            }
        ],
    )

    assert updated.count("[!EDITORIAL-BLOCK-START|highlight_callout]") == 1
    assert updated.count("[!EDITORIAL-BLOCK-END|highlight_callout]") == 1
    assert "[!EDITORIAL-BLOCK-LABEL|Highlight Callout]" in updated
    assert "**Component:** Highlight Callout" in updated
    assert "**Placement:**" not in updated


def test_editorial_validation_normalizes_and_preserves_longer_fallback():
    fallback = (
        "## Overview\n\n" + " ".join(f"original-{index}" for index in range(80)) + "."
    )

    editorial = sanitize_editorial_augmentation(
        {
            "augmented_content": "Short.",
            "components_added": [
                {
                    "component": "faq",
                    "justification": 42,
                    "placement": None,
                },
                {"component": "unsupported"},
            ],
            "diagnostic": {
                "cognitive_load": "high_risk",
                "narrative_density": "unknown",
            },
        },
        fallback_content=fallback,
    )

    assert fallback in editorial["augmented_content"]
    assert editorial["components_added"] == [
        {
            "component": "faq_block",
            "justification": "42",
            "placement": "",
        }
    ]
    assert editorial["diagnostic"] == {
        "cognitive_load": "weak",
        "narrative_density": "strong",
        "emphasis_clarity": "strong",
        "reading_behavior_risk": "strong",
    }
    assert "[!EDITORIAL-BLOCK-START|faq_block]" in editorial["augmented_content"]


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

    monkeypatch.setattr(editorial_llm, "get_vertex_llm", fake_get_vertex_llm)

    parsed, _raw = editorial_llm.invoke_json_llm(
        prompt="Return augmented article JSON.",
        model_name="editorial-model",
    )

    assert parsed["augmented_content"] == "Body"
    assert captured["model_name"] == "editorial-model"
    assert captured["max_tokens"] == Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS


def test_editorial_augmentation_json_llm_retries_invalid_json(monkeypatch):
    prompts: list[str] = []
    responses = iter(
        [
            "not json",
            '{"augmented_content":"Body","components_added":[]}',
        ]
    )

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            prompts.append(prompt)
            return next(responses)

    monkeypatch.setattr(editorial_llm, "get_vertex_llm", lambda **_kwargs: StubLLM())

    parsed, raw = editorial_llm.invoke_json_llm(prompt="Original prompt")

    assert parsed["augmented_content"] == "Body"
    assert raw.startswith('{"augmented_content"')
    assert len(prompts) == 2
    assert "Previous invalid output:\nnot json" in prompts[1]


def test_editorial_augmentation_uses_writing_model_for_stage_execution(monkeypatch):
    captured: dict[str, str] = {}

    def fake_invoke_json_llm(*, prompt: str, model_name: str):
        captured["prompt"] = prompt
        captured["model_name"] = model_name
        return (
            {
                "augmented_content": "## Overview\n\nOriginal article body.",
                "components_added": [],
                "diagnostic": {},
                "augmentation_summary": "",
            },
            "{}",
        )

    monkeypatch.setattr(editorial_stage, "_invoke_json_llm", fake_invoke_json_llm)
    monkeypatch.setattr(
        editorial_stage,
        "enforce_editorial_anti_ai_tells",
        lambda content, **_kwargs: content,
    )

    output = editorial_stage.stage_editorial_augmentation(
        _sample_stage3_output(),
        model_name="base-model",
        writing_model="editorial-writing-model",
        tone_guidance="Keep it concise.",
    )

    assert captured["model_name"] == "editorial-writing-model"
    assert "Keep it concise." in captured["prompt"]
    assert output.error is None
