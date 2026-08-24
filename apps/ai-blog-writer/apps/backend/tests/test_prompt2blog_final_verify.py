from __future__ import annotations

from typing import Any

from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.run_recorder import RunRecorder
from app.features.prompt2blog.stages.final_verify import run_final_verify_stage

AUDITED = "## Plan Your Visit\n\nKyoto rewards travelers who plan transport.\n"
AUGMENTED = (
    "## Plan Your Visit\n\nKyoto rewards travelers who plan transport.\n\n"
    "> [!EDITORIAL-BOX|highlight_callout]\n"
    "> The Kyoto tourist tax is 4,000 yen a night.\n"
)


def _fakes(*, grounded: bool, error: bool = False):
    recorded: dict[str, Any] = {"stages": [], "grounding_calls": 0}

    class FakeLLM:
        def invoke_json(self, **kwargs: Any) -> tuple[dict[str, Any], str]:
            recorded["grounding_calls"] += 1
            if error:
                raise RuntimeError("grounding checker unavailable")
            claims = (
                []
                if grounded
                else [
                    {
                        "claim": "The Kyoto tourist tax is 4,000 yen a night.",
                        "reason": "No source states a tourist tax.",
                        "severity": "high",
                    }
                ]
            )
            return (
                {
                    "grounded": grounded,
                    "assessment": "Checked.",
                    "unsupported_claims": claims,
                },
                "{}",
            )

    recorder = RunRecorder(
        status_writer=lambda *a, **k: None,
        stage_writer=lambda run_id, stage, payload: recorded["stages"].append(
            (stage, payload)
        ),
        artifact_writer=lambda *a, **k: None,
        clock=lambda: "2026-08-24T00:00:00+00:00",
    )
    return recorded, PipelineDependencies(llm=FakeLLM(), recorder=recorder)


def _verify_payload(recorded: dict[str, Any]) -> dict[str, Any]:
    """The last stage_final_verify record: the verification summary.

    The re-grounding call records under the same stage name first.
    """
    return [
        payload["data"]
        for stage, payload in recorded["stages"]
        if stage == "stage_final_verify"
    ][-1]


def _state(*, content: str, content_changed: bool) -> dict[str, Any]:
    return {
        "run_id": "run-final-verify",
        "trace": [],
        "include_debug": False,
        "audit_model": "test-audit",
        "raw_sources_text": "Kyoto source material.",
        "cleaned_data": "Kyoto source material.",
        "writing_brief": {},
        "rewrite": {"improved_title": "Kyoto", "improved_content": content},
        "quality": {"audit_complete": True, "overall_score": 9},
        "quality_checks": {"audience_match": True, "claims_grounded": True},
        "groundedness": {
            "checked": True,
            "grounded": True,
            "assessment": "Checked before augmentation.",
            "unsupported_claims": [],
            "high_severity_count": 0,
        },
        "content_changed_by_augmentation": content_changed,
    }


def test_unchanged_content_is_not_re_grounded():
    # The audited text and the shipping text are the same bytes, so the earlier
    # verdict still describes it. Buying a second grounding call here would be
    # pure cost.
    recorded, dependencies = _fakes(grounded=True)

    updates = run_final_verify_stage(
        _state(content=AUDITED, content_changed=False),
        dependencies,
    )

    assert recorded["grounding_calls"] == 0
    assert updates["groundedness"]["assessment"] == "Checked before augmentation."
    payload = _verify_payload(recorded)
    assert payload["content_changed_after_audit"] is False
    assert payload["regrounded"] is False


def test_changed_content_is_re_grounded():
    recorded, dependencies = _fakes(grounded=True)

    updates = run_final_verify_stage(
        _state(content=AUGMENTED, content_changed=True),
        dependencies,
    )

    assert recorded["grounding_calls"] == 1
    assert updates["groundedness"]["assessment"] == "Checked."
    assert _verify_payload(recorded)["regrounded"] is True


def test_a_claim_introduced_by_augmentation_is_caught():
    # The reported hole: augmentation can rewrite the whole article after the
    # audit has settled, and the pipeline went on reporting the pre-augmentation
    # grounding verdict for it.
    recorded, dependencies = _fakes(grounded=False)

    updates = run_final_verify_stage(
        _state(content=AUGMENTED, content_changed=True),
        dependencies,
    )

    assert updates["groundedness"]["grounded"] is False
    assert updates["groundedness"]["high_severity_count"] == 1
    assert updates["quality_checks"]["claims_grounded"] is False
    assert updates["quality"]["groundedness"]["grounded"] is False


def test_a_failed_re_check_is_recorded_as_unchecked():
    recorded, dependencies = _fakes(grounded=True, error=True)

    updates = run_final_verify_stage(
        _state(content=AUGMENTED, content_changed=True),
        dependencies,
    )

    # Degraded, not silently inherited from the pre-augmentation pass.
    assert updates["groundedness"]["checked"] is False
    assert _verify_payload(recorded)["groundedness_checked"] is False


def test_settling_restores_the_grounding_verdict_of_the_draft_it_restores():
    """Settling reverted the draft's text and scores but left `groundedness`
    on whatever the last repair iteration produced."""
    from app.features.prompt2blog.stages.audit_repair import run_quality_settle_stage

    recorded, dependencies = _fakes(grounded=True)
    best_groundedness = {
        "checked": True,
        "grounded": True,
        "assessment": "The kept draft is grounded.",
        "unsupported_claims": [],
        "high_severity_count": 0,
    }
    state = {
        "run_id": "run-settle",
        "trace": [],
        "include_debug": False,
        "rewrite": {"improved_title": "Late", "improved_content": "Late draft."},
        "quality": {"overall_score": 5},
        "quality_checks": {},
        # The last loop iteration was ungrounded; the draft being restored was not.
        "groundedness": {
            "checked": True,
            "grounded": False,
            "assessment": "The discarded draft invented a fee.",
            "unsupported_claims": [],
            "high_severity_count": 1,
        },
        "best_rewrite": {"improved_title": "Best", "improved_content": "Best draft."},
        "best_quality": {"overall_score": 9, "groundedness": best_groundedness},
        "best_quality_checks": {"claims_grounded": True},
    }

    updates = run_quality_settle_stage(state, dependencies)

    assert updates["rewrite"]["improved_content"] == "Best draft."
    assert updates["groundedness"] == best_groundedness
