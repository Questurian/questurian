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


def _pairs(claim_ids: list[str]) -> list[tuple[str, str]]:
    return [
        (claim_ids[index], other)
        for index in range(len(claim_ids))
        for other in claim_ids[index + 1 :]
    ]


def _figure(value: float, unit: str) -> str:
    rendered = f"{value:g}"
    return f"{rendered}{unit}" if unit in {"%", "$"} else f"{rendered} {unit}"


def record_numeric_conflicts(package: EvidencePackage) -> EvidencePackage:
    """Add a conflict for every numeric disagreement research left unrecorded.

    Unresolved, because nothing here knows which figure is right. That routes
    it to the gate the operator already answers before writing, which is the
    one place a person is asked to settle the dossier.
    """
    disagreements = detect_numeric_disagreements(package)
    if not disagreements:
        return package

    taken = {conflict.conflict_id for conflict in package.conflicts}
    additions: list[EvidenceConflict] = []
    for index, item in enumerate(disagreements, start=1):
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
