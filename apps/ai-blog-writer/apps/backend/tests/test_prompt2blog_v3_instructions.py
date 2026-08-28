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
    assert instructions.schema_version == 4
    assert instructions.stage_contexts.compose.included_sections == [
        "compose_authority",
        "evidence",
        "commission",
        "form",
        "topic_modules",
        "audience",
        "house_style",
    ]
    assert len(instructions.stage_contexts.compose.fingerprint) == 64


def test_stage_contexts_are_deterministic_and_keep_only_job_specific_material():
    fixture = _fixture()

    first = assemble_v3_instructions(_request()).stage_contexts
    second = assemble_v3_instructions(_request()).stage_contexts

    assert first == second
    assert "CLAIM INDEX" in first.outline.text
    assert "## Allowed structures" in first.outline.text
    assert fixture["evidence_package"]["sources"][0]["url"].rstrip("/") not in (
        first.outline.text
    )
    assert "HOUSE STYLE" not in first.outline.text
    assert "VERIFIED EVIDENCE" in first.compose.text
    assert "HOUSE STYLE" in first.compose.text
    assert "VERIFIED EVIDENCE" not in first.audit.text
    assert "TOPIC MODULES" not in first.audit.text
    assert "COMPACT SCOPE AND STYLE LOCK" in first.repair_lock.text
    assert "VERIFIED EVIDENCE" not in first.repair_lock.text
    assert "Prompt2Blog headline standard" in first.title.text
    assert "FORM HEADLINE NOTE — Analysis" in first.title.text
    assert "VERIFIED EVIDENCE" not in first.title.text


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


def test_title_context_carries_the_original_title_and_form_note():
    fixture = _fixture()

    instructions = assemble_v3_instructions(_request())

    title_context = instructions.stage_contexts.title.text
    assert fixture["commission"]["original_title"] in title_context
    assert "FORM HEADLINE NOTE — Analysis" in title_context
    assert "Primary subject: Lima" in title_context


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


def test_first_hand_material_is_written_as_the_writers_own_knowledge():
    """The operator answering a question research could not is a fact, not a
    caveat. Attributing it back to them reintroduces exactly the disclaimer
    prose the voice rules ban."""
    from app.features.prompt2blog.instructions_v3 import _evidence_body

    class _Evidence:
        records_text = "RECORDS"

    body = _evidence_body(_Evidence())

    assert "state it directly, as fact" in body
    assert "no attribution, no sourcing language" in body


def test_the_writer_is_told_not_to_narrate_the_premise_check():
    """Over-transparency is one of the loudest signals a human did not write it.

    The evidence records now carry what the commission assumed and what
    research found. Without this line that block is an invitation to write
    "the 2025 ranking, which is the most recent published edition" into a
    travel piece.
    """
    instructions = assemble_v3_instructions(_request())
    evidence_layer = next(
        layer for layer in instructions.layers if layer.layer == "evidence"
    )

    assert (
        "A confirmed premise is simply a fact the article may use"
        in evidence_layer.body
    )
    assert "never mention that it was checked" in evidence_layer.body


def test_the_writer_is_told_not_to_narrate_a_resolved_conflict():
    """The premise line's twin, and the same failure shape.

    Conflict resolution sends the operator's own decision to the writer, and
    on the run that proved the feature the auditor caught the writer narrating
    the disagreement itself. The reader wants the settled figure, not the
    argument that produced it.
    """
    instructions = assemble_v3_instructions(_request())
    evidence_layer = next(
        layer for layer in instructions.layers if layer.layer == "evidence"
    )

    assert "A resolved conflict is the same" in evidence_layer.body
    assert "Never tell the reader that two records disagreed" in evidence_layer.body
