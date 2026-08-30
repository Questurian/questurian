from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    EvidencePackage,
    Prompt2BlogWorkOrder,
)


FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)
FIXTURE_DIR = FIXTURE_PATH.parent


def test_lima_work_order_preserves_primary_subject_and_context_only_cities():
    fixture = json.loads(FIXTURE_PATH.read_text())
    brief = ArticleBrief.model_validate(fixture["brief"])
    work_order = Prompt2BlogWorkOrder.model_validate(fixture["work_order"])

    assert brief.seed == "Is Lima still South America's bargain expat capital?"
    assert brief.form_id == "analysis"
    assert work_order.primary_subject == "Lima"
    assert work_order.scope.mode == "single_subject"
    assert [
        (reference.name, reference.role) for reference in work_order.scope.references
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


def test_single_subject_work_order_rejects_comparator_role():
    payload = json.loads(FIXTURE_PATH.read_text())["work_order"]
    payload["scope"]["references"][1]["role"] = "comparator"

    with pytest.raises(ValidationError, match="cannot contain comparators"):
        Prompt2BlogWorkOrder.model_validate(payload)


def test_brief_rejects_more_than_four_topic_modules():
    payload = json.loads(FIXTURE_PATH.read_text())["brief"]
    payload["topic_module_ids"].append("transportation")

    with pytest.raises(ValidationError, match="at most 4 items"):
        ArticleBrief.model_validate(payload)


@pytest.mark.parametrize(
    ("holder", "path", "value"),
    [
        ("brief", ("form_id",), "comparison-article"),
        ("brief", ("topic_module_ids", 0), "packing"),
        ("brief", ("reader", "tags", 0), "everyone"),
        ("work_order", ("scope", "references", 1, "role"), "benchmark"),
    ],
)
def test_contracts_reject_unknown_catalog_ids(holder, path, value):
    payload = json.loads(FIXTURE_PATH.read_text())[holder]
    target = payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value

    model = ArticleBrief if holder == "brief" else Prompt2BlogWorkOrder
    with pytest.raises(ValidationError):
        model.model_validate(payload)


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


def test_work_order_rejects_a_question_resting_on_an_undeclared_premise():
    """A dependency the work order never declared cannot be refuted later.

    The direction step cannot browse, so its assumptions are only checkable if
    they are written down. A requirement pointing at an assumption id nobody
    declared is that link broken at the only place it can still be repaired.
    """
    payload = deepcopy(json.loads(FIXTURE_PATH.read_text())["work_order"])
    payload["premise"] = [
        {"assumption_id": "a1", "statement": "Lima publishes current rent data."}
    ]
    payload["requirements"][0]["assumption_ids"] = ["a1", "a4"]

    with pytest.raises(ValidationError) as error:
        Prompt2BlogWorkOrder.model_validate(payload)

    assert "undeclared assumptions: a4" in str(error.value)


def test_work_order_rejects_duplicate_premise_ids():
    payload = deepcopy(json.loads(FIXTURE_PATH.read_text())["work_order"])
    payload["premise"] = [
        {"assumption_id": "a1", "statement": "The 2026 ranking is published."},
        {"assumption_id": "a1", "statement": "The ceremony has taken place."},
    ]

    with pytest.raises(ValidationError) as error:
        Prompt2BlogWorkOrder.model_validate(payload)

    assert "assumption_id" in str(error.value)


def test_work_order_carries_a_declared_premise_through_validation():
    payload = deepcopy(json.loads(FIXTURE_PATH.read_text())["work_order"])
    payload["premise"] = [
        {"assumption_id": "a1", "statement": "Lima publishes current rent data."}
    ]
    payload["requirements"][0]["assumption_ids"] = ["a1"]

    work_order = Prompt2BlogWorkOrder.model_validate(payload)

    assert work_order.premise[0].statement == "Lima publishes current rent data."
    assert work_order.requirements[0].assumption_ids == ["a1"]
