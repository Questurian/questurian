"""The two moves the operator gets when research comes up short.

One gate blocks in the whole pipeline, and it sits before writing (ADR 0030).
It exists so an article is never written on top of a fact nobody confirmed, and
run 76b36468 is exactly why: research found Moravia Tours, its site and its two
founders by name, and no price -- because that co-op takes bookings directly
and does not publish one.

Until now a blocked run had one exit, the grill, which discards the research
that was already paid for. Both moves here settle the question in place.

**The operator answers it.** They looked it up, they know it, or they asked
somebody. Their words become a claim against a source recorded as `firsthand`,
so the record can always say the answer came from a person rather than from
something the system verified. That distinction matters six months later, when
a wrong fact is being traced and the research would otherwise take the blame.

**Nobody publishes it.** The fourth verdict, `unpublished`, was added after a
Lima run stalled on airport processing times no agency publishes. The coverage
gate already accepts it, so the run continues and the article gets to say the
true thing: this is not published anywhere. What was missing was any way for
the operator to say so.

Neither move touches a question research actually answered. A `supported`
requirement is not something the operator may quietly overwrite.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from .contracts_v4 import (
    EvidenceClaim,
    EvidencePackage,
    EvidenceSource,
    Prompt2BlogWorkOrder,
)
from .support import _safe_str

logger = logging.getLogger(__name__)

# Answers the operator supplied, kept apart from anything research retrieved.
OPERATOR_SOURCE_PREFIX = "op-"
OPERATOR_CLAIM_PREFIX = "opc-"


class GateAnswerRefused(ValueError):
    """The requirement cannot take this answer."""


def _requirement(evidence: EvidencePackage, requirement_id: str):
    for item in evidence.requirements:
        if item.requirement_id == requirement_id:
            return item
    raise GateAnswerRefused(f"No research question called {requirement_id}.")


def _guard(evidence: EvidencePackage, requirement_id: str) -> None:
    """Refuse to overwrite research. Correcting your own answer is fine.

    The rule is about whose answer is being replaced, not about the status. A
    question research settled must not be quietly rewritten by hand, because
    then the dossier stops describing what was actually found. A question the
    operator settled is theirs, and a typo in a price they supplied should be
    fixable without going back to the grill.
    """
    requirement = _requirement(evidence, requirement_id)
    if requirement.status != "supported":
        return
    theirs = any(
        claim_id.startswith(OPERATOR_CLAIM_PREFIX) for claim_id in requirement.claim_ids
    )
    if not theirs:
        raise GateAnswerRefused(
            f"{requirement_id} is already answered by the research."
        )


def answer_requirement(
    evidence: EvidencePackage,
    *,
    requirement_id: str,
    answer: str,
    source_url: str | None = None,
    today: date | None = None,
) -> EvidencePackage:
    """Record the operator's own answer as evidence, attributed to them.

    Stored verbatim. The operator's words are the one thing in the dossier
    nobody rewrote, and a paraphrase of an unverifiable claim is worse than the
    claim, because it reads as though something checked it.
    """
    cleaned = _safe_str(answer)
    if not cleaned:
        raise GateAnswerRefused("An answer cannot be empty.")
    _guard(evidence, requirement_id)

    payload = evidence.model_dump(mode="json")
    source_id = f"{OPERATOR_SOURCE_PREFIX}{requirement_id}"
    claim_id = f"{OPERATOR_CLAIM_PREFIX}{requirement_id}"

    # Replace rather than append, so answering twice does not leave the first
    # attempt sitting in the dossier as a second, contradicting claim.
    payload["sources"] = [
        item for item in payload["sources"] if item["source_id"] != source_id
    ]
    payload["claims"] = [
        item for item in payload["claims"] if item["claim_id"] != claim_id
    ]

    url = _safe_str(source_url) or None
    payload["sources"].append(
        EvidenceSource(
            source_id=source_id,
            title=f"Answered by the operator for {requirement_id}",
            publisher="Operator" if url else None,
            url=url,
            retrieved_at=today or date.today(),
            # `firsthand` is the honest label whether they went and looked or
            # already knew: either way no automatic check stands behind it.
            source_type="firsthand",
            # Not `web` even with a URL, because the rule for a web source is
            # that the system retrieved it, and it did not.
            material_type="first-person-notes",
            notes=[cleaned],
        ).model_dump(mode="json")
    )
    payload["claims"].append(
        EvidenceClaim(
            claim_id=claim_id,
            text=cleaned,
            source_ids=[source_id],
            requirement_ids=[requirement_id],
            as_of=today or date.today(),
            # Never `high`. Nothing verified it, and a confident label on an
            # unchecked claim is the thing that misleads a later reader of the
            # record.
            confidence="medium",
        ).model_dump(mode="json")
    )

    for item in payload["requirements"]:
        if item["requirement_id"] == requirement_id:
            item["status"] = "supported"
            item["claim_ids"] = sorted({*item.get("claim_ids", []), claim_id})
            # A supported requirement may not describe a gap.
            item["gap"] = ""

    logger.info(
        "Operator answered %s at the research gate", requirement_id
    )
    return EvidencePackage.model_validate(payload)


def omit_requirement(
    evidence: EvidencePackage,
    work_order: "Prompt2BlogWorkOrder",
    *,
    requirement_id: str,
) -> tuple[EvidencePackage, "Prompt2BlogWorkOrder", str]:
    """Drop the question. Returns the pair, and what the cut costs.

    Cutting a load-bearing question is already permitted at the work order
    stage, said once with what the article can no longer claim, then obeyed
    (ADR 0030). The same decision is allowed here, for the same reason: it is
    the operator's call and it is allowed to be wrong.

    Dropping a question means dropping any claim that served only it. A claim
    that also served another question keeps its other links and stays, because
    the fact is still doing work elsewhere.
    """
    _guard(evidence, requirement_id)
    remaining = [
        item for item in work_order.requirements if item.requirement_id != requirement_id
    ]
    if not remaining:
        raise GateAnswerRefused(
            "That is the last question. An article with nothing to stand on is "
            "not an article; go back to the grill instead."
        )
    if not any(item.kind == "load_bearing" for item in remaining):
        # The contract refuses an all-texture work order, and it is right to:
        # that is a mood, not a piece.
        raise GateAnswerRefused(
            "That is the last load-bearing question. Everything else is "
            "texture, and texture alone is not an article."
        )

    cost = _cost_of_omitting(work_order, requirement_id)

    payload = evidence.model_dump(mode="json")
    payload["requirements"] = [
        item
        for item in payload["requirements"]
        if item["requirement_id"] != requirement_id
    ]
    kept_claims = []
    for claim in payload["claims"]:
        links = [rid for rid in claim["requirement_ids"] if rid != requirement_id]
        if not links:
            # Nothing left for this claim to answer.
            continue
        claim["requirement_ids"] = links
        kept_claims.append(claim)
    payload["claims"] = kept_claims
    surviving = {claim["claim_id"] for claim in kept_claims}
    for item in payload["requirements"]:
        item["claim_ids"] = [c for c in item["claim_ids"] if c in surviving]
    payload["gaps"] = [
        gap
        for gap in payload.get("gaps", [])
        if [r for r in gap["requirement_ids"] if r != requirement_id]
    ]
    for gap in payload["gaps"]:
        gap["requirement_ids"] = [
            r for r in gap["requirement_ids"] if r != requirement_id
        ]
    payload["conflicts"] = [
        conflict
        for conflict in payload.get("conflicts", [])
        if len([c for c in conflict["claim_ids"] if c in surviving]) >= 2
    ]
    for conflict in payload["conflicts"]:
        conflict["claim_ids"] = [c for c in conflict["claim_ids"] if c in surviving]
    payload["premise_findings"] = [
        finding
        for finding in payload.get("premise_findings", [])
        if all(c in surviving for c in finding["claim_ids"])
    ]

    trimmed = work_order.model_copy(update={"requirements": remaining})
    logger.info("Operator omitted %s at the research gate", requirement_id)
    return EvidencePackage.model_validate(payload), trimmed, cost


def _cost_of_omitting(work_order: "Prompt2BlogWorkOrder", requirement_id: str) -> str:
    """What the article can no longer claim, said once and plainly.

    Said rather than asked. The operator should not have to already know which
    questions are load-bearing to cut safely, and the system does know.
    """
    question = next(
        (
            item
            for item in work_order.requirements
            if item.requirement_id == requirement_id
        ),
        None,
    )
    if question is None:
        return ""
    if question.kind == "texture":
        return (
            f'Cut "{question.question}" \u2014 the piece loses a detail, not an '
            "argument."
        )
    return (
        f'Cut "{question.question}" \u2014 the article can no longer claim '
        "anything that rested on it."
    )


def venues_to_check(evidence: EvidencePackage) -> list[dict[str, Any]]:
    """The places the article would send a reader, for a person to look at.

    Only claims that name somewhere bookable or visitable. In run 76b36468 that
    was five of nineteen claims, two of them the same operator: a two minute
    job, because most claims are facts rather than places.
    """
    seen: set[str] = set()
    venues: list[dict[str, Any]] = []
    for claim in evidence.claims:
        name = _safe_str(claim.venue)
        if not name or name.casefold() in seen:
            continue
        seen.add(name.casefold())
        urls = [
            str(source.url)
            for source in evidence.sources
            if source.source_id in claim.source_ids and source.url
        ]
        venues.append(
            {
                "claim_id": claim.claim_id,
                "venue": name,
                "text": claim.text,
                "urls": urls,
                "note": _safe_str(claim.venue_note),
            }
        )
    return venues


def note_venue(
    evidence: EvidencePackage,
    *,
    claim_id: str,
    note: str,
) -> EvidencePackage:
    """Attach what the operator saw. Reaches the writer with the claim."""
    cleaned = _safe_str(note)
    if not cleaned:
        raise GateAnswerRefused("A note cannot be empty.")
    payload = evidence.model_dump(mode="json")
    found = False
    for claim in payload["claims"]:
        if claim["claim_id"] == claim_id:
            claim["venue_note"] = cleaned
            found = True
    if not found:
        raise GateAnswerRefused(f"No claim called {claim_id}.")
    return EvidencePackage.model_validate(payload)


def drop_venue(evidence: EvidencePackage, *, claim_id: str) -> EvidencePackage:
    """Take a place out of the dossier entirely.

    Moravia Tours was correct in every word and was a business winding down.
    A claim the operator has looked at and rejected must not reach the writer,
    because the writer has no way to tell.

    A question left with nothing behind it becomes `partial` again rather than
    silently staying supported, so the gate can say so and the operator decides
    what to do about it. Quietly leaving it supported would publish an article
    resting on a claim that was deleted for being wrong.
    """
    payload = evidence.model_dump(mode="json")
    if not any(claim["claim_id"] == claim_id for claim in payload["claims"]):
        raise GateAnswerRefused(f"No claim called {claim_id}.")

    payload["claims"] = [
        claim for claim in payload["claims"] if claim["claim_id"] != claim_id
    ]
    surviving = {claim["claim_id"] for claim in payload["claims"]}
    for requirement in payload["requirements"]:
        kept = [c for c in requirement["claim_ids"] if c in surviving]
        if kept == requirement["claim_ids"]:
            continue
        requirement["claim_ids"] = kept
        if requirement["status"] == "supported" and not kept:
            requirement["status"] = "partial"
            requirement["gap"] = (
                "Its only support was a place the operator checked and rejected."
            )
    payload["conflicts"] = [
        conflict
        for conflict in payload.get("conflicts", [])
        if len([c for c in conflict["claim_ids"] if c in surviving]) >= 2
    ]
    for conflict in payload["conflicts"]:
        conflict["claim_ids"] = [c for c in conflict["claim_ids"] if c in surviving]
    payload["premise_findings"] = [
        finding
        for finding in payload.get("premise_findings", [])
        if all(c in surviving for c in finding["claim_ids"])
    ]
    logger.info("Operator dropped the venue on claim %s", claim_id)
    return EvidencePackage.model_validate(payload)


def mark_unpublished(
    evidence: EvidencePackage,
    *,
    requirement_id: str,
    note: str,
) -> EvidencePackage:
    """Record that the answer is not published anywhere.

    Content, not failure. "Moravia Tours takes bookings directly and does not
    post a price" is a sentence that belongs in the article, and the coverage
    gate already treats `unpublished` as answered.
    """
    cleaned = _safe_str(note)
    if not cleaned:
        raise GateAnswerRefused(
            "Say what was looked for and where, so the article can state it."
        )
    _guard(evidence, requirement_id)

    payload = evidence.model_dump(mode="json")
    for item in payload["requirements"]:
        if item["requirement_id"] == requirement_id:
            item["status"] = "unpublished"
            # `unpublished` keeps its claims on purpose: what research did find
            # is what makes the absence reportable rather than merely asserted.
            item["gap"] = cleaned

    logger.info("Operator marked %s unpublished", requirement_id)
    return EvidencePackage.model_validate(payload)
