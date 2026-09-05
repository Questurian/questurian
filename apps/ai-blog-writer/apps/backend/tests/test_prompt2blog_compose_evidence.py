"""Compose gets the dossier without the bibliography it may not quote (#516).

`records_text` is built once and read by compose, by groundedness and by the
readiness follow-up. Compose is told "Attribution is internal to these records.
Never carry it into the prose" and was then handed 12,299 characters of
per-claim source lists and 12,564 characters of grounding-redirect URLs.
Groundedness exists to check claims against exactly that provenance.

So this is two projections of one dossier. These tests are the five cases the
audit named, because each is a real thing from run 95a74dce that a careless cut
would have destroyed.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.features.prompt2blog.contracts_v4 import Prompt2BlogV4Request
from app.features.prompt2blog.evidence_v3 import normalize_evidence

FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)


def _evidence(**package_overrides):
    fixture = json.loads(FIXTURE_PATH.read_text())
    package = json.loads(json.dumps(fixture["evidence_package"]))
    package.update(package_overrides)
    request = Prompt2BlogV4Request.model_validate(
        {
            "schema_version": 4,
            "brief": fixture["brief"],
            "work_order": fixture["work_order"],
            "evidence_package": package,
            "profiles": {"length_id": "standard", "creativity_level": "medium"},
        }
    )
    return normalize_evidence(request.work_order, request.evidence_package)


def test_every_claim_survives_word_for_word():
    evidence = _evidence()

    for claim in evidence.claims:
        assert claim.text in evidence.compose_records_text
        assert claim.confidence in evidence.compose_records_text


def test_coverage_premises_conflicts_and_gaps_are_byte_identical():
    """The two projections must not drift on the parts they share."""
    evidence = _evidence()
    heading = "REQUIREMENT COVERAGE"

    assert (
        evidence.compose_records_text.split(heading, 1)[1]
        == evidence.records_text.split(heading, 1)[1]
    )


def test_the_bibliography_compose_may_not_quote_is_gone():
    evidence = _evidence()

    assert "http" not in evidence.compose_records_text
    assert "No note recorded for this source." not in evidence.compose_records_text
    # And it is still there for the stage that verifies against it.
    assert "http" in evidence.records_text


def test_a_source_note_that_changes_how_a_fact_reads_is_kept():
    """An operator settlement is the only thing saying which figure to use.

    On run 95a74dce a source note carried the operator's own distance
    settlement. A cut that removed it would leave two conflicting distances and
    no instruction.
    """
    fixture = json.loads(FIXTURE_PATH.read_text())
    package = json.loads(json.dumps(fixture["evidence_package"]))
    settlement = "Use 6.2 miles. The 10 km figure measures a different path."
    package["sources"][0]["notes"] = [settlement]

    evidence = _evidence(sources=package["sources"])

    assert settlement in evidence.compose_records_text
    # And the claims resting on it can still find it.
    kept_id = evidence.sources[0].source_id
    assert f"source notes: {kept_id}" in evidence.compose_records_text


def test_a_source_carrying_only_a_placeholder_is_dropped_but_its_claims_stay():
    fixture = json.loads(FIXTURE_PATH.read_text())
    package = json.loads(json.dumps(fixture["evidence_package"]))
    package["sources"][0]["notes"] = ["No note recorded for this source."]

    evidence = _evidence(sources=package["sources"])
    text = evidence.compose_records_text

    assert "SOURCE NOTES" in text
    assert "None. No source carried a caveat" in text
    for claim in evidence.claims:
        assert claim.text in text


def test_an_unresolved_conflict_is_never_silently_settled_or_dropped():
    fixture = json.loads(FIXTURE_PATH.read_text())
    package = json.loads(json.dumps(fixture["evidence_package"]))
    # A conflict is between claims, so the contract requires at least two --
    # and claim/requirement mappings must agree in both directions.
    second = dict(package["claims"][0], claim_id="c2")
    package["claims"].append(second)
    for requirement in package["requirements"]:
        if requirement["requirement_id"] in second["requirement_ids"]:
            requirement["claim_ids"] = sorted({*requirement["claim_ids"], "c2"})
    package["conflicts"] = [
        {
            "conflict_id": "k1",
            "summary": "Two sources give different distances.",
            "claim_ids": ["c1", "c2"],
            "resolution": "",
        }
    ]

    text = _evidence(
        claims=package["claims"],
        requirements=package["requirements"],
        conflicts=package["conflicts"],
    ).compose_records_text

    assert "Two sources give different distances." in text
    assert "resolution: unresolved" in text


def test_an_unsupported_requirement_keeps_its_status_and_gap():
    evidence = _evidence()
    text = evidence.compose_records_text

    for requirement in evidence.requirements:
        assert requirement.requirement_id in text
        if requirement.gap:
            assert requirement.gap in text
