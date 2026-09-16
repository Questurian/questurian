"""What one day is given, and what counts as that day changing.

Two jobs, and they are the same job. Everything the interview and the prompt
are told about a day is assembled here, and the fingerprint of that assembly
is what makes outstanding work stale. A context change nobody hashed is a
prompt that silently stops describing the trip it came from.

What is in the fingerprint (plan section 5):

- the trip's planning values
- this day's label, window, layout and both note fields
- every other day's tentative label and layout, and their accepted results
- the accepted direction, once there is one

What is deliberately NOT: which tab is open, which stop is expanded, when the
draft was last touched. Those move constantly and mean nothing, and a
fingerprint that included them would invalidate an export for scrolling.
"""

from __future__ import annotations

from typing import Any

from .contracts import (
    DayDirection,
    DaySnapshotModel,
    SetupSnapshot,
    SlotSnapshotModel,
    StoredResult,
    TripSnapshotModel,
    stable_hash,
)

_WEEKDAYS = (
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
)

_WINDOW_LABELS = {
    "full_day": "Full day",
    "morning_only": "Morning only",
    "afternoon_onward": "Afternoon onward",
    "evening_only": "Evening only",
    "custom": "Custom window",
}


def window_label(day: DaySnapshotModel) -> str:
    time = day.available_time
    if time.id != "custom":
        return _WINDOW_LABELS.get(time.id, time.id)
    if not time.custom_start or not time.custom_end:
        return "Custom window"
    tail = " (ends next day)" if time.ends_next_day else ""
    return f"{time.custom_start}–{time.custom_end}{tail}"


def day_date_label(trip: TripSnapshotModel, index: int) -> str:
    """The date or weekday, when the trip actually has one.

    Evergreen returns empty. Attaching an invented weekday to a trip that
    deliberately has none would put a fact into the prompt that the operator
    never supplied, and the research would plan around it.
    """
    timing = trip.timing or {}
    mode = str(timing.get("mode", ""))
    if mode == "specific_dates" and timing.get("startDate"):
        from datetime import date, timedelta

        try:
            start = date.fromisoformat(str(timing["startDate"]))
        except ValueError:
            return ""
        return (start + timedelta(days=index)).isoformat()
    if mode == "weekday_sequence" and timing.get("firstWeekday"):
        first = str(timing["firstWeekday"]).lower()
        if first not in _WEEKDAYS:
            return ""
        return _WEEKDAYS[(_WEEKDAYS.index(first) + index) % 7].capitalize()
    return ""


def travel_point_label(point: Any, trip: TripSnapshotModel) -> str:
    if point is None:
        return "Somewhere"
    ref = getattr(point, "ref", "custom")
    if ref == "base":
        return trip.base_city.strip() or "Base city"
    if ref == "getaway":
        destination = str((trip.getaway or {}).get("destination", "") or "").strip()
        return destination or "Getaway destination — undecided"
    return str(getattr(point, "text", "") or "").strip() or "Somewhere"


def slot_line(slot: SlotSnapshotModel, trip: TripSnapshotModel) -> str:
    """One stop, as one readable line for a prompt."""
    bits = [f"[{slot.id}] {slot.label or slot.kind}"]
    bits.append(f"kind: {slot.kind}")
    if slot.daypart:
        bits.append(f"time of day: {slot.daypart}")
    if slot.optional:
        bits.append("OPTIONAL")
    if slot.kind == "travel" and slot.travel is not None:
        bits.append(
            f"from {travel_point_label(slot.travel.from_point, trip)} "
            f"to {travel_point_label(slot.travel.to_point, trip)} "
            f"by {slot.travel.mode}"
        )
    if slot.allowed_categories:
        bits.append("categories allowed: " + ", ".join(slot.allowed_categories))
    if slot.preferred_categories:
        bits.append("preferred: " + ", ".join(slot.preferred_categories))
    if slot.purpose:
        bits.append(f"purpose: {slot.purpose}")
    if slot.cues:
        bits.append("cues: " + "; ".join(slot.cues))
    if slot.exclusions:
        bits.append("exclusions: " + "; ".join(slot.exclusions))
    return "  - " + " · ".join(bits)


def trip_facts(trip: TripSnapshotModel) -> list[str]:
    """The trip as plain lines. Blank fields are left out, not printed as blank.

    "Unspecified" is a real answer and repeating it eleven times buries the two
    answers that matter.
    """
    lines: list[str] = []
    if trip.title_seed.strip():
        lines.append(f"Working title: {trip.title_seed.strip()}")
    if trip.base_city.strip():
        lines.append(f"Base city: {trip.base_city.strip()}")
    lines.append(
        "Scope: includes an overnight getaway"
        if trip.scope == "with_getaway"
        else "Scope: city only"
    )
    timing = trip.timing or {}
    mode = str(timing.get("mode", "evergreen"))
    if mode == "specific_dates" and timing.get("startDate"):
        lines.append(f"Dates: starting {timing['startDate']}")
    elif mode == "weekday_sequence" and timing.get("firstWeekday"):
        lines.append(f"Starts on a {timing['firstWeekday']}")
    else:
        lines.append(
            "Timing: evergreen — no weekday is chosen, so nothing may assume one"
        )
    if trip.preferred_areas:
        lines.append("Preferred areas: " + ", ".join(trip.preferred_areas))
    if trip.starting_base.strip():
        lines.append(f"Starting base: {trip.starting_base.strip()}")

    labels = {
        "audience": "Who this is for",
        "budgetStyle": "Budget style",
        "budgetNote": "Budget note",
        "pace": "Pace",
        "transportNote": "Transport note",
        "walkingTolerance": "Walking tolerance",
        "dietaryNeeds": "Dietary needs",
        "accessNeeds": "Access needs",
        "mustInclude": "Must include",
        "avoid": "Avoid",
    }
    preferences = trip.shared_preferences or {}
    for key, label in labels.items():
        value = preferences.get(key)
        if isinstance(value, str) and value.strip() and value.strip() != "unspecified":
            lines.append(f"{label}: {value.strip()}")
    transport = preferences.get("transport")
    if isinstance(transport, list) and transport:
        lines.append("Getting around: " + ", ".join(str(item) for item in transport))

    for key, label in (("dietaryNeeds", "Dietary needs"), ("accessNeeds", "Access needs")):
        value = preferences.get(key)
        if not (isinstance(value, str) and value.strip()):
            lines.append(
                f"{label}: not specified — treat as unknown, never as 'none'"
            )

    if trip.scope == "with_getaway":
        getaway = trip.getaway or {}
        destination = str(getaway.get("destination", "") or "").strip()
        lines.append(
            "Getaway: "
            + (destination or "destination undecided")
            + f" · day {getaway.get('departureDay') or '?'} to day {getaway.get('returnDay') or '?'}"
        )
    return lines


def other_day_lines(
    setup: SetupSnapshot,
    day_id: str,
    results: dict[str, StoredResult],
    directions: dict[str, DayDirection],
) -> list[str]:
    """Every other day, labelled by how settled it actually is.

    Four states and they are not interchangeable: a tentative layout, an agreed
    direction, an incomplete saved result and a complete one. Collapsing them
    would let a day reserve a venue nobody has chosen, or treat a half-finished
    day as a fixture the next day must not repeat.
    """
    lines: list[str] = []
    for index, day in enumerate(setup.days):
        if day.id == day_id:
            continue
        number = index + 1
        date = day_date_label(setup.trip, index)
        head = f"Day {number}" + (f" ({date})" if date else "")
        label = day.label.strip()
        if label and label != f"Day {number}":
            head += f" — {label}"
        head += f" · layout: {day.source_template_name or 'custom'} · {window_label(day)}"
        lines.append(head)
        lines.append(
            "    stops: "
            + ", ".join(
                f"{slot.label or slot.kind}{' (optional)' if slot.optional else ''}"
                for slot in day.slots
            )
        )
        direction = directions.get(day.id)
        if direction is not None and direction.promise:
            lines.append(f"    AGREED DIRECTION: {direction.promise}")
        stored = results.get(day.id)
        if stored is None:
            lines.append("    No researched day saved yet — this is intent, not a booking.")
            continue
        selected = [stop for stop in stored.result.stops if stop.status == "selected"]
        state = (
            "COMPLETE FOR PLANNING"
            if stored.report.completeness.complete
            else "SAVED BUT INCOMPLETE"
        )
        lines.append(f"    SAVED RESULT ({state}): {stored.result.title or 'untitled'}")
        if selected:
            lines.append(
                "    already used: "
                + "; ".join(f"{stop.name}" for stop in selected if stop.name)
            )
        memory = stored.result.trip_memory
        if memory.reserved_for_later:
            lines.append("    reserved for later: " + "; ".join(memory.reserved_for_later))
        if memory.next_day_implications:
            lines.append(
                "    consequences for the next day: "
                + "; ".join(memory.next_day_implications)
            )
    return lines


def context_key(
    setup: SetupSnapshot,
    day_id: str,
    results: dict[str, StoredResult],
    accepted_direction: DayDirection | None = None,
) -> str:
    """The fingerprint of everything this day's work depends on."""
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id} in this workspace")
    payload = {
        "trip": setup.trip.model_dump(by_alias=True),
        "day": day.model_dump(by_alias=True, exclude={"approved_at"}),
        "position": setup.day_number(day_id),
        "others": [
            {
                "id": other.id,
                "label": other.label,
                "window": other.available_time.model_dump(by_alias=True),
                "slots": [
                    {"id": slot.id, "label": slot.label, "kind": slot.kind}
                    for slot in other.slots
                ],
                "result": (
                    None
                    if other.id not in results
                    else results[other.id].content_hash
                ),
            }
            for other in setup.days
            if other.id != day_id
        ],
        "direction": (
            None if accepted_direction is None else accepted_direction.model_dump()
        ),
    }
    return stable_hash(payload)


def day_brief(
    setup: SetupSnapshot,
    day_id: str,
    results: dict[str, StoredResult],
    directions: dict[str, DayDirection],
) -> str:
    """Everything about this day, as one block of prose for a prompt."""
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id} in this workspace")
    number = setup.day_number(day_id)
    date = day_date_label(setup.trip, number - 1)

    blocks = ["THE TRIP (entered once, inherited by every day):"]
    blocks.extend(f"- {line}" for line in trip_facts(setup.trip))
    blocks.append("")
    blocks.append(
        f"THE DAY YOU ARE PLANNING: day {number} of {len(setup.days)}"
        + (f", {date}" if date else "")
        + f" · id {day.id}"
    )
    if day.label.strip() and day.label.strip() != f"Day {number}":
        blocks.append(f"- Working label: {day.label.strip()}")
    blocks.append(f"- Layout: {day.source_template_name or 'custom'}")
    blocks.append(f"- Usable time: {window_label(day)}")
    blocks.append("- Approved stops, in order:")
    blocks.extend(slot_line(slot, setup.trip) for slot in day.slots)
    if day.setup_notes.strip():
        blocks.append(f"- Constraints entered during setup: {day.setup_notes.strip()}")
    if day.preparation_notes.strip():
        blocks.append(f"- Preparation notes for this day: {day.preparation_notes.strip()}")

    others = other_day_lines(setup, day_id, results, directions)
    blocks.append("")
    if others:
        blocks.append("THE OTHER DAYS OF THIS TRIP:")
        blocks.extend(others)
    else:
        blocks.append("THE OTHER DAYS OF THIS TRIP: none; this is the only day.")
    return "\n".join(blocks)


# ------------------------------------------------------- the compact brief --
#
# The research call used to be handed `day_brief` above plus the direction as
# pretty-printed JSON plus the whole interview replayed. What follows is the
# same information said once. Nothing is paraphrased: the functions only
# choose which lines to print and drop lines that are exact repeats.


def _preference_lines(trip: TripSnapshotModel) -> list[str]:
    labels = {
        "audience": "For",
        "budgetStyle": "Budget",
        "budgetNote": "Budget note",
        "pace": "Pace",
        "transportNote": "Transport note",
        "walkingTolerance": "Walking",
        "mustInclude": "Must include",
        "avoid": "Avoid",
    }
    preferences = trip.shared_preferences or {}
    lines: list[str] = []
    for key, label in labels.items():
        value = preferences.get(key)
        if isinstance(value, str) and value.strip() and value.strip() != "unspecified":
            lines.append(f"{label}: {value.strip()}")
    transport = preferences.get("transport")
    if isinstance(transport, list) and transport:
        lines.append("Getting around: " + ", ".join(str(item) for item in transport))
    return lines


def compact_trip_lines(trip: TripSnapshotModel) -> list[str]:
    """The trip in as few lines as it takes, blanks left out.

    Unknown dietary and access needs are stated once, as unknown, with the
    consequence spelled out: the research neither assumes there are none nor
    sets out to prove a stop suits every possible need. The audited day turned
    a blank into "survive any answer" and paid for it in searches.
    """
    head = [trip.base_city.strip() or "City not named"]
    head.append("with an overnight getaway" if trip.scope == "with_getaway" else "city only")
    timing = trip.timing or {}
    mode = str(timing.get("mode", "evergreen"))
    if mode == "specific_dates" and timing.get("startDate"):
        head.append(f"dates from {timing['startDate']}")
    elif mode == "weekday_sequence" and timing.get("firstWeekday"):
        head.append(f"starts on a {timing['firstWeekday']}")
    else:
        head.append("evergreen: no weekday is chosen, so assume none")
    lines = [" · ".join(head)]
    if trip.title_seed.strip():
        lines.append(f"Working title: {trip.title_seed.strip()}")
    if trip.preferred_areas:
        lines.append("Preferred areas: " + ", ".join(trip.preferred_areas))
    lines.append(
        f"Lodging: {trip.starting_base.strip()}"
        if trip.starting_base.strip()
        else "Lodging: unknown, so the day's arrival and departure journeys are not planned"
    )
    lines.extend(_preference_lines(trip))

    preferences = trip.shared_preferences or {}
    known = {
        label: str(preferences.get(key) or "").strip()
        for key, label in (("dietaryNeeds", "Dietary needs"), ("accessNeeds", "Access needs"))
    }
    for label, value in known.items():
        if value:
            lines.append(f"{label}: {value}")
    missing = [label.split()[0].lower() for label, value in known.items() if not value]
    if missing:
        lines.append(
            f"{' and '.join(missing).capitalize()} needs: not specified. Treat as "
            "unknown: never claim a stop suits every need, and research them only "
            "where the direction below makes them a requirement."
        )
    if trip.scope == "with_getaway":
        getaway = trip.getaway or {}
        destination = str(getaway.get("destination", "") or "").strip()
        lines.append(
            "Getaway: "
            + (destination or "destination undecided")
            + f", day {getaway.get('departureDay') or '?'} to day {getaway.get('returnDay') or '?'}"
        )
    return lines


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0] + "…"


def compact_other_days(
    setup: SetupSnapshot,
    day_id: str,
    results: dict[str, StoredResult],
    directions: dict[str, DayDirection],
) -> list[str]:
    """Other days as continuity, not as descriptions.

    What this day needs from them is what it must not repeat and what it must
    leave alone: the places already chosen, what they reserve, and what they
    say the next day has to take into account. Their promise is clipped
    because it is context for this day, not a requirement of it.
    """
    lines: list[str] = []
    for index, day in enumerate(setup.days):
        if day.id == day_id:
            continue
        number = index + 1
        date = day_date_label(setup.trip, index)
        head = f"Day {number}" + (f" ({date})" if date else "")
        label = day.label.strip()
        if label and label != f"Day {number}":
            head += f", {label}"
        stops = ", ".join(
            (slot.label or slot.kind) + (" (optional)" if slot.optional else "")
            for slot in day.slots
        )
        lines.append(f"{head}: {stops}")
        direction = directions.get(day.id)
        if direction is not None and direction.promise:
            lines.append(f"  Agreed: {_clip(direction.promise, 180)}")
        stored = results.get(day.id)
        if stored is None:
            lines.append("  Not researched yet.")
            continue
        state = "complete" if stored.report.completeness.complete else "saved, incomplete"
        used = [stop.name for stop in stored.result.stops if stop.status == "selected" and stop.name]
        lines.append(f"  Researched ({state}). Uses: " + ("; ".join(used) or "nothing named"))
        memory = stored.result.trip_memory
        if memory.reserved_for_later:
            lines.append("  Reserves: " + "; ".join(memory.reserved_for_later))
        if memory.next_day_implications:
            lines.append("  For the next day: " + "; ".join(memory.next_day_implications))
    return lines
