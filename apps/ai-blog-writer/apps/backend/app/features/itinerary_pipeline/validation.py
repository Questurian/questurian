"""What a pasted day has to survive before it can be saved.

Seven layers, in the order of plan section 9, each answering a different
question and each with its own remedy:

1. transport   — is this text at all, and can one JSON object be got out of it
2. schema      — is it the shape this contract describes
3. identity    — is it an answer to the request this day actually made
4. structure   — does it describe this day's stops, once each, honestly
5. evidence    — do the references resolve, and do assertions carry any
6. schedule    — does the arithmetic hold
7. review      — what should a person look at before trusting it

Three things this file will not do, all of them for the same reason.

It does not repair. No guessing an object out of prose, no fixing commas, no
model call to "clean up" a paste. A day that was silently repaired is a day
nobody read.

It does not retarget. A packet for the wrong day, or answering a request that
has since gone stale, is refused with an explanation of what changed. Editing
the ids to make it fit would attach researched content to a day it was not
researched for.

It does not verify. A resolving claim graph proves that references connect. It
does not prove the page says what the claim says it says, and nothing here
pretends otherwise: evidence is shown as unchecked until a person says
otherwise.

**Two answer formats, one set of checks.** A v1 answer is read as the saved
shape directly. A compact v2 answer is read as its own small model and turned
into the saved shape by `research_adapter.adapt` -- once, here -- and from that
point every layer below runs on the same object whichever format arrived. The
format is dispatched on `contractVersion` and nowhere else; an unknown version
is refused by name.

**Filled rows are not a day.** A day is complete for planning only when its
journeys exist and fit: every pair of consecutive selected stops has a leg with
a known time, a finish plus that journey fits before the next start, a rest
has room, and a return to base has its two legs. Code can prove that the
arithmetic holds. It cannot prove the geography, and says so.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError

from .context import window_label
from .contracts import (
    CompletenessReport,
    DayPromptExport,
    DayResult,
    DaySnapshotModel,
    READABLE_ANSWER_VERSIONS,
    RESEARCH_WIRE_VERSION,
    RESULT_CONTRACT_VERSION,
    ValidationIssue,
    ValidationReport,
    stable_hash,
)
from .research_adapter import AdapterContext, adapt
from .research_contract import WireAnswer, unknown_wire_fields

# A stretch longer than this with nothing planned in it needs a reason.
UNEXPLAINED_GAP_MINUTES = 90

# One MiB. A real day with a full evidence graph measured about 38 KB, so this
# is thirty times the largest thing anyone has actually produced -- big enough
# not to be hit by an honest paste, small enough that a paste of the wrong
# thing entirely is refused before it is parsed.
MAX_PASTE_BYTES = 1024 * 1024

_FENCE = re.compile(r"^```(?:json)?\s*\n(.*)\n```$", re.S)
_ALLOWED_SCHEMES = {"http", "https"}


class PasteRejected(ValueError):
    """The paste could not become a candidate day at all."""

    def __init__(self, message: str, *, layer: str = "transport") -> None:
        super().__init__(message)
        self.layer = layer


def _issue(severity: str, layer: str, message: str, path: str = "") -> ValidationIssue:
    return ValidationIssue(severity=severity, layer=layer, path=path, message=message)


# ---------------------------------------------------------- 1 · transport --


def normalize_paste(raw: str) -> tuple[str, list[str]]:
    """Text in, text out, with only the harmless normalisations named.

    Exactly three are performed, and each one is reported: a byte-order mark
    from a copy out of some editors, surrounding whitespace, and ONE complete
    fenced code block wrapping the whole thing, which is what a chat window
    hands you.

    Nothing else. In particular, no attempt to find an object inside prose: a
    reply that is half explanation and half JSON is a reply the operator should
    see and re-ask for, not one this function should go mining in.
    """
    notes: list[str] = []
    if raw is None:
        raise PasteRejected("There is nothing to read.")
    text = raw
    if text.startswith("﻿"):
        text = text.lstrip("﻿")
        notes.append("Removed a byte-order mark from the start.")
    stripped = text.strip()
    if stripped != text:
        notes.append("Trimmed surrounding whitespace.")
    text = stripped
    if not text:
        raise PasteRejected("There is nothing to read.")
    if len(text.encode("utf-8")) > MAX_PASTE_BYTES:
        raise PasteRejected(
            "That is larger than one megabyte. A whole researched day is "
            "normally well under a tenth of that, so this is probably not the "
            "JSON object."
        )
    fenced = _FENCE.match(text)
    if fenced:
        text = fenced.group(1).strip()
        notes.append("Unwrapped one surrounding ``` code fence.")
    return text, notes


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Refuse an object that names the same key twice.

    Python's default keeps the last one, which means a packet carrying two
    different `inputHash` values would validate against whichever happened to
    come second. Two answers is not an answer.
    """
    seen: dict[str, Any] = {}
    for key, value in pairs:
        if key in seen:
            raise PasteRejected(
                f'The JSON names "{key}" twice in the same object. It is not '
                "clear which one is meant, so nothing was read.",
                layer="schema",
            )
        seen[key] = value
    return seen


def parse_paste(raw: str) -> tuple[dict[str, Any], list[str]]:
    text, notes = normalize_paste(raw)
    try:
        parsed = json.loads(text, object_pairs_hook=_reject_duplicate_keys)
    except PasteRejected:
        raise
    except json.JSONDecodeError as error:
        raise PasteRejected(
            f"That is not valid JSON: {error.msg} (line {error.lineno}, "
            f"column {error.colno}).",
            layer="schema",
        ) from error
    if not isinstance(parsed, dict):
        raise PasteRejected(
            "The top level has to be one JSON object. This is a "
            f"{type(parsed).__name__}.",
            layer="schema",
        )
    return parsed, notes


# ------------------------------------------------------------- 2 · schema --


def _readable_path(location: tuple[Any, ...], day: DaySnapshotModel) -> str:
    """A pydantic error path, said the way the screen reads it.

    `('stops', 2, 'durationMinutes')` becomes `stops → Lunch → durationMinutes`,
    because the operator is looking at a day, not at an array index.
    """
    labels = {index: slot for index, slot in enumerate(day.slots)}
    parts: list[str] = []
    for index, piece in enumerate(location):
        if piece == "stops":
            parts.append("stops")
            continue
        if parts and parts[-1] == "stops" and isinstance(piece, int):
            slot = labels.get(piece)
            parts.append(slot.label or slot.id if slot else f"row {piece + 1}")
            continue
        parts.append(str(piece))
    return " → ".join(parts)


# Fields the contract knows about at the top level. Anything else in a packet
# is dropped by the model and named here, so "we ignored this" is something the
# operator reads rather than something that happens to them.
_KNOWN_TOP_LEVEL = {
    "contractVersion", "workspaceId", "dayId", "exportId", "inputHash",
    "research", "status", "title", "dayIntro", "tripRole", "scheduleLabel",
    "stops", "transfers", "restWindows", "sources", "claims", "feasibility",
    "proposedChanges", "tripMemory", "editorNotes",
}


_KNOWN_STOP_FIELDS = {
    "slotId", "status", "name", "category", "addressOrMeetingPoint", "area",
    "mapsUrl", "startMinutes", "durationMinutes", "whyHere", "readerCopy",
    "whatToDo", "practicalNotes", "claimIds", "selectionReason",
    "unresolvedReason",
}


def unknown_fields(payload: dict[str, Any]) -> list[str]:
    """Keys this contract has no place for, at the top level and on a stop.

    Reported, not refused. A model that adds one helpful extra key should not
    cost the operator a twelve-kilobyte day's research — but nothing should
    disappear without being mentioned either.

    Two levels rather than a full walk: the top level is where a packet built
    against a different contract shows up, and a stop is the richest object in
    the packet and so the likeliest place for a model to volunteer something.
    """
    found = {key for key in payload if key not in _KNOWN_TOP_LEVEL}
    stops = payload.get("stops")
    if isinstance(stops, list):
        for stop in stops:
            if isinstance(stop, dict):
                found |= {
                    f"stops.{key}"
                    for key in stop
                    if key not in _KNOWN_STOP_FIELDS
                }
    return sorted(found)


def _schema_errors(error: ValidationError, day: DaySnapshotModel, notes: list[ValidationIssue]):
    issues = list(notes)
    for detail in error.errors()[:40]:
        issues.append(
            _issue(
                "error",
                "schema",
                str(detail.get("msg", "is not the expected shape")),
                _readable_path(tuple(detail.get("loc", ())), day),
            )
        )
    return issues


def _extra_fields_note(extra: list[str]) -> list[ValidationIssue]:
    if not extra:
        return []
    return [
        _issue(
            "warning",
            "schema",
            "This answer carried fields the app has no place for, and they "
            "were left out: " + ", ".join(extra[:12]),
            "extra fields",
        )
    ]


def read_result(
    payload: dict[str, Any],
    day: DaySnapshotModel,
    adapter: AdapterContext | None = None,
) -> tuple[DayResult | None, list[ValidationIssue]]:
    """The saved shape, from whichever answer format arrived.

    A compact answer is read as the compact model first, so a schema error
    names a field the answer actually has, and only then adapted.
    """
    version = payload.get("contractVersion")
    if version not in READABLE_ANSWER_VERSIONS:
        return None, [
            _issue(
                "error",
                "schema",
                f'This says it is "{version}". This app reads '
                + " or ".join(f'"{known}"' for known in READABLE_ANSWER_VERSIONS)
                + ". Copy the prompt again and answer the format at the end of it.",
                "contractVersion",
            )
        ]

    if version == RESEARCH_WIRE_VERSION:
        notes = _extra_fields_note(unknown_wire_fields(payload))
        try:
            answer = WireAnswer.model_validate(payload)
        except ValidationError as error:
            return None, _schema_errors(error, day, notes)
        context = adapter or AdapterContext(day=day, schedule_label=window_label(day))
        adapted, adapter_notes = adapt(answer, context)
        notes += [
            _issue("warning", "evidence", note, "evidence") for note in adapter_notes
        ]
        payload = adapted
    else:
        notes = _extra_fields_note(unknown_fields(payload))
    try:
        return DayResult.model_validate(payload), notes
    except ValidationError as error:
        return None, _schema_errors(error, day, notes)


# ----------------------------------------------------------- 3 · identity --


def check_identity(
    result: DayResult,
    *,
    export: DayPromptExport,
    workspace_id: str,
    day_id: str,
    current_context_key: str,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if result.workspace_id != workspace_id:
        issues.append(
            _issue(
                "error",
                "identity",
                "This answer belongs to a different itinerary workspace.",
                "workspaceId",
            )
        )
    if result.day_id != day_id:
        issues.append(
            _issue(
                "error",
                "identity",
                f'This answer is for day "{result.day_id}", and you are importing '
                f'into "{day_id}". Import it into the day it was researched for.',
                "dayId",
            )
        )
    if result.export_id != export.export_id:
        issues.append(
            _issue(
                "error",
                "identity",
                "This answers a different copy of the prompt than the one this "
                "day is expecting.",
                "exportId",
            )
        )
    if result.input_hash != export.input_hash:
        issues.append(
            _issue(
                "error",
                "identity",
                "The identity stamp does not match the prompt that was copied. "
                "Copy the prompt again and re-run it.",
                "inputHash",
            )
        )
    arrived = result.wire_version or RESULT_CONTRACT_VERSION
    if arrived != export.schema_version:
        issues.append(
            _issue(
                "error",
                "identity",
                f'This answer is written as "{arrived}", and the prompt it names '
                f'asked for "{export.schema_version}". Answer the format at the end '
                "of that prompt.",
                "contractVersion",
            )
        )
    if current_context_key and export.context_key != current_context_key:
        issues.append(
            _issue(
                "error",
                "identity",
                "This day has changed since that prompt was copied — the trip, "
                "the layout, the notes or another day's result. Copy a fresh "
                "prompt; this research answers the old question.",
                "context",
            )
        )
    return issues


# ---------------------------------------------------------- 4 · structure --


def check_structure(
    result: DayResult, *, export: DayPromptExport, day: DaySnapshotModel
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    expected = list(export.slot_ids)
    optional = set(export.optional_slot_ids)
    by_id = {slot.id: slot for slot in day.slots}

    returned = [stop.slot_id for stop in result.stops]
    unknown = [slot_id for slot_id in returned if slot_id not in expected]
    for slot_id in unknown:
        issues.append(
            _issue(
                "error",
                "structure",
                f'"{slot_id}" is not a stop on this day.',
                f"stops → {slot_id}",
            )
        )
    counts: dict[str, int] = {}
    for slot_id in returned:
        counts[slot_id] = counts.get(slot_id, 0) + 1
    for slot_id, count in counts.items():
        if count > 1:
            issues.append(
                _issue(
                    "error",
                    "structure",
                    f"This stop appears {count} times. It has to appear exactly once.",
                    f"stops → {by_id[slot_id].label if slot_id in by_id else slot_id}",
                )
            )
    missing = [slot_id for slot_id in expected if slot_id not in counts]
    for slot_id in missing:
        slot = by_id.get(slot_id)
        issues.append(
            _issue(
                "error",
                "structure",
                "This stop is missing from the answer. Every approved stop needs "
                "a row, even an unresolved one.",
                f"stops → {slot.label if slot else slot_id}",
            )
        )
    known_returned = [slot_id for slot_id in returned if slot_id in expected]
    if not missing and not unknown and known_returned != expected:
        issues.append(
            _issue(
                "error",
                "structure",
                "The stops came back in a different order than the approved "
                "layout. The order is part of the day.",
                "stops",
            )
        )

    for stop in result.stops:
        slot = by_id.get(stop.slot_id)
        if slot is None:
            continue
        where = f"stops → {slot.label or slot.id}"
        if stop.status == "omitted_optional" and stop.slot_id not in optional:
            issues.append(
                _issue(
                    "error",
                    "structure",
                    "This stop is required, so it cannot be omitted. If nothing "
                    "fits, it is unresolved.",
                    where,
                )
            )
        if stop.status == "selected":
            # What "resolved" means depends on the kind, and conflating them is
            # how a free-time window gets refused for having no venue -- or
            # worse, how one gets filled with a venue to satisfy a check.
            if slot.kind in {"place", "experience"}:
                if not (stop.name or "").strip():
                    issues.append(
                        _issue(
                            "error",
                            "structure",
                            "A selected place or experience needs a name.",
                            where,
                        )
                    )
                if not (stop.address_or_meeting_point or "").strip():
                    issues.append(
                        _issue(
                            "error",
                            "structure",
                            "A selected place or experience needs an address or a "
                            "meeting point.",
                            where,
                        )
                    )
            elif stop.duration_minutes is None:
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        "This stop is planned rather than chosen, so it needs a "
                        "duration. There is nothing else to resolve about it.",
                        where,
                    )
                )
            if not (stop.reader_copy or "").strip():
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        "A selected stop needs reader copy.",
                        where,
                    )
                )
            if stop.unresolved_reason:
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        "This is marked selected and also carries a reason it "
                        "could not be resolved. It cannot be both.",
                        where,
                    )
                )
            if slot.allowed_categories and stop.category:
                if stop.category not in slot.allowed_categories:
                    issues.append(
                        _issue(
                            "error",
                            "structure",
                            f'"{stop.category}" is not one of the categories this '
                            f"stop allows ({', '.join(slot.allowed_categories)}).",
                            where,
                        )
                    )
            if slot.kind == "free_time" and (stop.name or "").strip():
                issues.append(
                    _issue(
                        "warning",
                        "structure",
                        "This is a free-time stop and it came back with a venue. "
                        "Free time is a window, not a place to be found.",
                        where,
                    )
                )
        if stop.status == "unresolved":
            if not (stop.unresolved_reason or "").strip():
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        "An unresolved stop has to say why.",
                        where,
                    )
                )
            if (stop.name or "").strip():
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        "This is marked unresolved and names a place. An "
                        "unresolved stop leaves the name empty.",
                        where,
                    )
                )

    # Travel endpoints have to exist. A transfer between two things that are
    # not on this day describes a different day.
    endpoints = {*expected, "base_start", "base", "base_end"}
    for index, transfer in enumerate(result.transfers, start=1):
        for label, value in (("from", transfer.from_ref), ("to", transfer.to_ref)):
            if value not in endpoints:
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        f'Transfer {index} goes {label} "{value}", which is not a '
                        "stop on this day.",
                        f"transfers → {index}",
                    )
                )
    return issues


# ----------------------------------------------------------- 5 · evidence --


def check_evidence(result: DayResult, day: DaySnapshotModel) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    source_ids: set[str] = set()
    for source in result.sources:
        if source.id in source_ids:
            issues.append(
                _issue(
                    "error",
                    "evidence",
                    f'Two sources share the id "{source.id}".',
                    "sources",
                )
            )
        source_ids.add(source.id)
        parsed = urlparse(source.url)
        if parsed.scheme.lower() not in _ALLOWED_SCHEMES or not parsed.netloc:
            issues.append(
                _issue(
                    "error",
                    "evidence",
                    f'Source "{source.id}" is not an http or https page: '
                    f"{source.url[:120]}",
                    "sources",
                )
            )

    claim_ids: set[str] = set()
    for claim in result.claims:
        if claim.id in claim_ids:
            issues.append(
                _issue(
                    "error", "evidence", f'Two claims share the id "{claim.id}".', "claims"
                )
            )
        claim_ids.add(claim.id)
        for source_id in claim.source_ids:
            if source_id not in source_ids:
                issues.append(
                    _issue(
                        "error",
                        "evidence",
                        f'Claim "{claim.id}" cites source "{source_id}", which is '
                        "not in the source list.",
                        "claims",
                    )
                )
        if not claim.source_ids:
            issues.append(
                _issue(
                    "warning",
                    "evidence",
                    f'Claim "{claim.id}" has no source behind it.',
                    "claims",
                )
            )

    by_id = {slot.id: slot for slot in day.slots}
    for stop in result.stops:
        slot = by_id.get(stop.slot_id)
        where = f"stops → {slot.label if slot else stop.slot_id}"
        for claim_id in stop.claim_ids:
            if claim_id not in claim_ids:
                issues.append(
                    _issue(
                        "error",
                        "evidence",
                        f'This stop cites claim "{claim_id}", which is not in the '
                        "claim list.",
                        where,
                    )
                )
        if (
            stop.status == "selected"
            and slot is not None
            and slot.kind in {"place", "experience"}
            and not stop.claim_ids
        ):
            issues.append(
                _issue(
                    "error",
                    "evidence",
                    "This stop names a real place and cites nothing. Every "
                    "selected place needs the evidence it was chosen on.",
                    where,
                )
            )

    for index, entry in enumerate(result.feasibility, start=1):
        for source_id in entry.source_ids:
            if source_id not in source_ids:
                issues.append(
                    _issue(
                        "error",
                        "evidence",
                        f'A feasibility note cites source "{source_id}", which is '
                        "not in the source list.",
                        f"feasibility → {index}",
                    )
                )
    for transfer_index, transfer in enumerate(result.transfers, start=1):
        for source_id in transfer.source_ids:
            if source_id not in source_ids:
                issues.append(
                    _issue(
                        "error",
                        "evidence",
                        f'Transfer {transfer_index} cites source "{source_id}", '
                        "which is not in the source list.",
                        f"transfers → {transfer_index}",
                    )
                )
    return issues


# ----------------------------------------------------------- 6 · schedule --


def _clock(minutes: int | None) -> str:
    if minutes is None:
        return "unknown"
    day_offset = minutes // 1440
    within = minutes % 1440
    tail = " (next day)" if day_offset else ""
    return f"{within // 60:02d}:{within % 60:02d}{tail}"


def check_schedule(result: DayResult, day: DaySnapshotModel) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    by_id = {slot.id: slot for slot in day.slots}

    timed = [
        stop
        for stop in result.stops
        if stop.status == "selected" and stop.start_minutes is not None
    ]
    ordered = sorted(timed, key=lambda stop: stop.start_minutes or 0)
    if [stop.slot_id for stop in ordered] != [stop.slot_id for stop in timed]:
        issues.append(
            _issue(
                "error",
                "schedule",
                "The times run backwards somewhere: a stop starts before the one "
                "that comes before it.",
                "stops",
            )
        )

    for first, second in zip(ordered, ordered[1:]):
        if first.duration_minutes is None or first.start_minutes is None:
            continue
        ends = first.start_minutes + first.duration_minutes
        if second.start_minutes is not None and ends > second.start_minutes:
            label = by_id.get(first.slot_id)
            issues.append(
                _issue(
                    "error",
                    "schedule",
                    f"This runs until {_clock(ends)} and the next stop starts at "
                    f"{_clock(second.start_minutes)}. They overlap, and there is no "
                    "time for the transfer between them.",
                    f"stops → {label.label if label else first.slot_id}",
                )
            )

    # The usable window, when the day names one. Only a custom window carries
    # real clock times; the named ones are coarse labels and are not arithmetic.
    time = day.available_time
    if time.id == "custom" and time.custom_start and time.custom_end:
        try:
            start_h, start_m = (int(part) for part in time.custom_start.split(":"))
            end_h, end_m = (int(part) for part in time.custom_end.split(":"))
        except (ValueError, TypeError):
            start_h = start_m = end_h = end_m = -1
        if start_h >= 0:
            window_start = start_h * 60 + start_m
            window_end = end_h * 60 + end_m + (1440 if time.ends_next_day else 0)
            for stop in timed:
                assert stop.start_minutes is not None
                if stop.start_minutes < window_start:
                    label = by_id.get(stop.slot_id)
                    issues.append(
                        _issue(
                            "warning",
                            "schedule",
                            f"This starts at {_clock(stop.start_minutes)}, before the "
                            f"day's window opens at {time.custom_start}.",
                            f"stops → {label.label if label else stop.slot_id}",
                        )
                    )
                finish = stop.start_minutes + (stop.duration_minutes or 0)
                if finish > window_end:
                    label = by_id.get(stop.slot_id)
                    issues.append(
                        _issue(
                            "warning",
                            "schedule",
                            f"This finishes at {_clock(finish)}, after the day's "
                            f"window closes at {time.custom_end}.",
                            f"stops → {label.label if label else stop.slot_id}",
                        )
                    )

    for index, transfer in enumerate(result.transfers, start=1):
        if (
            transfer.minutes_min is not None
            and transfer.minutes_max is not None
            and transfer.minutes_min > transfer.minutes_max
        ):
            issues.append(
                _issue(
                    "error",
                    "schedule",
                    "The shortest time for this transfer is longer than the "
                    "longest.",
                    f"transfers → {index}",
                )
            )
        if transfer.basis == "sourced" and not transfer.source_ids:
            issues.append(
                _issue(
                    "warning",
                    "schedule",
                    "This transfer time is described as sourced and cites nothing.",
                    f"transfers → {index}",
                )
            )

    seen_rest: set[tuple[str, str]] = set()
    for index, rest in enumerate(result.rest_windows, start=1):
        pair = (rest.after_slot_id, rest.before_slot_id)
        if pair in seen_rest:
            issues.append(
                _issue(
                    "error",
                    "schedule",
                    "Two rest windows sit in the same gap.",
                    f"rest → {index}",
                )
            )
        seen_rest.add(pair)
        for slot_id in pair:
            if slot_id not in by_id:
                issues.append(
                    _issue(
                        "error",
                        "schedule",
                        f'A rest window refers to "{slot_id}", which is not a stop '
                        "on this day.",
                        f"rest → {index}",
                    )
                )
        after = by_id.get(rest.after_slot_id)
        before = by_id.get(rest.before_slot_id)
        if after is not None and after.kind == "free_time":
            issues.append(
                _issue(
                    "warning",
                    "schedule",
                    "This rest sits right after a free-time stop, which is already "
                    "unallocated time. Check it is not the same gap twice.",
                    f"rest → {index}",
                )
            )
        if before is not None and before.kind == "free_time":
            issues.append(
                _issue(
                    "warning",
                    "schedule",
                    "This rest sits right before a free-time stop, which is already "
                    "unallocated time. Check it is not the same gap twice.",
                    f"rest → {index}",
                )
            )
        if rest.location_policy == "return_to_base":
            legs = {(t.from_ref, t.to_ref) for t in result.transfers}
            going = any(to == "base_end" or to == "base_start" for _, to in legs)
            if not going:
                issues.append(
                    _issue(
                        "warning",
                        "schedule",
                        "This rest goes back to base and no transfer accounts for "
                        "the two legs that needs.",
                        f"rest → {index}",
                    )
                )
    return issues


# ------------------------------------------------------------- 7 · review --


def review_notes(result: DayResult, day: DaySnapshotModel) -> list[ValidationIssue]:
    """What a person should look at. Never a reason to block a save.

    Everything here is something the app noticed and cannot settle. A meal that
    looks heavy, a venue that also appears on another day, an unchecked
    opening-day question: these are judgements, and the app's job is to put
    them where the operator will see them rather than to decide them.
    """
    issues: list[ValidationIssue] = []
    basis = result.research.browsing_basis
    if basis == "unknown":
        issues.append(
            _issue(
                "warning",
                "review",
                "The app did not run this research, so it cannot tell whether any "
                "page was actually read. Treat every source as unchecked.",
                "research",
            )
        )
    elif not result.research.browsing_used:
        issues.append(
            _issue(
                "warning",
                "review",
                "The model says it did not browse. Nothing in this day was looked "
                "up, whatever its sources appear to show."
                if basis == "model"
                else "The run made no web searches and read no pages. Nothing in "
                "this day was looked up, whatever its sources appear to show.",
                "research",
            )
        )
    for limitation in result.research.limitations[:20]:
        issues.append(_issue("warning", "review", limitation, "research → limitations"))
    for entry in result.feasibility:
        if entry.status in {"conditional", "unresolved"}:
            issues.append(
                _issue(
                    "warning",
                    "review",
                    # A compact issue's topic already carries its text.
                    entry.topic
                    if entry.detail and entry.detail in entry.topic
                    else f"{entry.topic}: {entry.detail}",
                    f"feasibility → {entry.status}",
                )
            )
    for change in result.proposed_changes:
        issues.append(
            _issue(
                "warning",
                "review",
                f"Proposed change to the layout: {change.proposal} — {change.reason}",
                f"proposed change → {change.slot_id or 'the day'}",
            )
        )
    for note in result.editor_notes[:20]:
        issues.append(_issue("warning", "review", note, "editor notes"))

    names: dict[str, str] = {}
    for stop in result.stops:
        if stop.status != "selected" or not stop.name:
            continue
        key = stop.name.strip().casefold()
        if key in names:
            issues.append(
                _issue(
                    "warning",
                    "review",
                    f'"{stop.name}" is used twice in this day.',
                    "stops",
                )
            )
        names[key] = stop.slot_id

    if result.status == "ready_for_editor_review" and not result.wire_version:
        issues.append(
            _issue(
                "warning",
                "review",
                "The model called this ready. That is its own judgement about its "
                "own work; nothing here has been checked against the sources.",
                "status",
            )
        )
    return issues


# -------------------------------------------------------------- 6b · route --


def _span(stop) -> tuple[int, int] | None:
    if stop.start_minutes is None or stop.duration_minutes is None:
        return None
    return stop.start_minutes, stop.start_minutes + stop.duration_minutes


def check_route(
    result: DayResult, day: DaySnapshotModel, *, base_known: bool = False
) -> tuple[list[ValidationIssue], list[str], list[str]]:
    """Whether the journeys exist, and whether they fit.

    Returns the warnings, the legs that are missing or untimed, and the
    conflicts. Warnings rather than errors: a day with a missing leg is an
    unfinished day and still worth saving, and `completeness_of` is where it
    stops counting as finished.

    The unit is a pair of consecutive selected venues. Free time and travel
    rows between them are part of that stretch: free time takes time, and a
    travel row IS the journey, so its duration is not added again. An
    unresolved stop in the stretch means nothing about the stretch can be
    planned yet, so nothing is demanded of it.
    """
    issues: list[ValidationIssue] = []
    missing: list[str] = []
    conflicts: list[str] = []
    by_id = {slot.id: slot for slot in day.slots}
    kind = {slot.id: slot.kind for slot in day.slots}

    def name(slot_id: str) -> str:
        slot = by_id.get(slot_id)
        return (slot.label or slot.id) if slot else slot_id

    legs: dict[tuple[str, str], Any] = {}
    for leg in result.transfers:
        legs.setdefault((leg.from_ref, leg.to_ref), leg)

    rows = [stop for stop in result.stops if stop.slot_id in by_id]
    venues = [
        index
        for index, stop in enumerate(rows)
        if stop.status == "selected" and kind[stop.slot_id] in {"place", "experience"}
    ]

    def untimed(leg) -> bool:
        return leg is None or leg.minutes_max is None or leg.basis == "unknown"

    for first, second in zip(venues, venues[1:]):
        a, b = rows[first], rows[second]
        between = rows[first + 1 : second]
        if any(stop.status == "unresolved" for stop in between):
            continue
        planned = [stop for stop in between if stop.status == "selected"]
        travel = [stop for stop in planned if kind[stop.slot_id] == "travel"]
        free = [stop for stop in planned if kind[stop.slot_id] == "free_time"]
        stretch = {a.slot_id, b.slot_id, *(stop.slot_id for stop in between)}
        rests = [
            rest
            for rest in result.rest_windows
            if rest.after_slot_id in stretch and rest.before_slot_id in stretch
        ]
        home = next((rest for rest in rests if rest.location_policy == "return_to_base"), None)
        where = f"{name(a.slot_id)} → {name(b.slot_id)}"

        journey: int | None = 0
        if home is not None:
            out = legs.get((home.after_slot_id, "base")) or legs.get((a.slot_id, "base"))
            back = legs.get(("base", home.before_slot_id)) or legs.get(("base", b.slot_id))
            for leg, label in ((out, f"{name(a.slot_id)} → base"), (back, f"base → {name(b.slot_id)}")):
                if untimed(leg):
                    missing.append(
                        label + ("" if base_known else " (lodging unknown)")
                    )
                    journey = None
                elif journey is not None:
                    journey += leg.minutes_max
        elif travel:
            # The travel row is the journey. Its own timing is checked with
            # every other row; a leg for it is asked for, and accepted from
            # either side of the row.
            leg = legs.get((a.slot_id, b.slot_id)) or next(
                (
                    legs.get(pair)
                    for row in travel
                    for pair in ((a.slot_id, row.slot_id), (row.slot_id, b.slot_id))
                    if legs.get(pair) is not None
                ),
                None,
            )
            if leg is None:
                missing.append(where)
            journey = 0
        else:
            leg = legs.get((a.slot_id, b.slot_id))
            if untimed(leg):
                missing.append(where if leg is None else f"{where} (time unknown)")
                journey = None
            else:
                journey = leg.minutes_max

        span_a = _span(a)
        if travel or span_a is None or b.start_minutes is None or journey is None:
            continue
        gap = b.start_minutes - span_a[1]
        occupied = sum(stop.duration_minutes or 0 for stop in free)
        resting = sum(rest.minutes for rest in rests)
        needed = journey + occupied + resting
        if needed > gap:
            short = needed - gap
            conflicts.append(where)
            issues.append(
                _issue(
                    "warning",
                    "schedule",
                    f"{name(a.slot_id)} finishes at {_clock(span_a[1])} and "
                    f"{name(b.slot_id)} starts at {_clock(b.start_minutes)}: "
                    f"{gap} min, and the journey"
                    + (" and the rest" if resting else "")
                    + (" and the free time" if occupied else "")
                    + (" need" if resting or occupied else " needs")
                    + f" up to {needed}. It is {short} min short.",
                    f"stops → {name(b.slot_id)}",
                )
            )
        elif gap - needed > UNEXPLAINED_GAP_MINUTES and not rests and not free:
            issues.append(
                _issue(
                    "warning",
                    "schedule",
                    f"{gap - needed} min between {name(a.slot_id)} and "
                    f"{name(b.slot_id)} are not planned. Say what the reader does "
                    "with them and where, or close the gap.",
                    f"stops → {name(b.slot_id)}",
                )
            )

    if base_known and venues:
        first, last = rows[venues[0]], rows[venues[-1]]
        for pair, label in (
            (("base_start", first.slot_id), f"base → {name(first.slot_id)}"),
            ((last.slot_id, "base_end"), f"{name(last.slot_id)} → base"),
        ):
            if untimed(legs.get(pair)):
                missing.append(label)

    for label in missing:
        issues.append(
            _issue(
                "warning",
                "schedule",
                f"No journey with a known time: {label}. The day is not planned "
                "until it has one.",
                "transfers",
            )
        )
    return issues, missing, conflicts


# ------------------------------------------------------------ completeness --


def completeness_of(
    result: DayResult,
    *,
    export: DayPromptExport,
    day: DaySnapshotModel,
    base_known: bool = False,
) -> CompletenessReport:
    """Planning completeness, which is not validity and not verification.

    A day is complete for planning when every required stop is resolved, every
    selected stop has a time, its journeys exist and fit, and nothing critical
    is outstanding. It is still unchecked evidence and it is still not
    published.
    """
    optional = set(export.optional_slot_ids)
    by_id = {slot.id: slot for slot in day.slots}
    selected = [stop for stop in result.stops if stop.status == "selected"]
    unresolved = [stop for stop in result.stops if stop.status == "unresolved"]
    omitted = [stop for stop in result.stops if stop.status == "omitted_optional"]

    required_unresolved = [
        (by_id[stop.slot_id].label if stop.slot_id in by_id else stop.slot_id)
        for stop in unresolved
        if stop.slot_id not in optional
    ]
    missing_timing = [
        (by_id[stop.slot_id].label if stop.slot_id in by_id else stop.slot_id)
        for stop in selected
        if stop.start_minutes is None or stop.duration_minutes is None
    ]
    # A question the model itself could not settle. Named rather than counted,
    # because it is the one reason for "not complete" that has nowhere else to
    # appear -- the other two point at a stop the operator can see.
    outstanding = [
        entry.topic for entry in result.feasibility if entry.status == "unresolved"
    ]
    _, missing_legs, conflicts = check_route(result, day, base_known=base_known)
    return CompletenessReport(
        selected=len(selected),
        unresolved=len(unresolved),
        omitted_optional=len(omitted),
        required_unresolved=required_unresolved,
        missing_timing=missing_timing,
        outstanding_checks=outstanding,
        missing_legs=missing_legs,
        schedule_conflicts=conflicts,
        complete=not (
            required_unresolved or missing_timing or outstanding or missing_legs or conflicts
        ),
    )


# ------------------------------------------------------------ the whole run --


def validate_paste(
    raw: str,
    *,
    export: DayPromptExport,
    day: DaySnapshotModel,
    workspace_id: str,
    day_id: str,
    current_context_key: str,
    adapter: AdapterContext | None = None,
    base_known: bool = False,
) -> tuple[DayResult | None, ValidationReport, str]:
    """Every layer, in order, stopping only where continuing is meaningless.

    Returns the parsed result (when there is one), the report, and the hash of
    the normalised packet. The hash is what the Save is pinned to: a paste
    edited after the preview is a different packet and must be previewed again.
    """
    try:
        payload, notes = parse_paste(raw)
    except PasteRejected as rejected:
        return (
            None,
            ValidationReport(
                valid=False,
                issues=[_issue("error", rejected.layer, str(rejected))],
            ),
            "",
        )

    result, schema_issues = read_result(payload, day, adapter)
    if result is None:
        return (
            None,
            ValidationReport(valid=False, issues=schema_issues, normalizations=notes),
            "",
        )

    issues = [
        *schema_issues,
        *check_identity(
            result,
            export=export,
            workspace_id=workspace_id,
            day_id=day_id,
            current_context_key=current_context_key,
        ),
    ]
    # Structure, evidence and schedule all read ids off the packet. Running
    # them against a packet that belongs to another day produces pages of
    # confident nonsense about stops it was never meant to have.
    if not any(issue.layer == "identity" for issue in issues):
        issues.extend(check_structure(result, export=export, day=day))
        issues.extend(check_evidence(result, day))
        issues.extend(check_schedule(result, day))
        issues.extend(check_route(result, day, base_known=base_known)[0])
    issues.extend(review_notes(result, day))

    report = ValidationReport(
        valid=not any(issue.severity == "error" for issue in issues),
        issues=issues,
        normalizations=notes,
        completeness=completeness_of(
            result, export=export, day=day, base_known=base_known
        ),
    )
    return result, report, stable_hash(result.model_dump(by_alias=True))
