"""The v1 research prompt, kept only as the rollback path.

This is the export the day workflow shipped with: the accepted direction as
pretty-printed JSON, the whole agreement trace replayed, the house rules, and
the full v1 response schema. The audited seven-stop day measured 49,412
characters of it. `prompt_export.py` now builds the compact assignment; this
module is reached only when `ITINERARY_RESEARCH_WIRE=v1` is set, and it is
left byte-for-byte in behaviour so a rollback reproduces exactly what was
issued before.

Its identity hash is also unchanged, which is what lets an export issued under
v1 be found and reused again after a rollback.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ..prompt2blog.config import (
    PROMPT2BLOG_HOUSE_RULES_FILE,
    PROMPT2BLOG_VOICE_FILE,
    PROMPT2BLOG_WRITING_CONVENTIONS_FILE,
)
from .contracts import (
    DayDirection,
    DayPromptExport,
    RESULT_CONTRACT_VERSION,
    SetupSnapshot,
    StoredResult,
    stable_hash,
)
from .context import day_brief, day_date_label, window_label
from .day_schema import build_response_schema


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def voice_snapshot() -> tuple[str, str]:
    """The canonical voice and house rules, read at export time, with a version.

    Read rather than copied. A second copy maintained as source code in this
    feature would drift from the one every other writer in this repo uses, and
    the drift would be invisible until two pieces stopped sounding alike.

    Three files, because a day's reader copy is Questurian prose like any
    other: the voice, the writing conventions, and the publication-wide house
    rules. The house rules are the ones that matter most for research output —
    the prose never names a source, an unconfirmed detail is cut rather than
    hedged, and the tired travel vocabulary is barred.

    The version is a hash of all three as they stood when this export was made.
    An export keeps the wording it was made with; a later edit produces a new
    version for new exports and does not retroactively invalidate a prompt
    somebody is still working from.
    """
    text = "\n\n".join(
        block
        for block in (
            _read(PROMPT2BLOG_VOICE_FILE),
            _read(PROMPT2BLOG_WRITING_CONVENTIONS_FILE),
            _read(PROMPT2BLOG_HOUSE_RULES_FILE),
        )
        if block
    )
    version = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    return text, version


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _direction_block(direction: DayDirection) -> str:
    """The accepted direction, as the object it is.

    JSON rather than prose, deliberately. A paraphrase of an agreement is a
    second agreement, and the operator approved this one.
    """
    return json.dumps(
        direction.model_dump(exclude={"agreement_trace"}),
        indent=2,
        ensure_ascii=False,
    )


def _trace_block(direction: DayDirection) -> str:
    lines = []
    for index, turn in enumerate(direction.agreement_trace, start=1):
        origin = (
            "accepted the interviewer's suggestion unchanged"
            if turn.answer_origin == "accepted_recommendation"
            else "answered in their own words"
        )
        lines.append(f"{index}. {turn.decision}\n   They {origin}: {turn.answer}")
    return "\n".join(lines) or "(no turns recorded)"


def build_legacy_prompt_text(
    *,
    setup: SetupSnapshot,
    day_id: str,
    direction: DayDirection,
    results: dict[str, StoredResult],
    directions: dict[str, DayDirection],
    export_id: str,
    workspace_id: str,
    input_hash: str,
    schema: dict,
    voice: str,
) -> str:
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id} in this workspace")
    number = setup.day_number(day_id)
    date = day_date_label(setup.trip, number - 1)
    required = [slot for slot in day.slots if not slot.optional]
    optional = [slot for slot in day.slots if slot.optional]

    return f"""# Research and write one day of a trip

Return ONE complete JSON object matching the schema at the end of this
message. No Markdown fences, no explanation before or after it, nothing but the
object.

Use web research. This is planning and writing work: make no bookings, no
purchases, no accounts and no reservations, and do not publish anything.

## Identity — copy these back exactly

    "contractVersion": "{RESULT_CONTRACT_VERSION}"
    "workspaceId":     "{workspace_id}"
    "dayId":           "{day_id}"
    "exportId":        "{export_id}"
    "inputHash":       "{input_hash}"

These five are how the app knows which request your answer belongs to. Changing
one does not retarget the answer; it makes it unusable.

## The job

Turn the agreed direction below into one researched day: real named places,
a workable order and times, and reader-facing prose.

Choose the day as a WHOLE. An excellent venue that breaks the route is a poor
selection, and six individually attractive places are not a day. Research more
candidates than you need, and return one selection per stop -- never a menu of
alternatives.

Everything in the setup and the direction is a PREFERENCE. None of it is
evidence about any real place. The operator has looked nothing up. Every
real-world fact in your answer has to come from a page you actually read.

## The day

Day {number} of {len(setup.days)}{f", {date}" if date else ""} · usable time: {window_label(day)}
{len(required)} required stop(s){f", {len(optional)} optional" if optional else ""}.

{day_brief(setup, day_id, results, directions)}

## The agreed direction

This was settled with the operator before any research. Treat it as the
requirements, not as a suggestion.

{_direction_block(direction)}

### How it was agreed

{_trace_block(direction)}

Where they accepted the interviewer's suggestion unchanged, that is the
interviewer's wording rather than a fact the operator supplied. It is still a
decision they stand behind; it is not first-hand knowledge of anything.

## Method, and the factual boundary

1. **Build a geographic sequence first, then fill it.** Establish where the day
   goes and in what order, anchored on whatever the direction names as the
   anchor. Then find stops that fit that route. Validate that a place is the
   branch you think it is: chains have several, and the wrong one breaks the
   route.

2. **Prefer official pages for identity, offerings, hours and conditions.**
   Read them. A guessed URL, a search snippet or a generic homepage is not
   evidence for a detailed claim. Use secondary sources where you must, and say
   plainly that is what they are.

3. **Walking before taxis.** Work out whether a leg is actually walkable before
   proposing a taxi for it. If you cannot establish a route, say the routing is
   unknown -- do not default every leg to a taxi, and do not present a straight-
   line distance as a walking time.

4. **Opening hours are not availability.** "Open at 18:30" does not mean a
   table is free at 18:30. A delivery menu is not evidence about dining in at a
   particular branch. If something needs booking, say so as a condition.

5. **Evergreen unless the setup names a date.** If the trip has no chosen
   weekday, do not invent one. State opening-day conditions that would matter.
   If a critical opening-day question cannot be settled, the stop is unresolved,
   not ready.

6. **Times are integers.** `startMinutes` is minutes after midnight on the day
   itself: 09:30 is 570, 20:15 is 1215. Anything after midnight uses a value
   over 1440 (00:30 the next morning is 1470). Null means you genuinely cannot
   say, and an unknown time makes the day incomplete -- it is never a zero.

7. **Account for rest and say where it happens.** Every rest window carries a
   `locationPolicy`. `return_to_base` means two more legs and both must appear
   in `transfers`. A long unallocated gap is a preference the direction asked
   for; it is not by itself proof that the day is relaxed or coherent.

8. **A full window is not a reason to add stops.** Effort, number of stops and
   available time are three different things. The stop list below is approved
   and settled: return exactly these rows, in this order. If you believe one
   should change, put it in `proposedChanges` and leave the stop itself
   unresolved -- never add, drop or reorder a row yourself.

9. **An unresolved stop is a real, valid answer.** Null name, null address,
   null times, empty reader copy, and a clear `unresolvedReason`. Never invent a
   venue to fill a row. An optional stop may be `omitted_optional` with a reason;
   a required stop may not.

10. **Free time and travel are not venue searches.** Both still get their own
    row in `stops`, and both are `selected` when you have planned them.

    A free-time stop needs a duration and a purpose in its row, a null name and
    no address. A travel stop needs a duration in its row AND a matching entry
    in `transfers` carrying the endpoints, the mode, the time range and what
    that range is based on. Do not put a business in either of them.

11. **If you cannot browse**, say so: `browsingUsed` false, empty sources and
    claims, every stop unresolved, `status` `insufficient_evidence`. Do not
    present remembered venues as researched ones.

## Evidence

Every factual assertion in `readerCopy`, `whatToDo`, `practicalNotes`, the
address and `selectionReason` needs a claim in `claims`, and every claim needs
at least one source in `sources` that you actually read. Ids must be unique and
every reference must resolve.

Judgement is not a claim. "This is the right lunch for this day" is your
opinion and belongs in `whyHere` or `selectionReason`; "it opens at noon on
Sundays" is a fact and needs a source.

`feasibility` must cover, at minimum: opening-day compatibility; total time
including transfers and rest; walking and effort; meal balance; geographic
continuity; the unknown start and end of the day; and any overlap with the
other days of this trip.

## The writing

Use the canonical voice below for reader-facing text only -- `title`,
`dayIntro` and `readerCopy`. Every other field is literal and technical.

Write a day title, a day introduction of roughly 70-110 words, and roughly
60-100 words of reader copy per selected stop. Lengths are guidance; being true
and complete wins.

Each stop says what to do there and why it belongs at this point in the day.
Let the progression carry the day rather than "next, head to" transitions. Never
write a sensory scene you did not read somewhere. Research provenance belongs in
claims and sources, not in reader prose. Practical caveats belong in
`practicalNotes`; things you could not check belong in `editorNotes` and
`research.limitations`.

{voice}

## Required output JSON Schema

{json.dumps(schema, indent=2, ensure_ascii=False)}
"""


def build_legacy_export(
    *,
    workspace_id: str,
    workspace_revision: int,
    setup: SetupSnapshot,
    day_id: str,
    direction: DayDirection,
    direction_revision: int,
    context_key: str,
    results: dict[str, StoredResult],
    directions: dict[str, DayDirection],
    export_id: str | None = None,
) -> DayPromptExport:
    """Assemble the whole packet, including the hash it will be checked by.

    The hash covers the identity of the request -- the setup, the direction,
    the continuity context and the schema version -- and deliberately not the
    prompt text. Rewording an instruction does not change what was asked for,
    and a hash over the prose would invalidate every outstanding export the day
    somebody fixed a typo in this file.
    """
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id} in this workspace")

    identity = {
        "workspace": workspace_id,
        "day": day_id,
        "context": context_key,
        "direction_revision": direction_revision,
        "schema": RESULT_CONTRACT_VERSION,
        "slots": [slot.id for slot in day.slots],
    }
    input_hash = stable_hash(identity)
    resolved_id = export_id or uuid.uuid4().hex[:12]
    schema = build_response_schema(
        workspace_id=workspace_id,
        day_id=day_id,
        export_id=resolved_id,
        input_hash=input_hash,
        slots=list(day.slots),
    )
    voice, voice_version = voice_snapshot()
    prompt_text = build_legacy_prompt_text(
        setup=setup,
        day_id=day_id,
        direction=direction,
        results=results,
        directions=directions,
        export_id=resolved_id,
        workspace_id=workspace_id,
        input_hash=input_hash,
        schema=schema,
        voice=voice,
    )
    return DayPromptExport(
        export_id=resolved_id,
        workspace_id=workspace_id,
        day_id=day_id,
        direction_revision=direction_revision,
        workspace_revision=workspace_revision,
        input_hash=input_hash,
        context_key=context_key,
        slot_ids=[slot.id for slot in day.slots],
        optional_slot_ids=[slot.id for slot in day.slots if slot.optional],
        voice_version=voice_version,
        prompt_text=prompt_text,
        response_schema=schema,
        created_at=_now(),
    )
