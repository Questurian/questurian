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

import logging
import re
from typing import Any, Callable

from .contracts import AngleConflict, SearchOrder

logger = logging.getLogger(__name__)

# Room for a verdict on every candidate, with the reasons.
#
# This was 2048 and a real call against 43 candidates died on it:
# `finish_reason: MALFORMED_FUNCTION_CALL`, with the truncated text showing the
# model part-way through its list. Gemini does not report an over-long tool
# call as a length problem -- it reports a malformed one, which reads like a
# schema fault and is not.
REVIEW_MAX_TOKENS = 8192

# How many candidates go into one review call. Well above a real run -- 43 in
# the largest so far -- so a normal list is judged as a whole, against the pool
# it is actually in, rather than in batches that cannot see each other.
MAX_CANDIDATES_REVIEWED = 120

CONFLICT_TOOL = "record_angle_conflicts"
CANDIDATE_TOOL = "record_barred_places"

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
    """Ask whether any approved search is hunting for barred places."""
    angles = "\n".join(
        f"- {angle.angle_id}: {angle.text}" for angle in order.angles
    )
    return f"""An operator is building a list of {order.kind or "places"} in {order.place or "a city"}.

They said to leave these out, no matter how good the place is:

{order.exclusions}

These are the searches they approved:

{angles}

Name any search that is likely to return places the operator just barred.

A real example of what this is for: a list of cevicherias whose cut said "no
places where ceviche is not the primary offering", with an approved search for
"Nikkei cevicherias doing Japanese-Peruvian preparations". Most Nikkei
restaurants are Japanese-Peruvian restaurants that serve ceviche among many
things, so that search mostly returns barred places. It did: 8 of the 10 it
found were barred.

Only name a search where the clash is likely, not merely possible. Nearly any
search can return one bad result; that is not what this is asking. Say nothing
about a search that is fine.

For each one, give its id and one plain sentence saying why the two disagree.
Address the operator. Do not suggest replacement wording -- they will decide
what to do."""


def build_candidate_prompt(order: SearchOrder, candidates: list[dict]) -> str:
    """Ask which returned places break the cut, from evidence already stored."""
    lines = []
    for index, candidate in enumerate(candidates[:MAX_CANDIDATES_REVIEWED], start=1):
        evidence = "; ".join(
            str(sighting.get("evidence", "")).strip()
            for sighting in candidate.get("sightings", [])
            if str(sighting.get("evidence", "")).strip()
        )
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
            "listicle.cut_review",
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


def review_candidates(
    order: SearchOrder,
    candidates: list[dict],
    review: Callable[[str, str, str, dict], Any],
) -> dict[str, dict[str, str]]:
    """Which returned places break the cut, keyed by the name they came back as.

    One call for the whole list. Nothing is looked up: the evidence each search
    already wrote is what this reads.
    """
    if not order.exclusions.strip() or not candidates:
        return {}

    payload = review(
        "listicle.cut_review",
        build_candidate_prompt(order, candidates),
        CANDIDATE_TOOL,
        CANDIDATE_SCHEMA,
    )

    reviewed = candidates[:MAX_CANDIDATES_REVIEWED]
    flags: dict[str, dict[str, str]] = {}
    for entry in (payload or {}).get("barred", []) or []:
        why = str(entry.get("why", "")).strip()
        if not why:
            continue
        try:
            number = int(entry.get("number"))
        except (TypeError, ValueError):
            continue
        # The listing is one-based, as printed.
        if not 1 <= number <= len(reviewed):
            continue
        candidate = reviewed[number - 1]
        actual = str(candidate.get("name", "")).strip()
        if not actual:
            continue
        # The name is a cross-check, not the key. A number that points at a
        # different restaurant from the one the model named is an off-by-one,
        # and acting on it would flag an innocent place while the real one goes
        # unflagged -- worse than dropping the finding. Compared loosely
        # because the model may echo the row's district along with its name.
        named = str(entry.get("name", "")).strip().lower()
        if named and _fold(actual) not in _fold(named) and _fold(named) not in _fold(actual):
            logger.warning(
                "Cut review said row %s was %r, but row %s is %r; dropped",
                number, entry.get("name"), number, actual,
            )
            continue
        confidence = _confidence(entry.get("confidence", ""))
        # The same name can appear on more than one row: a pair the merge
        # refused to join because their districts disagreed is two candidates
        # with one name, and the model judges each row separately. Run
        # 33fca394 has three such pairs, and one of them came back barred for
        # two different reasons -- Nikkei on one row, chain on the other.
        # Last-write-wins threw one of those away without saying so, so both
        # are kept, at the stronger of the two readings.
        existing = flags.get(actual)
        if existing is None:
            flags[actual] = {"why": why, "confidence": confidence}
            continue
        reasons = existing["why"]
        if _fold(why) not in _fold(reasons):
            reasons = f"{reasons} {why}"
        flags[actual] = {
            "why": reasons,
            "confidence": "clear"
            if "clear" in (existing["confidence"], confidence)
            else "arguable",
        }
    return flags
