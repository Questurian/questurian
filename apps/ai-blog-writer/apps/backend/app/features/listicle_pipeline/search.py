"""Running the search order, and pooling what comes back.

This is the step the whole interview exists to reach. The grill settles what to
search for; this runs those searches and produces the candidate places. Nothing
here judges whether a place is good -- it establishes that a place is real,
named, and found by at least one of the angles that were agreed.

Three things it does that a single search cannot:

**It splits the ask.** One search for forty places returns a dozen and repeats
itself. Six searches for eight each returned 49 rows on the first real run
(2026-09-04, Lima cevicherias). The split is not an optimisation; it is the
only reason the list fills.

**It overshoots.** Rows collapse: that same run lost 15 of its 49 to
duplicates, which is a third. Asking for exactly the target guarantees missing
it, so each angle is asked for enough that the pooled total clears the target
with the overlap already priced in.

**It keeps the overlap.** A place found by four angles is not four rows to be
thinned to one -- it is the strongest thing on the list, and `found_by` is
where ranking comes from later. Deduplication merges the rows and keeps the
count.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# What one angle is asked for, before overshoot. Seven is what a list is
# planned at; asking for exactly seven and losing a third to overlap is how a
# forty-item list arrives at twenty-eight.
OVERSHOOT = 1.8
# Nothing is gained by asking one search for more than this: the answers get
# thinner and the response starts truncating mid-row rather than listing more
# places.
MAX_PER_ANGLE = 15
MIN_PER_ANGLE = 6
# A search that asks for a dozen named places with evidence for each takes
# longer than the helper's default. One of seven searches on the first real run
# was lost to a 60-second read timeout and reported as zero results.
SEARCH_TIMEOUT_SECONDS = 180
SEARCH_MAX_TOKENS = 4_096
SEARCH_ATTEMPTS = 3
SEARCH_MODEL = "gemini-2.5-flash"

# Rows that name a container of places rather than one place. The searches
# return these in good faith -- "Surquillo Market (stalls)" is a fair answer to
# "stalls inside Lima's markets" -- but a listicle entry has to be somewhere a
# reader can walk into as one business.
#
# Deliberately narrow, and matched on collective words only. The obvious
# version of this filter rejected any name containing "market" or "mercado",
# which threw away El Mercado -- a real restaurant in Miraflores, and the
# highest-overlap place in the first real run. Keeping a junk row costs the
# operator one glance; dropping the strongest entry on the list is silent and
# unrecoverable.
_NOT_A_BUSINESS = re.compile(
    r"^(the\s+)?(various|several|many|multiple|assorted|different)\b"
    r"|\b(stalls|stands|vendors|kiosks|carts|puestos|food court|foodcourt)\b",
    re.IGNORECASE,
)

# Words that do not distinguish one place from another, dropped before
# comparing names. "Cevichería Nancy" and "Nancy" are one place; "La Mar" and
# "La Mar Cebichería" are one place. Without this the pool double-counts its
# strongest entries, which is the one error that corrupts ranking rather than
# just padding the list.
_NOISE_WORDS = {
    "restaurant", "restaurante", "cevicheria", "cebicheria", "ceviche",
    "cebiche", "marisqueria", "bar", "cafe", "el", "la", "los", "las", "de",
    "del", "don", "dona", "the", "and", "y",
}


def per_angle_ask(target_items: int, angle_count: int) -> int:
    """How many places to ask one search for."""
    if angle_count <= 0:
        return 0
    raw = round((target_items * OVERSHOOT) / angle_count)
    return max(MIN_PER_ANGLE, min(MAX_PER_ANGLE, raw))


def name_tokens(name: str) -> list[str]:
    """The words in a name that distinguish it from another place.

    A parenthetical is dropped before anything else. Searches qualify a name
    with what the row is about -- "Gran Hotel Bolívar (Bar Catedral)", "Hotel B
    (Rooftop bar)" -- and that qualifier is the row's reason, not part of the
    business's name.
    """
    without_aside = re.sub(r"\([^)]*\)", " ", name)
    folded = unicodedata.normalize("NFKD", without_aside.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return [w for w in re.findall(r"[a-z0-9]+", folded) if w not in _NOISE_WORDS]


def normalise_name(name: str) -> str:
    """A name reduced to what makes it a different place from another."""
    words = name_tokens(name)
    # A name that is nothing but noise words keeps them; "El Mercado" is a real
    # restaurant and dropping both words would erase it.
    if words:
        return "".join(words)
    folded = unicodedata.normalize("NFKD", name.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", folded)


# How many distinguishing words a shorter name needs before it may be treated
# as the same place as a longer one that contains it.
#
# Two is the whole safety margin. One would merge "Museo del Pisco" into
# "Pisco Bar" on the single word they share, which is two different bars.
_CONTAINMENT_MIN_TOKENS = 2


def merge_contained(candidates: list["Candidate"]) -> list["Candidate"]:
    """Fold a place named twice at different lengths into one entry.

    Exact-key pooling catches "La Mar" and "La Mar Cebichería" because the
    noise words fall away. It does not catch a name qualified by where it is:
    "Bar Inglés at the Country Club Hotel" and "Bar Inglés del Country Club"
    are one bar and share no normalised key.

    Searching in the local language made this worse rather than better, which
    is the point -- more sources means more spellings of the same place, and an
    undetected duplicate does not merely pad the list, it splits an entry's
    overlap in half and drops it down the ranking.

    The name kept is the one carrying the most distinguishing words, and on a
    tie the shorter string -- because a tie means the difference was a
    parenthetical, and "Hotel B" is the bar's name where "Hotel B (Rooftop
    bar)" is a search's note about why it turned up. `found_by` absorbs the
    other spelling's, so a place found under two names is correctly counted as
    found twice.
    """
    ordered = sorted(
        candidates, key=lambda c: (-len(name_tokens(c.name)), len(c.name))
    )
    kept: list[Candidate] = []
    for candidate in ordered:
        tokens = set(name_tokens(candidate.name))
        host = None
        if len(tokens) >= _CONTAINMENT_MIN_TOKENS:
            host = next(
                (k for k in kept if tokens <= set(name_tokens(k.name))), None
            )
        if host is None:
            kept.append(candidate)
            continue
        for angle in candidate.found_by:
            if angle not in host.found_by:
                host.found_by.append(angle)
        if candidate.district and not host.district:
            host.district = candidate.district
    return kept


@dataclass
class Candidate:
    """One place, and every angle that found it."""

    name: str
    district: str
    evidence: str
    found_by: list[str] = field(default_factory=list)

    @property
    def overlap(self) -> int:
        return len(self.found_by)


@dataclass
class AngleResult:
    """What one search returned, including when it returned nothing.

    A failed search and an empty one are different facts and the screen has to
    tell them apart: an angle nobody has written about is a finding about the
    topic, and a timeout is a finding about the network.
    """

    angle: str
    rows: int
    sources: int
    failed: bool = False
    reason: str = ""


def build_search_prompt(
    angle: str,
    *,
    kind: str,
    place: str,
    exclusions: str,
    standard: str,
    wanted: int,
) -> str:
    """What one angle is sent to the web as.

    The exclusions and the standard are in here because the first real run
    proved they are worthless anywhere else: the operator barred "general
    restaurants where ceviche is one line on the menu" and the Nikkei search
    returned four of exactly that, because nothing carried the bar from the
    interview to the search.
    """
    return f"""List real, currently open {kind} in {place} that match this description:
{angle}

Find {wanted}. Keep going until you have {wanted} or have genuinely run out --
listing four when eight exist is the failure mode here, and a place you are
reasonably confident about belongs on the list. Breadth first: this is a
shortlist someone will check, not a final answer.

Search in the local language of {place} as well as in English, and say so to
yourself before you start: run the query the way a resident would type it.
Local press, local food and drink blogs, and local review sites are where most
of this is written down, and an English-only search reaches the places written
up for visitors and stops there. Evidence in the local language counts exactly
the same. Write the results in English, but keep every business name exactly as
it is written locally.

Every entry must be ONE named business a reader could walk into. Not a market,
a street or a district -- if the answer is "the stalls in X market", name the
individual stalls or leave it out.

{f"Leave out: {exclusions}" if exclusions else ""}

{f"Prefer places that meet this standard, but do not drop a well-known place for want of a citation: {standard}" if standard else ""}

Write ONLY the list. One place per line, in exactly this format:
NAME | DISTRICT | evidence in under ten words

No preamble, no numbering, no closing line."""


def parse_rows(text: str) -> list[tuple[str, str, str]]:
    """The named places in a search's reply.

    Tolerant of a preamble and of numbering, because models add both however
    firmly they are told not to, and a reply thrown away for its shape is a
    whole angle missing from the list.
    """
    rows: list[tuple[str, str, str]] = []
    for line in text.splitlines():
        if "|" not in line:
            continue
        parts = [part.strip() for part in line.split("|")]
        name = re.sub(r"^[\-\*•\d\.\)\s]+", "", parts[0]).strip().strip("*_ ")
        if not name or name.lower() in {"name", "place", "business", "restaurant"}:
            continue
        if _NOT_A_BUSINESS.search(name):
            logger.info("Dropped a row that is not one named business: %r", name)
            continue
        rows.append(
            (name, parts[1] if len(parts) > 1 else "", parts[2] if len(parts) > 2 else "")
        )
    return rows


def _search_once(prompt: str, research) -> tuple[str, list[str]]:
    digest, urls, _tokens = research(prompt)
    return digest, urls


def run_search_order(
    angles: list[str],
    *,
    kind: str,
    place: str,
    target_items: int,
    exclusions: str = "",
    standard: str = "",
    research=None,
) -> tuple[list[Candidate], list[AngleResult]]:
    """Run every angle and pool what comes back.

    `research(prompt) -> (text, urls, tokens)` is the one path in this app that
    reaches the web, passed in so this is testable without a network.

    Returns the pooled candidates, strongest overlap first, and one result row
    per angle so a search that found nothing is visible as itself rather than
    as an absence.
    """
    if research is None:  # pragma: no cover -- wiring error, not a runtime one
        raise ValueError("run_search_order needs a research callable")

    wanted = per_angle_ask(target_items, len(angles))
    pool: dict[str, Candidate] = {}
    results: list[AngleResult] = []

    for angle in angles:
        prompt = build_search_prompt(
            angle,
            kind=kind,
            place=place,
            exclusions=exclusions,
            standard=standard,
            wanted=wanted,
        )
        text, urls, failure = "", [], ""
        for attempt in range(SEARCH_ATTEMPTS):
            try:
                text, urls = _search_once(prompt, research)
                failure = ""
                break
            except Exception as exc:  # pragma: no cover -- network dependent
                failure = f"{type(exc).__name__}"
                logger.warning(
                    "Angle search failed (attempt %s) for %r: %s", attempt + 1, angle, exc
                )

        rows = parse_rows(text)
        # Three different things look identical as a zero on the screen, and
        # only one of them is worth re-running:
        #
        #   the search never ran          -> a fact about the network
        #   it ran and said nothing       -> a fact about the model or the quota
        #   it answered but named nobody  -> a fact about the angle
        #
        # The first real run labelled all three "nothing published for this
        # angle", which sent the operator looking for a better angle when the
        # actual problem was a 60-second timeout.
        if failure:
            reason = failure
        elif rows:
            reason = ""
        elif not text.strip():
            reason = "the search came back empty"
        else:
            reason = "the search answered but named no places"
        results.append(
            AngleResult(
                angle=angle,
                rows=len(rows),
                sources=len(urls),
                failed=bool(failure),
                reason=reason,
            )
        )

        for name, district, evidence in rows:
            key = normalise_name(name)
            if not key:
                continue
            existing = pool.get(key)
            if existing is None:
                pool[key] = Candidate(
                    name=name, district=district, evidence=evidence, found_by=[angle]
                )
                continue
            if angle not in existing.found_by:
                existing.found_by.append(angle)
            # Keep the longer name and fill a district the first row lacked:
            # "La Mar" and "La Mar Cebichería" are one place, and the fuller
            # name is the one worth printing.
            if len(name) > len(existing.name):
                existing.name = name
            if district and not existing.district:
                existing.district = district

    merged = merge_contained(list(pool.values()))
    candidates = sorted(merged, key=lambda c: (-c.overlap, c.name.lower()))
    return candidates, results
