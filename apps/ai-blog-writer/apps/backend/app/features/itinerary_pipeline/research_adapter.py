"""One pure function: a compact answer in, the saved `DayResult` shape out.

Why an adapter rather than a new saved shape: every saved day, the history,
the screen and the continuity context read `DayResult`. Asking the model fewer
questions is not a reason to rewrite all of them, so the smaller answer is
turned into the existing object once, at the one place answers are read, and
nothing downstream has to know two formats exist.

What is filled in here, and on what authority:

- **ids.** Sources and claims get deterministic ids in order of appearance
  (`s1`, `c1`). Identical URLs share one source; the query string is kept,
  because two branch pages can differ only there. The same fact at two stops
  stays two claims, because it is about two places.
- **source type** is always `secondary`. Whether a page is official cannot be
  told from its appearance, and the compact answer does not say.
- **map links** are map SEARCHES built from the name and address. A labelled
  convenience, never routing evidence.
- **whyHere, selectionReason, whatToDo** stay empty. The reader paragraph says
  what to do and why the stop belongs; copying it three times would only
  restore the old volume.
- **issues** become what the saved shape already has: a blocking one is an
  unresolved feasibility entry (which keeps the day incomplete), anything else
  is an editor note, and a proposed change is a proposed change. No positive
  feasibility entries are written, because none were claimed.
- **status**, which in v1 was the model's own verdict, is derived from the
  issues -- and `wireVersion` says so, so nothing presents it as the model's.
- **trip role, schedule label, trip memory** come from the accepted direction,
  the setup and the selected stops.
- **browsing** comes from the run's own tool calls when the app dispatched it,
  and is `unknown` otherwise. It is never inferred from the number of turns.

Nothing here judges the day. A malformed URL is reported as a note and kept
out of the source list; a missing leg or an unresolved stop is left exactly as
it came, for `validation.py` to name.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote_plus, urlsplit, urlunsplit

from .contracts import (
    DaySnapshotModel,
    RESEARCH_WIRE_VERSION,
    RESULT_CONTRACT_VERSION,
)
from .research_contract import WireAnswer, WireEvidence

_ALLOWED_SCHEMES = {"http", "https"}


@dataclass(frozen=True)
class RunFacts:
    """What the app itself observed about the call, when it made one."""

    performed_at: str | None = None
    # None: not known. Never False-by-default.
    browsed: bool | None = None


@dataclass
class AdapterContext:
    day: DaySnapshotModel
    trip_role: str = ""
    schedule_label: str = ""
    reserved_for_later: list[str] = field(default_factory=list)
    run: RunFacts = field(default_factory=RunFacts)


def normalize_url(url: str) -> str | None:
    """The URL as a source key, or None when it is not a web page.

    Lower-cased scheme and host, no fragment, no trailing slash on the path.
    The query is kept whole: `?branch=miraflores` and `?branch=surquillo` are
    two pages.
    """
    text = (url or "").strip()
    if not text:
        return None
    try:
        parts = urlsplit(text)
    except ValueError:
        return None
    if parts.scheme.lower() not in _ALLOWED_SCHEMES or not parts.netloc:
        return None
    path = parts.path.rstrip("/") if parts.path not in ("", "/") else ""
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def map_search_url(name: str | None, address: str | None) -> str | None:
    words = ", ".join(part.strip() for part in (name, address) if part and part.strip())
    if not words:
        return None
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(words)


class _Ledger:
    """Sources and claims, numbered as they are first met."""

    def __init__(self) -> None:
        self.sources: list[dict[str, Any]] = []
        self.claims: list[dict[str, Any]] = []
        self.notes: list[str] = []
        self._by_url: dict[str, str] = {}
        self._claim_keys: dict[tuple[str, str, str], str] = {}

    def source(self, evidence: WireEvidence) -> str | None:
        key = normalize_url(evidence.url)
        if key is None:
            return None
        found = self._by_url.get(key)
        if found is not None:
            # A later mention may carry the title an earlier one left blank.
            if evidence.title.strip():
                row = next(row for row in self.sources if row["id"] == found)
                row["title"] = row["title"] or evidence.title.strip()
            return found
        source_id = f"s{len(self.sources) + 1}"
        self._by_url[key] = source_id
        self.sources.append(
            {
                "id": source_id,
                "url": evidence.url.strip(),
                "title": evidence.title.strip(),
                "publisher": urlsplit(key).netloc,
                "sourceType": "secondary",
                "accessedAt": None,
                "publishedOrUpdatedAt": None,
            }
        )
        return source_id

    def claim(self, evidence: WireEvidence, applies_to: str, where: str) -> str | None:
        fact = evidence.fact.strip()
        source_id = self.source(evidence)
        if source_id is None and evidence.url.strip():
            self.notes.append(
                f"{where}: the page given for “{fact[:80] or 'a fact'}” is not a "
                f"web address ({evidence.url.strip()[:120]}), so it was not kept as a source."
            )
        if not fact:
            return None
        key = (applies_to, fact.casefold(), source_id or "")
        if key in self._claim_keys:
            return self._claim_keys[key]
        claim_id = f"c{len(self.claims) + 1}"
        self._claim_keys[key] = claim_id
        self.claims.append(
            {
                "id": claim_id,
                "text": fact,
                "sourceIds": [source_id] if source_id else [],
                "appliesTo": applies_to,
            }
        )
        return claim_id


def _topic(label: str, text: str) -> str:
    """A short, readable name for a blocking issue: where, then what."""
    head = f"{label}: {text}".strip()
    if len(head) <= 200:
        return head
    cut = head[:197].rsplit(" ", 1)[0]
    return cut + "…"


def adapt(answer: WireAnswer, context: AdapterContext) -> tuple[dict[str, Any], list[str]]:
    """The v1 `DayResult` payload for a compact answer, plus what was noticed.

    Returns a plain dict (by alias) so the caller validates it through the
    same `DayResult` model a v1 paste goes through.
    """
    ledger = _Ledger()
    by_id = {slot.id: slot for slot in context.day.slots}

    def label(slot_id: str | None) -> str:
        if not slot_id:
            return "The whole day"
        slot = by_id.get(slot_id)
        return (slot.label or slot.id) if slot else slot_id

    stops: list[dict[str, Any]] = []
    for stop in answer.stops:
        claim_ids: list[str] = []
        for evidence in stop.evidence:
            claim_id = ledger.claim(evidence, stop.slot_id, label(stop.slot_id))
            if claim_id and claim_id not in claim_ids:
                claim_ids.append(claim_id)
        slot = by_id.get(stop.slot_id)
        placed = (
            stop.status == "selected"
            and slot is not None
            and slot.kind in {"place", "experience"}
        )
        stops.append(
            {
                "slotId": stop.slot_id,
                "status": stop.status,
                "name": stop.name,
                "category": stop.category,
                "addressOrMeetingPoint": stop.address_or_meeting_point,
                "area": stop.area,
                "mapsUrl": map_search_url(stop.name, stop.address_or_meeting_point)
                if placed
                else None,
                "startMinutes": stop.start_minutes,
                "durationMinutes": stop.duration_minutes,
                "whyHere": "",
                "readerCopy": stop.reader_copy,
                "whatToDo": [],
                "practicalNotes": list(stop.practical_notes),
                "claimIds": claim_ids,
                "selectionReason": "",
                "unresolvedReason": stop.unresolved_reason,
            }
        )

    transfers: list[dict[str, Any]] = []
    for index, leg in enumerate(answer.transfers, start=1):
        source_ids: list[str] = []
        for evidence in leg.evidence:
            # A journey's facts are kept as day-level claims so they can be
            # read, and its sources are what the leg cites.
            ledger.claim(evidence, "", f"Journey {index}")
            source_id = ledger.source(evidence)
            if source_id and source_id not in source_ids:
                source_ids.append(source_id)
        transfers.append(
            {
                "from": leg.from_ref,
                "to": leg.to_ref,
                "mode": leg.mode,
                "minutesMin": leg.minutes_min,
                "minutesMax": leg.minutes_max,
                # A leg that calls itself sourced and carries no usable page
                # has not established a time. Said once, here, rather than
                # left for a reader to notice.
                "basis": leg.basis,
                "sourceIds": source_ids,
                "note": leg.note,
            }
        )

    feasibility: list[dict[str, Any]] = []
    editor_notes: list[str] = []
    proposed: list[dict[str, Any]] = []
    blocking = False
    for issue in answer.issues:
        text = issue.text.strip()
        where = label(issue.slot_id)
        if text:
            if issue.blocking:
                blocking = True
                feasibility.append(
                    {
                        "topic": _topic(where, text),
                        "status": "unresolved",
                        "detail": text,
                        "sourceIds": [],
                    }
                )
            else:
                editor_notes.append(f"{where}: {text}")
        change = (issue.proposed_change or "").strip()
        if change:
            proposed.append(
                {"slotId": issue.slot_id or "", "proposal": change, "reason": text}
            )

    selected_names = [
        stop.name.strip()
        for stop in answer.stops
        if stop.status == "selected" and stop.name and stop.name.strip()
    ]
    covered = [
        label(stop.slot_id)
        for stop in answer.stops
        if stop.status == "selected"
        and by_id.get(stop.slot_id) is not None
        and by_id[stop.slot_id].kind in {"place", "experience"}
    ]
    unresolved_required = any(
        stop.status == "unresolved"
        and by_id.get(stop.slot_id) is not None
        and not by_id[stop.slot_id].optional
        for stop in answer.stops
    )
    nothing_found = bool(answer.stops) and all(
        stop.status != "selected" for stop in answer.stops
    )

    browsed = context.run.browsed
    payload: dict[str, Any] = {
        "contractVersion": RESULT_CONTRACT_VERSION,
        "wireVersion": RESEARCH_WIRE_VERSION,
        "workspaceId": answer.workspace_id,
        "dayId": answer.day_id,
        "exportId": answer.export_id,
        "inputHash": answer.input_hash,
        "research": {
            "performedAt": context.run.performed_at,
            "browsingUsed": bool(browsed),
            "browsingBasis": "unknown" if browsed is None else "tool_calls",
            "limitations": [],
        },
        "status": (
            "insufficient_evidence"
            if nothing_found
            else "needs_decision"
            if blocking or unresolved_required
            else "ready_for_editor_review"
        ),
        "title": answer.title,
        "dayIntro": answer.day_intro,
        "tripRole": context.trip_role,
        "scheduleLabel": context.schedule_label,
        "stops": stops,
        "transfers": transfers,
        "restWindows": [
            {
                "afterSlotId": rest.after_slot_id,
                "beforeSlotId": rest.before_slot_id,
                "minutes": rest.minutes,
                "locationPolicy": rest.location_policy,
                "description": rest.description,
            }
            for rest in answer.rest_windows
        ],
        "sources": ledger.sources,
        "claims": ledger.claims,
        "feasibility": feasibility,
        "proposedChanges": proposed,
        "tripMemory": {
            "usedPlaces": selected_names,
            "coveredExperiences": covered,
            "reservedForLater": list(context.reserved_for_later),
            "nextDayImplications": [note for note in answer.next_day_notes if note.strip()],
        },
        "editorNotes": editor_notes,
    }
    return payload, ledger.notes
