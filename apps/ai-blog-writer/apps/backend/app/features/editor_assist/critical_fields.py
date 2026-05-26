"""Critical Fields Guideline — category-agnostic static identity gate.

Confirms a listicle blurb target has the minimum identity needed to enter the
pipeline. Failing any check hard-blocks the target before Evidence Scan or
Research Profile runs. See ADR 0006.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ListicleCategory = Literal[
    "dining", "accommodations", "attractions", "nightlife", "key_location"
]
_SUPPORTED_CATEGORIES: frozenset[str] = frozenset(
    {"dining", "accommodations", "attractions", "nightlife", "key_location"}
)


@dataclass(frozen=True)
class CriticalFieldsResult:
    passed: bool
    missing: list[str]


def evaluate_critical_fields(
    *,
    name: str | None,
    category: str | None,
    location_label: str | None,
    payload_doc_id: str | None,
) -> CriticalFieldsResult:
    missing: list[str] = []
    if not (isinstance(name, str) and name.strip()):
        missing.append("name")
    if category not in _SUPPORTED_CATEGORIES:
        missing.append("category")
    if not (isinstance(location_label, str) and location_label.strip()):
        missing.append("location_label")
    if not (isinstance(payload_doc_id, str) and payload_doc_id.strip()):
        missing.append("payload_doc_id")
    return CriticalFieldsResult(passed=not missing, missing=missing)
