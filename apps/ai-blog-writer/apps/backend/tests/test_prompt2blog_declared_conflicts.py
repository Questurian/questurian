"""A disagreement research described in words and did not file.

Run b29d66b4 wrote "only conflicting general closing-hour listings (10am-5pm
daily vs 9am-5:30/6:30pm)" into Q7's gap and recorded `conflicts: []`. Run
849ae5aa did the same thing with a notes section headed "Discrepancies and
Credibility".

The numeric comparison that used to be tested here is gone. It fired forty
five times across the six stored dossiers and three or four were real; the
module docstring records what was tried and why it could not be narrowed.
"""

from __future__ import annotations

from typing import Any

from app.features.prompt2blog.contracts_v4 import EvidencePackage
from app.features.prompt2blog.evidence_conflicts import (
    detect_declared_disagreements,
    record_detected_conflicts,
)


def _claim(claim_id: str, text: str, requirement: str = "Q7") -> dict[str, Any]:
    return {
        "claim_id": claim_id,
        "text": text,
        "source_ids": ["s1"],
        "requirement_ids": [requirement],
        "confidence": "medium",
    }


HOURS = [
    _claim(
        "C12a",
        "One set of published hours for Bam Bam states Monday to Sunday, "
        "10:00 AM to 5:00 PM daily.",
    ),
    _claim(
        "C12b",
        "Another set of published hours states 9:00 AM to 5:30 PM on weekdays "
        "and 9:00 AM to 6:30 PM at weekends.",
    ),
    _claim(
        "C13",
        "No exact sell-out time is published; popular stalls close once the "
        "morning fish is gone.",
    ),
]

GAP = (
    "No exact sell-out/close time is published; only conflicting general "
    "closing-hour listings were found."
)


def _package(claims: list[dict[str, Any]], gap: str = GAP, **overrides: Any):
    requirement_ids = sorted(
        {rid for claim in claims for rid in claim["requirement_ids"]}
    )
    payload: dict[str, Any] = {
        "schema_version": 4,
        "work_order_fingerprint": "fp",
        "sources": [
            {
                "source_id": "s1",
                "title": "Listings",
                "publisher": "Rappi",
                "url": "https://example.com/hours",
                "retrieved_at": "2026-09-02",
                "source_type": "reporting",
                "material_type": "web",
                "notes": ["Opening hours."],
            }
        ],
        "claims": claims,
        "requirements": [
            {
                "requirement_id": rid,
                "status": "partial",
                "cause": "question_too_precise",
                "gap": gap,
                "claim_ids": [
                    claim["claim_id"]
                    for claim in claims
                    if rid in claim["requirement_ids"]
                ],
            }
            for rid in requirement_ids
        ],
    }
    payload.update(overrides)
    return EvidencePackage.model_validate(payload)


# --- the run that produced this -------------------------------------------


def test_a_gap_that_says_conflicting_is_a_conflict():
    found = detect_declared_disagreements(_package(HOURS))

    assert len(found) == 1
    assert found[0].requirement_id == "Q7"
    assert found[0].word == "conflicting"


def test_only_the_claims_carrying_figures_are_named():
    """C13 says no time is published at all. It is not a party to the
    disagreement and naming it would make the conflict harder to read."""
    found = detect_declared_disagreements(_package(HOURS))

    assert found[0].claim_ids == ("C12a", "C12b")


def test_the_conflict_is_filed_unresolved_and_quotes_the_gap():
    package = record_detected_conflicts(_package(HOURS))

    assert len(package.conflicts) == 1
    conflict = package.conflicts[0]
    assert conflict.resolution is None
    assert "conflicting general closing-hour listings" in conflict.summary


# --- what it must not fire on ---------------------------------------------


def test_a_distinction_is_not_a_disagreement():
    """"differ" fired three times across the stored dossiers and two were
    wrong: "a different vendor" and "prices for different dishes". It is
    deliberately not a trigger word."""
    gap = (
        "Available prices found are for different dishes at different "
        "candidate stalls."
    )

    assert detect_declared_disagreements(_package(HOURS, gap=gap)) == []


def test_a_requirement_with_no_gap_is_left_alone():
    package = _package(
        HOURS,
        requirements=[
            {
                "requirement_id": "Q7",
                "status": "supported",
                "claim_ids": ["C12a", "C12b", "C13"],
            }
        ],
    )

    assert detect_declared_disagreements(package) == []


def test_one_figure_bearing_claim_is_not_a_pair():
    claims = [
        _claim("C1", "One listing gives 10:00 AM to 5:00 PM."),
        _claim("C2", "No other hours are published anywhere."),
    ]
    found = detect_declared_disagreements(_package(claims))

    # Falls back to naming both, because a conflict needs two claim ids and
    # these are the only two on the question.
    assert found[0].claim_ids == ("C1", "C2")


def test_a_conflict_research_already_filed_is_not_duplicated():
    package = _package(
        HOURS,
        conflicts=[
            {
                "conflict_id": "x1",
                "claim_ids": ["C12a", "C12b"],
                "summary": "The two sets of hours disagree.",
                "resolution": "Use the earlier opening.",
            }
        ],
    )

    assert detect_declared_disagreements(package) == []
    assert record_detected_conflicts(package) is package


def test_a_clean_dossier_is_returned_untouched():
    package = _package(HOURS, gap="No sell-out time is published anywhere.")

    assert record_detected_conflicts(package) is package
