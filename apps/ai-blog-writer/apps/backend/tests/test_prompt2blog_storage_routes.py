import asyncio
import json
import sys
import types
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError

from app.core import (
    clear_all_runs,
    read_stage_result,
    read_status,
    write_artifact,
    write_status,
)

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda value: json.loads(value)
sys.modules.setdefault("utils", utils_stub)

import app.features.prompt2blog.routes as prompt2blog_routes  # noqa: E402
from app.features.prompt2blog.api import options as options_api  # noqa: E402
from app.features.prompt2blog.api import runs as runs_api  # noqa: E402
from app.features.prompt2blog.content.source_text import (  # noqa: E402
    _preclean_source_text,
)
from app.features.prompt2blog.dependencies import (  # noqa: E402
    PipelineDependencies,
)
from app.features.prompt2blog.stages.preparation import (  # noqa: E402
    prepare_full_pipeline_request,
)


PERU_SOURCE_SAMPLE = """Machu Picchu, Peru
IS IT SAFE TO TRAVEL TO PERU (2026 UPDATE)
March 31, 2026

Many travelers love the idea of Peru – Machu Picchu, Lima, the Andes, Inca culture, llamas – but is it safe to travel to Peru?

Safe Travel to Peru: What You Need to Know

Travelers to Peru should keep the following tips in mind as they explore the country:

Check the State Department’s safety ratings and enroll in STEP
Be very intentional about the transportation you take around the country
Have a well-defined plan for visiting Machu Picchu, including packing appropriate clothing
Take precautions to avoid intestinal diseases
Be aware of your surroundings, particularly in Lima
Understand Peru’s drug laws
Buy travel insurance

Peru’s Safety Ratings

The most authoritative and useful source for American travelers is the State Department, which gives Peru a highly conditional level-two rating – exercise increased caution.

The good news is that Machu Picchu and the area surrounding it is safe, and that there are safe ways of getting from Lima to Cusco.

One easy way to enhance your safety in Peru is to enroll in STEP, the State Department's safety-monitoring program.

Getting to Machu Picchu

As mentioned, taking the train to Machu Picchu is one of the safest and most scenic ways of getting to this iconic UNESCO World Heritage Site.

If you have time, spend a day in Cusco to get acclimated to its 11,000 feet of altitude.

Here are some additional safety tips for trekking around Machu Picchu:

Walking sticks are fine, but pointed ends must be covered with rubber tips.
Bring and use insect repellent.
Dress for mountain conditions, with multiple layers of warm clothing.
Bring water and a rain jacket, even if it looks like a sunny day.

LEARN MORE ABOUT OUR TRAVEL INSURANCE PLANS

Health Guidelines for Peru Travel

Yellow fever is a real risk in Peru, so make sure you’re vaccinated before traveling there.

Clean water is also an issue. Recommendations include:

Drink boiled water or bottled water with sealed lids
Avoid ice cubes
Avoid raw and undercooked food, such as salads

Travel Insurance

Berkshire Hathaway Travel Protection has a wide range of products to protect your Peruvian vacation, including:

AdrenalineCare®, for adventure travel
LuxuryCare®, for luxury travel
ExactCare Extra®, for travel insurance plus flight protection

Questions About Travel Insurance?
CHECK OUT THE GUIDE

Company
About Us
Customer Reviews
Plans
ExactCare
LuxuryCare
Resources
Blog
Contact
assist@bhtp.com
844-411-2487

© Berkshire Hathaway Specialty Insurance Company, 2014 - 2026

The full coverage terms and details, including limitations and exclusions, are contained in the travel insurance policy.
BBB travel insurance review"""


def _response_payload(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


def _seed_completed_run(run_id: str) -> None:
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": "2026-03-05T00:00:00Z",
        },
        feature="prompt2blog",
    )
    write_artifact(
        run_id,
        {
            "markdown": "# Persisted Prompt2Blog Title\n\n## Overview\n\nBody content.",
            "pipeline_v2": {
                "improved_article": {
                    "title": "Persisted Prompt2Blog Title",
                    "content": "## Overview\n\nBody content.",
                },
                "article_type": {"id": 11, "name": "Explainer"},
            },
        },
    )


def _build_prompt2blog_request(
    source_material: list[str],
) -> prompt2blog_routes.Prompt2BlogInputRequest:
    return prompt2blog_routes.Prompt2BlogInputRequest(
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


def _stub_option_context() -> dict[str, object]:
    return {
        "tone": {"id": "practical"},
        "length": {"id": "medium"},
        "brand_voice": {"id": "questurian-default"},
        "creativity_level": "medium",
    }


def _stub_writing_brief(request, option_context, cleaned_sources):  # noqa: ANN001
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
    *, invoke_json, invoke_text
) -> PipelineDependencies:  # noqa: ANN001
    return PipelineDependencies(
        llm=_StubLLM(invoke_json=invoke_json, invoke_text=invoke_text),
        resolve_input_options=lambda request: _stub_option_context(),
        build_writing_brief=_stub_writing_brief,
    )


def test_prompt2blog_storage_endpoints_without_http_client():
    clear_all_runs(feature="prompt2blog")
    run_id = f"p2b-{uuid4()}"
    _seed_completed_run(run_id)

    status_payload = _response_payload(
        asyncio.run(prompt2blog_routes.get_status(run_id))
    )
    assert status_payload["feature"] == "prompt2blog"
    assert status_payload["state"] == "completed"

    result_payload = _response_payload(
        asyncio.run(prompt2blog_routes.get_result(run_id))
    )
    assert result_payload["run_id"] == run_id
    assert result_payload["markdown"].startswith("# Persisted Prompt2Blog Title")

    articles_payload = _response_payload(asyncio.run(prompt2blog_routes.get_articles()))
    matching = [item for item in articles_payload if item["run_id"] == run_id]
    assert matching
    assert matching[0]["title"] == "Persisted Prompt2Blog Title"
    assert matching[0]["article_type"] == "Explainer"

    sync_before = _response_payload(
        asyncio.run(prompt2blog_routes.get_sync_status(run_id))
    )
    assert sync_before["synced_to_payload"] is False

    sync_mark = _response_payload(
        asyncio.run(
            prompt2blog_routes.mark_article_as_synced(
                run_id,
                {"payload_article_id": 8883},
            )
        )
    )
    assert sync_mark["payload_article_id"] == 8883

    sync_after = _response_payload(
        asyncio.run(prompt2blog_routes.get_sync_status(run_id))
    )
    assert sync_after["synced_to_payload"] is True
    assert sync_after["payload_article_id"] == 8883

    clear_all_runs(feature="prompt2blog")


def test_prompt2blog_start_pipeline_v2_queues_background_task(monkeypatch):
    clear_all_runs(feature="prompt2blog")
    captured: dict[str, object] = {}

    def _fake_run_full_pipeline(run_id: str, request):  # noqa: ANN001
        captured["run_id"] = run_id
        captured["request"] = request

    monkeypatch.setattr(runs_api, "run_full_pipeline", _fake_run_full_pipeline)

    request = prompt2blog_routes.Prompt2BlogInputRequest(
        article_type_id=1,
        source_material=["One source blob."],
        article_goal="Generate a practical article.",
        target_reader="General readers",
        destination_context="Barcelona, Spain",
        tone_id="practical",
        length_id="medium",
        brand_voice_id="questurian-default",
        include_debug=False,
        enable_editorial_augmentation=False,
    )
    background_tasks = BackgroundTasks()

    response = asyncio.run(
        prompt2blog_routes.start_pipeline_v2(
            request=request,
            background_tasks=background_tasks,
        )
    )
    payload = _response_payload(response)
    run_id = payload["run_id"]
    assert payload["message"] == "Prompt2Blog pipeline v2 queued"

    assert len(background_tasks.tasks) == 1
    task = background_tasks.tasks[0]
    task.func(*task.args, **task.kwargs)

    assert captured["run_id"] == run_id
    assert isinstance(captured["request"], prompt2blog_routes.Prompt2BlogInputRequest)
    assert read_status(run_id)["feature"] == "prompt2blog"

    clear_all_runs(feature="prompt2blog")


def test_prompt2blog_rejects_legacy_payload_shape():
    with pytest.raises(ValidationError):
        prompt2blog_routes.Prompt2BlogInputRequest.model_validate(
            {
                "raw_sources": ["legacy"],
                "writing_brief": {},
            }
        )


def test_prompt2blog_input_options_endpoint_returns_catalog(monkeypatch):
    monkeypatch.setattr(
        options_api,
        "read_article_type_name_definitions",
        lambda: [{"name": "Explainer", "definition": "Explains things clearly."}],
    )
    monkeypatch.setattr(
        options_api,
        "get_article_type_by_name",
        lambda _name: {
            "id": 11,
            "name": "Explainer",
            "definition": "Explains things clearly.",
        },
    )

    payload = _response_payload(asyncio.run(prompt2blog_routes.get_input_options()))
    assert payload["article_types"][0]["id"] == 11
    assert payload["tones"]
    assert payload["lengths"]
    assert payload["brand_voices"]


def test_prompt2blog_guideline_preview_endpoint_returns_selected_type(monkeypatch):
    monkeypatch.setattr(
        options_api,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Explainer",
            "definition": "Explains things clearly.",
            "guideline": "Fallback guideline.",
            "title_guideline": "Fallback title guideline.",
        },
    )

    payload = _response_payload(
        asyncio.run(prompt2blog_routes.get_article_type_guideline_preview(11))
    )
    assert payload["id"] == 11
    assert payload["name"] == "Explainer"
    assert isinstance(payload["guideline"], str)
    assert isinstance(payload["title_guideline"], str)


def test_prompt2blog_cleanup_stage_uses_ai_payload_and_keeps_travel_facts(monkeypatch):
    clear_all_runs(feature="prompt2blog")
    run_id = f"p2b-{uuid4()}"

    cleaned_text = """IS IT SAFE TO TRAVEL TO PERU (2026 UPDATE)
March 31, 2026

Many travelers love the idea of Peru – Machu Picchu, Lima, the Andes, Inca culture, llamas – but is it safe to travel to Peru?

Safe Travel to Peru: What You Need to Know

Travelers to Peru should keep the following tips in mind as they explore the country:

Check the State Department’s safety ratings and enroll in STEP
Be very intentional about the transportation you take around the country
Have a well-defined plan for visiting Machu Picchu, including packing appropriate clothing
Take precautions to avoid intestinal diseases
Be aware of your surroundings, particularly in Lima
Understand Peru’s drug laws

Peru’s Safety Ratings

The most authoritative and useful source for American travelers is the State Department, which gives Peru a highly conditional level-two rating – exercise increased caution.

The good news is that Machu Picchu and the area surrounding it is safe, and that there are safe ways of getting from Lima to Cusco.

One easy way to enhance your safety in Peru is to enroll in STEP, the State Department's safety-monitoring program.

Getting to Machu Picchu

As mentioned, taking the train to Machu Picchu is one of the safest and most scenic ways of getting to this iconic UNESCO World Heritage Site.

If you have time, spend a day in Cusco to get acclimated to its 11,000 feet of altitude.

Here are some additional safety tips for trekking around Machu Picchu:

Walking sticks are fine, but pointed ends must be covered with rubber tips.
Bring and use insect repellent.
Dress for mountain conditions, with multiple layers of warm clothing.
Bring water and a rain jacket, even if it looks like a sunny day.

Health Guidelines for Peru Travel

Yellow fever is a real risk in Peru, so make sure you’re vaccinated before traveling there.

Clean water is also an issue. Recommendations include:

Drink boiled water or bottled water with sealed lids
Avoid ice cubes
Avoid raw and undercooked food, such as salads"""

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
                        "reason": "Promotional upsell unrelated to the factual safety guidance.",
                        "excerpt": "LEARN MORE ABOUT OUR TRAVEL INSURANCE PLANS",
                    },
                    {
                        "label": "Insurance products",
                        "reason": "Product marketing section for Berkshire Hathaway travel insurance plans.",
                        "excerpt": "Berkshire Hathaway Travel Protection has a wide range of products to protect your Peruvian vacation, including:",
                    },
                    {
                        "label": "Footer navigation",
                        "reason": "Site navigation and company footer links are boilerplate.",
                        "excerpt": "Company About Us Customer Reviews Plans ExactCare LuxuryCare Resources Blog Contact assist@bhtp.com 844-411-2487",
                    },
                    {
                        "label": "Legal disclaimer",
                        "reason": "Policy disclaimer and legal copy are not useful source material for the article.",
                        "excerpt": "The full coverage terms and details, including limitations and exclusions, are contained in the travel insurance policy.",
                    },
                ],
            },
            "{}",
        )

    dependencies = _preparation_dependencies(
        invoke_json=_fake_cleanup_llm,
        invoke_text=lambda **kwargs: "Synthesized source material",
    )
    runtime_request = prepare_full_pipeline_request(
        run_id,
        _build_prompt2blog_request([PERU_SOURCE_SAMPLE]),
        dependencies,
    )

    assert runtime_request.raw_sources == [cleaned_text]

    cleanup_stage = read_stage_result(run_id, "stage_input_cleanup")
    assert cleanup_stage["data"]["cleanup_mode"] == "ai_always_aggressive_v1"
    assert cleanup_stage["data"]["model_name"] == "gemini-2.5-flash-lite"
    assert cleanup_stage["data"]["cleaned_sources"] == [cleaned_text]

    source = cleanup_stage["data"]["sources"][0]
    assert source["fallback_used"] is False
    assert source["title"] == "IS IT SAFE TO TRAVEL TO PERU (2026 UPDATE)"
    assert source["published_at"] == "March 31, 2026"
    assert "Clean water is also an issue." in source["cleaned_text"]
    assert "Travel Insurance" not in source["cleaned_text"]
    assert "Berkshire Hathaway Travel Protection" not in source["cleaned_text"]
    assert source["removed_blocks"][0]["label"] == "Travel insurance CTA"
    assert cleanup_stage["data"]["cleanup_stats"][0]["removed_lines"] == 4

    clear_all_runs(feature="prompt2blog")


def test_prompt2blog_cleanup_falls_back_to_precleaned_text_when_ai_cleanup_fails(
    monkeypatch,
):
    clear_all_runs(feature="prompt2blog")
    run_id = f"p2b-{uuid4()}"
    source_text = """Cookie banner
https://example.com/privacy
Main travel safety guidance stays here.

Keep this logistics paragraph."""

    captured_prompt: dict[str, str] = {}

    def _fake_synthesize_llm(**kwargs):  # noqa: ANN001
        captured_prompt["prompt"] = kwargs["prompt"]
        return "Synthesized source material"

    def _raising_cleanup_llm(**kwargs):  # noqa: ANN001
        raise RuntimeError("Invalid JSON")

    dependencies = _preparation_dependencies(
        invoke_json=_raising_cleanup_llm,
        invoke_text=_fake_synthesize_llm,
    )
    runtime_request = prepare_full_pipeline_request(
        run_id,
        _build_prompt2blog_request([source_text]),
        dependencies,
    )
    expected_fallback, _ = _preclean_source_text(source_text)

    assert runtime_request.raw_sources == [expected_fallback]
    assert expected_fallback in captured_prompt["prompt"]

    cleanup_stage = read_stage_result(run_id, "stage_input_cleanup")
    source = cleanup_stage["data"]["sources"][0]
    assert source["fallback_used"] is True
    assert source["cleaned_text"] == expected_fallback
    assert source["removed_blocks"] == []

    clear_all_runs(feature="prompt2blog")


def test_prompt2blog_cleanup_chunks_long_sources_and_merges_duplicates(monkeypatch):
    clear_all_runs(feature="prompt2blog")
    run_id = f"p2b-{uuid4()}"
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

    dependencies = _preparation_dependencies(
        invoke_json=_fake_chunk_cleanup_llm,
        invoke_text=lambda **kwargs: "Synthesized source material",
    )
    runtime_request = prepare_full_pipeline_request(
        run_id,
        _build_prompt2blog_request([long_source]),
        dependencies,
    )
    expected_cleaned = (
        "Shared boundary paragraph.\n\nChunk one facts.\n\nChunk two facts."
    )

    assert runtime_request.raw_sources == [expected_cleaned]
    assert len(cleanup_prompts) == 2

    cleanup_stage = read_stage_result(run_id, "stage_input_cleanup")
    source = cleanup_stage["data"]["sources"][0]
    assert source["fallback_used"] is False
    assert source["cleaned_text"] == expected_cleaned
    assert source["title"] == "Long Peru Source"
    assert len(source["removed_blocks"]) == 2

    clear_all_runs(feature="prompt2blog")
