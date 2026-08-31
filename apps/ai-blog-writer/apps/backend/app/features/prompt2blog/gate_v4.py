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

from .contracts_v4 import EvidenceClaim, EvidencePackage, EvidenceSource
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
