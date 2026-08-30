"""Is this dossier enough to write from, and is any of it worth reading?

Two questions, and v3 only ever asked the first.

The audited Lima run passed every check the system owned. Its research was
clean: first-party sources, dated, conflicts surfaced. It was also unusable --
no food, in one of the great food cities on earth -- because all three of its
questions existed to prove the premise, so all three answers proved it. Nothing
downstream noticed, because nothing downstream was looking.

So a dossier with nothing a reader would enjoy is reported as a real gap, the
same way a missing fact is. And this is the one gate in the whole pipeline that
blocks: writing is the most expensive step, writing well on thin material is
not possible, and a gate before writing saves money where a gate after writing
only hides work already paid for.

The exit is the grill. That is not a fallback -- it is the door the refuted
premise has not had since the direction cards were deleted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .contracts_v4 import EvidencePackage, Prompt2BlogWorkOrder

# A claim that could only have come from someone looking: a texture answer, a
# scene, something specific enough to put a reader somewhere. Counted rather
# than judged, because the alternative is another model call to ask a model
# whether it was interesting.
ENJOYABLE_STATUSES = {"supported", "partial"}


@dataclass
class CoverageVerdict:
    """Whether this run may write, and what is missing if not."""

    can_write: bool
    unsupported_load_bearing: list[str] = field(default_factory=list)
    refuted_assumptions: list[str] = field(default_factory=list)
    has_texture: bool = True
    findings: list[str] = field(default_factory=list)

    @property
    def reason(self) -> str:
        if self.can_write:
            return "ready_to_write"
        if self.refuted_assumptions:
            # More research cannot clear this. The article was commissioned
            # about something that is not so.
            return "premise_refuted"
        if self.unsupported_load_bearing:
            return "load_bearing_unanswered"
        return "nothing_worth_reading"

    def as_record(self) -> dict[str, Any]:
        return {
            "can_write": self.can_write,
            "reason": self.reason,
            "unsupported_load_bearing": list(self.unsupported_load_bearing),
            "refuted_assumptions": list(self.refuted_assumptions),
            "has_texture": self.has_texture,
            "findings": list(self.findings),
        }


def assess_coverage(
    work_order: Prompt2BlogWorkOrder,
    evidence: EvidencePackage,
) -> CoverageVerdict:
    """Decide whether this dossier can carry the piece."""
    status_by_id = {item.requirement_id: item.status for item in evidence.requirements}
    kind_by_id = {item.requirement_id: item.kind for item in work_order.requirements}

    unsupported = sorted(
        requirement_id
        for requirement_id, kind in kind_by_id.items()
        if kind == "load_bearing"
        and status_by_id.get(requirement_id) not in {"supported", "unpublished"}
    )
    refuted = sorted(
        finding.assumption_id
        for finding in evidence.premise_findings
        if finding.verdict == "refuted"
    )

    texture_ids = {
        requirement_id
        for requirement_id, kind in kind_by_id.items()
        if kind == "texture"
    }
    answered_texture = {
        requirement_id
        for requirement_id in texture_ids
        if status_by_id.get(requirement_id) in ENJOYABLE_STATUSES
    }
    # No texture questions at all still counts as thin: a work order with
    # nothing but proof produces a dossier with nothing but proof, which is
    # exactly what happened to Lima.
    has_texture = bool(answered_texture)

    findings: list[str] = []
    for requirement_id in unsupported:
        findings.append(
            f"{requirement_id} is load-bearing and unanswered "
            f"({status_by_id.get(requirement_id, 'missing')})."
        )
    for assumption_id in refuted:
        findings.append(
            f"{assumption_id} was assumed and turned out not to be so. "
            "More research will not change that."
        )
    if not has_texture:
        findings.append(
            "Nothing here would be a pleasure to read. Every answer proves "
            "something and none of it puts a reader anywhere."
        )

    return CoverageVerdict(
        can_write=not unsupported and not refuted and has_texture,
        unsupported_load_bearing=unsupported,
        refuted_assumptions=refuted,
        has_texture=has_texture,
        findings=findings,
    )
