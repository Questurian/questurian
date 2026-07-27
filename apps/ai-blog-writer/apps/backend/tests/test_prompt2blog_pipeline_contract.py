from __future__ import annotations

from dataclasses import replace
from typing import Any
from uuid import uuid4

import pytest

from app.features.prompt2blog.config import (
    P2B_AUDIT_MODEL,
    PROMPT2BLOG_CREATIVITY_TEMPERATURES,
)
from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.models import (
    PipelineV2RuntimeRequest,
    Prompt2BlogInputRequest,
)
from app.features.prompt2blog.orchestrator import run_full_pipeline, run_pipeline_v2
from app.features.prompt2blog.run_recorder import RunRecorder


def _runtime_request(
    *,
    enable_editorial_augmentation: bool = False,
) -> PipelineV2RuntimeRequest:
    return PipelineV2RuntimeRequest(
        cleaned_data="A synthesized account of practical Kyoto travel.",
        raw_sources=["Kyoto source material."],
        writing_brief={
            "goal": "Create a practical Kyoto guide.",
            "audience": "First-time visitors",
            "perspective": "Kyoto, Japan",
            "formatting": {"target_word_count": 0, "paragraph_length": ""},
            "seo": {"primary_keyword": "", "secondary_keywords": []},
        },
        article_type_id=7,
        option_context={
            "tone": {"id": "practical", "label": "Practical"},
            "length": {"id": "medium", "label": "Medium"},
            "brand_voice": {
                "id": "questurian-default",
                "label": "Questurian Default",
            },
            "creativity_level": "medium",
        },
        include_debug=True,
        enable_editorial_augmentation=enable_editorial_augmentation,
        model_name="test-model",
        writing_model="test-writer",
    )


def _pipeline_fakes(
    *,
    quality_scores: list[int],
    augmentation_error: bool = False,
) -> tuple[dict[str, Any], PipelineDependencies]:
    recorded: dict[str, Any] = {
        "statuses": [],
        "stages": [],
        "artifacts": [],
        "json_prompts": [],
        "text_prompts": [],
        "calls": [],
    }
    quality_score_iter = iter(quality_scores)

    def get_article_type(article_type_id: int) -> dict[str, Any]:
        return {
            "id": article_type_id,
            "name": "Travel Guide",
            "definition": "A practical destination guide.",
            "guideline": "Cover planning and logistics.",
            "title_guideline": "Use a specific, useful title.",
        }

    def invoke_json(*, prompt, **kwargs):  # noqa: ANN001
        recorded["json_prompts"].append(prompt)
        if "cleanup and extraction task" in prompt:
            return (
                {
                    "title": "Kyoto source",
                    "published_at": "",
                    "cleaned_text": "Kyoto source material.",
                    "removed_blocks": [],
                },
                '{"cleaned_text": "Kyoto source material."}',
            )
        if "coverage analyst" in prompt:
            return (
                {
                    "coverage_sufficient": True,
                    "analysis": "The source covers the requested guide.",
                    "missing_sections": [],
                },
                '{"coverage_sufficient": true}',
            )
        if "expert editor creating a publish-ready article" in prompt:
            return (
                {
                    "improved_title": "Kyoto for First-Time Visitors",
                    "improved_content": (
                        "## Plan Your Visit\n\n"
                        "Kyoto rewards travelers who plan transport and timing."
                    ),
                    "guideline_alignment_summary": "Planning guidance is present.",
                    "improvements_applied": ["Added a planning section."],
                    "remaining_gaps": [],
                },
                '{"improved_title": "Kyoto for First-Time Visitors"}',
            )
        if "quality auditor" in prompt:
            score = next(quality_score_iter)
            return (
                {
                    "overall_score": score,
                    "guideline_coverage_score": score,
                    "informativeness_score": score,
                    "originality_score": score,
                    "brief_adherence_score": score,
                    "seo_score": score,
                    "too_close_to_source": False,
                    "constraint_checks": {},
                    "required_revisions": (
                        ["Make the logistics more concrete."] if score <= 7 else []
                    ),
                    "quality_summary": f"Quality score {score}.",
                },
                f'{{"overall_score": {score}}}',
            )
        if "hard rewrite repair pass" in prompt:
            return (
                {
                    "improved_title": "A Practical First Visit to Kyoto",
                    "improved_content": (
                        "## Plan Your Visit\n\n"
                        "Use Kyoto Station as a transport anchor and travel early."
                    ),
                    "guideline_alignment_summary": "Logistics are now concrete.",
                    "improvements_applied": ["Added transport details."],
                    "remaining_gaps": [],
                },
                '{"improved_title": "A Practical First Visit to Kyoto"}',
            )
        if "EDITORIAL AUGMENTATION" in prompt:
            if augmentation_error:
                raise RuntimeError("augmentation unavailable")
            return (
                {
                    "augmented_content": (
                        "## Plan Your Visit\n\n"
                        "Use Kyoto Station as a transport anchor and travel early."
                    ),
                    "components_added": [],
                    "diagnostic": {},
                    "augmentation_summary": "No additions were needed.",
                },
                '{"components_added": []}',
            )
        raise AssertionError(f"Unexpected JSON prompt: {prompt[:120]}")

    def invoke_text(*, prompt, **kwargs):  # noqa: ANN001
        recorded["text_prompts"].append(prompt)
        if "Combine all these sources into a coherent overview" in prompt:
            return "A synthesized account of practical Kyoto travel."
        if "headline editor" in prompt:
            return "A Practical First Visit to Kyoto"
        raise AssertionError(f"Unexpected text prompt: {prompt[:120]}")

    class FakeLLM:
        def invoke_json(self, **kwargs: Any) -> tuple[dict[str, Any], str]:
            recorded["calls"].append(
                {
                    "prompt": kwargs["prompt"],
                    "model_name": kwargs.get("model_name"),
                    "temperature": kwargs.get("temperature"),
                }
            )
            return invoke_json(**kwargs)

        def invoke_text(self, **kwargs: Any) -> str:
            recorded["calls"].append(
                {
                    "prompt": kwargs["prompt"],
                    "model_name": kwargs.get("model_name"),
                    "temperature": kwargs.get("temperature"),
                }
            )
            return invoke_text(**kwargs)

        @staticmethod
        def enforce_anti_ai(text: str, **kwargs: Any) -> str:
            return text

    recorder = RunRecorder(
        status_writer=lambda run_id, payload, feature: recorded["statuses"].append(
            (run_id, payload.copy(), feature)
        ),
        stage_writer=lambda run_id, stage, payload: recorded["stages"].append(
            (run_id, stage, payload)
        ),
        artifact_writer=lambda run_id, artifact: recorded["artifacts"].append(
            (run_id, artifact)
        ),
        clock=lambda: "2026-07-25T00:00:00+00:00",
    )
    dependencies = PipelineDependencies(
        llm=FakeLLM(),
        recorder=recorder,
        get_article_type=get_article_type,
        read_article_type_markdown=lambda **kwargs: (kwargs["fallback"], None),
        resolve_writer_model=lambda value, default: value or default,
    )
    return recorded, dependencies


def _stage_payload(recorded: dict[str, Any], stage_name: str) -> dict[str, Any]:
    return next(
        payload for _run_id, stage, payload in recorded["stages"] if stage == stage_name
    )


def test_pipeline_contract_preserves_stage_order_and_artifact():
    recorded, dependencies = _pipeline_fakes(quality_scores=[9])
    run_id = f"run-contract-{uuid4()}"

    run_pipeline_v2(run_id, _runtime_request(), dependencies)

    stage_names = [stage for _run_id, stage, _payload in recorded["stages"]]
    assert [stage for stage in stage_names if stage != "langgraph_trace"] == [
        "stage_guideline_fetch",
        "stage_coverage_check",
        "stage_supplement",
        "stage_compose",
        "stage_quality_audit",
        "stage_repair",
        "stage_editorial_augmentation",
        "stage_title",
        "stage_finalize",
        "pipeline_v2",
    ]
    assert stage_names[-1] in {"pipeline_v2", "langgraph_trace"}
    assert recorded["statuses"][-1][1]["state"] == "completed"
    assert recorded["statuses"][-1][1]["stage"] == "complete"

    artifact = recorded["artifacts"][0][1]
    assert artifact["markdown"].startswith("# A Practical First Visit to Kyoto")
    assert artifact["pipeline_v2"]["pipeline_status"] == "ready_for_staging"
    assert artifact["pipeline_v2"]["article_type"] == {
        "id": 7,
        "name": "Travel Guide",
        "definition": "A practical destination guide.",
    }
    assert artifact["stages"].keys() == {
        "stage_guideline_fetch",
        "stage_coverage_check",
        "stage_compose",
        "stage_quality_audit",
        "stage_editorial_augmentation",
        "stage_title",
    }


def test_pipeline_contract_repairs_then_reaudits():
    recorded, dependencies = _pipeline_fakes(quality_scores=[6, 9])
    run_id = f"run-repair-{uuid4()}"

    run_pipeline_v2(run_id, _runtime_request(), dependencies)

    repair_payload = _stage_payload(recorded, "stage_repair")["data"]
    assert repair_payload["repair_applied"] is True
    assert repair_payload["rewrite"]["improved_title"] == (
        "A Practical First Visit to Kyoto"
    )
    assert repair_payload["quality"]["overall_score"] == 9
    assert sum("quality auditor" in prompt for prompt in recorded["json_prompts"]) == 2


def _model_for(recorded: dict[str, Any], marker: str) -> str | None:
    return next(
        call["model_name"] for call in recorded["calls"] if marker in call["prompt"]
    )


def test_writer_model_serves_compose_repair_and_title():
    recorded, dependencies = _pipeline_fakes(quality_scores=[6, 9])

    run_pipeline_v2(f"run-tiering-{uuid4()}", _runtime_request(), dependencies)

    assert _model_for(recorded, "expert editor creating a publish-ready article") == (
        "test-writer"
    )
    assert _model_for(recorded, "hard rewrite repair pass") == "test-writer"
    assert _model_for(recorded, "headline editor") == "test-writer"


def test_quality_audit_runs_on_the_audit_model_not_the_analysis_model():
    recorded, dependencies = _pipeline_fakes(quality_scores=[9])

    run_pipeline_v2(f"run-audit-model-{uuid4()}", _runtime_request(), dependencies)

    assert _model_for(recorded, "quality auditor") == P2B_AUDIT_MODEL
    assert _model_for(recorded, "quality auditor") != "test-model"


def test_finalize_records_actual_stage_model_routing():
    recorded, dependencies = _pipeline_fakes(quality_scores=[9])

    run_pipeline_v2(f"run-overrides-{uuid4()}", _runtime_request(), dependencies)

    overrides = recorded["artifacts"][0][1]["pipeline_v2"]["quality_review"][
        "stage_model_overrides"
    ]
    assert overrides == {
        "stage_compose": "test-writer",
        "stage_editorial_augmentation": "test-writer",
        "stage_repair": "test-writer",
        "stage_title": "test-writer",
        "stage_quality_audit": P2B_AUDIT_MODEL,
    }


def test_creativity_level_sets_the_compose_temperature():
    compose_marker = "expert editor creating a publish-ready article"
    temperatures = {}
    for level in ("low", "high"):
        recorded, dependencies = _pipeline_fakes(quality_scores=[9])
        request = _runtime_request()
        request.option_context["creativity_level"] = level
        run_pipeline_v2(f"run-creativity-{level}-{uuid4()}", request, dependencies)
        temperatures[level] = next(
            call["temperature"]
            for call in recorded["calls"]
            if compose_marker in call["prompt"]
        )

    # The control used to be inert: it was rendered into an instructions blob
    # while compose ran at a hardcoded 0.1 regardless.
    assert temperatures["low"] == PROMPT2BLOG_CREATIVITY_TEMPERATURES["low"]
    assert temperatures["high"] == PROMPT2BLOG_CREATIVITY_TEMPERATURES["high"]
    assert temperatures["low"] < temperatures["high"]


def test_hard_constraints_reach_the_compose_prompt():
    # An uncovered must_include now fails a constraint check and triggers
    # repair, so the audit runs twice.
    recorded, dependencies = _pipeline_fakes(quality_scores=[9, 9])
    request = _runtime_request()
    request.writing_brief["must_include"] = ["Mention visa on arrival"]
    request.writing_brief["negative_instructions"] = ["Never say hidden gem"]

    run_pipeline_v2(f"run-hard-constraints-{uuid4()}", request, dependencies)

    compose_prompt = next(
        call["prompt"]
        for call in recorded["calls"]
        if "expert editor creating a publish-ready article" in call["prompt"]
    )
    assert "HARD CONSTRAINTS:" in compose_prompt
    assert "MUST INCLUDE" in compose_prompt
    assert "Mention visa on arrival" in compose_prompt
    assert "MUST AVOID" in compose_prompt


def test_pipeline_contract_falls_back_when_augmentation_fails():
    recorded, dependencies = _pipeline_fakes(
        quality_scores=[9],
        augmentation_error=True,
    )
    run_id = f"run-augmentation-fallback-{uuid4()}"

    run_pipeline_v2(
        run_id,
        _runtime_request(enable_editorial_augmentation=True),
        dependencies,
    )

    augmentation_payload = _stage_payload(recorded, "stage_editorial_augmentation")[
        "data"
    ]
    assert (
        augmentation_payload["editorial_augmentation"]["augmentation_applied"] is False
    )
    assert recorded["statuses"][-1][1]["state"] == "completed"


def test_full_pipeline_runs_preparation_and_generation_in_one_graph():
    recorded, dependencies = _pipeline_fakes(quality_scores=[9, 9])
    run_id = f"run-full-contract-{uuid4()}"
    request = Prompt2BlogInputRequest(
        article_type_id=7,
        source_material=["Kyoto source material."],
        article_goal="Create a practical Kyoto guide.",
        target_reader="First-time visitors",
        destination_context="Kyoto, Japan",
        tone_id="practical",
        length_id="medium",
        brand_voice_id="questurian-default",
        include_debug=True,
        enable_editorial_augmentation=False,
        model_name="test-model",
        writing_model="test-writer",
    )

    result = run_full_pipeline(run_id, request, dependencies)

    recorded_stages = [stage for _run_id, stage, _payload in recorded["stages"]]
    assert recorded_stages[:3] == [
        "stage_input_validate",
        "stage_input_cleanup",
        "stage_synthesize_sources",
    ]
    assert result["completed"] is True
    assert recorded["artifacts"][0][1]["markdown"].startswith(
        "# A Practical First Visit to Kyoto"
    )


def test_pipeline_failure_records_active_stage_and_propagates():
    recorded, dependencies = _pipeline_fakes(quality_scores=[9])
    dependencies = replace(dependencies, get_article_type=lambda _article_id: None)
    run_id = f"run-failure-{uuid4()}"

    with pytest.raises(RuntimeError, match="Article type 7 not found"):
        run_pipeline_v2(run_id, _runtime_request(), dependencies)

    assert recorded["statuses"][-1][1]["state"] == "failed"
    assert recorded["statuses"][-1][1]["stage"] == "stage_guideline_fetch"
    failure_payload = _stage_payload(recorded, "pipeline_v2")["data"]
    assert failure_payload["failed_stage"] == "stage_guideline_fetch"
