"""Slot Fill issue creation for unfilled Itinerary Autobuild slots."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .candidate_scoring import SCORING_MODEL
from .reporting import elapsed_ms
from .schemas import (
    AutobuildStepEvent,
    DayShell,
    PlanStop,
    ShellSlot,
    SlotIssue,
)


@dataclass(frozen=True)
class SlotSelection:
    stop: PlanStop | None
    issue: SlotIssue | None
    step: AutobuildStepEvent


def create_slot_issue(
    *,
    day_index: int,
    shell: DayShell,
    slot: ShellSlot,
    issue: str,
) -> SlotIssue:
    return SlotIssue(
        day_index=day_index,
        shell_id=shell.id,
        slot_id=slot.id,
        slot_label=slot.label,
        daypart=slot.daypart,
        issue=issue,
    )


def unfilled_slot(
    *,
    day_index: int,
    shell: DayShell,
    slot: ShellSlot,
    started: float,
    issue_text: str,
    details: dict[str, Any],
    trace: dict[str, str] | None = None,
) -> SlotSelection:
    """Return the paired issue and failed report event for an unfilled slot."""
    return SlotSelection(
        stop=None,
        issue=create_slot_issue(
            day_index=day_index,
            shell=shell,
            slot=slot,
            issue=issue_text,
        ),
        step=AutobuildStepEvent(
            name="slot",
            label=f"Day {day_index + 1} · {slot.label}",
            status="failed",
            duration_ms=elapsed_ms(started),
            day_index=day_index,
            slot_id=slot.id,
            model=SCORING_MODEL if trace is not None else None,
            prompt=trace.get("prompt") if trace is not None else None,
            output=trace.get("output") if trace is not None else None,
            details=details,
        ),
    )
