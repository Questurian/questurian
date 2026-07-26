"""Writer Brief data contracts and source-fact limits."""

from __future__ import annotations

from dataclasses import dataclass, field

from .angle_assignment import ListicleAngle

MIN_SOURCE_FACTS = 2
MAX_SOURCE_FACTS = 8


@dataclass(frozen=True)
class SourceFact:
    fact: str
    citations: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class WriterBrief:
    angle_directive: str
    source_facts: list[SourceFact]
    angle: ListicleAngle | None
    venue: str

    @property
    def is_usable(self) -> bool:
        return bool(self.angle_directive) and len(self.source_facts) >= MIN_SOURCE_FACTS


@dataclass(frozen=True)
class WriterBriefTrace:
    prompt: str
    raw_response: str = ""
    model: str = ""
    error: str | None = None
    parser_dropped_reason: str | None = None


def empty_writer_brief(
    *,
    venue_name: str,
    angle: ListicleAngle | None,
    angle_directive: str,
) -> WriterBrief:
    """Build the unusable brief returned by parser and runtime fallbacks."""
    return WriterBrief(
        angle_directive=angle_directive,
        source_facts=[],
        angle=angle,
        venue=venue_name,
    )


__all__ = [
    "MAX_SOURCE_FACTS",
    "MIN_SOURCE_FACTS",
    "SourceFact",
    "WriterBrief",
    "WriterBriefTrace",
    "empty_writer_brief",
]
