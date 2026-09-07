"""Improvement 04: give every useful detail room to work.

Run 9e66bf84 planned 56 claims into one 200-word section -- three and a half
words per fact, at which density there is no sentence you can write except a
list. `crowded_sections` already measured that and reported it to nobody who
could act on it: the writer was handed a list of claims and a word budget and
left to reconcile two things that do not reconcile.

The report is explicit that this must extend the existing diagnostics rather
than start a second density system, and that density stays advice and never a
maximum -- one complicated fact can need more explaining than five simple ones,
so a count cannot decide anything. What a count *can* do is say which facts are
droppable, which is the part the writer had no way to know.
"""

from __future__ import annotations

from typing import Any

from app.features.prompt2blog.content.outline_v3 import (
    CROWDED_CLAIMS_PER_HUNDRED_WORDS,
    ROOMY_CLAIMS_PER_HUNDRED_WORDS,
    format_v3_outline_for_prompt,
    sanitize_v3_outline,
    validate_v3_outline,
)

WORK_ORDER: dict[str, Any] = {"primary_subject": "", "scope": {"references": []}}

ROLES = {
    "c1": "backbone",
    "c2": "practical",
    "c3": "texture",
    "c4": "texture",
    "c5": "texture",
    "c6": "backbone",
    "c7": "practical",
    "c8": "texture",
    "c9": "practical",
}


def _plan(*sections: tuple[str, list[str], int]) -> dict[str, Any]:
    return sanitize_v3_outline(
        {
            "working_title": "What Lima costs now",
            "sections": [
                {
                    "heading": heading,
                    "reader_payoff": f"What to do about {heading.lower()}.",
                    "claim_ids": claim_ids,
                    "target_words": words,
                }
                for heading, claim_ids, words in sections
            ],
        }
    )


def _validate(plan: dict[str, Any], *, roles: dict[str, str] | None = ROLES):
    # `min_sections=1` so these read as tests about density rather than about
    # section counts, which the form policy owns and its own tests cover.
    return validate_v3_outline(
        plan,
        work_order=WORK_ORDER,
        claim_ids=set(ROLES),
        target_word_count=0,
        min_sections=1,
        fact_roles=roles,
    )


CROWDED = ("Where to eat", ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"], 140)
ROOMY = ("What it costs", ["c9"], 300)


# ---------------------------------------------------------------------------
# The count is not new. What it can now say is.
# ---------------------------------------------------------------------------


def test_a_crowded_section_names_the_facts_that_could_go():
    _accepted, checks = _validate(_plan(CROWDED, ROOMY))
    crowded = checks["crowded_sections"]

    assert len(crowded) == 1
    assert crowded[0]["heading"] == "Where to eat"
    assert crowded[0]["claims"] == 8
    # The half that makes the number actionable. Eight facts in 140 words is a
    # different problem when four of them are colour.
    assert crowded[0]["spare_claims"] == ["c3", "c4", "c5", "c8"]


def test_a_crowded_section_of_load_bearing_facts_has_nothing_spare():
    """Over-planned, not over-written.

    A section carrying eight facts none of which is droppable needs a different
    plan, not a lighter hand, and the diagnostics must not suggest otherwise by
    offering a cut that does not exist.
    """
    _accepted, checks = _validate(
        _plan(CROWDED, ROOMY),
        roles={claim_id: "backbone" for claim_id in ROLES},
    )
    assert checks["crowded_sections"][0]["spare_claims"] == []


def test_density_is_still_never_enforced():
    """The rule this extends, unchanged.

    A plan rejected for density would be a plan thrown away over an estimate,
    and how many facts a paragraph carries depends on what they are.
    """
    accepted, checks = _validate(_plan(CROWDED, ROOMY))
    assert accepted is True
    assert checks["crowded_sections"]


def test_a_selection_with_no_roles_still_counts_the_crowding():
    """Runs whose selection predates roles keep the reporting they had.

    It simply has nothing to call droppable, which is the honest answer rather
    than a guess at which facts were colour.
    """
    _accepted, checks = _validate(_plan(CROWDED, ROOMY), roles=None)
    assert checks["crowded_sections"][0]["claims"] == 8
    assert checks["crowded_sections"][0]["spare_claims"] == []


# ---------------------------------------------------------------------------
# Repeated and unplaced facts
# ---------------------------------------------------------------------------


def test_a_fact_planned_into_two_sections_is_reported():
    _accepted, checks = _validate(
        _plan(("Where to eat", ["c1", "c2"], 300), ("What it costs", ["c1"], 300))
    )
    assert checks["repeated_claims"] == [
        {"claim_id": "c1", "headings": ["Where to eat", "What it costs"]}
    ]


def test_repeating_a_fact_does_not_fail_the_plan():
    """A price can legitimately be recalled where it matters again.

    This is the cheapest repetition there is and it was invisible; making it
    visible is the whole change. Making it fatal would be a different and worse
    one.
    """
    accepted, _checks = _validate(
        _plan(("Where to eat", ["c1", "c2"], 300), ("What it costs", ["c1"], 300))
    )
    assert accepted is True


def test_facts_chosen_and_never_placed_are_named():
    """The distance between what an operator picked and what the plan uses.

    Never a failure: "leave out what the piece is better without" is what the
    outline prompt asks for. It is reported so that gap stops being invisible.
    """
    accepted, checks = _validate(_plan(("Where to eat", ["c1", "c2"], 300), ROOMY))
    assert accepted is True
    assert checks["unplaced_claims"] == ["c3", "c4", "c5", "c6", "c7", "c8"]


# ---------------------------------------------------------------------------
# What the writer is actually told
# ---------------------------------------------------------------------------


def test_the_writer_is_told_a_crowded_section_is_a_list():
    rendered = format_v3_outline_for_prompt(
        _plan(CROWDED, ROOMY), fact_roles=ROLES
    )
    assert "8 facts in ~140 words is a list, not a section" in rendered
    assert "Colour, droppable: c3, c4, c5, c8." in rendered


def test_the_writer_is_told_where_there_is_room_to_explain():
    rendered = format_v3_outline_for_prompt(
        _plan(CROWDED, ROOMY), fact_roles=ROLES
    )
    assert "room here to say what they mean, not only what they are" in rendered


def test_a_section_with_room_is_not_told_what_it_could_cut():
    """"Nothing here is spare" answers a question nobody asked.

    That line earns its place only where the writer is looking for something to
    drop, which is a crowded section.
    """
    rendered = format_v3_outline_for_prompt(
        _plan(("What it costs", ["c1"], 300)),
        fact_roles={"c1": "backbone"},
    )
    assert "load-bearing" not in rendered


def test_a_crowded_section_with_nothing_spare_says_where_the_room_comes_from():
    rendered = format_v3_outline_for_prompt(
        _plan(CROWDED),
        fact_roles={claim_id: "backbone" for claim_id in ROLES},
    )
    assert "the room has to come from the prose" in rendered


def test_the_writer_is_told_which_fact_is_planned_twice():
    rendered = format_v3_outline_for_prompt(
        _plan(("Where to eat", ["c1", "c2"], 300), ("What it costs", ["c1"], 300)),
        fact_roles=ROLES,
    )
    assert "The same fact is planned into more than one section" in rendered
    assert "- c1: Where to eat / What it costs" in rendered


def test_a_plan_with_no_repetition_says_nothing_about_repetition():
    rendered = format_v3_outline_for_prompt(
        _plan(("Where to eat", ["c1"], 300), ("What it costs", ["c2"], 300)),
        fact_roles=ROLES,
    )
    assert "planned into more than one section" not in rendered


def test_a_section_with_no_budget_gets_no_advice_rather_than_a_wrong_number():
    """Dividing by a budget nobody set would invent a density."""
    rendered = format_v3_outline_for_prompt(
        _plan(("Where to eat", ["c1", "c2"], 0)), fact_roles=ROLES
    )
    assert "Room to work" not in rendered


def test_the_run_record_and_the_writer_agree_about_what_is_doubled():
    """One helper, two readers.

    The diagnostics and the section brief compute this from the same function,
    so an operator reading the run record and the writer reading its plan can
    never be looking at different lists.
    """
    plan = _plan(("Where to eat", ["c1", "c2"], 300), ("What it costs", ["c1"], 300))
    _accepted, checks = _validate(plan)
    rendered = format_v3_outline_for_prompt(plan, fact_roles=ROLES)
    for repeated in checks["repeated_claims"]:
        assert f"- {repeated['claim_id']}: " in rendered


def test_the_two_thresholds_leave_an_ordinary_middle():
    """Between them nothing needs saying either way.

    A plan is not improved by being told that four facts in two hundred words
    is four facts in two hundred words.
    """
    assert ROOMY_CLAIMS_PER_HUNDRED_WORDS < CROWDED_CLAIMS_PER_HUNDRED_WORDS
    rendered = format_v3_outline_for_prompt(
        _plan(("Where to eat", ["c1", "c2", "c3", "c4", "c5", "c6"], 200)),
        fact_roles=ROLES,
    )
    assert "Room to work: 6 facts in ~200 words." in rendered
    assert "is a list, not a section" not in rendered
    assert "room here to say what they mean" not in rendered


# ---------------------------------------------------------------------------
# The stage is what connects the packet's roles to both readers
# ---------------------------------------------------------------------------


def test_the_stage_reads_the_roles_off_the_packet():
    """Neither the diagnostics nor the writer's brief can label a fact alone.

    `texture` is a decision the selection recorded, and the outline stage is
    the only place that has both the packet and the plan. If it stopped passing
    the roles through, everything above would keep working and quietly stop
    saying anything droppable.
    """
    from tests.test_prompt2blog_v3_writing_stages import (  # noqa: PLC0415
        FakeLLM,
        _dependencies,
        _outline_payload,
        _state,
    )
    from app.features.prompt2blog.stages.v3.outline import run_v3_outline_stage

    payload = _outline_payload()
    facts = [
        {"claim_id": "c1", "role": "backbone"},
        {"claim_id": "c2", "role": "texture"},
        {"claim_id": "c3", "role": "texture"},
    ]
    # A three-section plan whose first section carries everything, in too few
    # words to explain any of it.
    payload["sections"][0]["claim_ids"] = ["c1", "c2", "c3"]
    payload["sections"][0]["target_words"] = 60
    payload["sections"][1]["claim_ids"] = ["c1"]
    payload["sections"][1]["target_words"] = 420
    payload["sections"][2]["claim_ids"] = []
    payload["sections"][2]["target_words"] = 420
    dependencies, recorder = _dependencies(FakeLLM(json_response=payload))

    updates = run_v3_outline_stage(
        _state(packet={"facts": facts}), dependencies
    )

    crowded = recorder.recorded[0][1]["checks"]["crowded_sections"]
    assert crowded[0]["spare_claims"] == ["c2", "c3"]
    assert "Colour, droppable: c2, c3." in updates["outline_text"]
