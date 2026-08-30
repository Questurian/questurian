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
