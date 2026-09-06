"""Research plumbing, and the gate.

What these prove: two passes, the shape enforced, texture treated like anything
else, the gate blocking, and the grill as its exit.

What they do not prove, and cannot: whether the research is any good. That is a
question about real output from a real model against the real web, and a fake
returning canned text says nothing about it. The first real signal is the Lima
re-run. Do not read a green run here as "research works".
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import date
from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefReader,
    EvidenceClaim,
    EvidencePackage,
    EvidencePremiseFinding,
    EvidenceRequirement,
    EvidenceSource,
    Prompt2BlogWorkOrder,
    WorkOrderAssumption,
    WorkOrderReference,
    WorkOrderRequirement,
    WorkOrderScope,
)
from app.features.prompt2blog.config import P2B_V4_GATHER_CONCURRENCY
from app.features.prompt2blog.coverage_v4 import assess_coverage
from app.features.prompt2blog.research_v4 import (
    ResearchDependencies,
    build_gather_prompt,
    build_structure_prompt,
    gather_research,
    research_stage_record,
    run_research,
    STRUCTURE_BATCH_SIZE,
    GatheredNotes,
    assemble_evidence,
    structure_research,
)


def _brief() -> ArticleBrief:
    return ArticleBrief(
        brief_fingerprint="bf-1",
        seed="Lima is no longer simply the stopover",
        location="Lima, Peru",
        form_id="destination-guide",
        reader=BriefReader(primary_reader="layover traveller"),
        reader_question="Is Lima worth two extra nights?",
        outcome="book two extra nights",
        spine="food, cheap beats famous",
        must_name=["Surquillo market"],
        fails_if="reads like a tourist board",
    )


def _work_order(**overrides) -> Prompt2BlogWorkOrder:
    payload: dict[str, Any] = dict(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Lima",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Lima", role="primary_subject")],
        ),
        premise=[WorkOrderAssumption(assumption_id="a1", statement="Prices are published.")],
        requirements=[
            WorkOrderRequirement(
                requirement_id="r1",
                question="What do market stalls charge?",
                kind="load_bearing",
                assumption_ids=["a1"],
            ),
            WorkOrderRequirement(
                requirement_id="r2",
                question="What is Huaca Pucllana like after dark?",
                kind="texture",
            ),
        ],
    )
    payload.update(overrides)
    return Prompt2BlogWorkOrder(**payload)


class RecordingGather:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []

    def __call__(
        self, prompt: str, model: str | None = None
    ) -> tuple[str, list[str], int | None]:
        self.calls.append((prompt, model))
        return f"Notes for: {prompt[:40]}", ["https://example.pe/a"], 1_200


class StructureLLM:
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        self.kwargs: dict[str, Any] = {}
        # Every call, because structuring is one call per question now and the
        # last one is the premise pass rather than a question.
        self.calls: list[dict[str, Any]] = []

    def invoke_json(self, **kwargs) -> tuple[dict[str, Any], str]:
        self.kwargs = kwargs
        self.calls.append(kwargs)
        return self.payload, "{}"


def _evidence_payload(**overrides) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sources": [
            {
                "source_id": "s1",
                "title": "Market price survey",
                "publisher": "Peru Retail",
                "url": "https://example.pe/prices",
                "retrieved_at": "2026-08-01",
                "source_type": "reporting",
                "material_type": "web",
                "notes": ["Stall ceviche is far below the tasting menus."],
            }
        ],
        "claims": [
            {
                "claim_id": "c1",
                "text": "Market ceviche runs a fraction of the tasting-menu price.",
                "source_ids": ["s1"],
                "requirement_ids": ["r1"],
                "confidence": "high",
            },
            {
                "claim_id": "c2",
                "text": "The site is floodlit and open into the evening.",
                "source_ids": ["s1"],
                "requirement_ids": ["r2"],
                "confidence": "medium",
            },
        ],
        "requirements": [
            {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"]},
            {"requirement_id": "r2", "status": "supported", "claim_ids": ["c2"]},
        ],
        "premise_findings": [
            {
                "assumption_id": "a1",
                "verdict": "confirmed",
                "basis": "The survey publishes them.",
                "claim_ids": ["c1"],
            }
        ],
    }
    payload.update(overrides)
    return payload


def _deps(payload: dict[str, Any] | None = None) -> ResearchDependencies:
    return ResearchDependencies(
        gather=RecordingGather(),
        structure_llm=StructureLLM(payload or _evidence_payload()),
    )


# --- the two passes -------------------------------------------------------


def test_every_question_gets_its_own_grounded_pass():
    deps = _deps()

    notes = gather_research(_brief(), _work_order(), deps)

    assert set(notes) == {"r1", "r2"}
    assert len(deps.gather.calls) == 2


def test_texture_is_researched_like_anything_else():
    """A scene we cannot source is still cut, so it has to be sourced.

    The Lima dossier was excellent as verification and contained nothing anyone
    would enjoy. That was not a retrieval failure -- nobody asked.
    """
    deps = _deps()

    gather_research(_brief(), _work_order(), deps)

    # Found rather than indexed: the searches run concurrently, so which one
    # was recorded second is the network's business.
    texture_prompt = next(
        prompt for prompt, _model in deps.gather.calls if "Huaca Pucllana" in prompt
    )
    assert "with sources" in texture_prompt


def test_gathering_names_no_model_of_its_own():
    """The stage used to pin the grounding model here.

    It names the job `p2b.research_gather` instead, and which model that runs
    on is the gateway's answer -- so this asserts the absence of a pin rather
    than the presence of a particular name.
    """
    deps = _deps()

    gather_research(_brief(), _work_order(), deps)

    assert {model for _prompt, model in deps.gather.calls} == {None}


def test_the_gather_prompt_asks_for_more_than_the_question():
    """"Guided circuits six days a week" and "a pre-Inca pyramid you can stand
    on at night" came from the same source. Only one survived."""
    prompt = build_gather_prompt(_brief(), _work_order().requirements[0])
    flat = " ".join(prompt.split())

    assert "Do not discard it because it was not the question." in flat
    assert "a reader would find interesting" in flat


# --- the searches run together -------------------------------------------


def _wide_work_order(count: int) -> Prompt2BlogWorkOrder:
    """More questions than the concurrency bound, so the bound is observable."""
    return _work_order(
        requirements=[
            WorkOrderRequirement(
                requirement_id=f"r{index}",
                question=f"Question {index}?",
                kind="load_bearing",
            )
            for index in range(1, count + 1)
        ]
    )


def test_the_searches_actually_run_at_the_same_time():
    """The whole point of the change, and the only test that can prove it.

    Both gathers wait on a barrier that only opens when both have arrived. Run
    sequentially the first one waits alone and the barrier times out, so this
    fails loudly rather than silently passing on a fast machine.
    """
    barrier = threading.Barrier(2, timeout=10)

    def _gather(_prompt: str, _model: str):
        barrier.wait()
        return "notes", [], 10

    notes = gather_research(
        _brief(),
        _work_order(),
        ResearchDependencies(gather=_gather, structure_llm=object()),
    )

    # The text, not the keys. A timed-out barrier raises inside the worker,
    # `_gather_one` turns that into an empty hole, and the keys are present
    # either way -- so asserting on the keys alone would pass sequentially.
    assert notes["r1"].text == "notes"
    assert notes["r2"].text == "notes"


def test_no_more_searches_run_at_once_than_the_bound_allows():
    """Grounded-search rate limits are unknown, so the fan-out is bounded."""
    lock = threading.Lock()
    live = 0
    peak = 0

    def _gather(_prompt: str, _model: str):
        nonlocal live, peak
        with lock:
            live += 1
            peak = max(peak, live)
        time.sleep(0.02)
        with lock:
            live -= 1
        return "notes", [], 10

    gather_research(
        _brief(),
        _wide_work_order(P2B_V4_GATHER_CONCURRENCY + 4),
        ResearchDependencies(gather=_gather, structure_llm=object()),
    )

    assert peak <= P2B_V4_GATHER_CONCURRENCY
    # And it really did fan out, rather than passing by staying sequential.
    assert peak > 1


def test_the_notes_keep_work_order_order_whatever_the_network_does():
    """The structure prompt is built from these notes.

    Ordering them by whichever search returned first would make the prompt --
    and so the dossier, and so any diff between two runs -- depend on the
    weather.
    """
    def _gather(prompt: str, _model: str):
        # The last question comes back first.
        if "Question 3" in prompt:
            return "third", [], 10
        time.sleep(0.05)
        return "other", [], 10

    notes = gather_research(
        _brief(),
        _wide_work_order(3),
        ResearchDependencies(gather=_gather, structure_llm=object()),
    )

    assert list(notes) == ["r1", "r2", "r3"]


def test_one_search_failing_does_not_take_the_others_down_with_it():
    """Concurrency must not turn one hole into a dead run."""
    def _gather(prompt: str, _model: str):
        if "Question 2" in prompt:
            raise RuntimeError("no network")
        return "notes", [], 10

    notes = gather_research(
        _brief(),
        _wide_work_order(3),
        ResearchDependencies(gather=_gather, structure_llm=object()),
    )

    assert notes["r2"].text == ""
    assert notes["r1"].text == "notes"
    assert notes["r3"].text == "notes"


def test_a_failed_gather_leaves_a_hole_rather_than_killing_the_run():
    def _explode(_prompt: str, _model: str):
        raise RuntimeError("no network")

    notes = gather_research(
        _brief(),
        _work_order(),
        ResearchDependencies(gather=_explode, structure_llm=StructureLLM({})),
    )

    assert notes["r1"].text == ""
    # The coverage gate is what turns this into a stop, so that one decision
    # lives in one place.


def test_structuring_forces_the_shape_rather_than_asking_for_it():
    deps = _deps()

    run_research(_brief(), _work_order(), deps)

    question_call, premise_call = deps.structure_llm.calls[0], deps.structure_llm.calls[-1]
    assert question_call["schema"]["required"] == ["sources", "claims", "requirements"]
    # The pass that settles the premise and any cross-question conflict has
    # its shape forced too.
    assert premise_call["schema"]["required"] == ["premise_findings"]
    assert question_call["temperature"] == 0.0
    assert premise_call["temperature"] == 0.0


def test_the_structured_package_is_bound_to_the_work_order_it_answers():
    evidence, _notes = run_research(_brief(), _work_order(), _deps())

    assert evidence.work_order_fingerprint == "wo-1"
    assert evidence.schema_version == 4


def test_the_structure_prompt_forbids_inventing_and_keeps_detail():
    notes = gather_research(_brief(), _work_order(), _deps())
    flat = " ".join(build_structure_prompt(_work_order(), notes).split())

    assert "Add nothing that is not in the notes." in flat
    assert "do not drop it for not being a number" in flat
    assert "different from not having looked" in flat


# --- taking the dossier the model actually sends ---------------------------


def test_a_one_sided_claim_link_is_reconciled_rather_than_refused():
    """The contract requires the claim-to-question and question-to-claim links
    to agree exactly, in both directions.

    That is a consistency property, not information: a model that says c2
    answers r2, while r2 forgets to list c2, has stated the same fact once.
    Refusing the whole dossier over it throws away everything research paid
    for.
    """
    payload = _evidence_payload()
    payload["requirements"] = [
        {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"]},
        {"requirement_id": "r2", "status": "supported", "claim_ids": []},
    ]

    evidence = assemble_evidence(_work_order(), payload)

    by_id = {item.requirement_id: item for item in evidence.requirements}
    assert by_id["r2"].claim_ids == ["c2"], "the link the claim asserted survives"


def test_the_reconciliation_works_from_the_question_side_too():
    payload = _evidence_payload()
    payload["claims"][1]["requirement_ids"] = []

    evidence = assemble_evidence(_work_order(), payload)

    by_id = {item.claim_id: item for item in evidence.claims}
    assert by_id["c2"].requirement_ids == ["r2"]


def test_questions_is_read_as_requirements():
    """The structure prompt says "question" throughout while the schema says
    `requirements`, and this model renamed exactly that list in the work order
    an hour before."""
    payload = _evidence_payload()
    payload["questions"] = payload.pop("requirements")

    evidence = assemble_evidence(_work_order(), payload)

    assert {item.requirement_id for item in evidence.requirements} == {"r1", "r2"}


def test_a_claim_citing_a_source_that_is_not_there_keeps_the_claim():
    payload = _evidence_payload()
    payload["claims"][0]["source_ids"] = ["s1", "s404"]

    evidence = assemble_evidence(_work_order(), payload)

    assert evidence.claims[0].source_ids == ["s1"]


def test_a_leftover_alias_key_is_not_carried_into_the_contract():
    """`extra="forbid"` makes a stray key fatal on its own, so reading an alias
    is only half the job -- the alias itself has to not survive."""
    payload = _evidence_payload()
    payload["questions"] = payload["requirements"]
    payload["claims"][0]["premise_ids"] = ["a1"]

    evidence = assemble_evidence(_work_order(), payload)

    assert len(evidence.requirements) == 2


def test_an_invented_source_vocabulary_falls_back_rather_than_failing():
    """Run 90b3f9bc (2026-08-30 21:37Z): all ten sources came back as
    `research_notes` / `synthesized_research_note`.

    One invented vocabulary, applied consistently, because the schema declared
    plain strings and the prompt listed no values. Both vocabularies carry an
    "other" member, which is what makes this survivable.
    """
    payload = _evidence_payload()
    payload["sources"][0]["source_type"] = "research_notes"
    payload["sources"][0]["material_type"] = "synthesized_research_note"

    evidence = assemble_evidence(_work_order(), payload)

    assert evidence.sources[0].source_type == "other"
    assert evidence.sources[0].material_type == "other"


def test_the_vocabularies_travel_in_the_schema():
    from typing import get_args

    from app.features.prompt2blog.contracts_v4 import EvidenceSourceType
    from app.features.prompt2blog.research_v4 import EVIDENCE_SCHEMA

    source = EVIDENCE_SCHEMA["properties"]["sources"]["items"]["properties"]
    assert source["source_type"]["enum"] == list(get_args(EvidenceSourceType))


def test_a_conflict_that_names_no_claims_is_dropped_not_fatal():
    """Eleven arrived at once, none pointing at a real claim.

    Two claims are what makes a conflict a conflict. One that nothing can point
    at is unusable downstream; dropping it costs a note, refusing it costs ten
    web searches.
    """
    payload = _evidence_payload()
    payload["conflicts"] = [
        {"conflict_id": "x1", "claim_ids": [], "summary": "Sources disagree."},
        {"conflict_id": "x2", "claim_ids": ["c1", "c2"], "summary": "These two do."},
    ]

    evidence = assemble_evidence(_work_order(), payload)

    assert [item.conflict_id for item in evidence.conflicts] == ["x2"]


def test_a_guessed_status_still_describes_its_gap():
    # The contract insists an unsettled question says what is missing, and a
    # status we had to fall back on is unsettled by definition.
    payload = _evidence_payload()
    payload["requirements"][0] = {"requirement_id": "r1", "status": "inconclusive"}

    evidence = assemble_evidence(_work_order(), payload)

    by_id = {item.requirement_id: item for item in evidence.requirements}
    assert by_id["r1"].status == "partial"
    assert by_id["r1"].gap


def test_a_timestamp_where_a_date_belongs_is_trimmed_not_fatal():
    """Run 90b3f9bc (2026-08-30 22:25Z) died on this, and on nothing else.

    One source out of thirteen carried a full ISO timestamp, and the time of
    day took down a dossier that cost ten web searches.
    """
    payload = _evidence_payload()
    payload["sources"][0]["published_at"] = "2026-07-14T09:30:00Z"
    payload["sources"][0]["retrieved_at"] = "2026-08-01 12:00:00"

    evidence = assemble_evidence(_work_order(), payload)

    assert evidence.sources[0].published_at == date(2026, 7, 14)
    assert evidence.sources[0].retrieved_at == date(2026, 8, 1)


def test_an_unreadable_date_is_dropped_rather_than_guessed():
    payload = _evidence_payload()
    payload["sources"][0]["published_at"] = "sometime last spring"

    evidence = assemble_evidence(_work_order(), payload)

    assert evidence.sources[0].published_at is None


def test_a_source_with_no_link_is_admitted_as_other_not_refused():
    """Run 90b3f9bc (2026-08-31 01:52Z): 49 of 54 sources had a publisher, a
    title, and no URL.

    Grounded search does not return per-source URLs -- it returns a dozen
    opaque redirect blobs per question, which nothing can honestly map onto
    "How to Peru". The model was right to leave the field empty, and the whole
    dossier was refused for it. `other` carries no URL requirement, so the
    source is admitted as what it actually is.
    """
    payload = _evidence_payload()
    payload["sources"][0]["url"] = None
    payload["sources"][0]["material_type"] = "web"

    evidence = assemble_evidence(_work_order(), payload)

    assert evidence.sources[0].material_type == "other"
    assert evidence.sources[0].publisher == "Peru Retail"


def test_anything_still_called_web_really_does_have_a_link():
    # The guarantee the demotion exists to preserve.
    payload = _evidence_payload()

    evidence = assemble_evidence(_work_order(), payload)

    for source in evidence.sources:
        if source.material_type in {"web", "report"}:
            assert source.url and source.publisher


def test_a_claim_left_with_no_usable_source_is_dropped_not_fatal():
    """Filtering a dangling reference can empty a list the contract requires,
    so the repair would itself become the failure."""
    payload = _evidence_payload()
    payload["claims"][0]["source_ids"] = ["s404"]

    evidence = assemble_evidence(_work_order(), payload)

    assert [item.claim_id for item in evidence.claims] == ["c2"]


def test_a_question_that_loses_its_claims_stops_calling_itself_supported():
    payload = _evidence_payload()
    payload["claims"][0]["source_ids"] = ["s404"]

    evidence = assemble_evidence(_work_order(), payload)

    by_id = {item.requirement_id: item for item in evidence.requirements}
    assert by_id["r1"].status == "partial"
    assert by_id["r1"].gap


def test_markup_urls_are_not_offered_as_sources():
    # Grounded search returns these alongside the real ones.
    from app.features.prompt2blog.research_v4 import _citable

    assert _citable(["http://www.w3.org/2000/svg", "https://example.pe/a"]) == [
        "https://example.pe/a"
    ]


def test_a_dossier_that_still_will_not_assemble_keeps_what_came_back():
    from app.features.prompt2blog.research_v4 import ResearchUnusable

    payload = _evidence_payload()
    payload["requirements"] = []

    with pytest.raises(ResearchUnusable) as error:
        assemble_evidence(_work_order(), payload)

    assert error.value.reason
    assert error.value.raw, "the payload has to travel with the failure"


def test_the_record_shows_what_research_cost_and_found():
    evidence, notes = run_research(_brief(), _work_order(), _deps())

    record = research_stage_record(evidence, notes)

    assert record["requirement_status"] == {"r1": "supported", "r2": "supported"}
    assert record["gathered"]["r1"]["tokens"] == 1_200
    assert record["gathered"]["r1"]["source_urls"] == ["https://example.pe/a"]


# --- the gate -------------------------------------------------------------


def _package(**overrides) -> EvidencePackage:
    payload = _evidence_payload()
    payload.update(overrides)
    payload["work_order_fingerprint"] = "wo-1"
    payload["schema_version"] = 4
    return EvidencePackage.model_validate(payload)


def test_a_complete_dossier_may_write():
    verdict = assess_coverage(_work_order(), _package())

    assert verdict.can_write is True
    assert verdict.reason == "ready_to_write"


def test_an_unanswered_load_bearing_question_stops_the_run():
    """Writing is the most expensive step, and writing well on thin material is
    not possible. This is the only gate in the pipeline that blocks."""
    thin = _package(
        requirements=[
            {"requirement_id": "r1", "status": "missing", "gap": "Nobody was asked."},
            {"requirement_id": "r2", "status": "supported", "claim_ids": ["c2"]},
        ],
        claims=[_evidence_payload()["claims"][1]],
        # The premise was confirmed by the claim that is now gone, so its
        # citation goes with it -- the contract checks both directions.
        premise_findings=[
            {
                "assumption_id": "a1",
                "verdict": "unverified",
                "basis": "The survey was not reached.",
                "claim_ids": [],
            }
        ],
    )

    verdict = assess_coverage(_work_order(), thin)

    assert verdict.can_write is False
    assert verdict.reason == "load_bearing_unanswered"
    assert verdict.unsupported_load_bearing == ["r1"]


def test_an_unpublished_answer_is_a_finding_not_a_blocker():
    """Nobody publishes Lima's customs processing minutes.

    Treating that as unanswered sent the operator back to look for a fact that
    does not exist, which is the loop v3 had no exit from.
    """
    established = _package(
        requirements=[
            {
                "requirement_id": "r1",
                "status": "unpublished",
                "claim_ids": ["c1"],
                "gap": "Checked the regulator and the operator.",
            },
            {"requirement_id": "r2", "status": "supported", "claim_ids": ["c2"]},
        ]
    )

    assert assess_coverage(_work_order(), established).can_write is True


def test_a_dossier_with_nothing_worth_reading_is_a_real_gap():
    """Every score v3 owned said the Lima article passed.

    It had no food in it, in one of the great food cities on earth. That is now
    a gap the run reports, exactly as it would a missing fact.
    """
    all_proof = _package(
        requirements=[
            {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"]},
            {"requirement_id": "r2", "status": "missing", "gap": "Not looked for."},
        ],
        claims=[_evidence_payload()["claims"][0]],
    )

    verdict = assess_coverage(_work_order(), all_proof)

    assert verdict.can_write is False
    assert verdict.reason == "nothing_worth_reading"
    assert "pleasure to read" in verdict.findings[0]


def test_a_work_order_with_no_texture_at_all_is_also_thin():
    # A plan that is all proof produces a dossier that is all proof. That is
    # what happened to Lima, and it happened at the planning step.
    proof_only = _work_order(
        requirements=[
            WorkOrderRequirement(
                requirement_id="r1",
                question="What do market stalls charge?",
                kind="load_bearing",
                assumption_ids=["a1"],
            )
        ]
    )
    evidence = _package(
        requirements=[{"requirement_id": "r1", "status": "supported", "claim_ids": ["c1"]}],
        claims=[_evidence_payload()["claims"][0]],
    )

    assert assess_coverage(proof_only, evidence).reason == "nothing_worth_reading"


def test_a_refuted_premise_outranks_everything_else():
    """More research cannot clear it, so saying "research again" would be a lie.

    This is the dead end that has had no door since the direction cards were
    deleted. The exit is the grill.
    """
    refuted = _package(
        premise_findings=[
            {
                "assumption_id": "a1",
                "verdict": "refuted",
                "basis": "Prices are not published anywhere.",
                "claim_ids": [],
            }
        ]
    )

    verdict = assess_coverage(_work_order(), refuted)

    assert verdict.can_write is False
    assert verdict.reason == "premise_refuted"
    assert "More research will not change that." in verdict.findings[0]


def test_the_verdict_record_says_what_a_page_has_to_show():
    verdict = assess_coverage(_work_order(), _package())

    assert set(verdict.as_record()) == {
        "can_write",
        "reason",
        "unsupported_load_bearing",
        "refuted_assumptions",
        "has_texture",
        "findings",
    }


# --- the shapes run 849ae5aa actually sent (2026-09-01) ---------------------
#
# One real run, four ways of losing a complete dossier. It came back with
# thirteen good claims and every one was thrown away.


def test_a_question_linking_its_claims_under_claims_still_links_them():
    """The one that cost the run.

    The model wrote `{"id": "q1", "claims": ["c1"], "status": "supported"}`.
    The field allowlist strips `claims` before the two-way union reads it, and
    the union reads the normalised dict rather than the raw row -- so every
    question arrived linked to nothing, every claim was dropped for answering
    nothing, and twelve answered questions reached the gate saying "its
    supporting claims could not be used".
    """
    payload = _evidence_payload()
    for row in payload["requirements"]:
        row["claims"] = row.pop("claim_ids")
    for claim in payload["claims"]:
        claim.pop("requirement_ids", None)

    evidence = assemble_evidence(_work_order(), payload)

    assert len(evidence.claims) == len(payload["claims"])
    by_id = {item.requirement_id: item for item in evidence.requirements}
    assert by_id["r1"].claim_ids
    assert by_id["r1"].status == "supported"


def test_sources_nested_inside_a_claim_are_lifted_out_and_kept():
    """The same run described its sources inside each claim -- publisher,
    source_type, material_type -- and sent no top-level `sources` at all."""
    payload = _evidence_payload()
    payload.pop("sources")
    for claim in payload["claims"]:
        claim["sources"] = [
            {
                "publisher": "Movimiento Peruano Sin Agua",
                "source_type": "official",
                "material_type": "web",
            }
        ]

    evidence = assemble_evidence(_work_order(), payload)

    assert evidence.sources, "a described source is still a source"
    assert len(evidence.claims) == len(payload["claims"])
    assert all(claim.source_ids for claim in evidence.claims)


def test_one_publisher_cited_by_every_claim_becomes_one_source():
    payload = _evidence_payload()
    payload.pop("sources")
    for claim in payload["claims"]:
        claim["sources"] = [{"publisher": "SENAMHI", "source_type": "official"}]

    evidence = assemble_evidence(_work_order(), payload)

    assert len(evidence.sources) == 1


def test_a_source_with_no_retrieval_date_is_dated_by_the_run_that_read_it():
    """Eleven sources, not one date, and the whole dossier refused over a field
    the parser was in a position to know: these pages were read today."""
    from datetime import date

    payload = _evidence_payload()
    for source in payload["sources"]:
        source["retrieved_at"] = ""

    evidence = assemble_evidence(_work_order(), payload)

    assert all(item.retrieved_at == date.today() for item in evidence.sources)


def test_a_source_with_no_note_says_so_rather_than_being_refused():
    """The contract wants a note on every source. Saying the record has none is
    honest; writing a sentence about the world would not be."""
    payload = _evidence_payload()
    for source in payload["sources"]:
        source["notes"] = []

    evidence = assemble_evidence(_work_order(), payload)

    assert all(item.notes for item in evidence.sources)
    assert "No note recorded" in evidence.sources[0].notes[0]



# --- one call per question -------------------------------------------------
#
# The dossier used to be built in a single call: every note in, the whole
# object out. On the Claude CLI that generated three to four times what it
# delivered -- 32,060 and 39,139 billed tokens against a 36 KB record -- and on
# 2026-09-02 it stopped converging, taking three attempts down at 600s, 600s
# and 1200s, on a plan smaller than the one that had worked the day before.


class PerQuestionLLM:
    """Answers whichever questions a batch asked about, and counts calls.

    A batch call gets records for every question in it, which is what the real
    model returns and what the merge downstream has to cope with.
    """

    def __init__(self, by_requirement: dict[str, dict[str, Any]]):
        self.by_requirement = by_requirement
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs):
        self.prompts.append(prompt)
        asked = [
            requirement_id
            for requirement_id in self.by_requirement
            if f"- {requirement_id} [" in prompt
        ]
        if not asked:
            return {"premise_findings": [], "conflicts": []}, "{}"
        merged: dict[str, Any] = {"sources": [], "claims": [], "requirements": []}
        for index, requirement_id in enumerate(asked):
            payload = self.by_requirement[requirement_id]
            for source in payload["sources"]:
                merged["sources"].append({**source, "source_id": f"s{index}"})
            for claim in payload["claims"]:
                merged["claims"].append(
                    {**claim, "claim_id": f"c{index}", "source_ids": [f"s{index}"]}
                )
            for item in payload["requirements"]:
                merged["requirements"].append({**item, "claim_ids": [f"c{index}"]})
        return merged, "{}"


def _one_question_payload(requirement_id: str, url: str) -> dict[str, Any]:
    return {
        "sources": [
            {
                "source_id": "s1",
                "title": "A page",
                "publisher": "Peru Retail",
                "url": url,
                "retrieved_at": "2026-09-01",
                "source_type": "reporting",
                "material_type": "web",
                "notes": ["Something."],
            }
        ],
        "claims": [
            {
                "claim_id": "c1",
                "text": f"Something established for {requirement_id}.",
                "source_ids": ["s1"],
                "requirement_ids": [requirement_id],
                "confidence": "high",
            }
        ],
        "requirements": [
            {
                "requirement_id": requirement_id,
                "status": "supported",
                "claim_ids": ["c1"],
            }
        ],
    }


def _per_question_deps(by_requirement):
    llm = PerQuestionLLM(by_requirement)
    return ResearchDependencies(gather=RecordingGather(), structure_llm=llm), llm


def _wide_work_order(count: int) -> Prompt2BlogWorkOrder:
    return _work_order(
        requirements=[
            WorkOrderRequirement(
                requirement_id=f"r{index}",
                question=f"Question {index}?",
                kind="load_bearing" if index == 1 else "texture",
            )
            for index in range(1, count + 1)
        ]
    )


def test_questions_are_structured_a_few_at_a_time():
    """Not one call, which stopped converging, and not one per question, which
    paid the CLI's 28,000 token per-call prefix twelve times over."""
    count = STRUCTURE_BATCH_SIZE * 2 + 1
    deps, llm = _per_question_deps(
        {
            f"r{index}": _one_question_payload(f"r{index}", f"https://example.pe/{index}")
            for index in range(1, count + 1)
        }
    )
    notes = {f"r{index}": GatheredNotes("Notes.") for index in range(1, count + 1)}

    structure_research(_wide_work_order(count), notes, deps)

    # Three batches over nine questions, plus the premise pass.
    assert len(llm.prompts) == 4


def test_the_premise_guard_speaks_once_a_run_not_once_a_batch(caplog):
    """The warning means "nobody checked your premises". It has to stay rare.

    Run 03c6702f logged it four times in a row, once per structuring batch,
    naming all eight declared assumptions each time -- on a run where the
    premise pass had simply not happened yet. A batch cannot carry a premise
    verdict, so judging one against the declared premises is a false alarm on
    every healthy run, and it made the one real case (95a74dce, a genuinely
    unanswered premise) indistinguishable from noise.
    """
    count = STRUCTURE_BATCH_SIZE * 2 + 1
    deps, _llm = _per_question_deps(
        {
            f"r{index}": _one_question_payload(f"r{index}", f"https://example.pe/{index}")
            for index in range(1, count + 1)
        }
    )
    notes = {f"r{index}": GatheredNotes("Notes.") for index in range(1, count + 1)}

    with caplog.at_level(logging.WARNING):
        evidence = structure_research(_wide_work_order(count), notes, deps)

    warnings = [
        record for record in caplog.records
        if "returned no premise verdict" in record.getMessage()
    ]
    # Three batches, and the fake premise pass answers nothing: still one.
    assert len(warnings) == 1
    # And the guard still did its job -- the declared premise has a verdict.
    assert [finding.verdict for finding in evidence.premise_findings] == ["unverified"]


def test_every_question_reaches_a_batch():
    count = STRUCTURE_BATCH_SIZE * 2 + 1
    deps, _llm = _per_question_deps(
        {
            f"r{index}": _one_question_payload(f"r{index}", f"https://example.pe/{index}")
            for index in range(1, count + 1)
        }
    )
    notes = {f"r{index}": GatheredNotes("Notes.") for index in range(1, count + 1)}

    evidence = structure_research(_wide_work_order(count), notes, deps)

    assert {item.requirement_id for item in evidence.requirements} == {
        f"r{index}" for index in range(1, count + 1)
    }


def test_two_batches_that_both_call_a_claim_c1_do_not_collide():
    """Answered in separate calls, both name their first claim `c1`."""
    deps, _llm = _per_question_deps(
        {
            "r1": _one_question_payload("r1", "https://example.pe/a"),
            "r2": _one_question_payload("r2", "https://example.pe/b"),
        }
    )
    notes = {"r1": GatheredNotes("Notes one."), "r2": GatheredNotes("Notes two.")}

    evidence = structure_research(_work_order(), notes, deps)

    assert len(evidence.claims) == 2
    assert len({claim.claim_id for claim in evidence.claims}) == 2


def test_the_same_page_answering_two_questions_is_listed_once():
    """A source described once per call is still one source. A dossier listing
    the same site under three ids is not wrong so much as unreadable."""
    shared = "https://example.pe/same"
    deps, _llm = _per_question_deps(
        {
            "r1": _one_question_payload("r1", shared),
            "r2": _one_question_payload("r2", shared + "/"),
        }
    )
    notes = {"r1": GatheredNotes("Notes one."), "r2": GatheredNotes("Notes two.")}

    evidence = structure_research(_work_order(), notes, deps)

    assert len(evidence.sources) == 1
    # Both claims still resolve to it, which the contract checks.
    assert {claim.source_ids[0] for claim in evidence.claims} == {
        evidence.sources[0].source_id
    }


def test_one_batch_failing_does_not_take_the_others_down():
    """The whole point of the split. One bad call used to be the run."""
    count = STRUCTURE_BATCH_SIZE * 2
    failing = f"r{count}"

    class HalfBrokenLLM(PerQuestionLLM):
        def invoke_json(self, *, prompt: str, **kwargs):
            if f"- {failing} [" in prompt:
                raise RuntimeError("Claude did not answer within 600s.")
            return super().invoke_json(prompt=prompt, **kwargs)

    llm = HalfBrokenLLM(
        {
            f"r{index}": _one_question_payload(f"r{index}", f"https://example.pe/{index}")
            for index in range(1, count + 1)
        }
    )
    deps = ResearchDependencies(gather=RecordingGather(), structure_llm=llm)
    notes = {f"r{index}": GatheredNotes("Notes.") for index in range(1, count + 1)}

    evidence = structure_research(_wide_work_order(count), notes, deps)

    by_id = {item.requirement_id: item for item in evidence.requirements}
    assert by_id["r1"].status == "supported"
    assert by_id[failing].status == "missing"
    assert "one call to retry" in by_id[failing].gap
    # The other batch is untouched, which is the property being bought here.
    assert by_id["r1"].claim_ids


def test_the_premise_pass_sees_the_claims_and_nothing_else():
    deps, llm = _per_question_deps(
        {"r1": _one_question_payload("r1", "https://example.pe/a")}
    )

    structure_research(_work_order(), {"r1": GatheredNotes("Notes one.")}, deps)

    premise_prompt = llm.prompts[-1]
    assert "WHAT RESEARCH ESTABLISHED" in premise_prompt
    assert "Something established for r1." in premise_prompt
    assert "Notes one." not in premise_prompt


# --- an extra answer is not a failed batch (run bogota-replan-0906) ---------


class OverAnsweringLLM:
    """Answers the batch it was asked about, and one question from elsewhere.

    Exactly what the real model does. Notes are gathered per search group and
    a batch is a slice of one, so the notes in front of the model cover
    questions this batch did not ask about, and it answers them too.
    """

    def __init__(self, extra_id: str):
        self.extra_id = extra_id
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs):
        self.prompts.append(prompt)
        asked = [
            requirement_id
            for requirement_id in (f"r{index}" for index in range(1, 20))
            if f"- {requirement_id} [" in prompt
        ]
        if not asked:
            return {"premise_findings": [], "conflicts": []}, "{}"
        merged: dict[str, Any] = {"sources": [], "claims": [], "requirements": []}
        for requirement_id in [*asked, self.extra_id]:
            payload = _one_question_payload(
                requirement_id, f"https://example.pe/{requirement_id}"
            )
            merged["sources"].append(
                {**payload["sources"][0], "source_id": f"s-{requirement_id}"}
            )
            merged["claims"].append(
                {
                    **payload["claims"][0],
                    "claim_id": f"c-{requirement_id}",
                    "source_ids": [f"s-{requirement_id}"],
                }
            )
            merged["requirements"].append(
                {**payload["requirements"][0], "claim_ids": [f"c-{requirement_id}"]}
            )
        return merged, "{}"


def test_one_extra_answer_does_not_bin_the_whole_batch():
    """Run bogota-replan-0906 died on this, twice in one run.

    The check was set equality. A batch asked about four rideshare questions,
    got all four right plus `req_rideshare_time_usaquen` from the same search
    group, and had all four recorded `missing` / `nothing_found`. Eight
    correct, already-paid-for answers thrown away, the gate blocked on them,
    and `suggested_move` told the operator "nothing relevant came back --
    answer it yourself, or drop it" about answers sitting in the notes.

    Retrying reproduced it exactly. Nothing about it was random, so nothing
    about it would ever have cleared on its own.
    """
    count = STRUCTURE_BATCH_SIZE + 1
    work_order = _wide_work_order(count)
    # The extra is a real question in the work order, from another batch.
    llm = OverAnsweringLLM(extra_id=f"r{count}")
    deps = ResearchDependencies(gather=RecordingGather(), structure_llm=llm)
    notes = {f"r{index}": GatheredNotes("Notes.") for index in range(1, count + 1)}

    evidence = structure_research(work_order, notes, deps)

    answered = {
        item.requirement_id: item.status for item in evidence.requirements
    }
    assert all(
        answered[f"r{index}"] == "supported" for index in range(1, count + 1)
    ), f"a correct batch was discarded over an extra answer: {answered}"


def test_a_batch_that_leaves_a_question_out_still_fails():
    """The check that matters is that everything asked for came back. Loosening
    set equality must not loosen that -- a question the model silently skipped
    is a real hole, and the operator meets it at the gate."""
    count = STRUCTURE_BATCH_SIZE
    work_order = _wide_work_order(count)

    class SkippingLLM:
        prompts: list[str] = []

        def invoke_json(self, *, prompt: str, **_kwargs):
            asked = [
                requirement_id
                for requirement_id in (f"r{index}" for index in range(1, count + 1))
                if f"- {requirement_id} [" in prompt
            ]
            if not asked:
                return {"premise_findings": [], "conflicts": []}, "{}"
            merged: dict[str, Any] = {"sources": [], "claims": [], "requirements": []}
            # Answers all but the last question it was asked about.
            for requirement_id in asked[:-1]:
                payload = _one_question_payload(
                    requirement_id, f"https://example.pe/{requirement_id}"
                )
                merged["sources"].append(
                    {**payload["sources"][0], "source_id": f"s-{requirement_id}"}
                )
                merged["claims"].append(
                    {
                        **payload["claims"][0],
                        "claim_id": f"c-{requirement_id}",
                        "source_ids": [f"s-{requirement_id}"],
                    }
                )
                merged["requirements"].append(
                    {**payload["requirements"][0], "claim_ids": [f"c-{requirement_id}"]}
                )
            return merged, "{}"

    deps = ResearchDependencies(gather=RecordingGather(), structure_llm=SkippingLLM())
    notes = {f"r{index}": GatheredNotes("Notes.") for index in range(1, count + 1)}

    evidence = structure_research(work_order, notes, deps)

    answered = {item.requirement_id: item.status for item in evidence.requirements}
    assert answered[f"r{count}"] == "missing"
