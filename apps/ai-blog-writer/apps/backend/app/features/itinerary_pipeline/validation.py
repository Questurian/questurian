"""What a returned proposal has to survive before it can be saved.

Four questions, in order, each with its own remedy:

1. transport -- is this text at all, and can one JSON object be got out of it
2. schema    -- is it the proposal shape
3. identity  -- is it an answer to the request this day actually made
4. structure -- does it fill this day's stops, once each, in order

That is all (ADR 0045). The article-shaped version also graded evidence
graphs, schedule arithmetic, route legs and the model's own verdict, and the
screen turned every one of those into something for the editor to clear. A
proposal is judged by the editor reading it; the app checks only that it
belongs to this trip and fills the expected stops.

Three things this file will not do. It does not repair: no mining an object
out of prose, no model call to clean up a paste. It does not retarget: an
answer for another day or an out-of-date request is refused with what changed.
And it does not verify facts: a source is kept for the editor, not certified.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import quote_plus, urlsplit

from pydantic import ValidationError

from .contracts import (
    CompletenessReport,
    DayPromptExport,
    DaySnapshotModel,
    RETIRED_ANSWER_VERSIONS,
    ValidationIssue,
    ValidationReport,
    stable_hash,
)
from .selection_contract import (
    SELECTION_CONTRACT_VERSION,
    STAY_ENDPOINTS,
    DaySelection,
    unknown_fields,
)

# One MiB. A whole proposal is a few kilobytes, so this is refused only when
# the paste is plainly the wrong thing.
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
            "That is larger than one megabyte. A day's proposal is a few "
            "kilobytes, so this is probably not the JSON object."
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


# --------------------------------------------------------------- 2 · schema --


def _readable_path(location: tuple[Any, ...], day: DaySnapshotModel) -> str:
    """`('picks', 2, 'name')` becomes `picks → Lunch → name`."""
    labels = dict(enumerate(day.slots))
    parts: list[str] = []
    for piece in location:
        if parts and parts[-1] == "picks" and isinstance(piece, int):
            slot = labels.get(piece)
            parts.append((slot.label or slot.id) if slot else f"row {piece + 1}")
            continue
        parts.append(str(piece))
    return " → ".join(parts)


def read_selection(
    payload: dict[str, Any], day: DaySnapshotModel
) -> tuple[DaySelection | None, list[ValidationIssue]]:
    version = payload.get("contractVersion")
    if version in RETIRED_ANSWER_VERSIONS:
        return None, [
            _issue(
                "error",
                "schema",
                "This is an answer in the older article format. That version is "
                "retired: build a new prompt for this day and answer that one. "
                "Days already saved in the old format stay viewable.",
                "contractVersion",
            )
        ]
    if version != SELECTION_CONTRACT_VERSION:
        return None, [
            _issue(
                "error",
                "schema",
                f'This says it is "{version}". This app reads '
                f'"{SELECTION_CONTRACT_VERSION}". Copy the prompt again and answer '
                "the format at the end of it.",
                "contractVersion",
            )
        ]
    notes: list[ValidationIssue] = []
    extra = unknown_fields(payload)
    if extra:
        notes.append(
            _issue(
                "warning",
                "schema",
                "This answer carried fields the app has no place for, and they "
                "were left out: " + ", ".join(extra[:12]),
                "extra fields",
            )
        )
    # Never take these from an answer: they are the app's to fill in.
    cleaned = dict(payload)
    if isinstance(cleaned.get("picks"), list):
        cleaned["picks"] = [
            {key: value for key, value in pick.items() if key not in {"mapsUrl", "chosenBy"}}
            if isinstance(pick, dict)
            else pick
            for pick in cleaned["picks"]
        ]
    try:
        return DaySelection.model_validate(cleaned), notes
    except ValidationError as error:
        for detail in error.errors()[:40]:
            notes.append(
                _issue(
                    "error",
                    "schema",
                    str(detail.get("msg", "is not the expected shape")),
                    _readable_path(tuple(detail.get("loc", ())), day),
                )
            )
        return None, notes


# ------------------------------------------------------------- 3 · identity --


def check_identity(
    selection: DaySelection,
    *,
    export: DayPromptExport,
    workspace_id: str,
    day_id: str,
    current_context_key: str,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if selection.workspace_id != workspace_id:
        issues.append(
            _issue("error", "identity", "This answer belongs to a different trip.", "workspaceId")
        )
    if selection.day_id != day_id:
        issues.append(
            _issue(
                "error",
                "identity",
                f'This answer is for day "{selection.day_id}", and you are importing '
                f'into "{day_id}". Import it into the day it was made for.',
                "dayId",
            )
        )
    if selection.export_id != export.export_id:
        issues.append(
            _issue(
                "error",
                "identity",
                "This answers a different copy of the prompt than the one this day "
                "is expecting.",
                "exportId",
            )
        )
    if selection.input_hash != export.input_hash:
        issues.append(
            _issue(
                "error",
                "identity",
                "The identity stamp does not match the prompt that was copied. Copy "
                "the prompt again and re-run it.",
                "inputHash",
            )
        )
    if not export.is_selection:
        issues.append(
            _issue(
                "error",
                "identity",
                "The prompt this names was built in the older article format. Build "
                "a new prompt for this day.",
                "contractVersion",
            )
        )
    if current_context_key and export.context_key != current_context_key:
        issues.append(
            _issue(
                "error",
                "identity",
                "This day has changed since that prompt was built — the trip, the "
                "layout, the stay, the notes or another day's places. Build a fresh "
                "prompt; this answer is for the old day.",
                "context",
            )
        )
    return issues


# ------------------------------------------------------------ 4 · structure --


def _web_page(url: str) -> bool:
    try:
        parts = urlsplit((url or "").strip())
    except ValueError:
        return False
    return parts.scheme.lower() in _ALLOWED_SCHEMES and bool(parts.netloc)


def map_search_url(name: str | None, where: str | None) -> str | None:
    words = ", ".join(part.strip() for part in (name, where) if part and part.strip())
    if not words:
        return None
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(words)


def tidy(selection: DaySelection, day: DaySnapshotModel) -> tuple[DaySelection, list[ValidationIssue]]:
    """The app's own fill-ins, and the harmless things it drops, each named.

    Map links are SEARCHES built from the name and address or area, a labelled
    convenience. A source that is not a web page is dropped and said so.
    """
    notes: list[ValidationIssue] = []
    by_id = {slot.id: slot for slot in day.slots}

    def pages(sources, where: str):
        kept = []
        for source in sources:
            if _web_page(source.url):
                kept.append(source)
            elif source.url.strip():
                notes.append(
                    _issue(
                        "warning",
                        "structure",
                        f"A source was not a web address and was left out: {source.url[:120]}",
                        where,
                    )
                )
        return kept

    picks = []
    for pick in selection.picks:
        slot = by_id.get(pick.slot_id)
        where = f"picks → {(slot.label or slot.id) if slot else pick.slot_id}"
        placed = (
            pick.status == "selected"
            and slot is not None
            and slot.kind in {"place", "experience"}
            and bool((pick.name or "").strip())
        )
        picks.append(
            pick.model_copy(
                update={
                    "sources": pages(pick.sources, where),
                    "maps_url": map_search_url(pick.name, pick.address or pick.area)
                    if placed
                    else None,
                }
            )
        )
    stay = selection.stay
    if stay is not None:
        stay = stay.model_copy(
            update={
                "sources": pages(stay.sources, "stay"),
                "maps_url": map_search_url(stay.name, stay.area) if stay.name.strip() else None,
            }
        )
    return selection.model_copy(update={"picks": picks, "stay": stay}), notes


def check_structure(
    selection: DaySelection,
    *,
    export: DayPromptExport,
    day: DaySnapshotModel,
    stay_id: str = "",
    other_days: dict[str, list[str]] | None = None,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    expected = list(export.slot_ids)
    optional = set(export.optional_slot_ids)
    by_id = {slot.id: slot for slot in day.slots}

    def where(slot_id: str) -> str:
        slot = by_id.get(slot_id)
        return f"picks → {(slot.label or slot.id) if slot else slot_id}"

    returned = [pick.slot_id for pick in selection.picks]
    counts: dict[str, int] = {}
    for slot_id in returned:
        counts[slot_id] = counts.get(slot_id, 0) + 1
        if slot_id not in expected:
            issues.append(
                _issue("error", "structure", f'"{slot_id}" is not a stop on this day.', where(slot_id))
            )
    for slot_id, count in counts.items():
        if count > 1 and slot_id in expected:
            issues.append(
                _issue(
                    "error",
                    "structure",
                    f"This stop appears {count} times. It has to appear once.",
                    where(slot_id),
                )
            )
    missing = [slot_id for slot_id in expected if slot_id not in counts]
    for slot_id in missing:
        issues.append(
            _issue(
                "error",
                "structure",
                "This stop has no pick. Every stop needs one, even an open one.",
                where(slot_id),
            )
        )
    known = [slot_id for slot_id in returned if slot_id in expected]
    if not missing and len(known) == len(returned) and known != expected:
        issues.append(
            _issue(
                "error",
                "structure",
                "The picks came back in a different order than the approved stops.",
                "picks",
            )
        )

    asked_about = {question.slot_id for question in selection.questions if question.slot_id}
    for pick in selection.picks:
        slot = by_id.get(pick.slot_id)
        if slot is None:
            continue
        here = where(pick.slot_id)
        if pick.status == "omitted_optional" and pick.slot_id not in optional:
            issues.append(
                _issue(
                    "error",
                    "structure",
                    "This stop is required, so it cannot be left out. If nothing fits, "
                    "it is open, with a question.",
                    here,
                )
            )
        if pick.status == "selected":
            if slot.kind in {"place", "experience"} and not (pick.name or "").strip():
                issues.append(
                    _issue("error", "structure", "A chosen place needs a name.", here)
                )
            if slot.allowed_categories and pick.category and pick.category not in slot.allowed_categories:
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        f'"{pick.category}" is not a category this stop allows '
                        f"({', '.join(slot.allowed_categories)}).",
                        here,
                    )
                )
            if slot.kind in {"place", "experience"} and not pick.reason.strip():
                issues.append(
                    _issue("warning", "structure", "This place came back without a reason.", here)
                )
        if pick.status == "unresolved":
            if (pick.name or "").strip():
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        "This stop is marked open and names a place. An open stop has no name.",
                        here,
                    )
                )
            if not pick.reason.strip() and pick.slot_id not in asked_about:
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        "This stop is open and does not say why.",
                        here,
                    )
                )

    for question in selection.questions:
        if question.slot_id and question.slot_id not in by_id:
            issues.append(
                _issue(
                    "error",
                    "structure",
                    f'A question is about "{question.slot_id}", which is not a stop on this day.',
                    "questions",
                )
            )

    endpoints = {*expected, *STAY_ENDPOINTS}
    for index, leg in enumerate(selection.journeys, start=1):
        for label, value in (("from", leg.from_ref), ("to", leg.to_ref)):
            if value not in endpoints:
                issues.append(
                    _issue(
                        "error",
                        "structure",
                        f'Journey {index} goes {label} "{value}", which is not on this day.',
                        f"journeys → {index}",
                    )
                )

    if stay_id and (selection.stay is None or not selection.stay.name.strip()):
        issues.append(
            _issue(
                "warning",
                "structure",
                "This day was asked to recommend a stay and did not.",
                "stay",
            )
        )
    elif stay_id and selection.stay is not None and selection.stay.stay_id != stay_id:
        issues.append(
            _issue(
                "warning",
                "structure",
                "The recommended stay names a different stay id than the one asked for.",
                "stay",
            )
        )

    seen: dict[str, str] = {}
    elsewhere = {
        name.strip().casefold(): day_label
        for day_label, names in (other_days or {}).items()
        for name in names
    }
    for pick in selection.picks:
        if pick.status != "selected" or not (pick.name or "").strip():
            continue
        key = pick.name.strip().casefold()
        if key in seen:
            issues.append(
                _issue("warning", "structure", f'"{pick.name}" is used twice in this day.', where(pick.slot_id))
            )
        seen[key] = pick.slot_id
        if key in elsewhere:
            issues.append(
                _issue(
                    "warning",
                    "structure",
                    f'"{pick.name}" is also used on {elsewhere[key]}. Keep it only if '
                    "the repeat is intended.",
                    where(pick.slot_id),
                )
            )
    return issues


def completeness_of(
    selection: DaySelection, *, export: DayPromptExport, day: DaySnapshotModel
) -> CompletenessReport:
    """Whether the proposal is ready to judge as a whole.

    Every required stop has a pick and there is no open question. Nothing
    about sources, timings or the model's opinion of itself.
    """
    optional = set(export.optional_slot_ids)
    by_id = {slot.id: slot for slot in day.slots}
    selected = [pick for pick in selection.picks if pick.status == "selected"]
    unresolved = [pick for pick in selection.picks if pick.status == "unresolved"]
    omitted = [pick for pick in selection.picks if pick.status == "omitted_optional"]
    required_open = [
        (by_id[pick.slot_id].label or pick.slot_id) if pick.slot_id in by_id else pick.slot_id
        for pick in unresolved
        if pick.slot_id not in optional
    ]
    questions = [question.question for question in selection.questions if question.question.strip()]
    return CompletenessReport(
        selected=len(selected),
        unresolved=len(unresolved),
        omitted_optional=len(omitted),
        required_unresolved=required_open,
        outstanding_checks=questions,
        complete=not (required_open or questions),
    )


# ------------------------------------------------------------ the whole run --


def validate_answer(
    raw: str,
    *,
    export: DayPromptExport,
    day: DaySnapshotModel,
    workspace_id: str,
    day_id: str,
    current_context_key: str,
    stay_id: str = "",
    other_days: dict[str, list[str]] | None = None,
) -> tuple[DaySelection | None, ValidationReport, str]:
    """Every check, in order, stopping only where continuing is meaningless.

    Returns the proposal (when there is one), the report, and the hash the
    Save is pinned to: an answer edited after the preview is a different
    answer and must be previewed again.
    """
    try:
        payload, notes = parse_paste(raw)
    except PasteRejected as rejected:
        return (
            None,
            ValidationReport(valid=False, issues=[_issue("error", rejected.layer, str(rejected))]),
            "",
        )

    selection, issues = read_selection(payload, day)
    if selection is None:
        return None, ValidationReport(valid=False, issues=issues, normalizations=notes), ""

    issues += check_identity(
        selection,
        export=export,
        workspace_id=workspace_id,
        day_id=day_id,
        current_context_key=current_context_key,
    )
    # Structure reads ids off the answer. Against an answer for another day it
    # would produce pages of confident nonsense.
    if not any(issue.layer == "identity" for issue in issues):
        selection, tidied = tidy(selection, day)
        issues += tidied
        issues += check_structure(
            selection, export=export, day=day, stay_id=stay_id, other_days=other_days
        )
    return (
        selection,
        ValidationReport(
            valid=not any(issue.severity == "error" for issue in issues),
            issues=issues,
            normalizations=notes,
            completeness=completeness_of(selection, export=export, day=day),
        ),
        stable_hash(selection.model_dump(by_alias=True)),
    )
