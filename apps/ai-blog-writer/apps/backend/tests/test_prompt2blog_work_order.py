"""The research plan, and the cut the operator gets to make.

v3 offered three direction cards, which is a menu after you have already
ordered. This replaces it with a decision that changes cost, focus and length:
the questions in plain English, strike two, add one.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefMaterial,
    BriefReader,
)
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.work_order_v4 import (
    build_work_order,
    build_work_order_prompt,
    bundled_question_note,
    cut_work_order,
    work_order_stage_record,
)


class FakeLLM:
    def __init__(self, response: dict[str, Any]):
        self.response = response
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.response, "{}"


def _brief(**overrides) -> ArticleBrief:
    payload: dict[str, Any] = dict(
        brief_fingerprint="bf-1",
        seed="Lima is no longer simply the stopover before Machu Picchu",
        location="Lima, Peru",
        form_id="destination-guide",
        topic_module_ids=["food-drink"],
        reader=BriefReader(primary_reader="layover traveller", tags=["first-time-visitor"]),
        reader_question="Is Lima worth two extra nights?",
        outcome="book two extra nights on a layover",
        spine="food, with a cheap-beats-famous argument",
        must_name=["Surquillo market"],
        material=[BriefMaterial(kind="firsthand", statement="mostly ate, four days")],
        fails_if="reads like a tourist board",
    )
    payload.update(overrides)
    return ArticleBrief(**payload)


def _payload(**overrides) -> dict[str, Any]:
    payload = {
        "primary_subject": "Lima",
        "scope_mode": "single_subject",
        "references": [{"name": "Lima", "role": "primary_subject"}],
        "premise": [
            {"assumption_id": "a1", "statement": "Market stall prices are published."}
        ],
        "requirements": [
            {
                "requirement_id": "r1",
                "question": "What do Surquillo market stalls charge for ceviche?",
                "kind": "load_bearing",
                "assumption_ids": ["a1"],
            },
            {
                "requirement_id": "r2",
                "question": "What do the tasting menus charge?",
                "kind": "load_bearing",
            },
            {
                "requirement_id": "r3",
                "question": "What is Huaca Pucllana like after dark?",
                "kind": "texture",
            },
        ],
    }
    payload.update(overrides)
    return payload


def _deps(payload: dict[str, Any]) -> GrillDependencies:
    return GrillDependencies(llm=FakeLLM(payload), research=lambda _s: ("", [], None))


# --- the shape the model actually sent (run 90b3f9bc, 2026-08-30 20:52Z) ---


# What came back: `questions` instead of `requirements`, `premises` instead of
# `premise`, `id`/`description` instead of `assumption_id`/`statement`,
# `premise_ids` instead of `assumption_ids`, no requirement ids at all, and no
# `primary_subject` or `scope_mode` field. Eight specific, checkable questions
# and five sound premises -- all discarded because the lists had other names.
AS_THE_MODEL_SENT_IT: dict[str, Any] = {
    "references": [
        {"name": "Lima", "role": "primary_subject"},
        {"name": "Cusco", "role": "comparator"},
        {"name": "Machu Picchu", "role": "context_only"},
    ],
    "premises": [
        {
            "id": "p1",
            "description": "Lima has globally ranked restaurants needing advance booking.",
        },
        {
            "id": "p2",
            "description": "Lima's sea-level elevation helps before Cusco's altitude.",
        },
    ],
    "questions": [
        {
            "question": "Which three Lima restaurants appear in the World's 50 Best 2024, and how far ahead do bookings open?",
            "kind": "load_bearing",
            "premise_ids": ["p1"],
        },
        {
            "question": "What is the elevation difference between Lima and Cusco, and the recommended acclimatisation time?",
            "kind": "load_bearing",
            "premise_ids": ["p2"],
        },
        {
            "question": "What is the vine-covered restaurant in the Museo Larco gardens called?",
            "kind": "texture",
        },
    ],
}


def test_the_plan_survives_the_model_naming_the_fields_its_own_way():
    order = build_work_order(_brief(), _deps(AS_THE_MODEL_SENT_IT))

    assert len(order.requirements) == 3
    assert [item.requirement_id for item in order.requirements] == ["r1", "r2", "r3"]
    assert order.requirements[0].assumption_ids == ["p1"]
    assert [item.kind for item in order.requirements] == [
        "load_bearing",
        "load_bearing",
        "texture",
    ]


def test_a_question_sent_under_query_is_still_a_question():
    """Run b78a9fe8 (2026-09-01): `questions` carrying `query` and `premises`.
    Six checkable questions, all dropped, and the operator was told the plan
    came back with none -- which was a synonym, not a bad plan.
    """
    order = build_work_order(
        _brief(),
        _deps(
            {
                "primary_subject": "Lima",
                "references": [{"name": "Lima", "role": "primary_subject"}],
                "premises": [
                    {"id": "premise_1", "description": "Lima's huarique culture stands apart."}
                ],
                "questions": [
                    {
                        "query": "What does an anticuchos platter cost at Tia Grimanesa, and as of when?",
                        "kind": "load_bearing",
                        "premises": ["premise_1"],
                    }
                ],
            }
        ),
    )

    assert [item.question for item in order.requirements] == [
        "What does an anticuchos platter cost at Tia Grimanesa, and as of when?"
    ]
    assert order.requirements[0].assumption_ids == ["premise_1"]


def test_premises_survive_their_own_renaming_too():
    order = build_work_order(_brief(), _deps(AS_THE_MODEL_SENT_IT))

    assert {item.assumption_id for item in order.premise} == {"p1", "p2"}
    assert order.premise[0].statement.startswith("Lima has globally ranked")


def test_the_subject_is_taken_from_the_reference_when_no_field_names_it():
    order = build_work_order(_brief(), _deps(AS_THE_MODEL_SENT_IT))

    assert order.primary_subject == "Lima"
    assert order.scope.mode == "head_to_head", "one comparator was listed"


def test_a_premise_nothing_rests_on_is_dropped():
    payload = {
        **AS_THE_MODEL_SENT_IT,
        "premises": [
            *AS_THE_MODEL_SENT_IT["premises"],
            {"id": "p9", "description": "Nothing asks about this."},
        ],
    }

    order = build_work_order(_brief(), _deps(payload))

    assert "p9" not in {item.assumption_id for item in order.premise}


def test_a_question_pointing_at_an_undeclared_premise_keeps_the_question():
    payload = {
        **AS_THE_MODEL_SENT_IT,
        "questions": [
            {
                "question": "What does a Barranco pisco sour cost?",
                "kind": "load_bearing",
                "premise_ids": ["p404"],
            }
        ],
    }

    order = build_work_order(_brief(), _deps(payload))

    assert len(order.requirements) == 1
    assert order.requirements[0].assumption_ids == []


# --- the scope repair (run 90b3f9bc, 2026-08-30) ---------------------------


def test_an_empty_reference_list_is_repaired_from_the_named_subject():
    """This reached the operator as "List should have at least 1 item after
    validation, not 0", mid-flow, after the grill and brief were both paid for.

    The subject was never in doubt -- it was sitting in `primary_subject`.
    """
    order = build_work_order(_brief(), _deps(_payload(references=[])))

    assert [(r.name, r.role) for r in order.scope.references] == [
        ("Lima", "primary_subject")
    ]
    assert order.scope.mode == "single_subject"


def test_references_with_no_primary_gain_one():
    order = build_work_order(
        _brief(),
        _deps(_payload(references=[{"name": "Cusco", "role": "context_only"}])),
    )

    primaries = [r for r in order.scope.references if r.role == "primary_subject"]
    assert [r.name for r in primaries] == ["Lima"]


def test_a_named_subject_already_listed_is_promoted_rather_than_duplicated():
    order = build_work_order(
        _brief(),
        _deps(_payload(references=[{"name": "Lima", "role": "context_only"}])),
    )

    assert [(r.name, r.role) for r in order.scope.references] == [
        ("Lima", "primary_subject")
    ]


def test_a_second_primary_subject_is_dropped_rather_than_fatal():
    order = build_work_order(
        _brief(),
        _deps(
            _payload(
                references=[
                    {"name": "Lima", "role": "primary_subject"},
                    {"name": "Cusco", "role": "primary_subject"},
                ]
            )
        ),
    )

    assert [(r.name, r.role) for r in order.scope.references] == [
        ("Lima", "primary_subject")
    ]


def test_an_invented_role_is_dropped_and_repeats_collapse():
    order = build_work_order(
        _brief(),
        _deps(
            _payload(
                references=[
                    {"name": "Lima", "role": "primary_subject"},
                    {"name": "Arequipa", "role": "rival"},
                    {"name": "lima", "role": "context_only"},
                ]
            )
        ),
    )

    assert [r.name for r in order.scope.references] == ["Lima"]


def test_the_mode_follows_the_references_that_survived():
    """The references are the substance; the mode is a label describing them.

    A stated mode that contradicts them is a label that is simply wrong, and
    used to be a hard failure at the contract.
    """
    order = build_work_order(
        _brief(),
        _deps(
            _payload(
                scope_mode="single_subject",
                references=[
                    {"name": "Lima", "role": "primary_subject"},
                    {"name": "Cusco", "role": "comparator"},
                ],
            )
        ),
    )

    assert order.scope.mode == "head_to_head"


def test_a_plan_naming_no_subject_at_all_says_so_in_words():
    from app.features.prompt2blog.work_order_v4 import WorkOrderUnusable

    deps = _deps(_payload(primary_subject="", references=[]))

    with pytest.raises(WorkOrderUnusable) as error:
        build_work_order(_brief(), deps)

    assert "named no subject" in error.value.reason
    assert error.value.raw


def test_the_brief_becomes_separately_checkable_questions():
    work_order = build_work_order(_brief(), _deps(_payload()))

    assert work_order.primary_subject == "Lima"
    assert [item.requirement_id for item in work_order.requirements] == ["r1", "r2", "r3"]
    assert work_order.brief_fingerprint == "bf-1"


def test_requirements_declare_what_missing_them_costs():
    work_order = build_work_order(_brief(), _deps(_payload()))

    kinds = {item.requirement_id: item.kind for item in work_order.requirements}
    assert kinds == {"r1": "load_bearing", "r2": "load_bearing", "r3": "texture"}


def test_a_requirement_with_no_kind_is_dropped_rather_than_guessed():
    # Guessing would put a texture question on the blocking path, or a
    # load-bearing one off it. Both are worse than one fewer question.
    payload = _payload()
    payload["requirements"][1].pop("kind")

    work_order = build_work_order(_brief(), _deps(payload))

    assert [item.requirement_id for item in work_order.requirements] == ["r1", "r3"]


def test_the_prompt_asks_for_texture_rather_than_only_proof():
    """The Lima dossier was excellent as verification and contained nothing
    anyone would enjoy. All three questions existed to prove the premise, so
    all three answers proved it."""
    prompt = build_work_order_prompt(_brief())
    flat = " ".join(prompt.split())

    assert "Ask for texture" in flat
    assert "nothing a reader would enjoy is a real gap" in flat


def test_the_prompt_does_not_ask_for_what_the_writer_already_has():
    prompt = build_work_order_prompt(_brief())

    assert "mostly ate, four days" in prompt
    assert "Do not write a question whose answer the writer already has" in " ".join(
        prompt.split()
    )


def test_the_prompt_carries_the_spine_and_the_failure_line():
    prompt = build_work_order_prompt(_brief())

    assert "food, with a cheap-beats-famous argument" in prompt
    assert "reads like a tourist board" in prompt


def test_striking_a_texture_question_says_it_costs_a_detail():
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r3"])

    assert len(outcome.work_order.requirements) == 2
    assert len(outcome.warnings) == 1
    assert "a detail, not an argument" in outcome.warnings[0]


def test_striking_a_load_bearing_question_says_what_the_piece_can_no_longer_claim():
    """Said once, then obeyed.

    The operator should not have to already know which questions are
    load-bearing in order to cut safely, and the system does know.
    """
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r1"])

    assert [item.requirement_id for item in outcome.work_order.requirements] == ["r2", "r3"]
    assert "cannot claim" in outcome.warnings[0]
    assert brief.spine in outcome.warnings[0]


def test_the_cut_obeys_rather_than_refusing():
    # A decision that cannot be wrong is not a decision. This is the whole
    # reason the direction cards were replaced with something real.
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r1", "r3"])

    assert [item.requirement_id for item in outcome.work_order.requirements] == ["r2"]
    assert len(outcome.warnings) == 2


def test_a_cut_that_leaves_nothing_load_bearing_is_refused():
    """All texture is not an article, it is a mood."""
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    with pytest.raises(ValidationError, match="load-bearing"):
        cut_work_order(work_order, brief, struck_ids=["r1", "r2"])


def test_an_added_question_joins_the_plan_as_load_bearing():
    # Nobody adds a question to be decorative.
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(
        work_order,
        brief,
        struck_ids=[],
        added_questions=["How late does the market actually stay open?"],
    )

    added = outcome.work_order.requirements[-1]
    assert added.kind == "load_bearing"
    assert added.question == "How late does the market actually stay open?"


def test_striking_something_that_is_not_there_is_an_error_not_a_silent_no_op():
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    with pytest.raises(ValueError, match="No such requirement"):
        cut_work_order(work_order, brief, struck_ids=["r9"])


def test_a_premise_nothing_rests_on_any_more_is_dropped():
    # Its only question is gone, so it is no longer an assumption this run
    # depends on -- and leaving it would fail the contract's dependency check.
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r1"])

    assert outcome.work_order.premise == []


def test_the_cut_changes_the_fingerprint():
    brief = _brief()
    work_order = build_work_order(brief, _deps(_payload()))

    outcome = cut_work_order(work_order, brief, struck_ids=["r3"])

    assert outcome.work_order.work_order_fingerprint != work_order.work_order_fingerprint
    assert outcome.work_order.brief_fingerprint == brief.brief_fingerprint


def test_the_stage_record_keeps_why_the_plan_is_the_size_it_is():
    brief = _brief()
    outcome = cut_work_order(
        build_work_order(brief, _deps(_payload())), brief, struck_ids=["r3"]
    )

    record = work_order_stage_record(outcome.work_order, outcome.warnings)

    assert record["load_bearing_count"] == 2
    assert record["texture_count"] == 0
    # A thin article later is often explained by a cut made here.
    assert record["cut_warnings"] == outcome.warnings


# --- the headline is a claim the article has to stand behind ---------------


def test_the_research_plan_is_shown_the_headline_it_has_to_support():
    """Nothing told the work order what the article would be published under.

    ADR 0034 made the seed the headline, so whatever it asserts now goes out
    as a claim. Run 062c0b86 (2026-09-01) was titled "Lima Has a Pyramid Older
    Than the Inca Empire" and asked nine research questions, not one of which
    established how old the pyramid is. The article never gave a date. The
    reader who clicked that headline finished the piece without the answer to
    the exact question that made them click.

    Same shape as the failure ADR 0034 removed from the title stage: the seed
    existed on the run the whole time and the stage that needed it was never
    shown it.
    """
    prompt = build_work_order_prompt(_brief())
    flat = " ".join(prompt.split())

    assert "Lima is no longer simply the stopover before Machu Picchu" in flat
    assert "PUBLISHED UNDER" in prompt
    assert "load bearing whether or not the brief mentions it again" in flat


def test_the_headline_instruction_names_the_kinds_of_claim_to_check():
    """"Verify the headline" is not actionable. The failure was concrete -- an
    age -- so the categories are named."""
    flat = " ".join(build_work_order_prompt(_brief()).split())

    for kind in ("an age", "a superlative", '"oldest"', "a comparison"):
        assert kind in flat


# --- what the article needs, rather than what the wording demands -----------
#
# Every blocked question on run a2066506 (2026-09-01) had research that
# answered what a reader needs and failed what the question literally asked
# for. Three for three, from one stage.


def test_a_question_carries_what_the_article_needs():
    payload = _payload()
    payload["requirements"][0]["precision"] = "approximate"

    work_order = build_work_order(_brief(), _deps(payload))

    needs = {item.requirement_id: item.precision for item in work_order.requirements}
    assert needs == {"r1": "approximate", "r2": "exact", "r3": "exact"}


def test_a_plan_that_says_nothing_about_precision_behaves_as_it_always_did():
    """`exact` is the default on purpose. Loosening is a choice the planner
    makes, never something that happens by omission."""
    work_order = build_work_order(_brief(), _deps(_payload()))

    assert all(item.precision == "exact" for item in work_order.requirements)


def test_an_unreadable_precision_falls_back_to_exact_rather_than_failing():
    payload = _payload()
    payload["requirements"][0]["precision"] = "ballpark-ish"

    work_order = build_work_order(_brief(), _deps(payload))

    assert work_order.requirements[0].precision == "exact"


def test_the_prompt_says_precision_is_about_the_reader_not_about_rigour():
    flat = " ".join(build_work_order_prompt(_brief()).split())

    assert "Set `precision` to what the ARTICLE needs" in flat
    assert "a fare they hand over in coins" in flat


def test_research_is_told_what_each_question_needs():
    """Otherwise the target is recorded and never read, and a bounded answer
    still comes back `partial`."""
    from app.features.prompt2blog.research_v4 import (
        build_gather_prompt,
        build_structure_prompt,
    )

    payload = _payload()
    payload["requirements"][0]["precision"] = "approximate"
    work_order = build_work_order(_brief(), _deps(payload))
    loose = work_order.requirements[0]

    gather = " ".join(build_gather_prompt(_brief(), loose).split())
    assert "A range or an order of magnitude is what the article needs" in gather
    # The line that must not move.
    assert "This is not permission to estimate" in gather
    assert "state it as a found fact" in gather

    strict = " ".join(
        build_gather_prompt(_brief(), work_order.requirements[1]).split()
    )
    assert "the actual figure" in strict
    assert "not permission to estimate" not in strict

    structure = " ".join(build_structure_prompt(work_order, {}).split())
    assert "[needs: approximate]" in structure
    assert "Judge each question against what it says it `needs`" in structure


# --- one question, one fact ------------------------------------------------


def test_a_question_asking_for_two_measured_things_is_flagged():
    """Run a2066506's q6 asked for the exact travel time AND the fare. The fare
    is published; the journey time is not. One question, two facts, one status,
    and the answered half held hostage by the other."""
    note = bundled_question_note(
        "What is the exact travel time in minutes and the current fare in PEN "
        "to ride the Metropolitano from Estacion Central to Estacion Bulevar?"
    )

    assert "two things at once" in note


def test_a_value_and_the_date_it_was_true_is_still_one_question():
    """This phrasing is the model answer in the prompt itself. A check that
    flagged it would be teaching the planner to avoid good questions."""
    assert (
        bundled_question_note(
            "What does a one-bedroom in Miraflores rent for, and as of when?"
        )
        == ""
    )


def test_a_list_of_places_with_their_rates_is_one_question():
    assert (
        bundled_question_note(
            "What are the names and approximate nightly rates in USD of three "
            "highly-rated hotels within five blocks of the Plaza Mayor?"
        )
        == ""
    )


def test_the_flag_reaches_the_screen_beside_the_question_it_is_about():
    payload = _payload()
    payload["requirements"][1]["question"] = (
        "What are the opening hours and the ticket price for Huaca Pucllana?"
    )
    work_order = build_work_order(_brief(), _deps(payload))

    record = work_order_stage_record(work_order)
    notes = {item["requirement_id"]: item["bundled_note"] for item in record["requirements"]}

    assert notes["r2"]
    assert notes["r1"] == ""
    assert record["requirements"][0]["precision"] == "exact"


def test_the_prompt_says_one_question_one_fact_with_the_case_that_broke():
    flat = " ".join(build_work_order_prompt(_brief()).split())

    assert "One question, one fact." in flat
    assert "holds the answered half hostage" in flat


# --- a premise declared instead of buried ----------------------------------


def test_the_prompt_names_a_presupposition_as_an_assumption():
    """"Three 4-star hotels within five blocks" assumes such hotels exist. The
    contract has modelled premises as separately refutable since v4; the
    planner was burying them in the question text, where nothing can check
    them, so a false premise failed a whole question instead."""
    flat = " ".join(build_work_order_prompt(_brief()).split())

    assert "A question that takes something for granted is assuming it." in flat
    assert "write the question so it survives being wrong" in flat
    assert "refuted premise, which is a finding" in flat


# --- what a plan is about to cost ------------------------------------------
#
# Run b29d66b4 planned fourteen questions, reached the settle node at 370,114
# tokens against a 320,000 ceiling, and had its one repair attempt refused on
# a 5/10 draft with four actionable revisions sitting there. The refusal was
# correct. Nothing said so while the plan could still be changed.


def test_the_projection_lands_on_the_run_that_produced_it():
    """Measured against b29d66b4: 38,308 spent at the cut, fourteen
    questions, and a real total of 383,407."""
    from app.features.prompt2blog.work_order_v4 import budget_projection

    projection = budget_projection(14, 38_308)

    assert projection.projected_total == 379_508
    assert abs(projection.projected_total - 383_407) / 383_407 < 0.02


def test_a_plan_that_cannot_repair_itself_says_so():
    from app.features.prompt2blog.work_order_v4 import budget_projection

    projection = budget_projection(14, 38_308)

    assert projection.repair_affordable is False
    assert "will not be able to repair itself" in projection.note or (
        "past the" in projection.note
    )


def test_a_small_plan_on_a_fresh_run_can_afford_its_repair():
    from app.features.prompt2blog.work_order_v4 import budget_projection

    projection = budget_projection(3, 5_000)

    assert projection.repair_affordable is True
    assert "leaving room for the one repair attempt" in projection.note


def test_the_note_blames_the_ceiling_when_no_workable_plan_fits():
    """Telling the operator to cut to three questions is not an article, so
    when nothing workable fits the note says what is actually wrong.

    Driven by a run that has already spent most of the ceiling rather than by
    the ceiling's current value, so raising the budget does not silently
    delete the branch this covers."""
    from app.features.prompt2blog.config import P2B_RUN_TOKEN_BUDGET
    from app.features.prompt2blog.work_order_v4 import budget_projection

    projection = budget_projection(9, P2B_RUN_TOKEN_BUDGET - 150_000)

    assert projection.repair_affordable is False
    assert projection.questions_that_fit < 5
    assert "ceiling being too low" in projection.note


def test_a_normal_plan_can_afford_its_repair_at_the_current_ceiling():
    """The size the pipeline actually plans. b29d66b4 asked fourteen and
    a2066506 nine; eleven is the middle of what a run costs."""
    from app.features.prompt2blog.work_order_v4 import budget_projection

    assert budget_projection(11, 38_000).repair_affordable is True


def test_a_run_with_no_accounting_gets_no_projection():
    """`decide_repair` skips its budget check rather than reading an absent
    count as zero, and this does the same."""
    from app.features.prompt2blog.work_order_v4 import budget_projection

    assert budget_projection(9, None) is None


def test_the_projection_travels_on_the_stage_record():
    from app.features.prompt2blog.work_order_v4 import work_order_stage_record

    work_order = build_work_order(_brief(), _deps(_payload()))
    record = work_order_stage_record(work_order, tokens_spent=38_308)

    from app.features.prompt2blog.config import P2B_RUN_TOKEN_BUDGET

    assert record["budget_projection"]["question_count"] == len(
        work_order.requirements
    )
    assert record["budget_projection"]["budget"] == P2B_RUN_TOKEN_BUDGET
    assert work_order_stage_record(work_order)["budget_projection"] is None


def test_a_plan_that_cannot_reach_the_writer_is_refused_before_research():
    """Run 03c6702f: 44 questions, 707,468 spent gathering, dead before the
    writer with no draft. Its own stage record already said it would not fit.

    The soft budget only asks whether one more repair is affordable, and a run
    that fails that still publishes. This asks whether there is an article at
    the end of it at all, so it refuses rather than warns.
    """
    from app.features.prompt2blog.work_order_v4 import (
        PlanTooLargeToFinish,
        budget_projection,
        enforce_plan_fits,
    )

    projection = budget_projection(44, 40_000)

    assert projection.can_finish is False
    assert projection.repair_affordable is False
    assert "never reaches the writer" in projection.note
    assert 0 < projection.questions_that_finish < 44
    with pytest.raises(PlanTooLargeToFinish) as raised:
        enforce_plan_fits(44, 40_000)
    assert raised.value.projection.questions_that_finish == projection.questions_that_finish


def test_a_plan_that_finishes_but_cannot_repair_is_allowed_through():
    """The operator's call, not the system's. It produces an article."""
    from app.features.prompt2blog.work_order_v4 import (
        budget_projection,
        enforce_plan_fits,
    )

    projection = budget_projection(14, 38_308)

    assert projection.repair_affordable is False
    assert projection.can_finish is True
    enforce_plan_fits(14, 38_308)


def test_an_unmetered_run_is_never_refused():
    """A ceiling nobody can measure is not one that can be enforced, and
    guessing zero would make it silently unenforceable -- the same discipline
    `check_run_budget` and `budget_projection` already keep."""
    from app.features.prompt2blog.work_order_v4 import (
        budget_projection,
        enforce_plan_fits,
    )

    assert budget_projection(44, None) is None
    enforce_plan_fits(44, None)
    # And nothing left to gather is nothing to refuse, so a resume whose notes
    # are already paid for is not charged for them a second time.
    enforce_plan_fits(0, 600_000)

