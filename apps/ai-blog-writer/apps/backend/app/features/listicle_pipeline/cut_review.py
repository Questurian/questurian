"""Does this break what the operator said to leave out?

The same question asked at two moments, because the cut fails in two different
ways and only one of them is recoverable.

**Before the searches run.** An angle can contradict the cut. Run 33fca394
approved "Nikkei cevicherias doing Japanese-Peruvian preparations" while its
cut read "no places where ceviche is not the primary offering". Those disagree,
and they disagreed in the order, on screen, before anything was bought. Nobody
looked, so the search ran and returned Maido, Osaka Nikkei, Toshi, Hanzo,
Nikko, Tomo and Shizen: 8 of its 10 places barred by the same order that paid
for them. One of seven searches, spent on results already ruled out.

**After they run.** A place can break the cut whichever angle found it. The
rule is composed into every search prompt and the model does not reliably obey
it -- that was tried, and the eight above are what it produced. More prompt
text is not the answer.

What makes the second check cheap is that nothing new has to be looked up. The
search already wrote down why it returned each place, and for several of these
the evidence gives it away by itself:

    Maido         "top Nikkei restaurant, offers ceviche"
    Osaka Nikkei  "Nikkei cuisine, offers ceviche"
    Toshi         "Japanese and Nikkei food"

"Offers ceviche" is the cut, stated. So this reads what is already stored and
judges the whole list in one call, rather than researching forty places to
rediscover what the first search said.

Both checks FLAG. Neither removes anything, and no verdict here is final:
Maido plainly breaks that cut, and a Nikkei place whose signature really is
ceviche plainly might not. The operator knows the city; this only makes sure
they are looking at the question.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Callable

from .contracts import (
    CUT_REVIEW_VERSION,
    AngleConflict,
    CutReview,
    CutReviewChunk,
    CutVerdict,
    SearchOrder,
)

logger = logging.getLogger(__name__)

# Room for a verdict on every candidate, with the reasons.
#
# This was 2048 and a real call against 43 candidates died on it:
# `finish_reason: MALFORMED_FUNCTION_CALL`, with the truncated text showing the
# model part-way through its list. Gemini does not report an over-long tool
# call as a length problem -- it reports a malformed one, which reads like a
# schema fault and is not.
REVIEW_MAX_TOKENS = 8192

# How many candidates go into one review call.
#
# This was 120 and it TRUNCATED: a pool of 121 sent 120 rows, the reviewer
# answered about those, and the pool was assembled as `cut_checked` with the
# 121st never looked at. Nine legal searches at their per-angle allowances
# reach 121 without anything unusual happening.
#
# Sixty is a bound, not an optimum. Nobody has measured what a reviewer judges
# best in one call; what is measured is that 43 candidates at 2048 output
# tokens died mid-list, reported by Gemini as a malformed function call rather
# than as a length problem. A normal 43-candidate pool is still one call.
# Anything larger is chunked, and every chunk is another call the operator is
# told about before it is bought.
CHUNK_SIZE = 60

# Kept as the old name for the one thing it still means: the largest pool one
# call may be asked about.
MAX_CANDIDATES_REVIEWED = CHUNK_SIZE

CONFLICT_TOOL = "record_angle_conflicts"
CANDIDATE_TOOL = "record_barred_places"

# The two checks are separate jobs because they are different questions, and
# they were measured apart.
#
# The order check is one short call, on the path to spending money, and it is
# a judgement about wording. Replayed against four stored orders with a known
# answer plus five planted clashes (2026-09-11), with the prompt below:
#
#     gemini-2.5-flash        ceviche orders perfect; missed "private members'
#                             clubs with a rooftop terrace" against a cut that
#                             bars members-only clubs, three times in three
#     claude-sonnet-5-medium  9 true, 0 false, 0 missed, ~9s
#     claude-opus-5-high      9 true, 0 false, 0 missed, twice, ~15s
#
# The place check reads up to sixty rows of evidence in one call with an 8k
# output budget, and nothing has measured it on another model. It stays where
# it was.
#
# With the Claude subscription off, the order check substitutes back to
# Flash. That fails toward saying nothing, which is the recoverable side:
# a missed clash is still caught place by place after the searches run, and a
# false one teaches the operator to stop reading the warning.
CONFLICT_JOB = "listicle.angle_conflicts"
CANDIDATE_JOB = "listicle.cut_review"

CONFLICT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "conflicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "angle_id": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["angle_id", "why"],
            },
        }
    },
    "required": ["conflicts"],
}

CANDIDATE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "barred": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    # The row's number, not its name. A real call answered with
                    # "Chez Wong (La Victoria)" -- it had copied back the line
                    # exactly as printed, district and all, which matched no
                    # candidate and would have silently dropped every finding.
                    # A number cannot be mangled by how the prompt formats a
                    # line.
                    "number": {"type": "integer"},
                    "name": {"type": "string"},
                    "why": {"type": "string"},
                    # "clear" or "arguable". Kept as a plain string rather than
                    # an enum because a value outside the two is treated as
                    # `arguable` anyway -- see `_confidence`.
                    "confidence": {"type": "string"},
                },
                "required": ["number", "name", "why", "confidence"],
            },
        }
    },
    "required": ["barred"],
}


def build_conflict_prompt(order: SearchOrder) -> str:
    """Ask whether any approved search is, by its own wording, a search for
    barred places.

    It used to ask which searches were "likely to return" barred places, and
    that is a question about the future that every model answers yes to. Run
    add41aca had eight searches for rooftop bars and a cut barring members-only
    clubs and guest-only terraces; the check flagged six, every reason some
    form of "a sunset bar could still be members-only". Replayed on four stored
    orders with a known answer, Flash raised 16 false flags against 6 true
    ones, and Opus 9 against 3 -- Opus's being the worse kind, confident local
    claims ("decades-old cevicherias are mostly chains") that the stored
    results contradict.

    The one real conflict on record is a different kind of thing. "Nikkei
    cevicherias doing Japanese-Peruvian fusion" against "no places where
    ceviche is not the primary offering" clashes IN THE WORDS: a place that
    perfectly fits the search is, by that description, a place the cut bars.
    That is checkable from the text alone, and it is the only thing this check
    can know before anything has been searched. What a search happens to drag
    back is the job of `review_candidates`, which reads the actual results.
    """
    angles = "\n".join(
        f"- {angle.angle_id}: {angle.text}" for angle in order.angles
    )
    kind = order.kind or "places"
    place = order.place or "the city"
    return f"""An operator is building a list of {kind} in {place}.

They said to leave these out, no matter how good the place is:

{order.exclusions}

These are the searches they approved:

{angles}

Every search is sent as "{kind} in {place} that match this description", with
the leave-out rules above attached. So every search is already asking for
{kind}, and already told what to leave out. After the searches run, every
place they return is checked against the rules separately. You are not being
asked whether a search might return a bad place. Nearly every search might.

You are being asked something narrower. For each search, picture a place that
PERFECTLY fits its description. Does that description, by itself, make it a
place the rules leave out?

The real case this exists for: a list of cevicherias whose rules said "no
places where ceviche is not the primary offering", and an approved search for
"Nikkei cevicherias doing Japanese-Peruvian preparations". A place that
perfectly fits that search is a Japanese-Peruvian restaurant, and those serve
ceviche as one dish among many. The description itself points at barred
places, and 8 of the 10 it returned were barred.

Compare "cevicherias that have been open for decades". A place that perfectly
fits it is an old cevicheria, and nothing in "open for decades" makes a place a
chain or a hotel restaurant. Some old places may be chains; that is a guess
about what the search returns, and it is not what you are being asked. Do not
name a search on the strength of what places of that kind are usually like in
this city.

Name a search only when the clash is in its own words: when you can point at
the words of the search and the words of the rules that cannot both be true of
one place. If you cannot point at both, the search is fine. Most orders have no
clashing search at all, and an empty list is the normal answer.

For each one, give its id and one plain sentence naming the words that clash.
Address the operator. Do not suggest replacement wording -- they will decide
what to do."""


def build_candidate_prompt(order: SearchOrder, candidates: list[dict]) -> str:
    """Ask which returned places break the cut, from evidence already stored.

    Every candidate given is printed. Nothing is trimmed to fit: a prompt that
    silently drops its last rows produces a verdict about a pool that is not
    the pool, and the caller has no way to tell. Deciding how many rows one
    call may hold is `chunks_of`, above this, where the decision is countable
    and the extra calls it implies are reported before they are bought.
    """
    lines = []
    for index, candidate in enumerate(candidates, start=1):
        evidence = _evidence_line(candidate)
        district = str(candidate.get("district", "")).strip()
        where = f" -- {district}" if district else ""
        # Rows this pipeline could not prove are separate places. Said out
        # loud, because without it the model reads two rows of one restaurant
        # as two branches: a real run flagged Chez Wong and El Verídico de
        # Fidel as chains on exactly that reasoning, and neither is a chain --
        # each is one famous place whose district two searches recorded
        # differently.
        twin = (
            " [may be the same place as another row here]"
            if candidate.get("possible_duplicates")
            else ""
        )
        lines.append(
            f"{index}. {candidate.get('name', '')}{where}{twin} -- "
            f"{evidence or 'no evidence recorded'}"
        )
    listing = "\n".join(lines)

    return f"""An operator is building a list of {order.kind or "places"} in {order.place or "a city"}.

They said to leave these out, no matter how good the place is:

{order.exclusions}

These places came back from the searches. After each one is what the search
itself said about it:

{listing}

List only the places you have a positive reason to think break one of those
rules. Say nothing about the rest. Most of this list is expected to be fine --
it came from searches built to satisfy the same order.

Flag a place only when something POSITIVELY indicates it belongs to a barred
category. Evidence that is merely thin, vague or silent is not an indication:
a row that says nothing either way stays off your list.

What counts as positive: the evidence names the place as belonging to the
excluded category -- "Nikkei restaurant", "inside the hotel", "branch of" --
or you independently know it does.

What does NOT count, and has caused wrong flags before:

- Evidence about the DISH itself, or about how the place sources or prepares
  it. "Buys daily from artisanal fishermen" is a reason it belongs on the
  list, not a reason to bar it.
- Two rows with the same name in different districts. This list is pooled from
  several searches and often holds one place twice, which is why some rows are
  marked as possibly the same place. That is a record-keeping artefact, NOT
  evidence of a chain. Do not call something a chain because it appears twice
  here; say so only if you know it genuinely has many branches.
- Being a restaurant rather than a stall, being expensive, or being
  well-regarded. None of those is an exclusion unless the operator said so.
- A place widely known for the thing this list is about. A famous specialist
  is the opposite of what such a rule excludes.

Mark each one `clear` or `arguable`:

- `clear` -- only when the evidence line ITSELF states the barred fact, so the
  operator can see it without leaving the screen.
- `arguable` -- everything else you flag, including anything resting on your
  own knowledge rather than on the evidence shown.

If you cannot point at the words that make it barred, it is `arguable`.

Give the row's number, its name, and one plain sentence saying which rule it
breaks. Copy the number exactly; it is what identifies the row."""


def _evidence_line(candidate: dict) -> str:
    """Every distinct thing the searches said about this place, once each.

    Three searches that returned the identical sentence are three sightings and
    one piece of evidence. Printing it three times spends tokens saying nothing
    and reads to the model as corroboration -- which repetition of one source's
    wording is not. Nothing is paraphrased and nothing unique is dropped: the
    repeat count is said instead, so the reviewer can still see that a row was
    reported the same way more than once.
    """
    seen: dict[str, int] = {}
    for sighting in candidate.get("sightings", []):
        text = str(sighting.get("evidence", "")).strip()
        if not text:
            continue
        seen[text] = seen.get(text, 0) + 1
    if not seen and str(candidate.get("evidence", "")).strip():
        seen[str(candidate["evidence"]).strip()] = 1
    return "; ".join(
        text if count == 1 else f"{text} (said by {count} searches)"
        for text, count in seen.items()
    )


def chunks_of(candidates: list[dict]) -> list[list[dict]]:
    """The pool, split into calls, deterministically.

    In the order the pool was assembled, so the same evidence always chunks the
    same way. A pool at or under the bound is one call, which is every real run
    so far.
    """
    return [
        candidates[start : start + CHUNK_SIZE]
        for start in range(0, len(candidates), CHUNK_SIZE)
    ] or []


def review_fingerprint(order: SearchOrder, candidates: list[dict]) -> str:
    """What has to match for a stored review to still be about this pool.

    Everything the reviewer was actually shown, plus the versions of the rules
    that shaped it. Change the cut, the candidates, their evidence, their
    duplicate context, the pooling rules or the reviewer's prompt, and the
    stored answer answers a different question.

    Ordered by candidate id rather than by position, so re-sorting the screen
    is not a cache miss and a genuinely different pool always is one.
    """
    material = json.dumps(
        {
            "kind": order.kind.strip(),
            "place": order.place.strip(),
            "exclusions": order.exclusions.strip(),
            "review_version": CUT_REVIEW_VERSION,
            "pooling_version": _pooling_version(),
            "candidates": sorted(
                (
                    str(candidate.get("candidate_id", "")),
                    str(candidate.get("name", "")).strip(),
                    str(candidate.get("district", "")).strip(),
                    _evidence_line(candidate),
                    bool(candidate.get("possible_duplicates")),
                )
                for candidate in candidates
            ),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def _pooling_version() -> str:
    from .search import POOLING_VERSION

    return POOLING_VERSION


def _fold(text: str) -> str:
    """A name reduced to what two spellings of it have in common."""
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


def _confidence(raw: str) -> str:
    """`clear` only when it was actually said. Everything else is arguable.

    The safe direction: `arguable` asks the operator to look, `clear` tells
    them not to bother. A value the model invented gets the reading that costs
    less if it is wrong.
    """
    return "clear" if str(raw).strip().lower() == "clear" else "arguable"


def review_order(
    order: SearchOrder,
    review: Callable[[str, str, str, dict], Any],
) -> list[AngleConflict]:
    """Which approved searches look like they will return barred places.

    `review` is injected rather than imported so that this module runs in a
    test without a network, the same way `search` takes its `research`.

    An order with no cut has nothing to contradict, and an order with no angles
    has nothing to check. Both return empty without a call: this is the one
    check that runs on the path to spending money, and it should not spend to
    learn that there was nothing to ask about.
    """
    if not order.exclusions.strip() or not order.angles:
        return []

    try:
        payload = review(
            CONFLICT_JOB,
            build_conflict_prompt(order),
            CONFLICT_TOOL,
            CONFLICT_SCHEMA,
        )
    except Exception:
        # A failed check is not a finding. The order stands and says nobody
        # looked, which is true and is what `conflicts_checked` is for.
        logger.warning("The angle/cut conflict check failed", exc_info=True)
        raise

    by_id = {angle.angle_id: angle for angle in order.angles}
    found: list[AngleConflict] = []
    for entry in (payload or {}).get("conflicts", []) or []:
        angle_id = str(entry.get("angle_id", "")).strip()
        why = str(entry.get("why", "")).strip()
        angle = by_id.get(angle_id)
        # An id nothing offered is not a finding about this order. Dropped
        # rather than shown against a made-up angle.
        if angle is None or not why:
            continue
        found.append(
            AngleConflict(angle_id=angle_id, angle_text=angle.text, why=why)
        )
    return found


class ReviewValidationError(RuntimeError):
    """The reviewer answered about a row that is not in the chunk it was sent.

    Raised rather than shrugged off. A finding quietly discarded turns into a
    chunk that reports itself complete while a real flag was thrown away, and
    "we looked and it is fine" is the one thing this step must never say
    falsely.
    """


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def review_candidates(
    order: SearchOrder,
    candidates: list[dict],
    review: Callable[[str, str, str, dict], Any],
    *,
    only_candidate_ids: set[str] | None = None,
    reviewer_model: str = "",
) -> CutReview:
    """Judge this pool against the cut, and say exactly what was covered.

    Nothing is looked up: the evidence each search already wrote is what this
    reads. What is new is that the answer knows its own extent -- which
    candidates were sent, which were covered, and which chunk failed if one
    did.

    `only_candidate_ids` retries the part that failed. A chunk costs a call,
    and a retry that re-buys the chunks that already succeeded is the operator
    paying twice for the same verdict.
    """
    fingerprint = review_fingerprint(order, candidates)
    base = CutReview(
        run_id=order.run_id,
        revision=order.revision,
        fingerprint=fingerprint,
        expected_candidate_ids=[
            str(candidate.get("candidate_id", "")) for candidate in candidates
        ],
        pooling_version=_pooling_version(),
        reviewer_model=reviewer_model,
        completed_at=_now(),
    )
    if not order.exclusions.strip() or not candidates:
        # Nothing was barred, so there is nothing to check. Distinct from
        # "checked and clean" and from "nobody looked": no call is made, and
        # the pool is not presented as having survived a judgement.
        return base.model_copy(update={"status": "not_needed"})

    planned = chunks_of(candidates)
    verdicts: list[CutVerdict] = []
    chunks: list[CutReviewChunk] = []
    reviewed: list[str] = []

    for index, chunk in enumerate(planned):
        ids = [str(candidate.get("candidate_id", "")) for candidate in chunk]
        if only_candidate_ids is not None and not (set(ids) & only_candidate_ids):
            continue
        try:
            payload = review(
                CANDIDATE_JOB,
                build_candidate_prompt(order, chunk),
                CANDIDATE_TOOL,
                CANDIDATE_SCHEMA,
            )
            verdicts.extend(_verdicts_from(payload, chunk))
        except ReviewValidationError as error:
            logger.warning("Cut review chunk %s was not usable: %s", index, error)
            chunks.append(
                CutReviewChunk(
                    index=index, candidate_ids=ids, state="failed", reason=str(error)
                )
            )
            continue
        except Exception as error:  # pragma: no cover -- network dependent
            logger.warning("Cut review chunk %s failed", index, exc_info=True)
            chunks.append(
                CutReviewChunk(
                    index=index,
                    candidate_ids=ids,
                    state="failed",
                    reason=type(error).__name__,
                )
            )
            continue
        chunks.append(CutReviewChunk(index=index, candidate_ids=ids, state="complete"))
        reviewed.extend(ids)

    covered = set(reviewed)
    expected = set(base.expected_candidate_ids)
    if not chunks:
        status = "failed"
    elif expected <= covered:
        status = "complete"
    elif covered:
        status = "partial"
    else:
        status = "failed"

    return base.model_copy(
        update={
            "status": status,
            "reviewed_candidate_ids": reviewed,
            "verdicts": _combined(verdicts),
            "chunks": chunks,
            "completed_at": _now(),
        }
    )


def _verdicts_from(payload: Any, chunk: list[dict]) -> list[CutVerdict]:
    """Read one chunk's findings, refusing any that names a row it was not sent.

    The row's number is what identifies it, and the name is a cross-check. A
    number pointing at a different place from the one the model named is an
    off-by-one, and acting on it flags an innocent place while the real one
    goes unflagged. The whole chunk is rejected rather than the one finding
    dropped: a chunk that answered about rows it was not shown has not answered
    the question, and calling it complete would be the falsehood.
    """
    found: list[CutVerdict] = []
    for entry in (payload or {}).get("barred", []) or []:
        why = str(entry.get("why", "")).strip()
        if not why:
            continue
        try:
            number = int(entry.get("number"))
        except (TypeError, ValueError):
            raise ReviewValidationError(
                f"a finding carried no usable row number: {entry.get('number')!r}"
            ) from None
        # The listing is one-based, as printed.
        if not 1 <= number <= len(chunk):
            raise ReviewValidationError(
                f"row {number} was named, and this chunk holds {len(chunk)} rows"
            )
        candidate = chunk[number - 1]
        actual = str(candidate.get("name", "")).strip()
        candidate_id = str(candidate.get("candidate_id", "")).strip()
        if not candidate_id:
            raise ReviewValidationError(
                f"row {number} ({actual!r}) has no candidate id to file against"
            )
        # Compared loosely because the model may echo the row's district along
        # with its name.
        named = str(entry.get("name", "")).strip().lower()
        if named and _fold(actual) not in _fold(named) and _fold(named) not in _fold(actual):
            raise ReviewValidationError(
                f"row {number} was named {entry.get('name')!r}, and row {number} "
                f"is {actual!r}"
            )
        found.append(
            CutVerdict(
                candidate_id=candidate_id,
                name=actual,
                why=why,
                confidence=_confidence(entry.get("confidence", "")),
            )
        )
    return found


def _combined(verdicts: list[CutVerdict]) -> list[CutVerdict]:
    """One verdict per candidate, keeping every distinct reason.

    A candidate can be flagged twice for two different reasons -- run 33fca394
    has a pair barred as Nikkei on one row and as a chain on the other.
    Last-write-wins threw one away silently, so both are kept, at the stronger
    of the two readings.

    Combined by candidate id. Two candidates with one name stay two verdicts,
    which is the whole of R5: the reviewer flagged the Azul inside a hotel, and
    storing by name put the same flag on the independent street bar in another
    district.
    """
    merged: dict[str, CutVerdict] = {}
    for verdict in verdicts:
        existing = merged.get(verdict.candidate_id)
        if existing is None:
            merged[verdict.candidate_id] = verdict
            continue
        reasons = existing.why
        if _fold(verdict.why) not in _fold(reasons):
            reasons = f"{reasons} {verdict.why}"
        merged[verdict.candidate_id] = existing.model_copy(
            update={
                "why": reasons,
                "confidence": "clear"
                if "clear" in (existing.confidence, verdict.confidence)
                else "arguable",
            }
        )
    return list(merged.values())
