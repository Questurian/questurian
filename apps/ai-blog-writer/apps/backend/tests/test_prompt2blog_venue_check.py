"""Looking at the places before the article recommends them.

Research found Moravia Tours, its site, and both founders by name, and every
word was true. What it could not see: last post 2024, a janky checkout, tired
photos. A business winding down is not a fact on a page, it is the absence of
recent activity, and no amount of better research closes that.

Called liveness rather than quality on purpose. The operator has not taken
these tours either and cannot say whether they are good. They can tell alive
from abandoned, which is exactly what went wrong.
"""

from __future__ import annotations

import pytest

from app.features.prompt2blog.contracts_v4 import EvidencePackage
from app.features.prompt2blog.gate_v4 import (
    GateAnswerRefused,
    dismiss_venue,
    drop_venue,
    note_venue,
    venues_to_check,
)


def _evidence(**overrides) -> EvidencePackage:
    payload = {
        "work_order_fingerprint": "wo-1",
        "sources": [
            {
                "source_id": "s1",
                "title": "Moravia Tours",
                "publisher": "Moravia Tours",
                "url": "https://moraviatours.com",
                "retrieved_at": "2026-08-31",
                "source_type": "official",
                "material_type": "web",
                "notes": ["Community founded."],
            }
        ],
        "claims": [
            {
                "claim_id": "c11",
                "text": "Moravia Tours was co-founded by community leaders.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
                "venue": "Moravia Tours",
            },
            {
                "claim_id": "c10",
                "text": "Real City Tours costs COP 100,000 per person.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
                "venue": "Real City Tours",
            },
            {
                "claim_id": "c4",
                "text": "The Graffitour draws about 7,000 tourists daily.",
                "source_ids": ["s1"],
                "requirement_ids": ["q1"],
                "confidence": "high",
            },
        ],
        "requirements": [
            {"requirement_id": "q3", "status": "supported", "claim_ids": ["c10", "c11"]},
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c4"]},
        ],
    }
    payload.update(overrides)
    return EvidencePackage.model_validate(payload)


def test_only_places_a_reader_could_go_are_listed():
    """Most claims are facts, not places. A list with every fact in it is a
    list nobody reads."""
    venues = venues_to_check(_evidence())

    assert [v["venue"] for v in venues] == ["Moravia Tours", "Real City Tours"]
    assert all(v["claim_id"] != "c4" for v in venues), "an elevation is not a venue"


def test_the_link_travels_with_it_so_it_can_actually_be_checked():
    venues = venues_to_check(_evidence())

    # Pydantic normalises the URL, so match on the host rather than the string.
    assert any("moraviatours.com" in url for url in venues[0]["urls"])


def test_the_same_place_named_twice_is_listed_once():
    """Run 76b36468 had five venue claims and two were the same operator."""
    evidence = _evidence(
        claims=[
            {
                "claim_id": "c12",
                "text": "Real City Tours limits groups to 8.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
                "venue": "Real City Tours",
            },
            {
                "claim_id": "c10",
                "text": "Real City Tours costs COP 100,000.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
                "venue": "real city tours",
            },
        ],
        requirements=[
            {"requirement_id": "q3", "status": "supported", "claim_ids": ["c10", "c12"]}
        ],
    )

    assert len(venues_to_check(evidence)) == 1


# --- what the operator does about it ---------------------------------------


def test_a_note_reaches_the_writer_with_the_claim():
    noted = note_venue(
        _evidence(),
        claim_id="c11",
        note="Still listed but quiet, last post 2024.",
    )

    claim = next(c for c in noted.claims if c.claim_id == "c11")
    assert claim.venue_note == "Still listed but quiet, last post 2024."


def test_an_empty_note_is_refused():
    with pytest.raises(GateAnswerRefused, match="cannot be empty"):
        note_venue(_evidence(), claim_id="c11", note="   ")


def test_dropping_takes_the_place_out_of_the_dossier():
    """The writer has no way to tell a dead operator from a live one."""
    dropped = drop_venue(_evidence(), claim_id="c11")

    assert "c11" not in {c.claim_id for c in dropped.claims}
    requirement = next(r for r in dropped.requirements if r.requirement_id == "q3")
    assert requirement.claim_ids == ["c10"]
    # The question still stands on its other claim.
    assert requirement.status == "supported"


def test_dropping_a_question_s_only_support_puts_it_back_behind_the_gate():
    """Quietly leaving it supported would publish an article resting on a claim
    the operator looked at and rejected."""
    from app.features.prompt2blog.coverage_v4 import assess_coverage
    from app.features.prompt2blog.contracts_v4 import (
        Prompt2BlogWorkOrder,
        WorkOrderReference,
        WorkOrderRequirement,
        WorkOrderScope,
    )

    evidence = _evidence(
        claims=[
            {
                "claim_id": "c11",
                "text": "Moravia Tours runs weekly tours.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
                "venue": "Moravia Tours",
            },
            {
                "claim_id": "c4",
                "text": "The Graffitour draws 7,000 daily.",
                "source_ids": ["s1"],
                "requirement_ids": ["q1"],
                "confidence": "high",
            },
        ],
        requirements=[
            {"requirement_id": "q3", "status": "supported", "claim_ids": ["c11"]},
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c4"]},
        ],
    )
    dropped = drop_venue(evidence, claim_id="c11")

    requirement = next(r for r in dropped.requirements if r.requirement_id == "q3")
    assert requirement.status == "partial"
    assert "checked and rejected" in requirement.gap

    work_order = Prompt2BlogWorkOrder(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Medellin",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Medellin", role="primary_subject")],
        ),
        requirements=[
            WorkOrderRequirement(requirement_id="q3", question="Prices?", kind="load_bearing"),
            WorkOrderRequirement(requirement_id="q1", question="Visitors?", kind="texture"),
        ],
    )
    assert assess_coverage(work_order, dropped).can_write is False


def test_dropping_an_unknown_claim_says_so():
    with pytest.raises(GateAnswerRefused, match="No claim called"):
        drop_venue(_evidence(), claim_id="c999")


def test_the_schema_asks_for_the_venue_and_the_prompt_explains_it():
    from app.features.prompt2blog.research_v4 import (
        EVIDENCE_SCHEMA,
        build_structure_prompt,
    )

    claim = EVIDENCE_SCHEMA["properties"]["claims"]["items"]["properties"]
    assert "venue" in claim

    from app.features.prompt2blog.contracts_v4 import (
        ArticleBrief,
        BriefReader,
        Prompt2BlogWorkOrder,
        WorkOrderReference,
        WorkOrderRequirement,
        WorkOrderScope,
    )

    brief = ArticleBrief(
        brief_fingerprint="bf-1",
        seed="s",
        location="Medellin, Colombia",
        form_id="destination-guide",
        reader=BriefReader(primary_reader="r"),
        reader_question="q",
        outcome="o",
        spine="s",
        fails_if="f",
    )
    work_order = Prompt2BlogWorkOrder(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Medellin",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Medellin", role="primary_subject")],
        ),
        requirements=[
            WorkOrderRequirement(requirement_id="q3", question="Prices?", kind="load_bearing")
        ],
    )
    flat = " ".join(build_structure_prompt(work_order, {}).split())

    assert "sends a reader to a place whose survival is genuinely in doubt" in flat
    assert "a list with every fact in it is a list nobody reads" in flat
    # The two faults from run a2066506, named in the instruction itself.
    assert "Nobody doubts the place is still there" in flat
    assert "names the place as evidence rather than as a destination" in flat


# --- what does not belong on the list at all --------------------------------


def test_a_place_the_operator_dismissed_leaves_the_list():
    """Run a2066506 put McDonald's, Starbucks and KFC in front of the operator.

    Nobody needs to confirm McDonald's is still trading, and clearing one has
    to be free -- the whole point is that it should never have been asked.
    """
    evidence = dismiss_venue(_evidence(), claim_id="c11")

    assert [v["venue"] for v in venues_to_check(evidence)] == ["Real City Tours"]


def test_dismissing_leaves_the_dossier_exactly_as_it_was():
    """The research was right. Only the question was not worth asking."""
    evidence = dismiss_venue(_evidence(), claim_id="c11")

    claim = next(c for c in evidence.claims if c.claim_id == "c11")
    assert claim.text == "Moravia Tours was co-founded by community leaders."
    assert claim.requirement_ids == ["q3"]
    requirement = next(r for r in evidence.requirements if r.requirement_id == "q3")
    assert requirement.status == "supported"
    assert requirement.claim_ids == ["c10", "c11"]


def test_a_dismissal_survives_a_re_parse_of_stored_evidence():
    """Otherwise the same three chains come back on the next page load."""
    from app.features.prompt2blog.research_v4 import _normalised_evidence

    dismissed = dismiss_venue(_evidence(), claim_id="c11")
    stored = dismissed.model_dump(mode="json")
    reparsed = EvidencePackage.model_validate(
        {
            **_normalised_evidence(stored),
            "work_order_fingerprint": stored["work_order_fingerprint"],
        }
    )

    claim = next(c for c in reparsed.claims if c.claim_id == "c11")
    assert claim.venue_dismissed is True


def test_dismissing_an_unknown_claim_says_so():
    with pytest.raises(GateAnswerRefused, match="No claim called"):
        dismiss_venue(_evidence(), claim_id="c999")


# --- saying what a drop will cost, before the click -------------------------


def test_the_list_says_which_questions_rest_on_this_place_alone():
    """The trap in run a2066506: clearing an irrelevant entry could push the
    run back behind the gate with no warning."""
    evidence = _evidence(
        claims=[
            {
                "claim_id": "c11",
                "text": "Moravia Tours runs weekly tours.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
                "venue": "Moravia Tours",
            },
            {
                "claim_id": "c10",
                "text": "Real City Tours costs COP 100,000.",
                "source_ids": ["s1"],
                "requirement_ids": ["q1"],
                "confidence": "high",
                "venue": "Real City Tours",
            },
            {
                "claim_id": "c4",
                "text": "The Graffitour draws 7,000 daily.",
                "source_ids": ["s1"],
                "requirement_ids": ["q1"],
                "confidence": "high",
            },
        ],
        requirements=[
            {"requirement_id": "q3", "status": "supported", "claim_ids": ["c11"]},
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c10", "c4"]},
        ],
    )

    by_name = {v["venue"]: v for v in venues_to_check(evidence)}
    assert by_name["Moravia Tours"]["sole_support_for"] == ["q3"]
    # q1 keeps c4 whatever happens to this one, so dropping it costs nothing.
    assert by_name["Real City Tours"]["sole_support_for"] == []


def test_nothing_rests_on_a_place_a_second_claim_also_supports():
    by_name = {v["venue"]: v for v in venues_to_check(_evidence())}

    assert by_name["Moravia Tours"]["sole_support_for"] == []
