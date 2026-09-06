"""The boundary between what was learned and what the writer receives.

What these prove: a chosen fact arrives verbatim with whatever makes it true,
a fact nobody chose does not arrive at all, and every way the inputs can move
under a selection is refused out loud rather than papered over.

What they cannot prove: whether the resulting article is better. That needs a
draft a person reads, and it belongs after the receiving stages are wired to
this. A green suite here says the hand-off is correct, not that it helped.
"""

from __future__ import annotations

import pytest

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefMaterial,
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
from app.features.prompt2blog.evidence_v3 import PLACEHOLDER_SOURCE_NOTE
from app.features.prompt2blog.packet_v4 import (
    PACKET_POLICY_VERSION,
    PacketRefused,
    build_packet,
    selection_fingerprint,
)
from app.features.prompt2blog.packet_v4 import (
    PLACEHOLDER_SOURCE_NOTE as PACKET_PLACEHOLDER_NOTE,
)
from app.features.prompt2blog.selection_v4 import Selection, apply_selection

CAVEAT = "Prices were last checked in March and the operator publishes no history."


def _brief(**overrides) -> ArticleBrief:
    fields = dict(
        brief_fingerprint="bf-1",
        seed="Barranco is the easier side of Lima to leave from.",
        location="Lima",
        spine="Where to stay if you are flying out early.",
        reader_question="Should I stay in Barranco or Miraflores?",
        outcome="The reader books one neighbourhood and knows the trip to the airport.",
        fails_if="It compares the two without saying which to pick.",
        reader=BriefReader(primary_reader="A first-time visitor with two nights."),
        must_name=[],
        material=[],
        topic_module_ids=[],
        form_id="analysis",
    )
    return ArticleBrief(**{**fields, **overrides})


def _work_order(fingerprint: str = "wo-1") -> Prompt2BlogWorkOrder:
    return Prompt2BlogWorkOrder(
        work_order_fingerprint=fingerprint,
        brief_fingerprint="bf-1",
        primary_subject="Barranco",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Barranco", role="primary_subject")],
        ),
        premise=[],
        requirements=[
            WorkOrderRequirement(
                requirement_id="r1",
                question="How long is the taxi to the airport?",
                kind="load_bearing",
            ),
            WorkOrderRequirement(
                requirement_id="r2",
                question="What does the neighbourhood look like?",
                kind="texture",
            ),
        ],
    )


def _evidence(
    *,
    notes: list[str] | None = None,
    conflicts: list[EvidenceConflict] | None = None,
    venue_note: str = "",
    text_of_c1: str = "The taxi to the airport takes 45 minutes.",
) -> EvidencePackage:
    return EvidencePackage(
        schema_version=4,
        work_order_fingerprint="wo-1",
        sources=[
            EvidenceSource(
                source_id="s1",
                url="https://example.pe/1",
                title="Source one",
                publisher="Example",
                source_type="official",
                material_type="web",
                retrieved_at="2026-09-01",
                notes=notes or [PLACEHOLDER_SOURCE_NOTE],
            ),
            EvidenceSource(
                source_id="s2",
                url="https://example.pe/2",
                title="Source two",
                publisher="Example",
                source_type="official",
                material_type="web",
                retrieved_at="2026-09-01",
                notes=["A note about a fact nobody chose."],
            ),
        ],
        claims=[
            EvidenceClaim(
                claim_id="c1",
                text=text_of_c1,
                source_ids=["s1"],
                requirement_ids=["r1"],
                as_of="2026-08-01",
                confidence="high",
                venue="Airport Express",
                venue_note=venue_note,
            ),
            EvidenceClaim(
                claim_id="c2",
                text="The walls of the bar are covered in Argentine football flags.",
                source_ids=["s1"],
                requirement_ids=["r2"],
                confidence="medium",
            ),
            EvidenceClaim(
                claim_id="c3",
                text="A fact nobody chose, about a bus nobody takes.",
                source_ids=["s2"],
                requirement_ids=["r1"],
                confidence="low",
            ),
        ],
        requirements=[
            EvidenceRequirement(
                requirement_id="r1", status="supported", claim_ids=["c1", "c3"]
            ),
            EvidenceRequirement(
                requirement_id="r2", status="supported", claim_ids=["c2"]
            ),
        ],
        premise_findings=[],
        conflicts=conflicts or [],
        gaps=[],
    )


def _selection(evidence: EvidencePackage, **overrides) -> Selection:
    defaults = dict(
        order=["c1", "c2", "c3"],
        keep_count=2,
        reasons={"c1": "It decides which side of the city to sleep on."},
        texture_order=["c2"],
        texture_reserve=1,
        target_word_count=900,
        brief_fingerprint="bf-1",
        work_order_fingerprint="wo-1",
        evidence_fingerprint=evidence.content_fingerprint(),
        deduped=True,
        ranked=True,
    )
    return Selection(**{**defaults, **overrides})


def test_the_chosen_facts_arrive_verbatim_and_the_others_do_not():
    """The whole point of the boundary. Run 4a56545b chose 25 of 292 facts and
    the writer's context did not shrink, because it was handed the cut and the
    receipt for the cut in the same breath."""
    evidence = _evidence()
    packet = build_packet(_brief(), _work_order(), evidence, _selection(evidence))

    assert [fact.claim_id for fact in packet.facts] == ["c1", "c2"]
    assert packet.facts[0].text == "The taxi to the airport takes 45 minutes."
    assert packet.claim_ids() == {"c1", "c2"}
    # Nothing about the question that was asked, the question that was not
    # answered, or the fact that was not chosen.
    rendered = packet.model_dump_json()
    assert "c3" not in rendered
    assert "r1" not in rendered


def test_a_fact_carries_its_qualification_even_when_that_makes_it_longer():
    """A compact packet that dropped the caveat is not a smaller packet, it is
    a wrong one. Relevance comes from the link, so length cannot decide it."""
    evidence = _evidence(notes=[CAVEAT])
    packet = build_packet(_brief(), _work_order(), evidence, _selection(evidence))

    notes = [note for note in packet.notes if note.kind == "source_note"]
    assert [note.text for note in notes] == [CAVEAT]
    assert notes[0].claim_ids == ["c1", "c2"]
    # s2's note bears only on the fact nobody chose, so it is the dossier's
    # business and stays there.
    assert all(note.note_id != "s2" for note in packet.notes)


def test_the_placeholder_note_is_not_a_limitation():
    """Run 95a74dce carried 55 of these. A packet that treats them as caveats
    has learned to pad, which is the failure this boundary exists to stop."""
    evidence = _evidence(notes=[PLACEHOLDER_SOURCE_NOTE, CAVEAT])
    packet = build_packet(_brief(), _work_order(), evidence, _selection(evidence))

    assert [note.text for note in packet.notes] == [CAVEAT]
    # The two projections may drift on everything else; not on this string.
    assert PACKET_PLACEHOLDER_NOTE == PLACEHOLDER_SOURCE_NOTE


def test_an_unsettled_conflict_about_a_chosen_fact_travels_with_it():
    """A conflict is not a spare fact to drop. If stating C1 safely depends on
    knowing two sources disagree, they travel together."""
    evidence = _evidence(
        conflicts=[
            EvidenceConflict(
                conflict_id="k1",
                claim_ids=["c1", "c3"],
                summary="Two sources give the taxi as 45 and 70 minutes.",
            )
        ]
    )
    packet = build_packet(_brief(), _work_order(), evidence, _selection(evidence))

    conflict = next(note for note in packet.notes if note.kind == "conflict")
    assert "45 and 70 minutes" in conflict.text
    assert "not settled" in conflict.text
    # Named against the chosen fact only. The unchosen half of the
    # disagreement is not smuggled back in as a note.
    assert conflict.claim_ids == ["c1"]


def test_a_conflict_between_two_unchosen_facts_stays_in_the_dossier():
    evidence = _evidence(
        conflicts=[
            EvidenceConflict(
                conflict_id="k1",
                claim_ids=["c3", "c2"],
                summary="A disagreement about the bus.",
                resolution="The later timetable is right.",
            )
        ]
    )
    selection = _selection(evidence, keep_count=1, texture_order=[], texture_reserve=0)
    packet = build_packet(_brief(), _work_order(), evidence, selection)

    assert packet.claim_ids() == {"c1"}
    assert packet.notes == []


def test_the_operators_own_note_reaches_the_writer():
    """The operator looked at the place. That outranks anything research said
    about it, and it is not a source note -- it has no source."""
    evidence = _evidence(venue_note="Booking page has been down since June.")
    packet = build_packet(_brief(), _work_order(), evidence, _selection(evidence))

    assert packet.facts[0].operator_note == "Booking page has been down since June."


def test_first_hand_material_is_copied_word_for_word():
    brief = _brief(
        material=[
            BriefMaterial(
                kind="firsthand",
                statement="I did this run at 5am in March and it took 25 minutes.",
                note="From the operator.",
            )
        ]
    )
    evidence = _evidence()
    packet = build_packet(brief, _work_order(), evidence, _selection(evidence))

    assert packet.supplied_material[0].statement == (
        "I did this run at 5am in March and it took 25 minutes."
    )


def test_roles_come_from_the_selection_and_colour_is_known_without_them():
    evidence = _evidence()
    packet = build_packet(
        _brief(),
        _work_order(),
        evidence,
        _selection(evidence, roles={"c1": "practical"}),
    )

    roles = {fact.claim_id: fact.role for fact in packet.facts}
    assert roles == {"c1": "practical", "c2": "texture"}


def test_an_operators_rescue_keeps_its_place_in_the_ranking():
    """Where the ranker put a fact is still what the ranker thought. Rescuing
    it is a decision about the fact, not about the order."""
    evidence = _evidence()
    selection = _selection(
        evidence, keep_count=1, texture_order=[], texture_reserve=0, rescued=["c3"]
    )
    packet = build_packet(_brief(), _work_order(), evidence, selection)

    assert [fact.claim_id for fact in packet.facts] == ["c1", "c3"]


def test_moved_evidence_refuses_rather_than_writing_from_the_wrong_dossier():
    """The failure this fingerprint exists for: a question is re-asked, three
    claims are replaced, and the choice made before that is handed to the
    writer as if it had chosen what the dossier now contains."""
    evidence = _evidence()
    selection = _selection(evidence)
    moved = _evidence(text_of_c1="The taxi to the airport takes 70 minutes.")

    with pytest.raises(PacketRefused, match="research has changed"):
        build_packet(_brief(), _work_order(), moved, selection)


def test_applying_a_selection_does_not_move_the_evidence_fingerprint():
    """Otherwise every selection would be stale the moment it was applied.
    `apply_selection` writes flags and extends links; it changes no fact."""
    evidence = _evidence()
    selection = _selection(evidence)
    applied = apply_selection(evidence, selection)

    assert applied.content_fingerprint() == evidence.content_fingerprint()
    build_packet(_brief(), _work_order(), applied, selection)


def test_a_selection_made_against_another_brief_refuses():
    evidence = _evidence()
    selection = _selection(evidence, brief_fingerprint="bf-2")

    with pytest.raises(PacketRefused, match="different brief"):
        build_packet(_brief(), _work_order(), evidence, selection)


def test_a_selection_made_against_another_work_order_refuses():
    evidence = _evidence()
    selection = _selection(evidence, work_order_fingerprint="wo-2")

    with pytest.raises(PacketRefused, match="different work order"):
        build_packet(_brief(), _work_order(), evidence, selection)


def test_a_fact_that_no_longer_exists_refuses_instead_of_being_skipped():
    """Writing from what is left hands the operator an article they did not
    pick, and does it silently."""
    evidence = _evidence()
    selection = _selection(
        evidence, order=["c1", "c9"], keep_count=2, texture_order=[], texture_reserve=0
    )
    selection.evidence_fingerprint = ""

    with pytest.raises(PacketRefused, match="not in the research"):
        build_packet(_brief(), _work_order(), evidence, selection)


def test_a_merged_away_fact_cannot_be_selected():
    evidence = _evidence()
    selection = _selection(evidence, merged={"c2": "c1"})
    applied = apply_selection(evidence, selection)
    # Force the state the contract normally prevents: the selection still
    # names a claim that deduplication has since stood down.
    selection.merged = {}
    selection.dropped = []

    with pytest.raises(PacketRefused, match="merged into others"):
        build_packet(_brief(), _work_order(), applied, selection)


def test_an_empty_selection_is_not_permission_to_use_everything():
    """The most important refusal in the module. A packet builder that fell
    back to the whole dossier here would restore the original density in the
    one case nobody is watching."""
    evidence = _evidence()
    selection = _selection(evidence, order=[], keep_count=0, texture_order=[])

    with pytest.raises(PacketRefused, match="nothing to write from"):
        build_packet(_brief(), _work_order(), evidence, selection)


def test_the_receipt_says_what_reached_the_writer():
    evidence = _evidence(notes=[CAVEAT])
    packet = build_packet(_brief(), _work_order(), evidence, _selection(evidence))
    receipt = packet.receipt()

    assert receipt["policy_version"] == PACKET_POLICY_VERSION
    assert receipt["claim_ids"] == ["c1", "c2"]
    assert receipt["fact_count"] == 2
    assert receipt["note_count"] == 1
    assert receipt["evidence_fingerprint"] == evidence.content_fingerprint()
    assert receipt["selection_fingerprint"] == selection_fingerprint(
        _selection(evidence)
    )


def test_the_same_selection_builds_the_same_packet_twice():
    """A frozen input has to mean the same thing when it thaws, or a resumed
    run is a different article."""
    evidence = _evidence(notes=[CAVEAT])
    first = build_packet(_brief(), _work_order(), evidence, _selection(evidence))
    second = build_packet(_brief(), _work_order(), evidence, _selection(evidence))

    assert first.model_dump() == second.model_dump()


def test_a_selection_without_bindings_can_still_be_checked_for_ids():
    """Every selection stored before bindings existed has empty fingerprints.
    They cannot be checked for staleness, and they are not treated as matching
    -- the id and provenance checks below them still run."""
    evidence = _evidence()
    selection = _selection(
        evidence,
        brief_fingerprint="",
        work_order_fingerprint="",
        evidence_fingerprint="",
    )

    packet = build_packet(_brief(), _work_order(), evidence, selection)
    assert packet.claim_ids() == {"c1", "c2"}
    assert packet.evidence_fingerprint == evidence.content_fingerprint()
