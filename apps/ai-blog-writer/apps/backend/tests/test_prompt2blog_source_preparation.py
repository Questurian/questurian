"""Prompt2Blog source cleanup and preparation-stage contracts."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.core import read_stage_result
from app.features.prompt2blog.content.source_text import (
    _preclean_source_text,
)
from app.features.prompt2blog.dependencies import (
    PipelineDependencies,
)
from app.features.prompt2blog.models import Prompt2BlogInputRequest
from app.features.prompt2blog.stages.preparation import (
    prepare_full_pipeline_request,
)

pytest_plugins = ["tests.prompt2blog_test_fixtures"]


PERU_SOURCE_SAMPLE = """Machu Picchu, Peru
IS IT SAFE TO TRAVEL TO PERU (2026 UPDATE)
March 31, 2026

Travelers should check the State Department's safety ratings and enroll in STEP.
Taking the train to Machu Picchu is one of the safest and most scenic routes.
Spend a day in Cusco to acclimate to its 11,000 feet of altitude.
Bring insect repellent, water, warm layers, and a rain jacket.

LEARN MORE ABOUT OUR TRAVEL INSURANCE PLANS

Health Guidelines for Peru Travel

Yellow fever is a real risk in Peru, so ask a clinician about vaccination.
Clean water is also an issue; drink bottled water with sealed lids.

Travel Insurance
Berkshire Hathaway Travel Protection offers multiple insurance products.

Company
About Us
Contact
assist@example.com

The full coverage terms, limitations, and exclusions are in the policy."""


def _build_request(source_material: list[str]) -> Prompt2BlogInputRequest:
    return Prompt2BlogInputRequest(
        article_type_id=7,
        source_material=source_material,
        article_goal="Explain whether Peru is a safe destination for travelers.",
        target_reader="U.S. travelers planning Peru trips",
        destination_context="Peru",
        tone_id="practical",
        length_id="medium",
        brand_voice_id="questurian-default",
        include_debug=True,
        enable_editorial_augmentation=False,
        model_name="gemini-2.5-flash-lite",
    )


def _stub_writing_brief(
    request,
    option_context,
    cleaned_sources,
):  # noqa: ANN001
    return {
        "goal": request.article_goal,
        "formatting": {"target_word_count": 900},
        "raw_input": {
            "blobs": [{"content": source} for source in cleaned_sources],
        },
    }


class _StubLLM:
    def __init__(self, *, invoke_json, invoke_text):  # noqa: ANN001
        self._invoke_json = invoke_json
        self._invoke_text = invoke_text

    def invoke_json(self, **kwargs):  # noqa: ANN003
        return self._invoke_json(**kwargs)

    def invoke_text(self, **kwargs):  # noqa: ANN003
        return self._invoke_text(**kwargs)

    def enforce_anti_ai(self, text: str, **kwargs):  # noqa: ANN003
        return text


def _preparation_dependencies(
    *,
    invoke_json,
    invoke_text,
) -> PipelineDependencies:  # noqa: ANN001
    return PipelineDependencies(
        llm=_StubLLM(invoke_json=invoke_json, invoke_text=invoke_text),
        resolve_input_options=lambda request: {
            "tone": {"id": "practical"},
            "length": {"id": "medium"},
            "brand_voice": {"id": "questurian-default"},
            "creativity_level": "medium",
        },
        build_writing_brief=_stub_writing_brief,
    )


def _synthesize_source(**kwargs):  # noqa: ANN003
    return "Synthesized source material"


def _prepare_source(
    source_text: str,
    *,
    invoke_json,
    invoke_text=_synthesize_source,
) -> tuple[list[str], dict[str, Any]]:  # noqa: ANN001
    raw_sources, cleanup_data, _runtime_request = _prepare_source_run(
        source_text,
        invoke_json=invoke_json,
        invoke_text=invoke_text,
    )
    return raw_sources, cleanup_data


def _prepare_source_run(
    source_text: str,
    *,
    invoke_json,
    invoke_text=_synthesize_source,
):  # noqa: ANN001, ANN202
    run_id = f"p2b-{uuid4()}"
    dependencies = _preparation_dependencies(
        invoke_json=invoke_json,
        invoke_text=invoke_text,
    )
    runtime_request = prepare_full_pipeline_request(
        run_id,
        _build_request([source_text]),
        dependencies,
    )
    cleanup_stage = read_stage_result(run_id, "stage_input_cleanup")
    return runtime_request.raw_sources, cleanup_stage["data"], runtime_request


def test_cleanup_uses_ai_payload_and_keeps_travel_facts(
    empty_prompt2blog_storage,
):
    cleaned_text = """IS IT SAFE TO TRAVEL TO PERU (2026 UPDATE)
March 31, 2026

Travelers should check the State Department's safety ratings and enroll in STEP.
Taking the train to Machu Picchu is one of the safest and most scenic routes.
Spend a day in Cusco to acclimate to its 11,000 feet of altitude.
Bring insect repellent, water, warm layers, and a rain jacket.

Health Guidelines for Peru Travel

Yellow fever is a real risk in Peru, so ask a clinician about vaccination.
Clean water is also an issue; drink bottled water with sealed lids."""

    def _fake_cleanup_llm(*, prompt, **kwargs):  # noqa: ANN001
        assert "Machu Picchu" in prompt
        return (
            {
                "title": "IS IT SAFE TO TRAVEL TO PERU (2026 UPDATE)",
                "published_at": "March 31, 2026",
                "cleaned_text": cleaned_text,
                "removed_blocks": [
                    {
                        "label": "Travel insurance CTA",
                        "reason": "Promotional upsell unrelated to safety guidance.",
                        "excerpt": "LEARN MORE ABOUT OUR TRAVEL INSURANCE PLANS",
                    },
                    {
                        "label": "Insurance products",
                        "reason": "Product marketing section.",
                        "excerpt": "Berkshire Hathaway Travel Protection offers products.",
                    },
                    {
                        "label": "Footer navigation",
                        "reason": "Site navigation and company footer links.",
                        "excerpt": "Company About Us Contact assist@example.com",
                    },
                    {
                        "label": "Legal disclaimer",
                        "reason": "Policy disclaimer and legal copy.",
                        "excerpt": "The full coverage terms are in the policy.",
                    },
                ],
            },
            "{}",
        )

    raw_sources, cleanup_data = _prepare_source(
        PERU_SOURCE_SAMPLE,
        invoke_json=_fake_cleanup_llm,
    )

    assert raw_sources == [cleaned_text]
    assert cleanup_data["cleanup_mode"] == "ai_always_aggressive_v1"
    assert cleanup_data["model_name"] == "gemini-2.5-flash-lite"
    assert cleanup_data["cleaned_sources"] == [cleaned_text]

    source = cleanup_data["sources"][0]
    assert source["fallback_used"] is False
    assert source["title"] == "IS IT SAFE TO TRAVEL TO PERU (2026 UPDATE)"
    assert source["published_at"] == "March 31, 2026"
    assert "Clean water is also an issue" in source["cleaned_text"]
    assert "Travel Insurance" not in source["cleaned_text"]
    assert "Berkshire Hathaway Travel Protection" not in source["cleaned_text"]
    assert source["removed_blocks"][0]["label"] == "Travel insurance CTA"
    assert cleanup_data["cleanup_stats"][0]["removed_lines"] == 4


def test_cleanup_falls_back_to_precleaned_text_when_ai_cleanup_fails(
    empty_prompt2blog_storage,
):
    source_text = """Cookie banner
https://example.com/privacy
Main travel safety guidance stays here.

Keep this logistics paragraph."""

    def _unexpected_text_llm(**kwargs):  # noqa: ANN001
        raise AssertionError("Synthesis should not run for a single source.")

    def _raising_cleanup_llm(**kwargs):  # noqa: ANN001
        raise RuntimeError("Invalid JSON")

    raw_sources, cleanup_data, runtime_request = _prepare_source_run(
        source_text,
        invoke_json=_raising_cleanup_llm,
        invoke_text=_unexpected_text_llm,
    )
    expected_fallback, _ = _preclean_source_text(source_text)

    assert raw_sources == [expected_fallback]
    # The precleaned fallback is what reaches the graph, unparaphrased.
    assert runtime_request.cleaned_data == expected_fallback

    source = cleanup_data["sources"][0]
    assert source["fallback_used"] is True
    assert source["cleaned_text"] == expected_fallback
    assert source["removed_blocks"] == []


def test_cleanup_chunks_long_sources_and_merges_duplicates(
    empty_prompt2blog_storage,
):
    segment_one = ("Chunk one factual sentence about Peru logistics. " * 220).strip()
    segment_two = (
        "Chunk two factual sentence about Peru health guidance. " * 220
    ).strip()
    long_source = f"{segment_one}\n\n{segment_two}"
    cleanup_prompts: list[str] = []

    def _fake_chunk_cleanup_llm(*, prompt, **kwargs):  # noqa: ANN001
        cleanup_prompts.append(prompt)
        if "chunk 1 of 2" in prompt:
            return (
                {
                    "title": "Long Peru Source",
                    "published_at": "",
                    "cleaned_text": "Shared boundary paragraph.\n\nChunk one facts.",
                    "removed_blocks": [
                        {
                            "label": "CTA",
                            "reason": "Marketing copy",
                            "excerpt": "Learn more today",
                        }
                    ],
                },
                "{}",
            )
        return (
            {
                "title": "",
                "published_at": "",
                "cleaned_text": "Shared boundary paragraph.\n\nChunk two facts.",
                "removed_blocks": [
                    {
                        "label": "Footer",
                        "reason": "Boilerplate links",
                        "excerpt": "Company Contact Legal",
                    }
                ],
            },
            "{}",
        )

    raw_sources, cleanup_data = _prepare_source(
        long_source,
        invoke_json=_fake_chunk_cleanup_llm,
    )
    expected_cleaned = (
        "Shared boundary paragraph.\n\nChunk one facts.\n\nChunk two facts."
    )

    assert raw_sources == [expected_cleaned]
    assert len(cleanup_prompts) == 2

    source = cleanup_data["sources"][0]
    assert source["fallback_used"] is False
    assert source["cleaned_text"] == expected_cleaned
    assert source["title"] == "Long Peru Source"
    assert len(source["removed_blocks"]) == 2


def _cleanup_json(cleaned_text: str):  # noqa: ANN202
    def _invoke(**kwargs):  # noqa: ANN003
        return (
            {
                "title": "Peru",
                "published_at": "",
                "cleaned_text": cleaned_text,
                "removed_blocks": [],
            },
            "{}",
        )

    return _invoke


def test_a_single_source_skips_synthesis(empty_prompt2blog_storage):
    """Synthesis combines several sources and deduplicates them. With one
    source it is an unaudited paraphrase between the source and every stage
    that reads cleaned_data -- including the grounding checker."""
    run_id = f"p2b-{uuid4()}"

    def _unexpected_text_llm(**kwargs):  # noqa: ANN003
        raise AssertionError("Synthesis should not run for a single source.")

    dependencies = _preparation_dependencies(
        invoke_json=_cleanup_json("Peru travel guidance stays here."),
        invoke_text=_unexpected_text_llm,
    )
    runtime_request = prepare_full_pipeline_request(
        run_id,
        _build_request(["Peru travel guidance stays here."]),
        dependencies,
    )

    assert runtime_request.cleaned_data == "Peru travel guidance stays here."
    stage = read_stage_result(run_id, "stage_synthesize_sources")["data"]
    assert stage["skipped"] is True
    assert stage["source_material_count"] == 1


def test_several_sources_still_synthesize(empty_prompt2blog_storage):
    run_id = f"p2b-{uuid4()}"
    prompts: list[str] = []

    def _synthesize(**kwargs):  # noqa: ANN003
        prompts.append(kwargs["prompt"])
        return "One combined account of Peru travel."

    dependencies = _preparation_dependencies(
        invoke_json=_cleanup_json("Peru travel guidance stays here."),
        invoke_text=_synthesize,
    )
    runtime_request = prepare_full_pipeline_request(
        run_id,
        _build_request(["First Peru source.", "Second Peru source."]),
        dependencies,
    )

    assert len(prompts) == 1
    assert runtime_request.cleaned_data == "One combined account of Peru travel."
    stage = read_stage_result(run_id, "stage_synthesize_sources")["data"]
    assert stage["skipped"] is False
