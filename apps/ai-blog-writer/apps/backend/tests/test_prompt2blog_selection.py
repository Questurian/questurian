"""Which facts the article is written from (#534).

What these prove: the same fact arriving twice becomes one, the order is what
the brief needs rather than what research returned, the line is drawn from the
article's length, the operator's moves stick, and none of it can cost the run
a fact it needed or turn an editorial cut into a coverage failure.

What they cannot prove: whether the ranking is any good. That is a question
about a real model reading real evidence against a real brief, and a fake
returning a canned order says nothing about it. The first real signal is a run
that finishes.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefReader,
    EvidenceClaim,
    EvidenceConflict,
    EvidencePackage,
    EvidenceRequirement,
    EvidenceSource,
    Prompt2BlogWorkOrder,
    WorkOrderReference,
    WorkOrderRequirement,
    WorkOrderScope,
)
from app.features.prompt2blog.selection_v4 import (
    MIN_KEPT_CLAIMS,
    Selection,
    SelectionDependencies,
    SelectionRefused,
    apply_selection,
    revise,
    select_evidence,
    shortlist,
    target_claim_count,
    texture_claim_ids,
)


def _brief() -> ArticleBrief:
    return ArticleBrief(
        brief_fingerprint="bf-1",
        seed="Chifa is Lima's second cuisine.",
        location="Lima",
        spine="What chifa is and where to eat it.",
        reader_question="Where should I eat chifa in Lima?",
        outcome="The reader picks a chifa and goes.",
        fails_if="It lists restaurants without saying which to choose.",
        reader=BriefReader(primary_reader="A first-time visitor with two nights."),
        must_name=[],
        material=[],
        topic_module_ids=[],
        form_id="analysis",
    )


def _work_order() -> Prompt2BlogWorkOrder:
    return Prompt2BlogWorkOrder(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Lima",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Lima", role="primary_subject")],
        ),
        premise=[],
        requirements=[
            WorkOrderRequirement(
                requirement_id="r1", question="What is chifa?", kind="load_bearing"
            ),
        ],
    )


def _package(count: int) -> EvidencePackage:
    return EvidencePackage(
        schema_version=4,
        work_order_fingerprint="wo-1",
        sources=[
            EvidenceSource(
                source_id=f"s{index}",
                url=f"https://example.pe/{index}",
                title=f"Source {index}",
                publisher="Example",
                source_type="official",
                material_type="web",
                retrieved_at="2026-09-01",
                notes=["Retrieved for this run."],
            )
            for index in range(1, count + 1)
        ],
        claims=[
            EvidenceClaim(
                claim_id=f"c{index}",
                text=f"Fact number {index} about chifa in Lima.",
                source_ids=[f"s{index}"],
                requirement_ids=["r1"],
                confidence="high",
            )
            for index in range(1, count + 1)
        ],
        requirements=[
            EvidenceRequirement(
                requirement_id="r1",
                status="supported",
                claim_ids=[f"c{index}" for index in range(1, count + 1)],
            )
        ],
        premise_findings=[],
        conflicts=[],
        gaps=[],
    )


class _LLM:
    """Answers the two calls by which schema it was handed."""

    def __init__(
        self,
        *,
        groups: list[dict] | None = None,
        ranked: list[str] | None = None,
        texture: list[str] | None = None,
    ):
        self.groups = groups
        self.ranked = ranked
        self.texture = texture
        self.jobs: list[str] = []
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, job_id: str = "", **_kwargs: Any):
        self.jobs.append(job_id)
        self.prompts.append(prompt)
        if job_id.endswith("dedupe"):
            if self.groups is None:
                raise RuntimeError("the dedupe model is having a day")
            return {"groups": self.groups}, "{}"
        # The colour pass runs under the same job id and is told apart by its
        # prompt, exactly as the real one is.
        if "THE DETAILS" in prompt:
            rows = self.texture or []
            return {"ranked": [{"claim_id": i, "why": "vivid"} for i in rows]}, "{}"
        if self.ranked is None:
            raise RuntimeError("the ranking model is having a day")
        return {"ranked": [{"claim_id": item, "why": "because"} for item in self.ranked]}, "{}"


def _select(evidence: EvidencePackage, llm: _LLM, *, words: int = 900) -> Selection:
    return select_evidence(
        _brief(),
        _work_order(),
        evidence,
        SelectionDependencies(llm=llm),
        target_word_count=words,
    )


def test_the_line_comes_from_how_long_the_article_is():
    """Run 9e66bf84 ran at nine claims per hundred words across the article and
    28 per hundred in its worst section. There is no sentence you can write at
    that density except a list."""
    assert target_claim_count(900, available=100) == 18
    assert target_claim_count(2500, available=100) == 50
    # Never more than there are, and never so few it is not an article.
    assert target_claim_count(2500, available=12) == 12
    assert target_claim_count(100, available=100) == MIN_KEPT_CLAIMS


def test_the_same_fact_twice_becomes_one_and_keeps_both_its_sources():
    """Deduplication must not lose provenance. A merged claim hands the
    survivor its sources and its questions before it stands down."""
    evidence = _package(3)
    llm = _LLM(groups=[{"keep": "f1", "same_as": ["f2"]}], ranked=["f1", "f3"])

    selection = _select(evidence, llm)
    applied = apply_selection(evidence, selection)
    by_id = {claim.claim_id: claim for claim in applied.claims}

    assert selection.merged == {"c2": "c1"}
    assert by_id["c2"].merged_into == "c1"
    assert by_id["c2"].selected is False
    assert by_id["c1"].source_ids == ["s1", "s2"]
    # The claim text is never rewritten. Every survivor is verbatim research.
    assert by_id["c1"].text == "Fact number 1 about chifa in Lima."


def test_dedupe_never_leaves_a_claim_pointing_at_a_claim_nobody_can_see():
    """A chain or a cycle would merge a claim into one that was itself merged
    away, and the survivor the operator is shown would not exist."""
    evidence = _package(3)
    llm = _LLM(
        groups=[
            {"keep": "f1", "same_as": ["f2"]},
            # f1 merged away here. Following both would leave f2 orphaned.
            {"keep": "f3", "same_as": ["f1"]},
        ],
        ranked=["f1", "f2", "f3"],
    )

    selection = _select(evidence, llm)

    for survivor in selection.merged.values():
        assert survivor not in selection.merged


def test_a_claim_the_ranker_forgot_is_kept_not_cut():
    """An omission from a model is not an editorial decision. Treating one as
    a cut would drop a fact nobody chose to drop."""
    evidence = _package(12)
    llm = _LLM(groups=[], ranked=["f5", "f3"])

    selection = _select(evidence, llm)

    assert set(selection.order) == {f"c{index}" for index in range(1, 13)}
    assert selection.order[:2] == ["c5", "c3"]


def test_a_failed_pass_keeps_every_fact_and_says_which_one_fell_over():
    """Degrade, not fail. An article written from all the evidence is worse
    than one written from the right quarter of it, and both beat no article."""
    evidence = _package(40)

    both_down = _select(evidence, _LLM(groups=None, ranked=None))
    assert both_down.deduped is False and both_down.ranked is False
    assert both_down.keep_count == 40, "an unranked order is not a ranking to cut"
    assert "nothing ordered them" in both_down.note

    rank_only = _select(evidence, _LLM(groups=None, ranked=[f"f{i}" for i in range(1, 41)]))
    assert rank_only.deduped is False and rank_only.ranked is True
    assert rank_only.keep_count == 18
    assert "Deduplication did not run" in rank_only.note


def test_a_deselected_claim_leaves_the_desk_and_never_the_record():
    """The rule that makes the cut safe, and the one it must never break: a
    question its claim supported is still supported."""
    evidence = _package(40)
    llm = _LLM(groups=[], ranked=[f"f{index}" for index in range(1, 41)])

    applied = apply_selection(evidence, _select(evidence, llm))
    selected = [claim for claim in applied.claims if claim.selected]

    assert len(applied.claims) == 40, "nothing is deleted"
    assert len(selected) == 18
    assert applied.requirements[0].claim_ids == [f"c{i}" for i in range(1, 41)]


def test_a_fact_added_after_the_ranking_still_reaches_the_writer():
    """The gate can mint a claim after selection has run -- an operator
    answering a question themselves. A fact somebody typed in to unblock the
    article being silently cut from it is the worst failure this could have."""
    evidence = _package(40)
    llm = _LLM(groups=[], ranked=[f"f{index}" for index in range(1, 41)])
    selection = _select(evidence, llm)

    late = evidence.claims[0].model_copy(
        update={"claim_id": "opc-1", "text": "What the operator found themselves."}
    )
    evidence = evidence.model_copy(update={"claims": [*evidence.claims, late]})
    applied = apply_selection(evidence, selection)

    assert next(c for c in applied.claims if c.claim_id == "opc-1").selected is True


def test_the_ranker_is_told_what_the_piece_fails_if_it_does_not_do():
    """Ranking is against this brief, not against general interest."""
    evidence = _package(3)
    llm = _LLM(groups=[], ranked=["f1", "f2", "f3"])

    _select(evidence, llm)

    rank_prompt = llm.prompts[-1]
    assert _brief().fails_if in rank_prompt
    assert _brief().reader_question in rank_prompt
    assert _brief().seed in rank_prompt
    assert llm.jobs == ["p2b.evidence_dedupe", "p2b.evidence_rank"]


def test_dedupe_is_told_a_summary_and_its_details_are_not_duplicates():
    """The case that would destroy the article's best material: one claim
    listing seven dishes and four describing four of them are two levels of
    zoom, not a duplicate."""
    evidence = _package(2)
    llm = _LLM(groups=[], ranked=["f1", "f2"])

    _select(evidence, llm)

    assert "SUMMARY AND ITS DETAILS ARE NOT DUPLICATES" in llm.prompts[0]
    assert "Never invent or rewrite claim text" in llm.prompts[0]


def _ranked(count: int = 40, keep: int = 18) -> Selection:
    return Selection(
        order=[f"c{index}" for index in range(1, count + 1)],
        keep_count=keep,
        ranked=True,
        deduped=True,
        reasons={"c1": "The reader cannot choose without it."},
        target_word_count=900,
    )


def test_moving_the_line_changes_what_is_kept():
    selection = revise(_ranked(), keep_count=5)

    assert selection.selected_claim_ids() == {f"c{index}" for index in range(1, 6)}


def test_a_rescue_outlives_the_line_moving_past_it():
    """The override is a decision about that fact, not about where the line is.
    An operator who rescues a fact and then widens the cut has not un-rescued
    it, and one who narrows the cut has not lost it."""
    selection = revise(_ranked(), rescue="c30")
    assert "c30" in selection.selected_claim_ids()

    widened = revise(selection, keep_count=35)
    assert "c30" in widened.selected_claim_ids()

    narrowed = revise(widened, keep_count=3)
    assert narrowed.selected_claim_ids() == {"c1", "c2", "c3", "c30"}


def test_a_drop_survives_the_line_too_and_can_be_undone():
    selection = revise(_ranked(), drop="c2")
    assert "c2" not in selection.selected_claim_ids()

    assert "c2" in revise(selection, clear="c2").selected_claim_ids()


def test_the_picker_refuses_what_it_cannot_mean():
    with pytest.raises(SelectionRefused):
        revise(_ranked(), keep_count=5, drop="c2")
    with pytest.raises(SelectionRefused):
        revise(_ranked())
    with pytest.raises(SelectionRefused):
        revise(_ranked(), rescue="c99")
    with pytest.raises(SelectionRefused):
        revise(_ranked(), keep_count=99)
    # And it will not leave the writer with nothing to write from.
    with pytest.raises(SelectionRefused):
        revise(_ranked(), keep_count=0)


def test_the_shortlist_names_what_a_survivor_absorbed():
    """Three near-identical rows to tick past is the shape that made the
    operator stop reading. One row saying what it stands for is the useful
    one."""
    evidence = _package(3)
    selection = Selection(
        order=["c1", "c3"],
        merged={"c2": "c1"},
        keep_count=1,
        ranked=True,
        deduped=True,
        reasons={"c1": "Answers the reader's question directly."},
    )

    rows = shortlist(evidence, _work_order(), selection)

    assert [row["claim_id"] for row in rows] == ["c1", "c3"]
    assert rows[0]["rank"] == 1 and rows[0]["selected"] is True
    assert rows[0]["merged_in"] == ["Fact number 2 about chifa in Lima."]
    assert rows[0]["why"] == "Answers the reader's question directly."
    assert rows[0]["questions"] == ["What is chifa?"]
    assert rows[1]["selected"] is False


def test_the_shortlist_says_when_the_line_was_not_what_decided_it():
    evidence = _package(3)
    selection = revise(
        Selection(order=["c1", "c2", "c3"], keep_count=1, ranked=True), rescue="c3"
    )

    rows = {row["claim_id"]: row for row in shortlist(evidence, _work_order(), selection)}

    assert rows["c3"]["rescued"] is True and rows["c3"]["selected"] is True
    assert rows["c2"]["rescued"] is False and rows["c2"]["selected"] is False


def test_the_models_are_given_short_labels_not_long_claim_ids():
    """Claim ids are namespaced by their question and run to 76 characters.
    Asked to copy a hundred of those, the first real run's ranker came back
    correctly ordered, with good reasoning, and every id rewritten from
    `req_neighbourhood_chifa_characteristics:ncc_18` to `ncc_18`. None of 102
    matched. This is #499 again and takes the same answer."""
    evidence = _package(3)
    long_ids = [
        claim.model_copy(update={"claim_id": f"req_a_very_long_question_name:{claim.claim_id}"})
        for claim in evidence.claims
    ]
    evidence = evidence.model_copy(
        update={
            "claims": long_ids,
            "requirements": [
                evidence.requirements[0].model_copy(
                    update={"claim_ids": [claim.claim_id for claim in long_ids]}
                )
            ],
        }
    )
    llm = _LLM(groups=[{"keep": "f1", "same_as": ["f2"]}], ranked=["f2", "f1"])

    selection = _select(evidence, llm)

    for prompt in llm.prompts:
        assert "req_a_very_long_question_name" not in prompt
        assert "- f1 |" in prompt
    # And the handles come back as the real ids, not as themselves.
    assert selection.merged == {
        "req_a_very_long_question_name:c2": "req_a_very_long_question_name:c1"
    }
    # Ranking's labels are numbered over the SURVIVORS, so f2 is the second
    # claim still standing (c3) rather than the second claim in the dossier
    # (c2, which was merged away). Sharing one numbering across both calls
    # would silently point the ranking at the wrong facts.
    assert selection.order == [
        "req_a_very_long_question_name:c3",
        "req_a_very_long_question_name:c1",
    ]


def test_a_ranking_that_matched_nothing_is_not_a_ranking():
    """The exact shape of the first real run's failure: 102 rows returned, none
    of them a claim. Reporting that as ranked drew a line at 18 through a list
    in the order research happened to return it, which is not a decision."""
    evidence = _package(40)
    llm = _LLM(groups=[], ranked=["nonsense_1", "nonsense_2"])

    selection = _select(evidence, llm)

    assert selection.ranked is False
    assert selection.keep_count == 40, "an unranked order is not a ranking to cut"
    assert "Ranking did not run" in selection.note


def test_a_merge_leaves_the_dossier_still_valid():
    """The contract requires claim->requirement and requirement->claim to
    agree. Handing a survivor the questions its merged claims answered without
    naming it on those questions produces a package that will not validate --
    which is how the first real run died, at the hand-off, after research was
    already paid for."""
    evidence = _package(3)
    # c2 answers a different question from c1, and is merged into it.
    claims = [
        evidence.claims[0],
        evidence.claims[1].model_copy(update={"requirement_ids": ["r2"]}),
        evidence.claims[2],
    ]
    evidence = evidence.model_copy(
        update={
            "claims": claims,
            "requirements": [
                evidence.requirements[0].model_copy(update={"claim_ids": ["c1", "c3"]}),
                EvidenceRequirement(
                    requirement_id="r2", status="supported", claim_ids=["c2"]
                ),
            ],
        }
    )
    llm = _LLM(groups=[{"keep": "f1", "same_as": ["f2"]}], ranked=["f1", "f2"])

    applied = apply_selection(evidence, _select(evidence, llm))

    # Revalidating is the whole test: this is what the hand-off does.
    EvidencePackage.model_validate(applied.model_dump(mode="json"))
    survivor = next(c for c in applied.claims if c.claim_id == "c1")
    assert set(survivor.requirement_ids) == {"r1", "r2"}
    r2 = next(r for r in applied.requirements if r.requirement_id == "r2")
    # Added to, never taken from: r2 keeps c2 and gains the claim that absorbed
    # it, so coverage after selection is never weaker than before it.
    assert set(r2.claim_ids) == {"c1", "c2"}


def test_dedupe_will_not_merge_two_claims_the_dossier_says_disagree():
    """Run 3750891f held Chifa Titi's Sunday opening as both 12:30 and 12:45,
    and recorded the conflict. Dedupe merged the correct claim into the wrong
    one -- the sentences are nearly identical -- so the writer only ever saw
    12:45, while groundedness reads the whole dossier and failed the draft for
    a claim the writer had no way to check.

    A recorded conflict is the dossier saying in as many words that two claims
    are not the same fact. Merging across one picks a winner in a factual
    dispute and deletes the loser from the writer's desk, silently.
    """
    evidence = _package(3)
    evidence = evidence.model_copy(
        update={
            "conflicts": [
                EvidenceConflict(
                    conflict_id="conflict_1",
                    claim_ids=["c1", "c2"],
                    summary="Two different opening times for the same restaurant.",
                )
            ]
        }
    )
    llm = _LLM(
        # The model tries to merge the disputed pair and an undisputed one.
        groups=[{"keep": "f1", "same_as": ["f2", "f3"]}],
        ranked=["f1", "f2", "f3"],
    )

    selection = _select(evidence, llm)

    assert "c2" not in selection.merged, "a disputed claim must keep its own voice"
    assert selection.merged == {"c3": "c1"}, "an undisputed merge still happens"


def _mixed(load_bearing: int, texture: int):
    """A dossier with both kinds, and a work order that says which is which."""
    total = load_bearing + texture
    evidence = _package(total)
    colour = [f"c{index}" for index in range(load_bearing + 1, total + 1)]
    evidence = evidence.model_copy(
        update={
            "claims": [
                claim.model_copy(update={"requirement_ids": ["r_colour"]})
                if claim.claim_id in colour
                else claim
                for claim in evidence.claims
            ],
            "requirements": [
                evidence.requirements[0].model_copy(
                    update={"claim_ids": [f"c{i}" for i in range(1, load_bearing + 1)]}
                ),
                EvidenceRequirement(
                    requirement_id="r_colour", status="supported", claim_ids=colour
                ),
            ],
        }
    )
    work_order = _work_order().model_copy(
        update={
            "requirements": [
                *_work_order().requirements,
                WorkOrderRequirement(
                    requirement_id="r_colour",
                    question="What is the room like?",
                    kind="texture",
                ),
            ]
        }
    )
    return evidence, work_order, colour


def test_colour_keeps_a_share_of_the_desk_instead_of_losing_every_time():
    """Ranking against the brief means ranking against the reader question, the
    outcome and fails_if -- three questions about usefulness. A fact whose only
    job is to make a place feel like a place loses to a price band every time.

    Measured on run 8a7e9aa4: 23 texture claims in the dossier, 2 selected. The
    best line in it -- Canta Rana's dining room covered in football flags
    because the owner is Argentine -- ranked 59th of 151 and was cut.
    """
    evidence, work_order, colour = _mixed(load_bearing=40, texture=10)
    # The utility ranker does what it did in the wild: all the colour last.
    llm = _LLM(
        groups=[],
        ranked=[f"f{i}" for i in range(1, 51)],
        texture=[f"f{i}" for i in range(1, 11)],
    )

    selection = select_evidence(
        _brief(), work_order, evidence, SelectionDependencies(llm=llm),
        target_word_count=900,
    )
    kept = selection.selected_claim_ids()

    assert selection.keep_count == 18
    assert len(kept) == 18, "the reserve holds slots, it does not add them"
    assert len(kept & set(colour)) == 4, "a fifth of 18, rounded"
    # And without the reserve every one of them would have been cut.
    assert all(claim not in selection.order[:18] for claim in colour)


def test_the_operators_moves_do_not_quietly_delete_the_reserve():
    """The first click used to rebuild the selection without it."""
    evidence, work_order, colour = _mixed(load_bearing=40, texture=10)
    llm = _LLM(
        groups=[],
        ranked=[f"f{i}" for i in range(1, 51)],
        texture=[f"f{i}" for i in range(1, 11)],
    )
    selection = select_evidence(
        _brief(), work_order, evidence, SelectionDependencies(llm=llm),
        target_word_count=900,
    )

    widened = revise(selection, keep_count=30)

    assert widened.texture_reserve == selection.texture_reserve
    assert len(widened.selected_claim_ids() & set(colour)) >= 4


def test_the_colour_pass_is_asked_a_different_question_from_the_ranking():
    """Judged on usefulness, colour is correctly judged useless. It has to be
    judged on what it is for."""
    evidence, work_order, _colour = _mixed(load_bearing=6, texture=4)
    llm = _LLM(groups=[], ranked=[f"f{i}" for i in range(1, 11)], texture=["f1"])

    select_evidence(
        _brief(), work_order, evidence, SelectionDependencies(llm=llm),
        target_word_count=900,
    )

    colour_prompt = next(p for p in llm.prompts if "real place" in p)
    assert "SPECIFIC BEATS EVALUATIVE" in colour_prompt
    assert "football flags" in colour_prompt
    assert "beloved" in colour_prompt, "marketing language is named and demoted"
    # And the practical claims are not in it: this pass only sees colour.
    assert "- f5 |" not in colour_prompt


def test_a_claim_that_also_proves_something_is_not_colour():
    """A claim answering a load-bearing question is doing load-bearing work,
    whatever else it does. Counting it as colour would spend the reserve on
    facts that were never at risk."""
    evidence, work_order, _colour = _mixed(load_bearing=3, texture=2)
    both = evidence.claims[3].model_copy(update={"requirement_ids": ["r1", "r_colour"]})
    evidence = evidence.model_copy(
        update={
            "claims": [*evidence.claims[:3], both, evidence.claims[4]],
            "requirements": [
                evidence.requirements[0].model_copy(
                    update={"claim_ids": ["c1", "c2", "c3", "c4"]}
                ),
                evidence.requirements[1],
            ],
        }
    )

    assert texture_claim_ids(work_order, evidence) == {"c5"}


def test_a_colour_row_shows_why_it_is_vivid_not_why_it_is_useless():
    """Both passes rank a colour claim, and the utility pass says what it is
    not. Run 4a56545b put "folklore the piece can live without" beside a row
    kept precisely because it was the most vivid thing in the dossier."""
    evidence, work_order, colour = _mixed(load_bearing=4, texture=2)
    llm = _LLM(
        groups=[], ranked=[f"f{i}" for i in range(1, 7)], texture=["f1", "f2"]
    )

    selection = select_evidence(
        _brief(), work_order, evidence, SelectionDependencies(llm=llm),
        target_word_count=900,
    )

    assert selection.reasons[colour[0]] == "vivid"
    assert selection.reasons["c1"] == "because"
