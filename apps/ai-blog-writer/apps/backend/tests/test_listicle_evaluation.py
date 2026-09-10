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


# Before anything is bought
#
# The verified plan of 2026-09-09 asks for the harness work to land BEFORE the
# comparison is authorised: a manifest naming the exact prompts and the worst
# number of calls, receipts per request, and a cap that sits at the dispatch.
# A budget agreed against a guess is not a budget agreed against the run.


def test_every_case_states_where_it_searches():
    """Never parsed off the end of the seed. "in Lima" and "in Lima's old
    centre" split differently on " in ", and a place read wrong is every search
    in the case run against the wrong city."""
    from app.features.listicle_pipeline.evaluation import CASES

    for case in CASES:
        assert case.place, case.key
        city = case.place.split(",")[0]
        assert city in case.seed, case.key
    # And the case that proves why it is stated rather than read: the city is
    # in the middle of this seed, and splitting on " in " would search a
    # suitability clause.
    narrow = next(case for case in CASES if case.key == "narrow-hotels")
    assert narrow.seed.split(" in ")[-1] != narrow.place


def _harness():
    import importlib.util
    import sys
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "scripts"
        / "listicle_angle_comparison.py"
    )
    spec = importlib.util.spec_from_file_location("listicle_angle_comparison", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_the_manifest_names_the_worst_case_rather_than_the_angle_count():
    """One invocation is up to three requests. A cap on angles is a cap on the
    wrong thing, and so is a budget."""
    from app.features.listicle_pipeline.evaluation import CASES_BY_KEY
    from app.features.listicle_pipeline.search import SEARCH_ATTEMPTS

    harness = _harness()
    case = CASES_BY_KEY["narrow-hotels"]
    requests = harness._requests_for(case, ["one angle", "another angle"], ["broad", "broad"])
    manifest = harness._manifest(case, requests, max_calls=6)

    assert manifest["provider_calls_at_best"] == 2
    assert manifest["provider_calls_at_worst"] == 2 * SEARCH_ATTEMPTS
    assert manifest["place"] == case.place
    assert manifest["search_prompt_version"]
    assert manifest["pooling_version"]
    # The prompts themselves, so the authorisation is against what will be sent.
    assert all(entry["prompt"] for entry in manifest["angles"])
    assert case.exclusions in manifest["angles"][0]["prompt"] or not case.exclusions


def test_the_cap_stops_the_run_at_the_dispatch():
    harness = _harness()
    dispatcher = harness.Dispatcher(max_calls=0)
    import pytest as _pytest

    with _pytest.raises(harness.BudgetExhausted):
        dispatcher("a prompt")
    assert dispatcher.calls == [], "nothing was sent, so nothing is receipted"


def test_a_request_is_receipted_before_it_is_sent():
    """A request whose answer never arrives may still have been charged for. A
    receipt written only on success omits exactly the calls nobody can account
    for."""
    harness = _harness()
    dispatcher = harness.Dispatcher(max_calls=2)

    import app.shared.model_calls as model_calls

    original = model_calls.grounded_text
    model_calls.grounded_text = lambda *a, **k: (_ for _ in ()).throw(
        TimeoutError("read timed out")
    )
    try:
        try:
            dispatcher("a prompt")
        except TimeoutError:
            pass
    finally:
        model_calls.grounded_text = original

    assert len(dispatcher.calls) == 1
    assert dispatcher.calls[0]["outcome"].startswith("failed")
    assert dispatcher.calls[0]["prompt"] == "a prompt"
