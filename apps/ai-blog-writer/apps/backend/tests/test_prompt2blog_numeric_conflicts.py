"""Two figures on one question, and nothing saying they disagree.

Run 849ae5aa asked one question about Lima's rainfall and research answered it
twice: "between 5 and 25 millimeters" at high confidence, "197 millimeters" at
low. Both were attached to `q_rainfall`, `evidence.conflicts` was empty, and
the writer used both in consecutive clauses under a headline saying fog is the
only rain the city gets.

The stored notes for that question carry a section headed "Discrepancies and
Credibility" naming 197 as the outlier. So the gather step found it and the
structure step dropped it.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import EvidencePackage
from app.features.prompt2blog.evidence_conflicts import (
    detect_numeric_disagreements,
    quantities,
    record_detected_conflicts,
)


def _package(claims: list[dict[str, Any]], **overrides: Any) -> EvidencePackage:
    requirement_ids = sorted(
        {
            requirement_id
            for claim in claims
            for requirement_id in claim["requirement_ids"]
        }
    )
    payload: dict[str, Any] = {
        "schema_version": 4,
        "work_order_fingerprint": "fp",
        "sources": [
            {
                "source_id": "s1",
                "title": "Climate summary",
                "publisher": "Weather and Climate",
                "url": "https://example.com/lima",
                "retrieved_at": "2026-09-01",
                "source_type": "reporting",
                "material_type": "web",
                "notes": ["Annual rainfall figures."],
            }
        ],
        "claims": claims,
        "requirements": [
            {
                "requirement_id": requirement_id,
                "status": "supported",
                "claim_ids": [
                    claim["claim_id"]
                    for claim in claims
                    if requirement_id in claim["requirement_ids"]
                ],
            }
            for requirement_id in requirement_ids
        ],
    }
    payload.update(overrides)
    return EvidencePackage.model_validate(payload)


def _claim(claim_id: str, text: str, requirement: str = "q_rainfall") -> dict[str, Any]:
    return {
        "claim_id": claim_id,
        "text": text,
        "source_ids": ["s1"],
        "requirement_ids": [requirement],
        "confidence": "high",
    }


RAINFALL = [
    _claim(
        "c1",
        "The average annual rainfall in Lima typically ranges between 5 and 25 "
        "millimeters.",
    ),
    _claim(
        "c2",
        "Weather and Climate reports Lima's average annual rainfall as 197 "
        "millimeters based on 1990-2020 data.",
    ),
]


# --- the run that produced this -------------------------------------------


def test_the_rainfall_claims_are_seen_to_disagree():
    found = detect_numeric_disagreements(_package(RAINFALL))

    assert len(found) == 1
    assert found[0].requirement_id == "q_rainfall"
    assert set(found[0].claim_ids) == {"c1", "c2"}
    assert found[0].unit == "mm"
    assert found[0].values == (25.0, 197.0)


def test_the_disagreement_is_recorded_as_an_unresolved_conflict():
    package = record_detected_conflicts(_package(RAINFALL))

    assert len(package.conflicts) == 1
    conflict = package.conflicts[0]
    assert sorted(conflict.claim_ids) == ["c1", "c2"]
    assert "25 mm" in conflict.summary and "197 mm" in conflict.summary
    # Unresolved on purpose: nothing here knows which figure is right, and an
    # unresolved conflict is a readiness finding the operator settles at the
    # gate before writing.
    assert conflict.resolution is None


def test_the_year_range_in_the_same_sentence_is_not_a_quantity():
    # "1990-2020 data" is provenance. Reading it as a figure would put every
    # dated claim in conflict with every other one.
    assert 1990.0 not in {
        value for values in quantities(RAINFALL[1]["text"]).values() for value in values
    }


# --- what it must not fire on ---------------------------------------------


def test_two_claims_on_different_questions_are_not_compared():
    claims = [
        _claim("c1", "The district collects 200 litres a day.", "q_yield"),
        _claim("c2", "The museum charges 20 soles.", "q_price"),
    ]

    assert detect_numeric_disagreements(_package(claims)) == []


def test_the_same_figure_written_differently_is_not_a_disagreement():
    claims = [
        _claim("c1", "Over 600 collectors were built in the district."),
        _claim("c2", "The count of collectors reached 600 by 2015."),
    ]

    assert detect_numeric_disagreements(_package(claims)) == []


def test_a_small_difference_is_not_a_disagreement():
    """Rounding, a revised estimate and a figure quoted to another precision
    are all normal. A check that fires on those gets turned off."""
    claims = [
        _claim("c1", "Rainfall is about 7 millimetres a year."),
        _claim("c2", "Rainfall is roughly 5 millimetres a year."),
    ]

    assert detect_numeric_disagreements(_package(claims)) == []


def test_figures_in_different_units_are_not_compared():
    claims = [
        _claim("c1", "The nets stand 900 metres above sea level."),
        _claim("c2", "The nets yield 200 litres a day."),
    ]

    assert detect_numeric_disagreements(_package(claims)) == []


def test_metric_spellings_are_the_same_unit():
    claims = [
        _claim("c1", "Rainfall reaches 25 millimetres."),
        _claim("c2", "Rainfall reaches 197 millimeters."),
    ]

    assert len(detect_numeric_disagreements(_package(claims))) == 1


def test_a_conflict_research_already_recorded_is_not_duplicated():
    package = _package(
        RAINFALL,
        conflicts=[
            {
                "conflict_id": "x1",
                "claim_ids": ["c1", "c2"],
                "summary": "The two rainfall figures disagree.",
                "resolution": "Prefer the 5 to 25 millimetre range.",
            }
        ],
    )

    assert detect_numeric_disagreements(package) == []
    assert len(record_detected_conflicts(package).conflicts) == 1


def test_a_clean_dossier_is_returned_untouched():
    package = _package([_claim("c1", "The nets are maintained by volunteers.")])

    assert record_detected_conflicts(package) is package


# --- the prompt still asks for the half a comparison cannot do -------------


@pytest.mark.parametrize(
    "phrase",
    [
        "A section headed",
        "called an outlier",
        "put that in the conflict\'s `resolution`",
        "inventing a resolution",
    ],
)
def test_the_structure_prompt_names_what_a_conflict_looks_like_in_notes(phrase: str):
    from app.features.prompt2blog.contracts_v4 import (
        Prompt2BlogWorkOrder,
        WorkOrderReference,
        WorkOrderRequirement,
        WorkOrderScope,
    )
    from app.features.prompt2blog.research_v4 import build_structure_prompt

    work_order = Prompt2BlogWorkOrder(
        work_order_fingerprint="wo",
        brief_fingerprint="bf",
        primary_subject="Lima",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Lima", role="primary_subject")],
        ),
        requirements=[
            WorkOrderRequirement(
                requirement_id="q_rainfall",
                question="How much rain?",
                kind="load_bearing",
            )
        ],
    )
    flat = " ".join(build_structure_prompt(work_order, {}).split())

    assert phrase in flat
