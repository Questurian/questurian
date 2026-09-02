"""Numbers that disagree on one question, when nothing said they did.

Run 849ae5aa asked one question about Lima's rainfall. Research answered it
with "between 5 and 25 millimeters" at high confidence and "197 millimeters"
at low, attached to the same requirement, and recorded no conflict at all.
The writer used both, in consecutive clauses, under a headline saying fog is
the only rain the city gets.

The mechanism was there and the prompt asked for it. The stored notes even
carry a section headed "Discrepancies and Credibility" naming 197 as the
outlier -- so the gather step surfaced the disagreement and the structure step
dropped it.

This is the cheap half of the fix, and the half that cannot invent anything:
two claims answering one requirement, each carrying a number in the same unit,
where the numbers disagree and no conflict names them. It is a comparison
against the dossier's own consistency, not a judgement about the world. It
misses every conflict expressed in prose with no figures in it, which is why
the prompt still asks for the rest.

A detected conflict is recorded unresolved, which routes it to the gate the
operator already answers before writing. Nothing here picks a figure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .contracts_v4 import EvidenceConflict, EvidencePackage

# A number and the word immediately after it. The word is what makes two
# figures comparable: 197 and 25 mean nothing beside each other until both are
# millimetres.
_NUMBER_WITH_UNIT = re.compile(
    r"(?P<value>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"\s*(?P<unit>%|[A-Za-z][A-Za-z.]{0,19})"
)

# Words that follow a number without being a unit. Without these, "5 and 25
# millimetres" reports a quantity of 5 "and", and a range stops comparing
# against anything.
_NOT_A_UNIT = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "but", "by", "for", "from", "if",
        "in", "into", "is", "of", "on", "or", "out", "over", "per", "than",
        "that", "the", "then", "to", "under", "up", "was", "were", "when",
        "which", "while", "with",
    }
)

# Same quantity, different spelling. Only units where the two spellings are
# certainly the same thing; anything unlisted compares against its own exact
# spelling and nothing else, which is the safe direction to be wrong in.
_UNIT_ALIASES = {
    "millimetre": "mm",
    "millimeter": "mm",
    "centimetre": "cm",
    "centimeter": "cm",
    "metre": "m",
    "meter": "m",
    "kilometre": "km",
    "kilometer": "km",
    "mile": "mi",
    "kilogram": "kg",
    "litre": "l",
    "liter": "l",
    "percent": "%",
    "pct": "%",
    "hectare": "ha",
    "year": "yr",
    "hour": "hr",
    "minute": "min",
    "usd": "$",
    "dollar": "$",
    "sol": "pen",
    "soles": "pen",
}

# How far apart two figures have to be before this says anything. Deliberately
# blunt: a rounding difference, a revised estimate and a figure quoted to a
# different precision are all normal, and a check that fires on those would be
# turned off within a week. 197 against 25 is what this is for.
DISAGREEMENT_RATIO = 1.5

# Two figures this close are the same figure, quoted differently.
AGREEMENT_TOLERANCE = 0.05


# Words that can only mean two sources saying different things about the same
# thing. Chosen by sweeping the stored dossiers rather than by guessing, and
# the exclusions matter more than the inclusions:
#
# - "differ" fired three times across the corpus and two were wrong -- "only
#   Don Danilo's stall (#486), a different vendor" and "prices found are for
#   different dishes" are both distinctions, not disagreements. It would have
#   manufactured two conflicts out of nothing.
# - " vs " fired only inside a sentence that already said "conflicting", so it
#   adds nothing here and would fire on any comparison piece.
#
# The corpus is thin: seven v4 dossiers, ten requirements carrying a gap at
# all. This list is narrow on purpose because of that, not in spite of it.
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


@dataclass(frozen=True)
class NumericDisagreement:
    """Two claims on one requirement whose numbers do not agree."""

    requirement_id: str
    claim_ids: tuple[str, str]
    unit: str
    values: tuple[float, float]


def _normalise_unit(raw: str) -> str | None:
    unit = raw.strip(".").lower()
    if not unit or unit in _NOT_A_UNIT:
        return None
    if unit != "%" and unit.endswith("s") and len(unit) > 2:
        unit = unit[:-1]
    return _UNIT_ALIASES.get(unit, unit)


def quantities(text: str) -> dict[str, set[float]]:
    """Every number in the text, keyed by the unit it was written with."""
    found: dict[str, set[float]] = {}
    for match in _NUMBER_WITH_UNIT.finditer(text):
        unit = _normalise_unit(match.group("unit"))
        if unit is None:
            continue
        try:
            value = float(match.group("value").replace(",", ""))
        except ValueError:  # pragma: no cover -- the pattern cannot produce this
            continue
        if value == 0:
            continue
        found.setdefault(unit, set()).add(value)
    return found


def _disagree(left: set[float], right: set[float]) -> tuple[float, float] | None:
    for one in left:
        for other in right:
            if abs(one - other) <= AGREEMENT_TOLERANCE * max(one, other):
                return None
    low = min(min(left), min(right))
    high = max(max(left), max(right))
    if high / low < DISAGREEMENT_RATIO:
        return None
    return (low, high)


def detect_numeric_disagreements(
    package: EvidencePackage,
) -> list[NumericDisagreement]:
    """Numbers on one question that disagree with no conflict naming them."""
    already_paired = {
        frozenset(pair)
        for conflict in package.conflicts
        for pair in _pairs(conflict.claim_ids)
    }
    found: list[NumericDisagreement] = []
    for requirement in package.requirements:
        claims = [
            claim
            for claim in package.claims
            if requirement.requirement_id in claim.requirement_ids
        ]
        measured = [(claim, quantities(claim.text)) for claim in claims]
        for index, (claim, left) in enumerate(measured):
            for other, right in measured[index + 1 :]:
                if frozenset({claim.claim_id, other.claim_id}) in already_paired:
                    continue
                for unit in sorted(set(left) & set(right)):
                    values = _disagree(left[unit], right[unit])
                    if values is None:
                        continue
                    found.append(
                        NumericDisagreement(
                            requirement_id=requirement.requirement_id,
                            claim_ids=(claim.claim_id, other.claim_id),
                            unit=unit,
                            values=values,
                        )
                    )
                    break
    return found


def detect_declared_disagreements(
    package: EvidencePackage,
) -> list[DeclaredDisagreement]:
    """Requirements whose gap says the sources disagree, with no conflict filed.

    Run b29d66b4 wrote this gap and recorded no conflict:

        "only conflicting general closing-hour listings (10am-5pm daily vs
        9am-5:30/6:30pm)"

    The numeric comparison cannot catch that one: 9 against 10 is a ratio of
    1.11, far under a magnitude threshold that exists to stay quiet, and a
    clock time is not a quantity anyway. What can catch it is the structure
    step's own sentence. This reads what the model wrote rather than judging
    the world, so it invents nothing.
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
        if any(
            frozenset(pair) in already_paired for pair in _pairs(ids)
        ):
            continue
        # The claims that carry figures are the ones that can disagree. On
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


def _pairs(claim_ids: list[str]) -> list[tuple[str, str]]:
    return [
        (claim_ids[index], other)
        for index in range(len(claim_ids))
        for other in claim_ids[index + 1 :]
    ]


def _figure(value: float, unit: str) -> str:
    rendered = f"{value:g}"
    return f"{rendered}{unit}" if unit in {"%", "$"} else f"{rendered} {unit}"


def record_detected_conflicts(package: EvidencePackage) -> EvidencePackage:
    """Add a conflict for every disagreement research left unrecorded.

    Two ways of finding one, and they are complements rather than overlaps.
    The numeric comparison catches figures that disagree in magnitude and says
    nothing about clock times, where a real disagreement is a rounding error
    away in ratio terms. The declared check catches the structure step's own
    sentence saying the sources conflict, which is the half no comparison can
    reach.

    Both record unresolved, because nothing here knows which is right. That
    routes them to the gate the operator already answers before writing, which
    is the one place a person is asked to settle the dossier.
    """
    numeric = detect_numeric_disagreements(package)
    declared = detect_declared_disagreements(package)
    if not numeric and not declared:
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
                    f"in its own words and filed no conflict: \"{item.gap}\""
                ),
            )
        )
    for index, item in enumerate(numeric, start=1):
        conflict_id = f"measured_{item.requirement_id}_{index}"
        while conflict_id in taken:
            conflict_id = f"{conflict_id}_x"
        taken.add(conflict_id)
        low, high = item.values
        additions.append(
            EvidenceConflict(
                conflict_id=conflict_id,
                claim_ids=list(item.claim_ids),
                summary=(
                    f"{item.claim_ids[0]} and {item.claim_ids[1]} both answer "
                    f"{item.requirement_id} and their figures disagree: "
                    f"{_figure(low, item.unit)} against "
                    f"{_figure(high, item.unit)}. Research recorded no conflict "
                    f"between them."
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
