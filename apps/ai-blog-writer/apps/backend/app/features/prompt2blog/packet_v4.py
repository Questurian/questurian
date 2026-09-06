"""What reaches the writer's desk, and nothing else.

Selection decides which facts belong in this article. Until now that decision
was applied by setting a flag on the dossier and then handing the dossier
down, so the writer received the cut and the receipt for it in the same
breath. Measured on run `4a56545b` (`docs/audits/2026-09-06-research-redesign`):
25 chosen facts arrived as 7,225 characters of claims, followed by 10,371
characters naming all 28 research questions, eleven of them reading
`claims: none kept for this article`. Cutting 267 of 292 facts did not make
the writer's context smaller, because the context was never mostly facts.

A packet is the other half of a cut: the dossier records what was learned, the
selection records what belongs in this article, and this builds the view the
writer reads. Three rules make it safe to be small.

**It is derived, never authored.** Every string in it is copied from the
dossier or the brief. No model call, no summary, no paraphrase -- a fact
rewritten by a model is prose asserting something, and a drifted date inside
one would pass groundedness, because groundedness checks the draft against the
claim and the claim is the thing that moved.

**A fact travels with what makes it true.** A source caveat, an operator's note
on a venue, an unresolved disagreement about the same number: these are not
spare length to trim. They come in through links -- the claim's own sources,
the conflicts naming it -- so relevance is computed rather than judged, and a
long note is kept precisely because it is long enough to change a sentence.

**A stale packet refuses.** It carries the fingerprints of the brief, the work
order, the dossier and the selection it was built from. If any of them has
moved since the operator picked, the packet is not rebuilt from today's
defaults and it is not silently widened back to everything -- it says so and
stops. A missing selection is not permission to use every fact.

Groundedness and the readiness follow-up are unaffected and still read the
whole dossier. This is a projection of one record, not a second one.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from .contracts_v4 import (
    ArticleBrief,
    EvidencePackage,
    Prompt2BlogWorkOrder,
)
from .selection_v4 import Selection

# Bumped when the shape or the meaning of a packet changes. A run frozen under
# an older one restarts rather than being reinterpreted: the whole point of
# freezing the writer's input is that it means the same thing when it thaws.
PACKET_POLICY_VERSION = 1

# What a fact is here for. Editorial roles, and deliberately not the work
# order's question kinds: a `load_bearing` question can produce a fact whose
# job in the finished piece is colour, and a `texture` question can produce the
# one price the reader needs. Empty means the selection did not say -- a
# ranking pass that skipped the field, or a selection made before roles
# existed. The outline reads that as "chosen for this article" and groups the
# labelled facts around it.
PacketRole = Literal["", "backbone", "practical", "texture"]


class PacketRefused(ValueError):
    """The packet cannot be built from what it was given.

    Always a technical failure -- an id that names nothing, a fingerprint that
    moved, an empty choice. Never an editorial opinion: a packet somebody would
    not have chosen is still a valid packet, and this is not the place that
    argues with them.
    """


class PacketModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PacketFact(PacketModel):
    """One chosen claim, verbatim, with what the writer needs to state it."""

    claim_id: str
    # Exactly what research returned. Never rewritten, never shortened.
    text: str
    role: PacketRole = ""
    # The selection's own one-liner on why this fact is here. Editorial intent,
    # not a fact, and it is what lets compose know a claim is available
    # material rather than a sentence it owes the reader.
    reason: str = ""
    as_of: str | None = None
    confidence: str
    # The operator looked at this place and wrote this down. It outranks
    # anything research said about the same venue.
    operator_note: str = ""


class PacketNote(PacketModel):
    """A limitation that changes how one of the chosen facts may be stated."""

    note_id: str
    kind: Literal["source_note", "conflict"]
    text: str
    # Which of the chosen facts it bears on. Nothing reaches the packet
    # without at least one, which is what keeps this from becoming a second
    # dossier.
    claim_ids: list[str]


class PacketMaterial(PacketModel):
    """Something the operator has, in their own words.

    Copied from the brief unchanged. First-hand material is never handed to a
    researcher to verify and never restated as an evidence claim -- a person
    saying what they saw is not a web page making an assertion.
    """

    kind: str
    statement: str
    note: str = ""


class WritingPacket(PacketModel):
    """The material for one article, frozen at the moment writing was asked for."""

    policy_version: int = PACKET_POLICY_VERSION
    brief_fingerprint: str
    work_order_fingerprint: str
    evidence_fingerprint: str
    selection_fingerprint: str
    target_word_count: int
    facts: list[PacketFact]
    notes: list[PacketNote]
    supplied_material: list[PacketMaterial]

    def claim_ids(self) -> set[str]:
        """The only facts any writing stage may cite.

        The outline validator checks planned claim ids against this rather than
        against the dossier, so a section cannot be planned around a fact the
        writer will never see.
        """
        return {fact.claim_id for fact in self.facts}

    def receipt(self) -> dict[str, Any]:
        """What a finished run has to be able to show about its own hand-off.

        Sizes rather than text: the packet itself is already stored with the
        run, and a receipt that repeats it is a second copy to drift from.
        """
        return {
            "policy_version": self.policy_version,
            "brief_fingerprint": self.brief_fingerprint,
            "work_order_fingerprint": self.work_order_fingerprint,
            "evidence_fingerprint": self.evidence_fingerprint,
            "selection_fingerprint": self.selection_fingerprint,
            "target_word_count": self.target_word_count,
            "claim_ids": sorted(self.claim_ids()),
            "fact_count": len(self.facts),
            "note_count": len(self.notes),
            "material_count": len(self.supplied_material),
            "roles": {
                role: sum(1 for fact in self.facts if fact.role == role)
                for role in sorted({fact.role for fact in self.facts})
            },
            "characters": {
                "facts": sum(len(fact.text) for fact in self.facts),
                "notes": sum(len(note.text) for note in self.notes),
                "material": sum(
                    len(item.statement) for item in self.supplied_material
                ),
            },
        }


def _digest(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:32]


def selection_fingerprint(selection: Selection) -> str:
    """The editorial decision, as an identity.

    Over the decision and not over the reasoning: the order, the line, the
    overrides and the roles. Re-running the ranker and getting the same order
    back produces the same fingerprint, because the same article was chosen.
    """
    return _digest(
        {
            "order": list(selection.order),
            "merged": dict(sorted(selection.merged.items())),
            "keep_count": selection.keep_count,
            "rescued": sorted(selection.rescued),
            "dropped": sorted(selection.dropped),
            "texture_order": list(selection.texture_order),
            "texture_reserve": selection.texture_reserve,
            "roles": dict(sorted(selection.roles.items())),
            "target_word_count": selection.target_word_count,
        }
    )


# A source note research writes when a source carried nothing worth recording.
# It is not a limitation, and a packet full of them is a packet that has
# learned to pad. Duplicated from `evidence_v3` rather than imported, because
# the two projections are allowed to drift on everything else and this is the
# one string they must agree on; a test holds them together.
PLACEHOLDER_SOURCE_NOTE = "No note recorded for this source."


def _is_limitation(note: str) -> bool:
    text = note.strip()
    return bool(text) and text != PLACEHOLDER_SOURCE_NOTE


def _role_of(selection: Selection, claim_id: str) -> PacketRole:
    """What the selection said this fact is for.

    `texture_order` is the older, narrower version of the same idea: colour is
    ranked separately, on how much of the place it carries, so a claim in it is
    one the system has already called colour. Read second, so an explicit role
    wins -- and `select_evidence` writes `texture` over anything the ranking
    pass called a colour claim, so the two cannot disagree in practice.
    """
    role = selection.roles.get(claim_id, "")
    if role in {"backbone", "practical", "texture"}:
        return role  # type: ignore[return-value]
    return "texture" if claim_id in set(selection.texture_order) else ""


def stale_reason(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: EvidencePackage,
    selection: Selection,
) -> str:
    """Why this choice no longer describes what it was made from, or "".

    One sentence, in the operator's terms, and one definition: the selection
    screen shows exactly what the write boundary would refuse with, so nobody
    discovers at the hand-off that the choice they were looking at was already
    out of date.

    An empty fingerprint is not a match. Every selection stored before bindings
    existed carries one, and those cannot be checked -- which is a thing to
    say, not a thing to assume is fine.
    """
    if (
        selection.evidence_fingerprint
        and selection.evidence_fingerprint != evidence.content_fingerprint()
    ):
        return (
            "The research has changed since these facts were chosen. Look at "
            "the list again before writing."
        )
    if (
        selection.brief_fingerprint
        and selection.brief_fingerprint != brief.brief_fingerprint
    ):
        return (
            "These facts were chosen against a different brief. Look at the "
            "list again before writing."
        )
    if (
        selection.work_order_fingerprint
        and selection.work_order_fingerprint != work_order.work_order_fingerprint
    ):
        return (
            "These facts were chosen against a different set of research "
            "questions. Look at the list again before writing."
        )
    return ""


def build_packet(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: EvidencePackage,
    selection: Selection,
) -> WritingPacket:
    """Assemble the writer's material from a selection and a dossier.

    Pure code. It copies, it links, and it refuses; it never decides. The
    editorial decision was made by the ranker and the operator before this
    runs, and re-deciding anything here would put a second chooser beside the
    one the operator can see.
    """
    if reason := stale_reason(brief, work_order, evidence, selection):
        raise PacketRefused(reason)

    by_id = {claim.claim_id: claim for claim in evidence.claims}
    chosen_ids = selection.selected_claim_ids()

    unknown = sorted(chosen_ids - by_id.keys())
    if unknown:
        # Refusing rather than skipping. A chosen fact that no longer exists is
        # a selection describing a dossier that is gone, and quietly writing
        # from what is left hands the operator an article they did not pick.
        raise PacketRefused(
            "The selection names facts that are not in the research: "
            + ", ".join(unknown[:5])
            + ("…" if len(unknown) > 5 else "")
        )
    merged_away = sorted(
        claim_id for claim_id in chosen_ids if by_id[claim_id].merged_into
    )
    if merged_away:
        raise PacketRefused(
            "The selection names facts that were merged into others: "
            + ", ".join(merged_away[:5])
        )
    if not chosen_ids:
        raise PacketRefused(
            "No facts are selected — there is nothing to write from."
        )

    # Ranked order, so the packet reads most-needed first and two runs of the
    # same selection assemble byte-identically. A rescued fact from below the
    # line keeps its own position rather than being appended, because where the
    # ranker put it is still what the ranker thought.
    ordered = [
        claim_id for claim_id in selection.order if claim_id in chosen_ids
    ]
    ordered.extend(
        claim.claim_id
        for claim in evidence.claims
        if claim.claim_id in chosen_ids and claim.claim_id not in set(ordered)
    )

    facts = [
        PacketFact(
            claim_id=claim_id,
            text=by_id[claim_id].text,
            role=_role_of(selection, claim_id),
            reason=selection.reasons.get(claim_id, ""),
            as_of=(
                by_id[claim_id].as_of.isoformat() if by_id[claim_id].as_of else None
            ),
            confidence=by_id[claim_id].confidence,
            operator_note=by_id[claim_id].venue_note,
        )
        for claim_id in ordered
    ]

    notes: list[PacketNote] = []
    for source in evidence.sources:
        bearing = sorted(
            claim_id
            for claim_id in chosen_ids
            if source.source_id in by_id[claim_id].source_ids
        )
        if not bearing:
            continue
        notes.extend(
            PacketNote(
                note_id=source.source_id,
                kind="source_note",
                text=note.strip(),
                claim_ids=bearing,
            )
            for note in source.notes
            if _is_limitation(note)
        )
    for conflict in evidence.conflicts:
        bearing = sorted(set(conflict.claim_ids) & chosen_ids)
        if not bearing:
            # A disagreement between two facts the article does not use is the
            # dossier's business. It stays there; grounding still reads it.
            continue
        settled = (conflict.resolution or "").strip()
        notes.append(
            PacketNote(
                note_id=conflict.conflict_id,
                kind="conflict",
                text=(
                    f"{conflict.summary} Settled: {settled}"
                    if settled
                    else f"{conflict.summary} This is not settled — do not "
                    "state either version as certain."
                ),
                claim_ids=bearing,
            )
        )

    return WritingPacket(
        brief_fingerprint=brief.brief_fingerprint,
        work_order_fingerprint=work_order.work_order_fingerprint,
        evidence_fingerprint=evidence.content_fingerprint(),
        selection_fingerprint=selection_fingerprint(selection),
        target_word_count=selection.target_word_count,
        facts=facts,
        notes=notes,
        supplied_material=[
            PacketMaterial(
                kind=item.kind, statement=item.statement, note=item.note
            )
            for item in brief.material
        ],
    )
