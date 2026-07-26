import pytest

from app.features.editor_assist.blurb_composer import (
    ListicleCompositionDeps,
    ListicleCompositionSettings,
    ListicleCompositionTarget,
    ListicleCompositionWriterError,
    compose_listicle_target,
)
from app.features.editor_assist.critical_fields import CriticalFieldsResult
from app.features.editor_assist.research_profile import (
    ResearchFinding,
    ResearchProfile,
    ResearchProfileTrace,
    SelectedAngleEvidence,
)
from app.features.editor_assist.writer_brief import (
    SourceFact,
    WriterBrief,
    WriterBriefTrace,
)
from app.shared.writer_invocation import WriterModelError


class _WriterResult:
    def __init__(self, text: str) -> None:
        self.text = text
        self.model_name = "test-writer"


def _paragraph(word_count: int, *, token: str = "editorial") -> str:
    return " ".join([token] * word_count)


def _target(category="dining") -> ListicleCompositionTarget:
    return ListicleCompositionTarget(
        target_id="item-1_blurb",
        field_type="blurb",
        category=category,
        display_name="La Mar",
        research_subject="La Mar",
        location_label="Miraflores, Lima",
        supporting_context="hours: noon to 10pm",
    )


def _settings(
    *,
    requested_angle="signature-dish",
    effective_angle="signature-dish",
) -> ListicleCompositionSettings:
    return ListicleCompositionSettings(
        article_title="Best Restaurants in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        article_context="",
        custom_instruction="",
        model_name="test-model",
        requested_angle=requested_angle,
        effective_angle=effective_angle,
    )


def _profile(
    *,
    angle="signature-dish",
    usable_for_blurb=True,
    warnings=None,
) -> ResearchProfile:
    return ResearchProfile(
        selected_angle=SelectedAngleEvidence(
            angle=angle,
            status="supported" if usable_for_blurb else "unsupported",
            summary="La Mar has a cited signature cebiche.",
            citations=["https://example.com/angle"] if usable_for_blurb else [],
            reason="supported by source",
        ),
        standard_buckets={
            "specific-offerings": (
                [
                    ResearchFinding(
                        summary="Cebiche is central to the menu.",
                        citations=["https://example.com/menu"],
                    )
                ]
                if usable_for_blurb
                else []
            ),
            "experience-texture": [],
        },
        usable_for_blurb=usable_for_blurb,
        warnings=warnings or [],
    )


def _usable_brief(angle="signature-dish") -> WriterBrief:
    return WriterBrief(
        angle_directive="Open by naming La Mar's cebiche.",
        source_facts=[
            SourceFact(
                fact="Cebiche is central to the menu.",
                citations=["https://example.com/menu"],
            ),
            SourceFact(
                fact="The room is in Miraflores.",
                citations=["https://example.com/location"],
            ),
        ],
        angle=angle,
        venue="La Mar",
    )


def test_unusable_writer_brief_falls_to_identity_only_and_marks_low_confidence():
    captured: dict[str, str] = {}

    def _writer(**kwargs):
        captured["prompt"] = kwargs["prompt"]
        return _WriterResult(_paragraph(100))

    def _brief(**kwargs):
        return (
            WriterBrief(
                angle_directive="Open by naming La Mar's cebiche.",
                source_facts=[],
                angle=kwargs["angle"],
                venue=kwargs["venue_name"],
            ),
            WriterBriefTrace(
                prompt="brief prompt",
                raw_response='{"angle_directive":"x","source_facts":[]}',
                model="brief-model",
            ),
        )

    result = compose_listicle_target(
        target=_target(),
        settings=_settings(),
        cf_result=CriticalFieldsResult(passed=True, missing=[]),
        research_profile=_profile(),
        research_profile_trace=ResearchProfileTrace(prompt="rp prompt"),
        deps=ListicleCompositionDeps(invoke_writer=_writer, run_writer_brief=_brief),
    )

    assert result.status == "generated"
    assert result.low_confidence is True
    assert "EVIDENCE STATUS" in captured["prompt"]
    assert "No public evidence was found" in captured["prompt"]
    assert "Source facts (use only what you need):" not in captured["prompt"]

    writer_brief_step = next(
        step for step in result.steps if step.name == "writer_brief_completed"
    )
    assert writer_brief_step.status == "failed"
    writer_step = next(step for step in result.steps if step.name == "writer_called")
    assert writer_step.details["low_confidence_reasons"] == ["writer brief unusable"]


def test_lean_retry_stays_inside_composer_without_http_route():
    prompts: list[str] = []

    def _writer(**kwargs):
        prompts.append(kwargs["prompt"])
        if len(prompts) == 1:
            return _WriterResult("too short")
        return _WriterResult(_paragraph(100))

    def _brief(**kwargs):
        return (
            _usable_brief(kwargs["angle"]),
            WriterBriefTrace(
                prompt="brief prompt", raw_response="{}", model="brief-model"
            ),
        )

    result = compose_listicle_target(
        target=_target(),
        settings=_settings(),
        cf_result=CriticalFieldsResult(passed=True, missing=[]),
        research_profile=_profile(),
        research_profile_trace=ResearchProfileTrace(prompt="rp prompt"),
        deps=ListicleCompositionDeps(invoke_writer=_writer, run_writer_brief=_brief),
    )

    assert result.status == "generated"
    assert result.low_confidence is False
    assert [step.name for step in result.steps] == [
        "critical_fields_evaluated",
        "research_profile_completed",
        "writer_brief_completed",
        "writer_called",
        "validated",
        "retry_called",
        "finalized",
    ]
    assert len(prompts) == 2
    assert "REVISION TASK" in prompts[1]
    assert "Source facts (use only what you need):" in prompts[1]
    assert "BUILDER CONTEXT" not in prompts[1]
    assert "RESEARCH PROFILE" not in prompts[1]


def test_critical_fields_failure_short_circuits_all_model_dependencies():
    def _should_not_run(**_kwargs):
        raise AssertionError(
            "model dependency must not run after Critical Fields failure"
        )

    result = compose_listicle_target(
        target=_target(),
        settings=_settings(),
        cf_result=CriticalFieldsResult(passed=False, missing=["payload_doc_id"]),
        research_profile=None,
        research_profile_trace=None,
        deps=ListicleCompositionDeps(
            invoke_writer=_should_not_run,
            run_writer_brief=_should_not_run,
        ),
    )

    assert result.status == "error"
    assert result.error_message == (
        "Critical Fields gate failed: missing payload_doc_id"
    )
    assert [step.name for step in result.steps] == ["critical_fields_evaluated"]
    assert result.steps[0].status == "failed"


def test_unusable_research_preserves_warnings_sources_and_confidence_reasons():
    profile = ResearchProfile(
        selected_angle=SelectedAngleEvidence(
            angle="signature-dish",
            status="unsupported",
            reason="No cited dish evidence.",
        ),
        standard_buckets={
            "standout-hook": [
                ResearchFinding(
                    summary="The dining room overlooks the coast.",
                    citations=["https://example.com/hook"],
                )
            ],
            "experience-texture": [],
        },
        usable_for_blurb=False,
        warnings=["Selected angle could not be supported."],
    )

    result = compose_listicle_target(
        target=_target(),
        settings=_settings(effective_angle=None),
        cf_result=CriticalFieldsResult(passed=True, missing=[]),
        research_profile=profile,
        research_profile_trace=None,
        deps=ListicleCompositionDeps(
            invoke_writer=lambda **_kwargs: _WriterResult(_paragraph(100))
        ),
    )

    assert result.status == "generated"
    assert result.source_urls == ["https://example.com/hook"]
    assert result.warnings == ["Selected angle could not be supported."]
    assert result.low_confidence is True
    writer_step = next(step for step in result.steps if step.name == "writer_called")
    assert writer_step.details["low_confidence_reasons"] == [
        "requested angle unsupported",
        "research profile unusable",
    ]


def test_second_validation_failure_returns_error_with_retry_trace():
    calls = 0

    def _writer(**_kwargs):
        nonlocal calls
        calls += 1
        return _WriterResult("still too short")

    result = compose_listicle_target(
        target=_target(category="key_location"),
        settings=_settings(requested_angle=None, effective_angle=None),
        cf_result=CriticalFieldsResult(passed=True, missing=[]),
        research_profile=None,
        research_profile_trace=None,
        deps=ListicleCompositionDeps(invoke_writer=_writer),
    )

    assert calls == 2
    assert result.status == "error"
    assert result.markdown is None
    assert result.error_message == "Generated content failed validation after retry."
    assert result.validation_errors
    assert [(step.name, step.status) for step in result.steps[-3:]] == [
        ("validated", "failed"),
        ("retry_called", "failed"),
        ("finalized", "failed"),
    ]


def test_writer_error_is_translated_through_compatible_composer_exception():
    def _writer(**_kwargs):
        raise WriterModelError("writer unavailable")

    with pytest.raises(ListicleCompositionWriterError, match="writer unavailable"):
        compose_listicle_target(
            target=_target(category="key_location"),
            settings=_settings(requested_angle=None, effective_angle=None),
            cf_result=CriticalFieldsResult(passed=True, missing=[]),
            research_profile=None,
            research_profile_trace=None,
            deps=ListicleCompositionDeps(invoke_writer=_writer),
        )
