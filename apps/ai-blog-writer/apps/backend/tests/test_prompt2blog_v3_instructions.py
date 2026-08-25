from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v3 import (
    EvidenceRequirement,
    Prompt2BlogV3Request,
)
from app.features.prompt2blog.evidence_v3 import normalize_evidence
from app.features.prompt2blog.instructions_v3 import (
    PRECEDENCE,
    assemble_v3_instructions,
)


FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v3.json"
)


def _fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def _request(**overrides) -> Prompt2BlogV3Request:
    fixture = _fixture()
    payload = {
        "schema_version": 3,
        "commission": fixture["commission"],
        "evidence_package": fixture["evidence_package"],
        "profiles": {
            "tone_id": "editorial",
            "length_id": "standard",
            "brand_voice_id": None,
            "creativity_level": "medium",
        },
    }
    payload.update(overrides)
    return Prompt2BlogV3Request.model_validate(payload)


def test_instruction_layers_follow_the_fixed_authority_order():
    instructions = assemble_v3_instructions(_request())

    assert [layer.layer for layer in instructions.layers] == [
        "evidence",
        "commission",
        "form",
        "topic_modules",
        "audience",
        "house_style",
    ]
    assert instructions.precedence == list(PRECEDENCE)
    positions = [
        instructions.instruction_text.index(layer.title)
        for layer in instructions.layers
    ]
    assert positions == sorted(positions)
    assert "may never add a subject" in instructions.instruction_text


def test_commission_layer_locks_form_subject_scope_and_exclusions():
    fixture = _fixture()
    instructions = assemble_v3_instructions(_request())
    commission_layer = next(
        layer for layer in instructions.layers if layer.layer == "commission"
    )

    assert fixture["commission"]["original_title"] in commission_layer.body
    assert "Primary subject: Lima" in commission_layer.body
    assert "Scope mode: single_subject" in commission_layer.body
    assert "- Medellín — context_only" in commission_layer.body
    assert "never become co-subjects" in commission_layer.body
    for exclusion in fixture["commission"]["exclusions"]:
        assert exclusion in commission_layer.body
    assert instructions.instruction_meta["form_id"] == "analysis"


def test_only_the_commissioned_modules_and_tags_reach_the_stack():
    instructions = assemble_v3_instructions(_request())
    modules_layer = next(
        layer for layer in instructions.layers if layer.layer == "topic_modules"
    )
    audience_layer = next(
        layer for layer in instructions.layers if layer.layer == "audience"
    )

    assert instructions.instruction_meta["topic_module_ids"] == (
        _fixture()["commission"]["topic_module_ids"]
    )
    assert "## Research questions" in modules_layer.body
    assert "Safety" not in instructions.instruction_meta["topic_module_ids"]
    assert "adjust emphasis only" in audience_layer.body


def test_evidence_layer_preserves_publisher_url_dates_and_exact_notes():
    fixture = _fixture()
    source = fixture["evidence_package"]["sources"][0]
    instructions = assemble_v3_instructions(_request())
    evidence_layer = next(
        layer for layer in instructions.layers if layer.layer == "evidence"
    )

    assert source["publisher"] in evidence_layer.body
    assert source["url"].rstrip("/") in evidence_layer.body
    assert source["retrieved_at"] in evidence_layer.body
    for note in source["notes"]:
        assert note in evidence_layer.body
    assert "never invent a bridge" in evidence_layer.body


def test_normalized_requirements_keep_commission_order_and_report_gaps():
    request = _request()

    evidence = normalize_evidence(request.commission, request.evidence_package)

    assert [item.requirement_id for item in evidence.requirements] == [
        item.requirement_id for item in request.commission.requirements
    ]
    assert evidence.unresolved_requirement_ids() == ["r2", "r3"]
    receipt = evidence.receipt()
    assert receipt["requirement_status"]["r1"] == "supported"
    assert receipt["unresolved_requirement_ids"] == ["r2", "r3"]


def test_headline_instructions_carry_the_original_title_and_form_note():
    fixture = _fixture()

    instructions = assemble_v3_instructions(_request())

    assert fixture["commission"]["original_title"] in (
        instructions.headline_instructions
    )
    assert "FORM HEADLINE NOTE — Analysis" in instructions.headline_instructions
    assert "author intent, not a template" in instructions.headline_instructions


def test_unknown_catalog_ids_fail_instead_of_silently_dropping():
    # The request contract already rejects unknown IDs, so the assembler is
    # forced past it to prove it fails loudly rather than dropping the module.
    broken = _request().model_copy(deep=True)
    broken.commission.topic_module_ids = ["not-a-module"]

    with pytest.raises(ValueError, match="Unknown topic modules"):
        assemble_v3_instructions(broken)


def test_supported_requirement_cannot_also_declare_a_gap():
    with pytest.raises(ValidationError, match="cannot describe a gap"):
        EvidenceRequirement.model_validate(
            {
                "requirement_id": "r1",
                "status": "supported",
                "claim_ids": ["c1"],
                "gap": "Still incomplete.",
            }
        )
