"""Finding 07: the article's shape now comes from its approved form.

Every article used to open with a 40-60 word direct answer, carry at least
three `##` headings, and close with takeaways. That is a service guide. It was
also a profile, an essay, a column and a Q&A, because the rule lived in the
compose prompt, the outline schema and the outline validator, none of which
had ever been told which form was approved.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, get_args

import pytest

from app.features.prompt2blog.contracts_v4 import ArticleFormId, Prompt2BlogV4Request
from app.features.prompt2blog.content.outline_v3 import (
    sanitize_v3_outline,
    validate_v3_outline,
)
from app.features.prompt2blog.editorial_catalog import (
    DEFAULT_STRUCTURE_POLICY,
    FormStructurePolicy,
    load_editorial_catalog,
)
from app.features.prompt2blog.instructions_v3 import resolve_structure_policy
from app.features.prompt2blog.schemas import v3_outline_schema
from tests.prompt2blog_packet_support import runtime_for

FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)


def _forms() -> dict[str, Any]:
    return {form.id: form for form in load_editorial_catalog().forms}


def _runtime_for_form(form_id: str):
    fixture = json.loads(FIXTURE_PATH.read_text())
    fixture["brief"]["form_id"] = form_id
    return runtime_for(
        Prompt2BlogV4Request.model_validate(
            {
                "schema_version": 4,
                "brief": fixture["brief"],
                "work_order": fixture["work_order"],
                "evidence_package": fixture["evidence_package"],
                "profiles": {"length_id": "medium", "creativity_level": "medium"},
            }
        )
    )


def test_every_form_declares_its_own_structure():
    forms = _forms()
    assert set(forms) == set(get_args(ArticleFormId))
    for form_id, form in forms.items():
        assert isinstance(form.structure, FormStructurePolicy), form_id


def test_a_service_guide_keeps_the_answer_and_the_takeaways():
    rules = _forms()["service-guide"].structure.compose_rules()

    assert "direct 40-60 word answer" in rules
    assert "takeaway section" in rules


def test_a_profile_is_not_forced_into_the_service_guide_shape():
    structure = _forms()["feature-profile"].structure
    rules = structure.compose_rules()

    assert structure.opening == "form-led"
    assert structure.closing == "form-led"
    assert "40-60 word answer" not in rules
    assert "Close with a concise takeaway section" not in rules
    # It still has to open on something real. "Form-led" is not "start
    # wherever"; that would trade one bad default for no default at all.
    assert "concrete and supported" in rules


def test_no_form_licenses_invented_material_to_fill_its_shape():
    for form_id, form in _forms().items():
        assert "never licenses an invented scene" in form.structure.compose_rules(), (
            form_id
        )


def test_an_interview_may_divide_into_two_sections():
    structure = _forms()["interview-qa"].structure
    assert structure.min_sections == 2

    outline = sanitize_v3_outline(
        {
            "working_title": "Two questions",
            "sections": [
                {
                    "heading": "On the route",
                    "reader_payoff": "Which leg of the trip is worth the detour.",
                    "claim_ids": [],
                    "target_words": 400,
                },
                {
                    "heading": "On the price",
                    "reader_payoff": "Whether the fare quoted is the one to book.",
                    "claim_ids": [],
                    "target_words": 400,
                },
            ],
        },
        max_sections=structure.max_sections,
    )
    accepted, checks = validate_v3_outline(
        outline,
        work_order={"primary_subject": "", "scope": {"references": []}},
        claim_ids=set(),
        target_word_count=0,
        min_sections=structure.min_sections,
    )

    assert checks["enough_sections"] is True
    assert accepted is True


def test_the_same_two_section_plan_still_fails_a_service_guide():
    structure = _forms()["service-guide"].structure
    outline = sanitize_v3_outline(
        {
            "working_title": "Two sections",
            "sections": [
                {"heading": "One", "claim_ids": [], "target_words": 400},
                {"heading": "Two", "claim_ids": [], "target_words": 400},
            ],
        },
        max_sections=structure.max_sections,
    )
    _accepted, checks = validate_v3_outline(
        outline,
        work_order={"primary_subject": "", "scope": {"references": []}},
        claim_ids=set(),
        target_word_count=0,
        min_sections=structure.min_sections,
    )

    assert checks["enough_sections"] is False


def test_the_provider_schema_follows_the_form_too():
    # The one place a provider refuses rather than asks. A literal minItems of
    # 3 rejected a valid two-section Q&A before any of our checks ran.
    schema = v3_outline_schema(min_sections=2, max_sections=9)
    sections = schema["properties"]["sections"]

    assert sections["minItems"] == 2
    assert sections["maxItems"] == 9
    # And building one never edits the shared constant.
    from app.features.prompt2blog.schemas import V3_OUTLINE_SCHEMA

    assert V3_OUTLINE_SCHEMA["properties"]["sections"]["minItems"] == 3


@pytest.mark.parametrize("form_id", ["service-guide", "feature-profile"])
def test_the_resolved_policy_is_frozen_with_the_run(form_id: str):
    runtime = _runtime_for_form(form_id)
    recorded = runtime.instructions["instruction_meta"]["structure_policy"]

    assert recorded == _forms()[form_id].structure.model_dump()
    # And a resumed leg reads it back rather than resolving the form again.
    assert resolve_structure_policy(runtime.instructions) == _forms()[
        form_id
    ].structure


def test_a_run_with_no_recorded_policy_keeps_the_old_shape():
    """Every run started before forms carried a policy. Those should finish."""
    assert resolve_structure_policy({}) == DEFAULT_STRUCTURE_POLICY
    assert resolve_structure_policy(None) == DEFAULT_STRUCTURE_POLICY
    assert (
        resolve_structure_policy({"instruction_meta": {}}) == DEFAULT_STRUCTURE_POLICY
    )
