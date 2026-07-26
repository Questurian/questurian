"""Stable prompt contracts for Listicle Content Generation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .contracts import ListTone

ListicleArticleType = Literal["single-type-listicle", "listicle-itinerary"]
ListicleFieldType = Literal["intro", "blurb"]
ListicleCategory = Literal[
    "dining",
    "accommodations",
    "attractions",
    "nightlife",
    "key_location",
]


@dataclass(frozen=True)
class ListicleWriterTarget:
    target_id: str
    field_type: ListicleFieldType
    category: ListicleCategory | None
    display_name: str | None = None
    research_subject: str | None = None
    location_label: str | None = None
    current_content: str = ""
    supporting_context: str = ""


__all__ = [
    "ListTone",
    "ListicleArticleType",
    "ListicleCategory",
    "ListicleFieldType",
    "ListicleWriterTarget",
]
