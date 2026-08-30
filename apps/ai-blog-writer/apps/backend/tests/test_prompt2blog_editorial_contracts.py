from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v3 import (
    EvidencePackage,
    Prompt2BlogCommission,
    Prompt2BlogV3Request,
)
from app.features.prompt2blog.models import Prompt2BlogInputRequest


FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v3.json"
)
FIXTURE_DIR = FIXTURE_PATH.parent


def test_legacy_v2_request_contract_remains_unchanged():
    payload = json.loads((FIXTURE_DIR / "legacy-v2-request.json").read_text())

    request = Prompt2BlogInputRequest.model_validate(payload)

    assert request.model_dump(mode="json") == payload


def test_lima_commission_preserves_primary_subject_and_context_only_cities():
    payload = json.loads(FIXTURE_PATH.read_text())["commission"]

    commission = Prompt2BlogCommission.model_validate(payload)

    assert commission.original_title == (
        "Is Lima still South America's bargain expat capital?"
    )
    assert commission.form_id == "analysis"
    assert commission.primary_subject == "Lima"
    assert commission.scope.mode == "single_subject"
    assert [
        (reference.name, reference.role) for reference in commission.scope.references
    ] == [
        ("Lima", "primary_subject"),
        ("Medellín", "context_only"),
        ("Buenos Aires", "context_only"),
    ]


def test_lima_evidence_keeps_source_metadata_and_requirement_links():
    payload = json.loads(FIXTURE_PATH.read_text())["evidence_package"]

    evidence = EvidencePackage.model_validate(payload)

    assert evidence.sources[0].publisher == (
        "Instituto Nacional de Estadística e Informática"
    )
    assert str(evidence.sources[0].url) == (
        "https://www.inei.gob.pe/example-lima-prices"
    )
    assert evidence.claims[0].source_ids == ["s1"]
    assert evidence.requirements[0].claim_ids == ["c1"]


def test_single_subject_commission_rejects_comparator_role():
    payload = json.loads(FIXTURE_PATH.read_text())["commission"]
    payload["scope"]["references"][1]["role"] = "comparator"

    with pytest.raises(ValidationError, match="cannot contain comparators"):
        Prompt2BlogCommission.model_validate(payload)


def test_commission_rejects_more_than_four_topic_modules():
    payload = json.loads(FIXTURE_PATH.read_text())["commission"]
    payload["topic_module_ids"].append("transportation")

    with pytest.raises(ValidationError, match="at most 4 items"):
        Prompt2BlogCommission.model_validate(payload)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("form_id",), "comparison-article"),
        (("topic_module_ids", 0), "packing"),
        (("audience", "tags", 0), "everyone"),
        (("scope", "references", 1, "role"), "benchmark"),
    ],
)
def test_commission_rejects_unknown_catalog_ids(path, value):
    payload = json.loads(FIXTURE_PATH.read_text())["commission"]
    target = payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    with pytest.raises(ValidationError):
        Prompt2BlogCommission.model_validate(payload)


def test_evidence_rejects_unknown_source_reference():
    payload = json.loads(FIXTURE_PATH.read_text())["evidence_package"]
    payload["claims"][0]["source_ids"] = ["missing-source"]

    with pytest.raises(ValidationError, match="references an unknown source"):
        EvidencePackage.model_validate(payload)


def test_evidence_rejects_inconsistent_claim_requirement_mapping():
    payload = json.loads(FIXTURE_PATH.read_text())["evidence_package"]
    payload["claims"][0]["requirement_ids"] = ["r2"]

    with pytest.raises(ValidationError, match="must agree in both directions"):
        EvidencePackage.model_validate(payload)


def test_unpublished_requirement_must_record_what_was_checked():
    # The gap is the only thing that makes this verdict checkable by a human:
    # which authorities, which documents, which dates.
    payload = json.loads(FIXTURE_PATH.read_text())["evidence_package"]
    payload["requirements"][1] = {
        "requirement_id": "r2",
        "status": "unpublished",
        "claim_ids": [],
        "gap": "",
    }

    with pytest.raises(ValidationError, match="must describe the gap"):
        EvidencePackage.model_validate(payload)


def test_unpublished_requirement_may_cite_the_claims_that_prove_the_absence():
    # "The regulator measures these two steps and no others" is a real claim
    # with a real source, and it is what separates an established absence from
    # a research desk that simply gave up.
    payload = json.loads(FIXTURE_PATH.read_text())["evidence_package"]
    payload["claims"][0]["requirement_ids"] = ["r1", "r2"]
    payload["requirements"][1] = {
        "requirement_id": "r2",
        "status": "unpublished",
        "claim_ids": [payload["claims"][0]["claim_id"]],
        "gap": "Checked the regulator, the operator, and the customs authority.",
    }

    package = EvidencePackage.model_validate(payload)

    assert package.requirements[1].status == "unpublished"


def test_v3_request_requires_matching_fingerprint_and_requirement_set():
    fixture = json.loads(FIXTURE_PATH.read_text())
    payload = {
        "schema_version": 3,
        "commission": fixture["commission"],
        "evidence_package": deepcopy(fixture["evidence_package"]),
        "profiles": {
            "tone_id": "questurian-voice",
            "length_id": "long",
            "brand_voice_id": "questurian-default",
            "creativity_level": "medium",
        },
    }
    payload["evidence_package"]["commission_fingerprint"] = "wrong"

    with pytest.raises(ValidationError, match="fingerprint must match"):
        Prompt2BlogV3Request.model_validate(payload)

    payload["evidence_package"] = deepcopy(fixture["evidence_package"])
    payload["evidence_package"]["requirements"].pop()
    payload["evidence_package"]["gaps"].pop()

    with pytest.raises(ValidationError, match="exactly match commission"):
        Prompt2BlogV3Request.model_validate(payload)


def test_commission_rejects_a_question_resting_on_an_undeclared_premise():
    """A dependency the commission never declared cannot be refuted later.

    The direction step cannot browse, so its assumptions are only checkable if
    they are written down. A requirement pointing at an assumption id nobody
    declared is that link broken at the only place it can still be repaired.
    """
    payload = deepcopy(json.loads(FIXTURE_PATH.read_text())["commission"])
    payload["premise"] = [
        {"assumption_id": "a1", "statement": "Lima publishes current rent data."}
    ]
    payload["requirements"][0]["assumption_ids"] = ["a1", "a4"]

    with pytest.raises(ValidationError) as error:
        Prompt2BlogCommission.model_validate(payload)

    assert "undeclared assumptions: a4" in str(error.value)


def test_commission_rejects_duplicate_premise_ids():
    payload = deepcopy(json.loads(FIXTURE_PATH.read_text())["commission"])
    payload["premise"] = [
        {"assumption_id": "a1", "statement": "The 2026 ranking is published."},
        {"assumption_id": "a1", "statement": "The ceremony has taken place."},
    ]

    with pytest.raises(ValidationError) as error:
        Prompt2BlogCommission.model_validate(payload)

    assert "assumption_id" in str(error.value)


def test_commission_carries_a_declared_premise_through_validation():
    payload = deepcopy(json.loads(FIXTURE_PATH.read_text())["commission"])
    payload["premise"] = [
        {"assumption_id": "a1", "statement": "Lima publishes current rent data."}
    ]
    payload["requirements"][0]["assumption_ids"] = ["a1"]

    commission = Prompt2BlogCommission.model_validate(payload)

    assert commission.premise[0].statement == "Lima publishes current rent data."
    assert commission.requirements[0].assumption_ids == ["a1"]
