"""Prompt2Blog v3 intake contract."""

from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError

import app.features.prompt2blog.routes as prompt2blog_routes
from app.features.prompt2blog.contracts_v4 import Prompt2BlogV4Request
from app.features.prompt2blog.intake_v3 import (
    prepare_v3_runtime_request,
    v3_intake_result,
    v3_run_input_artifact,
)

FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)


def _fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def _payload(**overrides) -> dict:
    fixture = _fixture()
    payload = {
        "schema_version": 4,
        "brief": fixture["brief"],
        "work_order": fixture["work_order"],
        "evidence_package": fixture["evidence_package"],
        "profiles": {
            "length_id": "medium",
            "creativity_level": "medium",
        },
        "model_routing": {"writing_model": "test-writer"},
    }
    payload.update(overrides)
    return payload


def _ready_evidence() -> dict:
    """The fixture package with every locked requirement genuinely supported."""
    evidence = deepcopy(_fixture()["evidence_package"])
    evidence["claims"].extend(
        [
            {
                "claim_id": "c2",
                "text": "Current reporting documents Lima's practical tradeoffs.",
                "source_ids": ["s1"],
                "requirement_ids": ["r2"],
                "as_of": "2026-07-01",
                "confidence": "medium",
            },
            {
                "claim_id": "c3",
                "text": "Comparable earlier reporting shows how those costs moved.",
                "source_ids": ["s1"],
                "requirement_ids": ["r3"],
                "as_of": "2026-07-01",
                "confidence": "medium",
            },
        ]
    )
    evidence["requirements"] = [
        {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"], "gap": ""},
        {"requirement_id": "r2", "status": "supported", "claim_ids": ["c2"], "gap": ""},
        {"requirement_id": "r3", "status": "supported", "claim_ids": ["c3"], "gap": ""},
    ]
    evidence["gaps"] = []
    return evidence


def _ready_payload(**overrides) -> dict:
    return _payload(evidence_package=_ready_evidence(), **overrides)


def _request(**overrides) -> Prompt2BlogV4Request:
    return Prompt2BlogV4Request.model_validate(_payload(**overrides))


def _intake(payload: dict) -> dict:
    """Runs the gate-and-assemble step `/pipeline-v3` runs before queueing."""
    return v3_intake_result(Prompt2BlogV4Request.model_validate(payload))


def test_intake_returns_a_versioned_run_input_for_the_approved_brief():
    fixture = _fixture()

    payload = _intake(_ready_payload())
    run_input = payload["run_input"]

    assert run_input["schema_version"] == 4
    assert run_input["instruction_schema_version"] == 5
    assert (
        run_input["brief_fingerprint"] == fixture["brief"]["brief_fingerprint"]
    )
    assert run_input["seed"] == fixture["brief"]["seed"]
    assert run_input["location"] == fixture["brief"]["location"]
    assert run_input["spine"] == fixture["brief"]["spine"]
    assert run_input["fails_if"] == fixture["brief"]["fails_if"]
    assert run_input["form_id"] == "analysis"
    assert run_input["scope_mode"] == "single_subject"
    assert run_input["requirement_ids"] == ["r1", "r2", "r3"]
    assert run_input["precedence"][0] == "verified evidence"
    assert run_input["precedence"][-1] == "house style"


def test_run_input_records_the_evidence_receipt_and_resolved_profiles():
    run_input = _intake(_ready_payload())["run_input"]

    receipt = run_input["evidence_receipt"]
    assert receipt["requirement_status"] == {
        "r1": "supported",
        "r2": "supported",
        "r3": "supported",
    }
    assert receipt["unresolved_requirement_ids"] == []
    assert run_input["source_ids"] == receipt["source_ids"]
    assert run_input["profiles"]["length_id"] == "medium"
    assert run_input["profiles"]["length_id"] == "medium"
    assert run_input["model_routing"]["writing_model"] == "test-writer"


def test_runtime_request_keeps_the_commission_and_evidence_whole():
    fixture = _fixture()

    runtime = prepare_v3_runtime_request(_request(evidence_package=_ready_evidence()))

    # A commission written before the direction step declared its premise still
    # runs. The empty premise, the empty assumption_ids and the `exact`
    # precision are the defaults filling in, not the runtime losing anything
    # the fixture carried. `exact` is the default on purpose: a plan that never
    # said how precise it needed to be behaves as it always did.
    expected_work_order = deepcopy(fixture["work_order"])
    expected_work_order["premise"] = []
    for requirement in expected_work_order["requirements"]:
        requirement["assumption_ids"] = []
        requirement["precision"] = "exact"
    assert runtime.work_order == expected_work_order
    assert runtime.brief == fixture["brief"]
    source = runtime.evidence["sources"][0]
    original = fixture["evidence_package"]["sources"][0]
    assert source["publisher"] == original["publisher"]
    assert source["published_at"] == original["published_at"]
    assert source["retrieved_at"] == original["retrieved_at"]
    assert source["notes"] == original["notes"]
    assert original["url"].rstrip("/") in source["url"]
    # A v2 field must not reappear under a new name.
    assert "source_material" not in runtime.model_dump()
    assert "article_type_id" not in runtime.model_dump()


def test_intake_rejects_an_unknown_writing_profile_by_name():
    payload = _ready_payload()
    payload["profiles"]["length_id"] = "not-a-length"

    with pytest.raises(RuntimeError, match="length_id"):
        _intake(payload)


def test_the_run_route_reports_an_unknown_writing_profile_as_a_bad_request():
    """The route is where an unresolvable profile becomes a 400 rather than a 500."""
    payload = _ready_payload()
    payload["profiles"]["length_id"] = "not-a-length"

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            prompt2blog_routes.start_pipeline_v3(
                Prompt2BlogV4Request.model_validate(payload),
                BackgroundTasks(),
                None,
            )
        )

    assert excinfo.value.status_code == 400
    assert "length_id" in str(excinfo.value.detail)


def test_intake_rejects_evidence_from_a_different_work_order():
    payload = _payload()
    evidence = deepcopy(payload["evidence_package"])
    evidence["work_order_fingerprint"] = "b" * 64
    payload["evidence_package"] = evidence

    with pytest.raises(ValidationError, match="different work order"):
        _intake(payload)


def test_intake_cannot_be_used_to_change_the_work_order():
    fixture = _fixture()
    payload = _payload()
    # A research response that tries to promote a context-only city has to be
    # refused by the contract, not normalized into an accepted work order.
    work_order = deepcopy(payload["work_order"])
    work_order["scope"]["references"][1]["role"] = "comparator"
    payload["work_order"] = work_order

    with pytest.raises(ValidationError):
        _intake(payload)

    unchanged = _intake(_ready_payload())["run_input"]
    assert (
        unchanged["work_order_fingerprint"]
        == fixture["work_order"]["work_order_fingerprint"]
    )


def test_v3_run_input_does_not_reintroduce_v2_shapes():
    runtime = prepare_v3_runtime_request(_request(evidence_package=_ready_evidence()))

    artifact = v3_run_input_artifact(runtime)

    assert "article_type_id" not in artifact
    assert "guideline" not in artifact
    assert artifact["instruction_meta"]["house_rules_id"] == "house-rules"
    # No headline rules receipt: nothing in the graph writes a headline any
    # more (ADR 0034), and recording which rules governed the run would be a
    # receipt for work that did not happen.
    assert "headline_rules_id" not in artifact["instruction_meta"]
