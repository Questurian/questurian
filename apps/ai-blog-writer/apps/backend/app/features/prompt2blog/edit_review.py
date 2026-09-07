"""Whether an edit still says what the evidence says.

The probe. Packet: "A costs $20. B costs $40." Proposal: "A costs $40. B costs
$20." Every number in the proposal appears in the packet, both claims are
wrong, and the check in front of an editor -- figures in the revision that are
in neither the original nor the packet -- had nothing to report. It could not
have: it compares sets of tokens, and the two sets are identical.

The pipeline already had the answer to this. Groundedness reads the evidence
records themselves and judges what the prose asserts against them, which is
why an overstated date or a widened claim is visible to it. The post-writing
editor could not reach that judgement without running a pipeline stage for its
side effects, so it did without.

So this asks the same question about a candidate section, and takes the answer
through the same sanitiser -- an unreadable verdict is `unchecked`, never a
pass.

Three things it is careful about.

**It reads the section in its article.** A sentence that is fine alone can be
wrong where it sits, and a recommendation is only overstated relative to what
the rest of the piece already said.

**It is bound to what it looked at.** A review carries the run, the section,
the exact candidate text, the article revision and the evidence identity.
Applying prose the review did not read is refused, because a review that
travels through a browser and comes back attached to different text is not
evidence about that text.

**It is advisory, and it does not pretend otherwise.** A finding does not block
a draft; it makes a person decide, and the decision is recorded. `checked` and
`status` keep "we looked and it holds up", "we looked and it does not" and "we
did not manage to look" as three different answers, because collapsing the
third into the first is how an unchecked article comes to wear the stamp of a
checked one.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pydantic import BaseModel, Field

from .content.sections import segment_article
from .grounding_service import check_grounding
from .support import _safe_dict, _safe_str

EDIT_REVIEW_SCHEMA_VERSION = 1

SUPPORTED = "supported"
UNSUPPORTED = "unsupported"
UNCHECKED = "unchecked"


P2B_EDIT_REVIEW_PROMPT = """\
You are checking one edited section of an article against the exact records
the article was written from. Judge what the new text asserts, not whether its
numbers appear somewhere.

Return strict JSON only:
{{
  "grounded": true or false,
  "assessment": "one sentence",
  "unsupported_claims": [
    {{"claim": "the quoted assertion", "reason": "why", "severity": "high" or "low"}}
  ]
}}

`grounded` is false only when at least one high-severity finding explains it.
A finding with no `claim`, no `severity` of exactly "high" or "low", is not a
finding.

What counts as unsupported. A figure appearing in the records is not the same
as the records supporting the sentence it is now in:

- WRONG PAIRING. The records say A costs $20 and B costs $40; the text says A
  costs $40. Both numbers are in the records; the claim is false. Check every
  figure, date, place and duration against the thing it is attached to.
- WIDENED SCOPE. A price for one operator stated as the price. A rule for one
  nationality stated as the rule. A fact about one season stated year-round.
- LOST TIME. A record that holds "as of March" restated as what is true now, or
  a date dropped from a sentence that needed it.
- DROPPED QUALIFICATION. A caveat, exception or condition in the record that
  the text no longer carries. The caveat is what makes the fact true.
- FLIPPED SENSE. A negation added or removed. "Do not" becoming "do", "rarely"
  becoming "often", a warning becoming a recommendation.
- OVERSTATED RECOMMENDATION. The text tells a reader to do something the
  records do not support, or states a preference between options the records
  do not distinguish.

First-hand material is testimony with its own scope. "I waited 45 minutes" is
supported as one person's experience on one occasion; the same sentence turned
into "the wait is 45 minutes" is a general claim the records do not carry, and
that is a high-severity finding.

Do not report a difference in wording, length, tone or structure. This is not
an edit review. Prose that says the same thing in fewer words is grounded.

THE EVIDENCE RECORDS (the only support that exists):
{records}

FIRST-HAND MATERIAL, verbatim, with its own scope:
{material}

WHAT THE REST OF THE ARTICLE SAYS (context; a claim can be wrong only here):
{context}

THE SECTION AS IT WAS:
{original}

THE SECTION AS PROPOSED -- judge this:
{candidate}
"""


class EditReview(BaseModel):
    """A judgement about one candidate section, bound to what it judged."""

    schema_version: int = EDIT_REVIEW_SCHEMA_VERSION
    # Three answers, never two. `unchecked` is not a pass and is not a fail.
    status: str = UNCHECKED
    checked: bool = False
    assessment: str = ""
    unsupported_claims: list[dict[str, str]] = Field(default_factory=list)

    # What this review looked at. Verified server-side before an edit carrying
    # it is applied.
    run_id: str = ""
    section_id: str = ""
    candidate_hash: str = ""
    base_revision: int = -1
    evidence_fingerprint: str = ""

    @property
    def high_severity(self) -> list[dict[str, str]]:
        return [
            claim
            for claim in self.unsupported_claims
            if claim.get("severity") == "high"
        ]

    @property
    def blocks_without_a_decision(self) -> bool:
        """True when a person has to say something before this edit lands.

        Both of the answers that are not "we looked and it holds up". An
        unchecked edit is not a failed one, and it is also not a checked one;
        applying it is a choice somebody makes rather than a default.
        """
        return self.status != SUPPORTED


def candidate_hash(text: str) -> str:
    """Identity of the exact prose a review read.

    Over the stripped text, because the whitespace an editor cannot see is not
    what a review is about -- and because a hash that changed on a trailing
    newline would refuse edits for no reason a person could act on.
    """
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16]


def evidence_fingerprint(packet: dict[str, Any]) -> str:
    """Which evidence this review was made against.

    The packet's own fingerprints when it has them: they already identify the
    evidence and the selection made from it, and two packets carrying the same
    pair hold the same facts. A run frozen before those existed falls back to a
    digest of the fact texts, which is weaker -- it cannot tell an operator's
    note apart from a re-worded one -- and is still better than binding a
    review to nothing.
    """
    record = _safe_dict(packet)
    evidence = _safe_str(record.get("evidence_fingerprint"))
    selection = _safe_str(record.get("selection_fingerprint"))
    if evidence or selection:
        return f"{evidence}:{selection}"
    payload = [
        _safe_str(_safe_dict(fact).get("text")) for fact in record.get("facts") or []
    ] + [
        _safe_str(_safe_dict(item).get("statement"))
        for item in record.get("supplied_material") or []
    ]
    digest = hashlib.sha256(
        json.dumps(sorted(payload), ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:16]
    return f"facts:{digest}"


def _records_block(packet: dict[str, Any]) -> str:
    lines: list[str] = []
    for fact in _safe_dict(packet).get("facts") or []:
        record = _safe_dict(fact)
        text = _safe_str(record.get("text"))
        if not text:
            continue
        claim_id = _safe_str(record.get("claim_id"))
        as_of = _safe_str(record.get("as_of"))
        suffix = f" (as of {as_of})" if as_of else ""
        lines.append(f"- [{claim_id or 'unnamed'}] {text}{suffix}")
    for note in _safe_dict(packet).get("notes") or []:
        text = _safe_str(_safe_dict(note).get("text"))
        if text:
            lines.append(f"- LIMIT: {text}")
    return "\n".join(lines) or "No records were kept for this article."


def _material_block(packet: dict[str, Any]) -> str:
    lines = [
        f"- {_safe_str(_safe_dict(item).get('statement'))}"
        for item in _safe_dict(packet).get("supplied_material") or []
        if _safe_str(_safe_dict(item).get("statement"))
    ]
    return "\n".join(lines) or "None supplied."


def _context_block(content: str, section_id: str) -> str:
    """The rest of the article, quoted, so a claim can be wrong in context."""
    parts = [
        section.render()
        for section in segment_article(content)
        if section.section_id != section_id and section.render()
    ]
    return "\n\n".join(parts) or "This article has no other sections."


def review_section_edit(
    *,
    llm: Any,
    run_id: str,
    section_id: str,
    content: str,
    original: str,
    candidate: str,
    packet: dict[str, Any],
    base_revision: int,
    model_name: str | None = None,
) -> EditReview:
    """Judge a candidate section against the frozen packet, in its article.

    The verdict comes back through the pipeline's sanitiser, so a malformed
    answer is `unchecked` rather than a pass, and a provider outage degrades
    instead of blocking the draft.
    """
    prompt = P2B_EDIT_REVIEW_PROMPT.format(
        records=_records_block(packet),
        material=_material_block(packet),
        context=_context_block(content, section_id),
        original=original,
        candidate=candidate,
    )
    outcome = check_grounding(
        llm=llm,
        prompt=prompt,
        job_id="p2b.edit_review",
        model_name=model_name,
    )
    verdict = outcome.verdict
    return EditReview(
        status=str(verdict.get("status") or UNCHECKED),
        checked=bool(verdict.get("checked")),
        assessment=_safe_str(verdict.get("assessment")),
        unsupported_claims=[
            {
                "claim": _safe_str(_safe_dict(item).get("claim")),
                "reason": _safe_str(_safe_dict(item).get("reason")),
                "severity": _safe_str(_safe_dict(item).get("severity")),
            }
            for item in verdict.get("unsupported_claims") or []
        ],
        run_id=run_id,
        section_id=section_id,
        candidate_hash=candidate_hash(candidate),
        base_revision=base_revision,
        evidence_fingerprint=evidence_fingerprint(packet),
    )


def binding_failure(
    review: EditReview | None,
    *,
    run_id: str,
    section_id: str,
    candidate: str,
    packet: dict[str, Any],
) -> str:
    """Why this review does not describe this edit, or an empty string.

    Checked on the server, on the way in. A review is generated here, travels
    to a browser as JSON, and comes back in a request body -- so the object
    being trusted is one the client had every opportunity to rewrite, and the
    review that says a candidate is grounded says it about the candidate it
    read and nothing else.

    The article revision is deliberately not checked here. That is the apply's
    own compare-and-swap, which refuses a moved document with a message about
    the document; refusing it a second time as a broken review would explain
    the wrong thing.
    """
    if review is None:
        return "this edit carries no review"
    if review.run_id and review.run_id != run_id:
        return "this review was made for a different run"
    if review.section_id and review.section_id != section_id:
        return "this review was made for a different section"
    if review.candidate_hash != candidate_hash(candidate):
        return "this review was made for different text"
    expected = evidence_fingerprint(packet)
    if review.evidence_fingerprint and review.evidence_fingerprint != expected:
        return "this review was made against different evidence"
    return ""
