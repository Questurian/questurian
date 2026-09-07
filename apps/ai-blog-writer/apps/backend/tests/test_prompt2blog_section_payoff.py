"""Improvement 01: a section has to say what the reader gets out of it.

The outline already carried a `purpose` per section and nothing in the outline
prompt ever said what a purpose was, so it came back as the heading restated --
"covers the transport options" under a heading about transport options. A
section could therefore be planned, written and audited without anybody ever
naming what a reader leaves it with.

What changed is small and in three places: the form declares which *kind* of
payoff its sections owe, the plan has to state one per section, and the audit
checks the draft against those written promises instead of inventing its own.
"""

from __future__ import annotations

from typing import Any, get_args

import pytest

from app.features.prompt2blog.contracts_v4 import ArticleFormId
from app.features.prompt2blog.content.outline_v3 import (
    format_payoff_promises,
    format_v3_outline_for_prompt,
    sanitize_v3_outline,
    validate_v3_outline,
)
from app.features.prompt2blog.editorial_catalog import (
    PAYOFF_NOUNS,
    FormStructurePolicy,
    PayoffMode,
    load_editorial_catalog,
)
from app.features.prompt2blog.quality import _sanitize_quality

WORK_ORDER: dict[str, Any] = {
    "primary_subject": "Lima",
    "scope": {"references": []},
}


def _forms():
    return {form.id: form for form in load_editorial_catalog().forms}


def _plan(*sections: tuple[str, str]) -> dict[str, Any]:
    return sanitize_v3_outline(
        {
            "working_title": "What Lima costs now",
            "sections": [
                {
                    "heading": heading,
                    "reader_payoff": payoff,
                    "claim_ids": [],
                    "target_words": 300,
                }
                for heading, payoff in sections
            ],
        }
    )


def _validate(plan: dict[str, Any]):
    return validate_v3_outline(
        plan,
        work_order=WORK_ORDER,
        claim_ids=set(),
        target_word_count=0,
    )


GOOD_PLAN = (
    ("What Lima costs now", "Whether a monthly budget stretches in Lima today."),
    ("The tradeoffs behind the price", "Which tradeoff to accept for the price."),
    ("How the picture changed", "Whether to move now or wait, given how costs moved."),
)


# ---------------------------------------------------------------------------
# The form decides which kind of payoff, and every form has decided
# ---------------------------------------------------------------------------


def test_every_form_declares_what_its_sections_owe_the_reader():
    forms = _forms()
    assert set(forms) == set(get_args(ArticleFormId))
    for form_id, form in forms.items():
        assert form.structure.payoff in get_args(PayoffMode), form_id


def test_a_form_file_that_omits_the_payoff_fails_the_catalog_load(tmp_path):
    """Loudly, at import, rather than by silently substituting a default.

    The model default exists so a run frozen before this shipped still
    validates and resumes. A *form* acquiring a payoff kind it never chose is
    a different thing, and the two must not share one lenience.
    """
    from app.features.prompt2blog.editorial_catalog import _structure_policy

    metadata = {"opening": "form-led", "sections": "3-12", "closing": "form-led"}
    with pytest.raises(KeyError):
        _structure_policy(metadata, tmp_path / "made-up-form.md")


def test_advice_is_not_forced_on_a_form_that_does_not_give_it():
    """The report is explicit that this must not turn every form into advice.

    A profile whose every section ends in a recommendation is a worse profile.
    So the narrative forms ask for an insight and say so, and the planning rule
    they receive says in as many words not to recommend anything.
    """
    forms = _forms()
    assert forms["feature-profile"].structure.payoff == "insight"
    assert forms["personal-essay-travelogue"].structure.payoff == "insight"
    assert forms["service-guide"].structure.payoff == "decision"
    assert forms["interview-qa"].structure.payoff == "answer"

    profile_rule = forms["feature-profile"].structure.outline_payoff_rule()
    assert "Not a recommendation" in profile_rule
    assert "decision" not in profile_rule


def test_the_planner_and_the_writer_are_told_the_same_thing():
    """One rule, one owner. The #547 lesson, applied to a new rule.

    Both stages read the noun off the same table, so the plan cannot be asked
    for a decision while the prose is asked to deliver an insight.
    """
    for mode in get_args(PayoffMode):
        policy = FormStructurePolicy(
            opening="form-led",
            closing="form-led",
            min_sections=2,
            max_sections=8,
            payoff=mode,
        )
        assert PAYOFF_NOUNS[mode] in policy.compose_payoff_rule()
        assert policy.outline_payoff_rule() in policy.outline_rules()
        assert policy.compose_payoff_rule() in policy.compose_rules()


# ---------------------------------------------------------------------------
# The plan has to state one, and they have to differ
# ---------------------------------------------------------------------------


def test_a_plan_that_names_a_payoff_per_section_is_accepted():
    accepted, checks = _validate(_plan(*GOOD_PLAN))
    assert accepted is True
    assert checks["payoffs_stated"] is True
    assert checks["payoffs_distinct"] is True
    assert checks["missing_payoffs"] == []


def test_a_section_with_no_payoff_is_named_and_the_plan_refused():
    plan = _plan(*GOOD_PLAN)
    plan["sections"][1]["reader_payoff"] = ""
    accepted, checks = _validate(plan)

    assert accepted is False
    assert checks["payoffs_stated"] is False
    # Named, so an operator reading the run record knows which section, and so
    # a later stage can say something more useful than "the plan was rejected".
    assert checks["missing_payoffs"] == ["The tradeoffs behind the price"]


def test_a_missing_payoff_stays_missing_rather_than_filling_itself_in():
    """The old field defaulted to the sentence "Purpose not stated."

    Which is a sentence, so every check downstream saw a section that had
    stated its purpose. A missing payoff can only be caught if it still looks
    missing after sanitizing.
    """
    plan = sanitize_v3_outline(
        {"working_title": "T", "sections": [{"heading": "One", "claim_ids": []}]}
    )
    assert plan["sections"][0]["reader_payoff"] == ""


def test_two_sections_promising_the_same_thing_are_one_section():
    plan = _plan(
        ("What Lima costs now", "Whether a monthly budget stretches in Lima today."),
        ("The tradeoffs", "Which tradeoff to accept for the price."),
        ("How the picture changed", "Whether a monthly budget stretches in Lima today."),
    )
    accepted, checks = _validate(plan)

    assert accepted is False
    assert checks["payoffs_distinct"] is False
    assert checks["duplicate_payoffs"]


def test_wording_a_promise_differently_does_not_make_it_a_different_promise():
    """Compared on content words, not on the sentence.

    Otherwise the rule is satisfied by rephrasing, which is the failure the
    duplicate check exists to catch dressed up.
    """
    plan = _plan(
        ("Costs", "Whether a monthly budget stretches in Lima today."),
        ("Prices", "Whether, today, a monthly budget stretches in Lima."),
        ("Change", "Whether to move now or wait, given how costs moved."),
    )
    _accepted, checks = _validate(plan)
    assert checks["payoffs_distinct"] is False


def test_a_payoff_that_only_restates_its_heading_is_reported_not_enforced():
    """The same treatment `crowded_sections` gets, for the same reason.

    Whether a sentence adds anything to its heading is a judgement, and a plan
    thrown away over one line would cost the article its whole structure to fix
    a sentence.
    """
    plan = _plan(
        ("Transport options", "Covers the transport options."),
        ("The tradeoffs behind the price", "Which tradeoff to accept for the price."),
        ("How the picture changed", "Whether to move now or wait as costs moved."),
    )
    accepted, checks = _validate(plan)

    assert accepted is True
    assert checks["restated_payoffs"] == ["Transport options"]


def test_a_real_promise_that_reuses_the_headings_words_is_not_a_restatement():
    plan = _plan(
        (
            "Airport transfers",
            "Which airport transfer to book before a 6am flight, and what it costs.",
        ),
        ("The tradeoffs behind the price", "Which tradeoff to accept for the price."),
        ("How the picture changed", "Whether to move now or wait as costs moved."),
    )
    _accepted, checks = _validate(plan)
    assert checks["restated_payoffs"] == []


# ---------------------------------------------------------------------------
# The promise travels to the writer, and then to the auditor
# ---------------------------------------------------------------------------


def test_the_writer_is_told_what_each_section_owes_the_reader():
    rendered = format_v3_outline_for_prompt(_plan(*GOOD_PLAN))
    assert "What the reader gets: Whether a monthly budget stretches" in rendered
    assert "Purpose:" not in rendered


def test_the_auditor_is_handed_the_promises_rather_than_inventing_them():
    promises = format_payoff_promises(_plan(*GOOD_PLAN))
    for heading, payoff in GOOD_PLAN:
        assert f"{heading} -> {payoff}" in promises


def test_a_run_with_no_plan_offers_the_auditor_no_promises_to_check():
    """An honest absence.

    A rejected plan has no promises. Inventing some here would put the auditor
    back to guessing, with the authority of a list that looks recorded.
    """
    assert "No section promises were recorded" in format_payoff_promises(
        {"sections": []}
    )


# ---------------------------------------------------------------------------
# An unresolved promise becomes something repair can act on
# ---------------------------------------------------------------------------


def test_an_unresolved_payoff_survives_the_sanitizer_with_its_reason():
    quality = _sanitize_quality(
        {
            "overall_score": 8,
            "unresolved_payoffs": [
                {
                    "heading": "The tradeoffs behind the price",
                    "why": "Lists three options and never says which suits whom.",
                }
            ],
        }
    )
    assert quality["unresolved_payoffs"] == [
        {
            "heading": "The tradeoffs behind the price",
            "why": "Lists three options and never says which suits whom.",
        }
    ]


@pytest.mark.parametrize(
    "entry",
    [
        {"heading": "", "why": "something is missing"},
        {"heading": "A section", "why": ""},
        {"heading": "A section"},
        "not an object",
    ],
)
def test_an_accusation_nobody_can_act_on_is_dropped(entry):
    """Both halves or neither.

    A heading with no reason is a complaint repair would spend a call failing
    to satisfy, and a reason with no heading cannot be scoped to anything.
    """
    quality = _sanitize_quality(
        {"overall_score": 8, "unresolved_payoffs": [entry]}
    )
    assert quality["unresolved_payoffs"] == []


def test_the_count_of_open_promises_is_recoverable_from_the_audit():
    """The measure improvement 01 asks to track.

    "How many promises did this draft leave open" is not recoverable from a
    flat list of revision sentences, which is why the list survives as its own
    field as well as being folded into the revisions.
    """
    quality = _sanitize_quality(
        {
            "overall_score": 8,
            "unresolved_payoffs": [
                {"heading": "One", "why": "no decision reached"},
                {"heading": "Two", "why": "the question is restated, not answered"},
            ],
        }
    )
    assert len(quality["unresolved_payoffs"]) == 2
