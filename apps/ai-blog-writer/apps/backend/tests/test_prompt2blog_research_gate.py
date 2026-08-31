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
        ],
        "requirements": [
            {
                "requirement_id": "q3",
                "status": "partial",
                "claim_ids": ["c10"],
                "gap": "No per-person price is published on its site.",
            },
            {"requirement_id": "q1", "status": "supported", "claim_ids": ["c20"]},
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
