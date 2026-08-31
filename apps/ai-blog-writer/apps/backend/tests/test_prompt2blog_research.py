"""Research plumbing, and the gate.

What these prove: two passes, the shape enforced, texture treated like anything
else, the gate blocking, and the grill as its exit.

What they do not prove, and cannot: whether the research is any good. That is a
question about real output from a real model against the real web, and a fake
returning canned text says nothing about it. The first real signal is the Lima
re-run. Do not read a green run here as "research works".
"""

from __future__ import annotations

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
from app.features.prompt2blog.coverage_v4 import assess_coverage
from app.features.prompt2blog.research_v4 import (
    GATHER_MODEL,
    ResearchDependencies,
    build_gather_prompt,
    build_structure_prompt,
    gather_research,
    research_stage_record,
    run_research,
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
        self.calls: list[tuple[str, str]] = []

    def __call__(self, prompt: str, model: str) -> tuple[str, list[str], int | None]:
        self.calls.append((prompt, model))
        return f"Notes for: {prompt[:40]}", ["https://example.pe/a"], 1_200


class StructureLLM:
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        self.kwargs: dict[str, Any] = {}

    def invoke_json(self, **kwargs) -> tuple[dict[str, Any], str]:
        self.kwargs = kwargs
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

    texture_prompt = deps.gather.calls[1][0]
    assert "Huaca Pucllana" in texture_prompt
    assert "with sources" in texture_prompt


def test_gathering_runs_on_the_model_the_grounding_path_actually_uses():
    deps = _deps()

    gather_research(_brief(), _work_order(), deps)

    assert {model for _prompt, model in deps.gather.calls} == {GATHER_MODEL}


def test_the_gather_prompt_asks_for_more_than_the_question():
    """"Guided circuits six days a week" and "a pre-Inca pyramid you can stand
    on at night" came from the same source. Only one survived."""
    prompt = build_gather_prompt(_brief(), _work_order().requirements[0])
    flat = " ".join(prompt.split())

    assert "Do not discard it because it was not the question." in flat
    assert "a reader would find interesting" in flat


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

    assert deps.structure_llm.kwargs["schema"]["required"] == [
        "sources",
        "claims",
        "requirements",
    ]
    assert deps.structure_llm.kwargs["temperature"] == 0.0


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

    evidence = structure_research(_work_order(), {}, _deps(payload))

    by_id = {item.requirement_id: item for item in evidence.requirements}
    assert by_id["r2"].claim_ids == ["c2"], "the link the claim asserted survives"


def test_the_reconciliation_works_from_the_question_side_too():
    payload = _evidence_payload()
    payload["claims"][1]["requirement_ids"] = []

    evidence = structure_research(_work_order(), {}, _deps(payload))

    by_id = {item.claim_id: item for item in evidence.claims}
    assert by_id["c2"].requirement_ids == ["r2"]


def test_questions_is_read_as_requirements():
    """The structure prompt says "question" throughout while the schema says
    `requirements`, and this model renamed exactly that list in the work order
    an hour before."""
    payload = _evidence_payload()
    payload["questions"] = payload.pop("requirements")

    evidence = structure_research(_work_order(), {}, _deps(payload))

    assert {item.requirement_id for item in evidence.requirements} == {"r1", "r2"}


def test_a_claim_citing_a_source_that_is_not_there_keeps_the_claim():
    payload = _evidence_payload()
    payload["claims"][0]["source_ids"] = ["s1", "s404"]

    evidence = structure_research(_work_order(), {}, _deps(payload))

    assert evidence.claims[0].source_ids == ["s1"]


def test_a_leftover_alias_key_is_not_carried_into_the_contract():
    """`extra="forbid"` makes a stray key fatal on its own, so reading an alias
    is only half the job -- the alias itself has to not survive."""
    payload = _evidence_payload()
    payload["questions"] = payload["requirements"]
    payload["claims"][0]["premise_ids"] = ["a1"]

    evidence = structure_research(_work_order(), {}, _deps(payload))

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

    evidence = structure_research(_work_order(), {}, _deps(payload))

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

    evidence = structure_research(_work_order(), {}, _deps(payload))

    assert [item.conflict_id for item in evidence.conflicts] == ["x2"]


def test_a_guessed_status_still_describes_its_gap():
    # The contract insists an unsettled question says what is missing, and a
    # status we had to fall back on is unsettled by definition.
    payload = _evidence_payload()
    payload["requirements"][0] = {"requirement_id": "r1", "status": "inconclusive"}

    evidence = structure_research(_work_order(), {}, _deps(payload))

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

    evidence = structure_research(_work_order(), {}, _deps(payload))

    assert evidence.sources[0].published_at == date(2026, 7, 14)
    assert evidence.sources[0].retrieved_at == date(2026, 8, 1)


def test_an_unreadable_date_is_dropped_rather_than_guessed():
    payload = _evidence_payload()
    payload["sources"][0]["published_at"] = "sometime last spring"

    evidence = structure_research(_work_order(), {}, _deps(payload))

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

    evidence = structure_research(_work_order(), {}, _deps(payload))

    assert evidence.sources[0].material_type == "other"
    assert evidence.sources[0].publisher == "Peru Retail"


def test_anything_still_called_web_really_does_have_a_link():
    # The guarantee the demotion exists to preserve.
    payload = _evidence_payload()

    evidence = structure_research(_work_order(), {}, _deps(payload))

    for source in evidence.sources:
        if source.material_type in {"web", "report"}:
            assert source.url and source.publisher


def test_a_claim_left_with_no_usable_source_is_dropped_not_fatal():
    """Filtering a dangling reference can empty a list the contract requires,
    so the repair would itself become the failure."""
    payload = _evidence_payload()
    payload["claims"][0]["source_ids"] = ["s404"]

    evidence = structure_research(_work_order(), {}, _deps(payload))

    assert [item.claim_id for item in evidence.claims] == ["c2"]


def test_a_question_that_loses_its_claims_stops_calling_itself_supported():
    payload = _evidence_payload()
    payload["claims"][0]["source_ids"] = ["s404"]

    evidence = structure_research(_work_order(), {}, _deps(payload))

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
        structure_research(_work_order(), {}, _deps(payload))

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
