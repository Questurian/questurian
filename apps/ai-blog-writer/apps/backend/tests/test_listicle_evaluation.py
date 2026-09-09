"""The evaluation cases, checked as far as they can be checked for nothing.

Half of every case is a property of the catalogue and the order: which shapes a
commission is offered, whether its stated requirements reach every search,
whether an order that cannot fill a list says so. None of that needs a model.

The other half -- whether the angles find better places -- needs real searches
and real money, and the plan is explicit that it must not be bought until
identity handling and result recording are trustworthy. These tests do not
pretend to answer it, and the assertion at the bottom of this file is there so
nobody later reads a green suite as evidence that they did.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline.evaluation import CASES, REPORTED_OUTCOMES, CaseReport
from app.features.listicle_pipeline.search import build_search_prompt, role_allowances
from app.features.listicle_pipeline.shapes import shapes_for, subject_of


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.key)
def test_the_commission_is_filed_under_the_subject_it_belongs_to(case):
    assert subject_of(case.kind) == case.subject


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.key)
def test_the_catalogue_offers_what_this_subject_needs(case):
    offered = {shape.key for shape in shapes_for(case.subject)}
    assert set(case.must_offer) <= offered
    assert not set(case.must_not_offer) & offered


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.key)
def test_every_stated_requirement_reaches_every_search(case):
    """A requirement applies to every place however it was found. It is
    composed into the prompt from the order, so an operator editing an angle
    cannot drop it and one angle cannot be left carrying the commission."""
    for shape in shapes_for(case.subject)[:3]:
        prompt = build_search_prompt(
            f"{case.kind} that are {shape.core}",
            kind=case.kind,
            place="Lima, Peru",
            exclusions=case.exclusions,
            standard=case.standard,
            wanted=8,
            role=shape.role,
        )
        for requirement in case.must_survive:
            assert requirement in prompt


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.key)
def test_every_case_says_what_a_person_has_to_judge(case):
    """Written down before any paid run. Criteria chosen afterwards are
    criteria chosen to flatter whichever result came back."""
    assert case.judged_by


def test_an_order_of_broad_angles_can_reach_a_long_list():
    assert sum(role_allowances(30, ["broad"] * 5)) >= 30


def test_an_order_of_narrow_angles_cannot_and_the_numbers_say_so():
    assert sum(role_allowances(30, ["specific"] * 5)) < 30


def test_an_unreported_outcome_reads_as_unreported_rather_than_as_zero():
    report = CaseReport(case_key="broad-hotels")
    report.outcomes["coverage"] = "22 distinct venues"
    assert "spend" in report.unreported()
    assert len(report.unreported()) == len(REPORTED_OUTCOMES) - 1


def test_no_comparison_has_been_run():
    """The one thing this file must not be mistaken for.

    A green suite says the mechanics behave. It says nothing about whether the
    revised angle strategy finds better places, and the plan's own adoption
    rule requires reviewed cases and a bounded live comparison for that. When
    the first comparison is run, its results go in `docs/audits/` and this test
    is replaced by one that points at them.
    """
    from pathlib import Path

    audits = Path(__file__).resolve().parents[3] / "docs" / "audits"
    existing = list(audits.glob("listicle-angle-comparison-*")) if audits.exists() else []
    assert not existing, (
        "A comparison has been recorded. Replace this test with one that reads "
        "it, rather than leaving a test that asserts nothing was measured."
    )
