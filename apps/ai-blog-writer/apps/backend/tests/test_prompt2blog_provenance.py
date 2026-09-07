"""Improvement 02: where a passage of the finished article came from.

The feature is a finding aid, and the tests that matter are the ones that stop
it becoming something else. A link says a passage and a chosen fact share a
figure or a distinctive phrase. It does not say the sentence means what the
fact means, and the moment anything in this map can be read as "checked", the
map is worse than not having one.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.provenance import (
    Confirmation,
    ConfirmationRecord,
    PacketNotStored,
    build_provenance,
    frozen_packet,
    prune_confirmations,
    segment_passages,
)

ARTICLE = """Lima is worth two extra nights.

## Where to eat

Market ceviche runs about $8, well under the tasting menus at $95. I waited
45 minutes on my visit, which is normal at lunch.

The choice is easy once you know the price gap.

## Getting there

The transfer costs $30 and takes 40 minutes in traffic."""

PACKET: dict[str, Any] = {
    "facts": [
        {
            "claim_id": "c1",
            "text": "Stall ceviche in Surquillo market is priced around $8.",
            "as_of": "2026-08-01",
            "confidence": "high",
            "role": "backbone",
        },
        {
            "claim_id": "c2",
            "text": "Tasting menus in Miraflores run to $95.",
            "confidence": "medium",
            "role": "practical",
        },
        {
            "claim_id": "c3",
            "text": "Surquillo market opens at 07:00 on weekdays.",
            "confidence": "high",
            "role": "practical",
        },
    ],
    "notes": [
        {
            "note_id": "n1",
            "kind": "source_note",
            "text": "Price surveyed in August 2026; stalls vary.",
            "claim_ids": ["c1"],
        }
    ],
    "supplied_material": [
        {"kind": "firsthand", "statement": "I waited 45 minutes on my visit"}
    ],
}


def _report(markdown: str = ARTICLE, packet: dict[str, Any] | None = None, **kwargs):
    return build_provenance("r1", markdown, packet or PACKET, **kwargs)


def _passage(report, passage_id: str):
    return next(p for p in report.passages if p.passage_id == passage_id)


def _links(report, passage_id: str) -> dict[str, Any]:
    return {link.source_id: link for link in _passage(report, passage_id).links}


# ---------------------------------------------------------------------------
# Passages
# ---------------------------------------------------------------------------


def test_a_passage_address_says_which_section_it_belongs_to():
    passages = segment_passages(ARTICLE)
    assert [p.passage_id for p in passages] == ["s0.p0", "s1.p0", "s1.p1", "s2.p0"]
    assert _by_id(passages, "s1.p0").heading == "Where to eat"


def _by_id(passages, passage_id):
    return next(p for p in passages if p.passage_id == passage_id)


def test_the_opening_block_is_addressable_like_everything_else():
    passages = segment_passages(ARTICLE)
    assert _by_id(passages, "s0.p0").text == "Lima is worth two extra nights."
    assert _by_id(passages, "s0.p0").section_id == "s0"


def test_two_identical_paragraphs_under_different_headings_do_not_collide():
    """Positional ids under the section's, so a repeated line stays two things."""
    passages = segment_passages("## One\n\nSame line.\n\n## Two\n\nSame line.")
    ids = [p.passage_id for p in passages if p.text == "Same line."]
    assert len(ids) == 2 and len(set(ids)) == 2


def test_editing_one_passage_does_not_change_another_passages_identity():
    """What makes a confirmation survive an unrelated edit.

    If every hash moved when any paragraph did, a person's review of the price
    would be thrown away by a typo fix three sections later.
    """
    before = {p.passage_id: p.text_hash for p in segment_passages(ARTICLE)}
    edited = ARTICLE.replace("The choice is easy", "The choice is simple")
    after = {p.passage_id: p.text_hash for p in segment_passages(edited)}

    assert before["s1.p1"] != after["s1.p1"]
    assert before["s1.p0"] == after["s1.p0"]
    assert before["s2.p0"] == after["s2.p0"]


# ---------------------------------------------------------------------------
# What counts as a shared figure
# ---------------------------------------------------------------------------


def test_a_price_links_the_passage_to_the_fact_that_states_it():
    links = _links(_report(), "s1.p0")
    assert links["c1"].basis == "figure"
    assert links["c1"].shared == ["$8"]


def test_a_small_price_is_not_filtered_as_a_small_number():
    """The first thing this got wrong.

    Bare "8" between a paragraph and a fact is a coincidence. "$8" is the price
    the passage turns on, and dropping it because eight is a small number left
    the one link an operator actually wanted unmade.
    """
    report = _report(
        "## Cost\n\nIt costs $8.",
        {"facts": [{"claim_id": "c1", "text": "It is priced at $8.", "confidence": "high"}]},
    )
    assert [link.source_id for link in _passage(report, "s1.p0").links] == ["c1"]


def test_a_bare_small_number_is_not_evidence_of_anything():
    report = _report(
        "## Cost\n\nThere are 3 of them.",
        {"facts": [{"claim_id": "c1", "text": "3 unrelated things exist.", "confidence": "high"}]},
    )
    assert _passage(report, "s1.p0").links == []


def test_a_duration_is_not_truncated_to_its_first_letter():
    """`m` written before `minutes` in an ordered alternation matches the "m".

    The figure then reads "45 m", which collides with 45 metres and looks like
    a bug to anybody shown it.
    """
    report = _report()
    assert _links(_report(), "s1.p0")["m0"].shared == ["45 minutes"]
    assert all(
        "45 m" not in figure or figure == "45 minutes"
        for passage in report.passages
        for link in passage.links
        for figure in link.shared
    )


def test_a_fact_with_no_figure_links_by_distinctive_wording():
    report = _report(
        "## Market\n\nSurquillo market opens early on weekdays, before the crowds.",
        {
            "facts": [
                {
                    "claim_id": "c3",
                    "text": "Surquillo market opens at 07:00 on weekdays.",
                    "confidence": "high",
                }
            ]
        },
    )
    link = _passage(report, "s1.p0").links[0]
    assert link.basis == "phrase"
    assert "surquillo market opens" in link.shared


# ---------------------------------------------------------------------------
# What travels with a link
# ---------------------------------------------------------------------------


def test_the_date_and_the_caveat_come_with_the_fact():
    """The whole point: the answer without a trip to the dossier."""
    link = _links(_report(), "s1.p0")["c1"]
    assert link.as_of == "2026-08-01"
    assert link.confidence == "high"
    assert link.caveats == ["Price surveyed in August 2026; stalls vary."]


def test_the_operators_own_words_count_as_provenance():
    """A sentence resting on supplied experience is not unsourced.

    Reporting it as unsourced is the exact mistake the grounding checker used
    to make, which is what finding 01 was about.
    """
    link = _links(_report(), "s1.p0")["m0"]
    assert link.source_kind == "material"
    assert link.text == "I waited 45 minutes on my visit"


def test_every_candidate_is_offered_rather_than_a_winner_chosen():
    """Picking one would be an opinion about which fact a sentence rests on.

    That judgement is the one thing this module is not entitled to make. An
    operator looking at three candidates can see that there are three.
    """
    assert set(_links(_report(), "s1.p0")) == {"c1", "c2", "m0"}


def test_a_shared_figure_is_offered_before_shared_wording():
    report = _report(
        "## Market\n\nSurquillo market opens at 07:00, and the market is calm then.",
        {
            "facts": [
                {"claim_id": "c3", "text": "Surquillo market opens at 07:00.", "confidence": "high"},
                {"claim_id": "c4", "text": "Surquillo market opens onto a quiet street.", "confidence": "low"},
            ]
        },
    )
    assert [link.basis for link in _passage(report, "s1.p0").links] == [
        "figure",
        "phrase",
    ]


# ---------------------------------------------------------------------------
# The signal worth having
# ---------------------------------------------------------------------------


def test_a_figure_matching_nothing_on_the_desk_is_named():
    """Either a fact stated differently from its record, or one from nowhere.

    The most useful thing this map produces, and the reason it is worth
    computing at all.
    """
    assert _passage(_report(), "s2.p0").unmatched_figures == ["$30", "40 minutes"]


def test_a_passage_with_no_figures_reports_none_missing():
    assert _passage(_report(), "s1.p1").unmatched_figures == []


# ---------------------------------------------------------------------------
# Nothing here is a check
# ---------------------------------------------------------------------------


def test_every_automatic_link_is_provisional():
    report = _report()
    assert {
        link.status for passage in report.passages for link in passage.links
    } == {"provisional"}


def test_the_summary_says_what_it_is_not():
    summary = _report().summary
    assert "not a check" in summary["means"]
    assert "not a measure of how much of the article is true" in summary["means"]


def test_no_count_is_named_with_verification_vocabulary():
    """A number labelled "verified" is read as verified by the third person.

    The count names are what a UI renders as labels, so the vocabulary is
    refused there rather than left to whoever builds the screen. `means` is
    exempt because its whole job is to use those words in a sentence that
    denies them.
    """
    summary = _report().summary
    keys = " ".join(summary).casefold()
    for banned in ("verified", "grounded", "checked", "accuracy", "correct"):
        assert banned not in keys


def test_passages_with_no_link_are_counted_and_excused():
    summary = _report().summary
    assert summary["passages_with_no_link"] == 3
    assert "judgement, transition, or general background" in summary["means"]


# ---------------------------------------------------------------------------
# Confirmations, and losing them
# ---------------------------------------------------------------------------


def _confirmation(markdown: str, passage_id: str, source_id: str) -> dict[str, Any]:
    passage = _by_id(segment_passages(markdown), passage_id)
    return ConfirmationRecord(
        confirmations=[
            Confirmation(
                passage_hash=passage.text_hash,
                source_kind="claim",
                source_id=source_id,
                reviewer="alan",
                confirmed_at="2026-09-07T00:00:00+00:00",
            )
        ]
    ).model_dump(mode="json")


def test_a_person_is_the_only_thing_that_confirms_a_link():
    report = _report(confirmations=_confirmation(ARTICLE, "s1.p0", "c1"))
    links = _links(report, "s1.p0")
    assert links["c1"].status == "confirmed"
    # And only the one they read. A confirmation is about one pairing.
    assert links["c2"].status == "provisional"


def test_editing_the_passage_drops_the_confirmation():
    """A deletion, not a flag.

    A confirmation kept beside changed prose is worse than none: it is the one
    thing on the screen that says somebody checked.
    """
    stored = _confirmation(ARTICLE, "s1.p0", "c1")
    edited = ARTICLE.replace("about $8", "about $9")

    kept = prune_confirmations(stored, edited)

    assert kept.confirmations == []


def test_editing_a_different_passage_keeps_the_confirmation():
    stored = _confirmation(ARTICLE, "s1.p0", "c1")
    edited = ARTICLE.replace("The choice is easy", "The choice is simple")

    kept = prune_confirmations(stored, edited)

    assert len(kept.confirmations) == 1


def test_a_confirmation_for_a_passage_that_no_longer_exists_is_dropped():
    stored = _confirmation(ARTICLE, "s2.p0", "c1")
    shortened = ARTICLE.split("## Getting there")[0]

    assert prune_confirmations(stored, shortened).confirmations == []


# ---------------------------------------------------------------------------
# A run with no packet has no map
# ---------------------------------------------------------------------------


def test_a_run_that_never_recorded_its_packet_refuses_rather_than_rebuilds(
    isolated_db, monkeypatch
):
    """Every run from before this shipped is in that position.

    Rebuilding a packet from the selection would produce a different one
    whenever the operator has since changed their mind -- which is precisely
    when somebody asks where a sentence came from. A refusal is honest; a
    plausible wrong map would be read as an answer.
    """
    from app.core import write_stage_result

    write_stage_result("r-old", "pipeline_input_v3", {"data": {"packet_receipt": {}}})
    with pytest.raises(PacketNotStored):
        frozen_packet("r-old")


def test_a_run_that_recorded_its_packet_hands_it_back(isolated_db):
    from app.core import write_stage_result

    write_stage_result("r-new", "pipeline_input_v3", {"data": {"packet": PACKET}})
    assert frozen_packet("r-new")["facts"][0]["claim_id"] == "c1"


# ---------------------------------------------------------------------------
# The routes
# ---------------------------------------------------------------------------


def _seed_run(run_id: str, markdown: str = ARTICLE, packet=PACKET) -> None:
    from app.core import write_artifact, write_stage_result, write_status

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": "2026-09-07T00:00:00Z",
        },
        feature="prompt2blog",
    )
    write_artifact(run_id, {"markdown": markdown, "pipeline_v3": {"run_id": run_id}})
    if packet is not None:
        write_stage_result(run_id, "pipeline_input_v3", {"data": {"packet": packet}})


def test_the_route_returns_the_map_for_a_finished_run(isolated_db):
    from app.features.prompt2blog.api import runs as runs_api
    from tests.prompt2blog_test_support import response_payload

    _seed_run("r-route")
    payload = response_payload(runs_api.get_provenance("r-route"))

    assert payload["run_id"] == "r-route"
    assert [p["passage_id"] for p in payload["passages"]][:2] == ["s0.p0", "s1.p0"]
    assert payload["summary"]["passages"] == 4


def test_an_older_run_is_refused_with_a_reason_rather_than_a_404(isolated_db):
    """409, because the run and the article both exist.

    A 404 would read as "no such run" and send somebody looking for the wrong
    problem.
    """
    from fastapi import HTTPException

    from app.features.prompt2blog.api import runs as runs_api

    _seed_run("r-older", packet=None)
    with pytest.raises(HTTPException) as raised:
        runs_api.get_provenance("r-older")

    assert raised.value.status_code == 409
    assert "did not record the packet" in raised.value.detail


def test_confirming_a_passage_that_has_since_changed_is_refused(isolated_db):
    """The check that keeps a confirmation about the text somebody read."""
    from fastapi import HTTPException

    from app.features.prompt2blog.api import runs as runs_api

    _seed_run("r-stale")
    with pytest.raises(HTTPException) as raised:
        runs_api.confirm_provenance(
            "r-stale",
            Confirmation(
                passage_hash="deadbeefcafe", source_kind="claim", source_id="c1"
            ),
            staff_id="alan",
        )

    assert raised.value.status_code == 409
    assert "edited since you read it" in raised.value.detail


def test_a_confirmation_is_recorded_and_then_shows_on_the_map(isolated_db):
    from app.features.prompt2blog.api import runs as runs_api
    from tests.prompt2blog_test_support import response_payload

    _seed_run("r-confirm")
    passage = _by_id(segment_passages(ARTICLE), "s1.p0")

    runs_api.confirm_provenance(
        "r-confirm",
        Confirmation(
            passage_hash=passage.text_hash, source_kind="claim", source_id="c1"
        ),
        staff_id="alan",
    )
    payload = response_payload(runs_api.get_provenance("r-confirm"))

    links = {
        link["source_id"]: link
        for entry in payload["passages"]
        if entry["passage_id"] == "s1.p0"
        for link in entry["links"]
    }
    assert links["c1"]["status"] == "confirmed"
    assert links["c2"]["status"] == "provisional"
    assert payload["summary"]["passages_with_a_confirmed_link"] == 1


def test_confirming_the_same_pairing_twice_leaves_one_record(isolated_db):
    from app.features.prompt2blog.api import runs as runs_api
    from tests.prompt2blog_test_support import response_payload

    _seed_run("r-twice")
    passage = _by_id(segment_passages(ARTICLE), "s1.p0")
    body = Confirmation(
        passage_hash=passage.text_hash, source_kind="claim", source_id="c1"
    )

    runs_api.confirm_provenance("r-twice", body, staff_id="alan")
    payload = response_payload(
        runs_api.confirm_provenance("r-twice", body, staff_id="alan")
    )

    assert len(payload["confirmations"]) == 1
    assert payload["confirmations"][0]["reviewer"] == "alan"
