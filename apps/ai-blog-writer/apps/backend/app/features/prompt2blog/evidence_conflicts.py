"""Disagreements research left unrecorded, found by reading what it wrote.

Run 849ae5aa answered one rainfall question with "between 5 and 25
millimeters" at high confidence and "197 millimeters" at low, on the same
requirement, and recorded no conflict. Run b29d66b4 wrote "only conflicting
general closing-hour listings (10am-5pm daily vs 9am-5:30/6:30pm)" into a gap
and recorded no conflict. The mechanism exists and the prompt asks for it; the
model does not always use it.

What is here reads the structure step's own gap text for words that can only
mean two sources disagreeing, and files an unresolved conflict naming the
claims on that requirement that carry figures. It judges nothing about the
world -- it reads what the model wrote -- so it cannot invent a fact.

A numeric comparison used to live here, and it is gone on purpose. It compared
two claims answering one requirement whose figures differed by more than half
again, and it shipped on the strength of a single dossier where it fired once
and correctly. Swept across all six stored v4 dossiers it produced forty five
detections of which three or four were real: two hotels at different distances
from the same square, a restaurant name beside a ticket price, "2 August" and
"28 August" read as a quantity of "august", and clock times throughout.

Subject overlap does not separate them. The true rainfall pair scores 0.67,
false pairs score 0.53 and 0.50, and genuine disagreements about tour lengths
and night opening hours score 0.45 and 0.43. Two claims on one question carry
different numbers for an ordinary reason: they are about different things.
Telling that from a contradiction is a judgement, and one positive example is
not enough to tune a discriminator on. So it is removed rather than narrowed
again. If it comes back, it comes back with evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .contracts_v4 import EvidenceConflict, EvidencePackage

# Words that can only mean two sources saying different things about the same
# thing. Chosen by sweeping the stored dossiers rather than by guessing, and
# the exclusions matter more than the inclusions:
#
# - "differ" fired three times across the corpus and two were wrong -- "only
#   Don Danilo's stall (#486), a different vendor" and "prices found are for
#   different dishes" are distinctions, not disagreements. It would have
#   manufactured two conflicts out of nothing.
# - " vs " fired only inside a sentence that already said "conflicting", so it
#   earns nothing here and would fire on any comparison piece.
#
# The corpus is thin: seven v4 dossiers, ten requirements carrying a gap at
# all. This list is narrow because of that, not in spite of it.
_DISAGREEMENT_WORDS = (
    "conflicting",
    "disagree",
    "discrepan",
    "contradict",
    "inconsistent",
    "outlier",
)

_HAS_DIGIT = re.compile(r"[0-9]")


@dataclass(frozen=True)
class DeclaredDisagreement:
    """A requirement whose own gap text says the sources disagree."""

    requirement_id: str
    claim_ids: tuple[str, ...]
    word: str
    gap: str


def _pairs(claim_ids: list[str]) -> list[tuple[str, str]]:
    return [
        (claim_ids[index], other)
        for index in range(len(claim_ids))
        for other in claim_ids[index + 1 :]
    ]


def detect_declared_disagreements(
    package: EvidencePackage,
) -> list[DeclaredDisagreement]:
    """Requirements whose gap says the sources disagree, with no conflict filed.

    Run b29d66b4 wrote this gap and recorded nothing:

        "only conflicting general closing-hour listings (10am-5pm daily vs
        9am-5:30/6:30pm)"

    A magnitude comparison could never have caught it -- 9 against 10 is a
    ratio of 1.11 -- and a clock time is not a quantity anyway. What catches it
    is the sentence the model wrote beside the empty field.
    """
    already_paired = {
        frozenset(pair)
        for conflict in package.conflicts
        for pair in _pairs(conflict.claim_ids)
    }
    claims_by_id = {claim.claim_id: claim for claim in package.claims}
    found: list[DeclaredDisagreement] = []
    for requirement in package.requirements:
        gap = (requirement.gap or "").lower()
        if not gap:
            continue
        word = next((item for item in _DISAGREEMENT_WORDS if item in gap), None)
        if word is None:
            continue
        ids = [item for item in requirement.claim_ids if item in claims_by_id]
        if any(frozenset(pair) in already_paired for pair in _pairs(ids)):
            continue
        # The claims carrying figures are the ones that can disagree. On
        # b29d66b4's Q7 that is the two sets of opening hours and not the
        # third claim, which says no time is published at all.
        measured = [
            item for item in ids if _HAS_DIGIT.search(claims_by_id[item].text)
        ]
        named = measured if len(measured) >= 2 else ids
        if len(named) < 2:
            continue
        found.append(
            DeclaredDisagreement(
                requirement_id=requirement.requirement_id,
                claim_ids=tuple(named),
                word=word,
                gap=requirement.gap or "",
            )
        )
    return found


def record_detected_conflicts(package: EvidencePackage) -> EvidencePackage:
    """File the disagreements research described and did not record.

    Unresolved, because nothing here knows which side is right. That routes
    them to the gate the operator already answers before writing, which is the
    one place a person is asked to settle the dossier.
    """
    declared = detect_declared_disagreements(package)
    if not declared:
        return package

    taken = {conflict.conflict_id for conflict in package.conflicts}
    additions: list[EvidenceConflict] = []
    for index, item in enumerate(declared, start=1):
        conflict_id = f"declared_{item.requirement_id}_{index}"
        while conflict_id in taken:
            conflict_id = f"{conflict_id}_x"
        taken.add(conflict_id)
        additions.append(
            EvidenceConflict(
                conflict_id=conflict_id,
                claim_ids=list(item.claim_ids),
                summary=(
                    f"Research reported a disagreement on {item.requirement_id} "
                    f'in its own words and filed no conflict: "{item.gap}"'
                ),
            )
        )

    return EvidencePackage.model_validate(
        {
            **package.model_dump(),
            "conflicts": [
                *(conflict.model_dump() for conflict in package.conflicts),
                *(conflict.model_dump() for conflict in additions),
            ],
        }
    )
