"""Settling a blocked run without re-buying the research.

Run 76b36468 (2026-08-31) was stopped by one co-op that does not publish its
price. Six of seven questions were answered, ten web searches were already
paid for, and the only exit was the grill, which discards all of it.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.features.prompt2blog.contracts_v4 import EvidencePackage
from app.features.prompt2blog.gate_v4 import (
    GateAnswerRefused,
    answer_requirement,
    mark_unpublished,
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
                "notes": ["Community founded; no price published."],
            }
        ],
        "claims": [
            {
                "claim_id": "c10",
                "text": "Moravia Tours was co-founded by community leaders.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
            },
            {
                "claim_id": "c20",
                "text": "Comuna 13 drew a documented visitor count.",
                "source_ids": ["s1"],
                "requirement_ids": ["q1"],
                "confidence": "high",
            },
            {
                "claim_id": "c30",
                "text": "The Morro is planted with guadua and flowering shrubs.",
                "source_ids": ["s1"],
                "requirement_ids": ["q5"],
                "confidence": "medium",
            },
        ],
        "requirements": [
            {
                "requirement_id": "q3",
                "status": "partial",
                "claim_ids": ["c10"],
                "gap": "No per-person price is published on its site.",
            },
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c20"]},
            {"requirement_id": "q5", "status": "supported", "claim_ids": ["c30"]},
        ],
    }
    payload.update(overrides)
    return EvidencePackage.model_validate(payload)


# --- the operator answers it ----------------------------------------------


def test_their_answer_settles_the_question():
    settled = answer_requirement(
        _evidence(),
        requirement_id="q3",
        answer="Moravia Tours charges COP 60,000 per person, quoted by WhatsApp.",
        today=date(2026, 8, 31),
    )

    requirement = next(r for r in settled.requirements if r.requirement_id == "q3")
    assert requirement.status == "supported"
    assert "opc-q3" in requirement.claim_ids
    # A supported requirement may not describe a gap.
    assert requirement.gap == ""


def test_the_record_says_the_answer_came_from_a_person():
    """Six months later, a wrong fact has to be traceable to whoever supplied
    it rather than blamed on research that never claimed it."""
    settled = answer_requirement(
        _evidence(), requirement_id="q3", answer="COP 60,000.", today=date(2026, 8, 31)
    )

    source = next(s for s in settled.sources if s.source_id == "op-q3")
    assert source.source_type == "firsthand"
    assert source.material_type == "first-person-notes"


def test_their_words_are_kept_exactly():
    answer = "They quote COP 60,000 per person, and only over WhatsApp."
    settled = answer_requirement(
        _evidence(), requirement_id="q3", answer=answer, today=date(2026, 8, 31)
    )

    claim = next(c for c in settled.claims if c.claim_id == "opc-q3")
    assert claim.text == answer


def test_an_operator_answer_is_never_recorded_as_high_confidence():
    """Nothing verified it. A confident label on an unchecked claim is what
    misleads the next person reading the record."""
    settled = answer_requirement(
        _evidence(), requirement_id="q3", answer="COP 60,000.", today=date(2026, 8, 31)
    )

    claim = next(c for c in settled.claims if c.claim_id == "opc-q3")
    assert claim.confidence != "high"


def test_a_url_they_supply_is_kept_but_is_not_called_a_web_source():
    """The rule for a web source is that the system retrieved it. It did not."""
    settled = answer_requirement(
        _evidence(),
        requirement_id="q3",
        answer="COP 60,000.",
        source_url="https://moraviatours.com/precios",
        today=date(2026, 8, 31),
    )

    source = next(s for s in settled.sources if s.source_id == "op-q3")
    assert str(source.url).startswith("https://moraviatours.com/precios")
    assert source.material_type == "first-person-notes"


def test_they_can_correct_their_own_answer_without_going_back_to_the_grill():
    once = answer_requirement(
        _evidence(), requirement_id="q3", answer="COP 60,000.", today=date(2026, 8, 31)
    )
    twice = answer_requirement(
        once, requirement_id="q3", answer="COP 70,000.", today=date(2026, 8, 31)
    )

    operator_claims = [c for c in twice.claims if c.claim_id == "opc-q3"]
    assert len(operator_claims) == 1
    assert operator_claims[0].text == "COP 70,000."


def test_an_empty_answer_is_refused():
    with pytest.raises(GateAnswerRefused, match="cannot be empty"):
        answer_requirement(_evidence(), requirement_id="q3", answer="   ")


def test_a_question_research_answered_cannot_be_overwritten_by_hand():
    """Whose answer is being replaced is the rule, not the status. Rewriting
    research by hand is how a dossier stops describing what was found."""
    with pytest.raises(GateAnswerRefused, match="already answered"):
        answer_requirement(_evidence(), requirement_id="q1", answer="Something else.")


def test_an_unknown_question_is_refused():
    with pytest.raises(GateAnswerRefused, match="No research question"):
        answer_requirement(_evidence(), requirement_id="q99", answer="Anything.")


# --- nobody publishes it ---------------------------------------------------


def test_unpublished_settles_it_and_keeps_what_was_found():
    """The absence is reportable because of what research did find. Dropping
    the claims would leave it merely asserted."""
    settled = mark_unpublished(
        _evidence(),
        requirement_id="q3",
        note="Moravia Tours takes bookings directly and posts no price.",
    )

    requirement = next(r for r in settled.requirements if r.requirement_id == "q3")
    assert requirement.status == "unpublished"
    assert requirement.claim_ids == ["c10"]
    assert "posts no price" in requirement.gap


def test_unpublished_needs_a_sentence_the_article_can_use():
    with pytest.raises(GateAnswerRefused, match="what was looked for"):
        mark_unpublished(_evidence(), requirement_id="q3", note="  ")


def test_the_gate_accepts_unpublished_as_answered():
    """The fourth verdict was added after a Lima run stalled on airport times
    no agency publishes. This is the check that it actually unblocks."""
    from app.features.prompt2blog.contracts_v4 import (
        Prompt2BlogWorkOrder,
        WorkOrderReference,
        WorkOrderRequirement,
        WorkOrderScope,
    )
    from app.features.prompt2blog.coverage_v4 import assess_coverage

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

    assert assess_coverage(work_order, _evidence()).can_write is False

    settled = mark_unpublished(
        _evidence(), requirement_id="q3", note="Not published anywhere."
    )
    assert assess_coverage(work_order, settled).can_write is True


# --- dropping the question altogether --------------------------------------


def _work_order(*requirements):
    from app.features.prompt2blog.contracts_v4 import (
        Prompt2BlogWorkOrder,
        WorkOrderReference,
        WorkOrderRequirement,
        WorkOrderScope,
    )

    return Prompt2BlogWorkOrder(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Medellin",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Medellin", role="primary_subject")],
        ),
        requirements=[WorkOrderRequirement(**r) for r in requirements],
    )


def _pair():
    # q1 is texture and answered, as a real work order's would be. Without one
    # the dossier has nothing a reader would enjoy and the gate blocks for
    # that instead, which is a different rule doing its own job.
    return _evidence(), _work_order(
        {"requirement_id": "q3", "question": "Prices?", "kind": "load_bearing"},
        {"requirement_id": "q1", "question": "Visitors?", "kind": "load_bearing"},
        {"requirement_id": "q5", "question": "What grows there?", "kind": "texture"},
    )


def test_omitting_drops_the_question_and_says_what_it_costs():
    from app.features.prompt2blog.gate_v4 import omit_requirement

    evidence, work_order = _pair()
    settled, trimmed, cost = omit_requirement(
        evidence, work_order, requirement_id="q3"
    )

    assert [r.requirement_id for r in trimmed.requirements] == ["q1", "q5"]
    assert [r.requirement_id for r in settled.requirements] == ["q1", "q5"]
    assert "can no longer claim" in cost
    assert "Prices?" in cost


def test_a_claim_that_served_only_the_dropped_question_goes_with_it():
    from app.features.prompt2blog.gate_v4 import omit_requirement

    evidence, work_order = _pair()
    settled, _trimmed, _cost = omit_requirement(
        evidence, work_order, requirement_id="q3"
    )

    assert "c10" not in {c.claim_id for c in settled.claims}
    assert "c20" in {c.claim_id for c in settled.claims}


def test_a_claim_still_serving_another_question_survives():
    """The fact is doing work elsewhere, so only the link goes."""
    from app.features.prompt2blog.gate_v4 import omit_requirement

    evidence = _evidence(
        claims=[
            {
                "claim_id": "c10",
                "text": "Moravia Tours was co-founded by community leaders.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3", "q1"],
                "confidence": "high",
            }
        ],
        requirements=[
            {"requirement_id": "q3", "status": "partial", "claim_ids": ["c10"], "gap": "No price."},
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c10"]},
        ],
    )
    settled, _trimmed, _cost = omit_requirement(
        evidence,
        _work_order(
            {"requirement_id": "q3", "question": "Prices?", "kind": "load_bearing"},
            {"requirement_id": "q1", "question": "Visitors?", "kind": "load_bearing"},
        ),
        requirement_id="q3",
    )

    survivor = next(c for c in settled.claims if c.claim_id == "c10")
    assert survivor.requirement_ids == ["q1"]


def test_the_last_question_cannot_be_dropped():
    from app.features.prompt2blog.gate_v4 import omit_requirement

    evidence = _evidence(
        claims=[
            {
                "claim_id": "c10",
                "text": "Something.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
            }
        ],
        requirements=[{"requirement_id": "q3", "status": "partial", "claim_ids": ["c10"], "gap": "g"}],
    )

    with pytest.raises(GateAnswerRefused, match="last question"):
        omit_requirement(
            evidence,
            _work_order({"requirement_id": "q3", "question": "Prices?", "kind": "load_bearing"}),
            requirement_id="q3",
        )


def test_omitting_can_still_leave_a_dossier_with_nothing_worth_reading():
    """A different rule, doing its own job.

    Dropping the question that carried all the texture leaves a dossier that is
    all proof, which is exactly what made the audited Lima run unreadable. The
    gate says so rather than letting it through.
    """
    from app.features.prompt2blog.coverage_v4 import assess_coverage
    from app.features.prompt2blog.gate_v4 import omit_requirement

    evidence = _evidence(
        claims=[
            {
                "claim_id": "c10",
                "text": "Moravia Tours was co-founded by community leaders.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3"],
                "confidence": "high",
            },
            {
                "claim_id": "c20",
                "text": "Comuna 13 drew a documented visitor count.",
                "source_ids": ["s1"],
                "requirement_ids": ["q1"],
                "confidence": "high",
            },
        ],
        requirements=[
            {"requirement_id": "q3", "status": "partial", "claim_ids": ["c10"], "gap": "No price."},
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c20"]},
        ],
    )
    work_order = _work_order(
        {"requirement_id": "q3", "question": "Prices?", "kind": "texture"},
        {"requirement_id": "q1", "question": "Visitors?", "kind": "load_bearing"},
    )

    settled, trimmed, _cost = omit_requirement(
        evidence, work_order, requirement_id="q3"
    )
    verdict = assess_coverage(trimmed, settled)

    assert verdict.can_write is False
    assert verdict.reason == "nothing_worth_reading"


def test_dropping_the_last_load_bearing_question_is_refused():
    """An all-texture work order is a mood, not a piece, and the contract
    refuses it anyway."""
    from app.features.prompt2blog.gate_v4 import omit_requirement

    evidence, _ = _pair()

    with pytest.raises(GateAnswerRefused, match="last load-bearing"):
        omit_requirement(
            evidence,
            _work_order(
                {"requirement_id": "q3", "question": "Prices?", "kind": "load_bearing"},
                {"requirement_id": "q1", "question": "Colour?", "kind": "texture"},
                {"requirement_id": "q5", "question": "Plants?", "kind": "texture"},
            ),
            requirement_id="q3",
        )


def test_omitting_unblocks_the_run():
    from app.features.prompt2blog.coverage_v4 import assess_coverage
    from app.features.prompt2blog.gate_v4 import omit_requirement

    evidence, work_order = _pair()
    assert assess_coverage(work_order, evidence).can_write is False

    settled, trimmed, _cost = omit_requirement(
        evidence, work_order, requirement_id="q3"
    )
    assert assess_coverage(trimmed, settled).can_write is True


# --- the operator re-asks it ----------------------------------------------


def _reask(**kwargs):
    from app.features.prompt2blog.gate_v4 import reask_requirement

    evidence, work_order = _pair()
    return reask_requirement(evidence, work_order, **kwargs)


def test_re_asking_rewrites_the_question_and_keeps_its_id():
    """The id is what every claim, gap and conflict links to.

    Changing it would leave the work order and the dossier declaring different
    sets, which the request contract refuses outright.
    """
    _settled, rewritten, _note = _reask(
        requirement_id="q3", question="What does a Moravia Tours walk cost per person?"
    )

    asked = {item.requirement_id: item.question for item in rewritten.requirements}
    assert asked["q3"] == "What does a Moravia Tours walk cost per person?"
    assert asked["q1"] == "Visitors?"
    assert [item.requirement_id for item in rewritten.requirements] == ["q3", "q1", "q5"]


def test_re_asking_puts_the_question_back_to_unanswered():
    """`missing` is the honest word: nothing answers it right now."""
    settled, _rewritten, _note = _reask(requirement_id="q3", question="Cost per person?")

    requirement = next(r for r in settled.requirements if r.requirement_id == "q3")
    assert requirement.status == "missing"
    assert requirement.claim_ids == []


def test_what_the_old_wording_bought_is_discarded():
    """The Argentina answer must not survive the question that produced it."""
    settled, _rewritten, note = _reask(
        requirement_id="q3", question="Cost per person?"
    )

    assert "c10" not in {claim.claim_id for claim in settled.claims}
    assert "1 claim(s)" in note
    assert "Prices?" in note and "Cost per person?" in note


def test_a_claim_still_serving_another_question_survives_a_re_ask():
    from app.features.prompt2blog.gate_v4 import reask_requirement

    evidence = _evidence(
        claims=[
            {
                "claim_id": "c10",
                "text": "Moravia Tours was co-founded by community leaders.",
                "source_ids": ["s1"],
                "requirement_ids": ["q3", "q1"],
                "confidence": "high",
            }
        ],
        requirements=[
            {"requirement_id": "q3", "status": "partial", "claim_ids": ["c10"], "gap": "No price."},
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c10"]},
        ],
    )
    work_order = _work_order(
        {"requirement_id": "q3", "question": "Prices?", "kind": "load_bearing"},
        {"requirement_id": "q1", "question": "Visitors?", "kind": "texture"},
    )

    settled, _rewritten, _note = reask_requirement(
        evidence, work_order, requirement_id="q3", question="Cost per person?"
    )

    survivor = next(claim for claim in settled.claims if claim.claim_id == "c10")
    assert survivor.requirement_ids == ["q1"]


def test_a_question_the_research_answered_can_be_re_asked():
    """The point of the whole move, and the one place `_guard` must not apply.

    Run 76b36468's q6 asked about a project "in Buenos Aires" and research
    answered about Argentina; the article is about Medellín, whose Buenos
    Aires is a neighbourhood. It came back marked `supported`, so refusing to
    touch a supported requirement would refuse exactly the case this exists
    for.
    """
    settled, _rewritten, _note = _reask(
        requirement_id="q1", question="How many visitors in 2024, in Medellin?"
    )

    requirement = next(r for r in settled.requirements if r.requirement_id == "q1")
    assert requirement.status == "missing"


def test_the_same_question_is_refused():
    with pytest.raises(GateAnswerRefused, match="same question"):
        _reask(requirement_id="q3", question="Prices?")


def test_an_empty_rewrite_is_refused():
    with pytest.raises(GateAnswerRefused, match="cannot be empty"):
        _reask(requirement_id="q3", question="   ")


def test_re_asking_an_unknown_question_is_refused():
    with pytest.raises(GateAnswerRefused, match="No research question"):
        _reask(requirement_id="q99", question="Anything at all?")


def test_the_pair_stays_bound_to_one_plan():
    """The fingerprint is the token binding this dossier to this work order.

    Both sides move together in one operation, so it is deliberately left
    alone -- exactly as `omit` leaves it alone. What changed is in the note.
    """
    evidence, work_order = _pair()
    settled, rewritten, _note = _reask(requirement_id="q3", question="Cost per person?")

    assert rewritten.work_order_fingerprint == work_order.work_order_fingerprint
    assert settled.work_order_fingerprint == evidence.work_order_fingerprint
    assert {r.requirement_id for r in rewritten.requirements} == {
        r.requirement_id for r in settled.requirements
    }
