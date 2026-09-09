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
thinned to one. The rows merge, every original sighting is kept, and how many
angles found a place is reported as what it is -- repeated discovery, not a
verdict on quality.

Two rules were added after the plan of 2026-09-08:

**Angles do not all carry the same load.** "Affordable hotels" can supply a
dozen; "the place credited with inventing the dish" supplies one, and asking it
for a dozen is asking it to invent eleven. Each angle carries a discovery role
and gets an allowance from it.

**A merge that is not certain does not happen.** The Centro branch and the
airport branch are two businesses; two bars inside one hotel are two
businesses. Showing a possible duplicate costs a glance. Silently folding two
venues into one loses a venue and nobody can see that it happened.
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

# The three jobs an angle can be doing, and what each may be asked for.
#
# These are requests, not forecasts. Nobody has measured how many places a
# "specific discovery" angle really returns, and the numbers below are a
# bounded, explainable starting point to be tuned against comparison runs --
# not a yield model derived from six interviews.
BROAD = "broad"
DISTINCTIVE = "distinctive"
SPECIFIC = "specific"
ROLES: tuple[str, ...] = (BROAD, DISTINCTIVE, SPECIFIC)

# Share of the per-angle ask each role carries, and the bounds it is held
# between. A broad angle carries a full share; a specific-discovery angle is
# never pressured to fill a quota it cannot fill honestly.
_ROLE_SHARE = {BROAD: 1.0, DISTINCTIVE: 0.7, SPECIFIC: 0.25}
_ROLE_FLOOR = {BROAD: MIN_PER_ANGLE, DISTINCTIVE: 4, SPECIFIC: 1}
_ROLE_CEILING = {BROAD: MAX_PER_ANGLE, DISTINCTIVE: 12, SPECIFIC: 5}


def _share(role: str) -> float:
    return _ROLE_SHARE.get(role, _ROLE_SHARE[DISTINCTIVE])


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

# A list marker, and nothing longer. The version this replaced stripped every
# leading digit and every leading full stop, which turned "1900 Hotel" into
# "Hotel" and a numbered row for "Bodega 1884" into "Bodega". A year in a bar's
# name is common and the damage was silent: the row survived under a name that
# does not exist, so nothing downstream could resolve it.
_LIST_MARKER = re.compile(r"^\s*(?:[-*•·–—]+|\(?\d{1,2}\s*[.)\]]|#\d{1,2})\s+")


def role_allowances(target_items: int, roles: list[str]) -> list[int]:
    """How many places each angle in an order is asked for.

    The overshoot is spread across the roles rather than divided equally: an
    order of one broad angle and four specific ones must not ask the four for
    the same number the broad one gets, because they cannot supply it and the
    ask is what makes a search pad its answer.
    """
    if not roles:
        return []
    weight = sum(_share(role) for role in roles) or 1.0
    per_unit = (target_items * OVERSHOOT) / weight
    allowances = []
    for role in roles:
        raw = round(per_unit * _share(role))
        floor = _ROLE_FLOOR.get(role, _ROLE_FLOOR[DISTINCTIVE])
        ceiling = _ROLE_CEILING.get(role, _ROLE_CEILING[DISTINCTIVE])
        allowances.append(max(floor, min(ceiling, raw)))
    return allowances


def per_angle_ask(target_items: int, angle_count: int) -> int:
    """How many places to ask one search for, when every angle is broad.

    Kept as the plain case of `role_allowances`: an order whose roles are not
    known yet is an order of broad searches, which is what the pipeline did
    before roles existed.
    """
    if angle_count <= 0:
        return 0
    return role_allowances(target_items, [BROAD] * angle_count)[0]


def name_tokens(name: str) -> list[str]:
    """The words in a name that distinguish it from another place.

    A parenthetical is dropped before anything else. Searches qualify a name
    with what the row is about -- "Gran Hotel Bolívar (Bar Catedral)", "Hotel B
    (Rooftop bar)" -- and that qualifier is the row's reason, not part of the
    business's name. It is not thrown away: `qualifier_tokens` reads it back,
    because two rows qualified differently may be two different businesses
    inside one building.
    """
    without_aside = re.sub(r"\([^)]*\)", " ", name)
    folded = unicodedata.normalize("NFKD", without_aside.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return [w for w in re.findall(r"[a-z0-9]+", folded) if w not in _NOISE_WORDS]


def qualifier_tokens(name: str) -> set[str]:
    """What a name says about itself in brackets, or after a branch separator.

    "Tanta (Larcomar)" and "Tanta (San Isidro)" are two restaurants. "Gran
    Hotel Bolívar (Bar Catedral)" and "Gran Hotel Bolívar (Bar Maury)" are two
    bars. Both pairs share every distinguishing word in the name itself, so the
    only thing that can keep them apart is this.
    """
    asides = " ".join(re.findall(r"\(([^)]*)\)", name))
    folded = unicodedata.normalize("NFKD", asides.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]+", folded) if w not in _NOISE_WORDS}


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


def _district_key(district: str) -> str:
    folded = unicodedata.normalize("NFKD", district.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", folded)


# How many distinguishing words a shorter name needs before it may be treated
# as the same place as a longer one that contains it.
#
# Two is the whole safety margin. One would merge "Museo del Pisco" into
# "Pisco Bar" on the single word they share, which is two different bars.
_CONTAINMENT_MIN_TOKENS = 2


def _districts_conflict(a: str, b: str) -> bool:
    """Two rows that name different districts are two branches until proven not.

    A chain with a branch in Centro and a branch at the airport is two entries
    on a list and two different addresses. Merging them keeps one and loses the
    other, and the loss is invisible: the surviving row looks like an ordinary
    candidate.
    """
    left, right = _district_key(a), _district_key(b)
    if not left or not right:
        return False
    return left != right and left not in right and right not in left


def _qualifiers_conflict(a: str, b: str) -> bool:
    """Two rows qualified differently name two things inside one building."""
    left, right = qualifier_tokens(a), qualifier_tokens(b)
    if not left or not right:
        # One row is unqualified. "Hotel B" and "Hotel B (Rooftop bar)" in a
        # search for bars are the same bar written two ways, and refusing that
        # merge would split the overlap of a place two angles agreed on.
        return False
    return left.isdisjoint(right)


def may_merge(a: "Candidate", b: "Candidate") -> bool:
    """Whether two rows are certainly the same business.

    Deliberately asymmetric in what it costs to be wrong. A duplicate left
    standing is a row the operator glances at and dismisses. A false merge
    deletes a real venue, and there is nothing on the screen to notice.
    """
    if _districts_conflict(a.district, b.district):
        return False
    if _qualifiers_conflict(a.name, b.name):
        return False
    return True


@dataclass
class Sighting:
    """One row exactly as one search returned it.

    Kept per candidate rather than collapsed into a single evidence sentence.
    Two angles finding the same place found it for two different reasons, and
    the reasons are what a person needs to check whether the merge was right --
    which the previous version discarded at the moment it mattered most.
    """

    angle: str
    angle_id: str
    name: str
    district: str
    evidence: str


@dataclass
class Candidate:
    """One place, and every angle that found it."""

    name: str
    district: str
    evidence: str
    found_by: list[str] = field(default_factory=list)
    sightings: list[Sighting] = field(default_factory=list)
    # Rows that look like this place but were not merged into it, because a
    # district or a bracketed qualifier said they might be somewhere else.
    # Shown rather than resolved: this step cannot tell a second branch from a
    # second spelling, and pretending otherwise is how a venue disappears.
    possible_duplicates: list[str] = field(default_factory=list)

    @property
    def overlap(self) -> int:
        return len(self.found_by)


@dataclass
class AngleRequest:
    """One angle as it is actually sent, with its identity attached.

    The wording alone is not enough to file a result against: two revisions of
    an order can carry the same sentence, and an edited angle carries a
    sentence no shape ever wrote. The id travels with the request so a stored
    result belongs to a search rather than to a string.
    """

    angle_id: str
    text: str
    role: str = BROAD
    wanted: int = 0
    shape_key: str = ""
    group: str = ""
    edited: bool = False


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
    angle_id: str = ""
    role: str = BROAD
    wanted: int = 0
    source_urls: list[str] = field(default_factory=list)
    # The publications, by name. `source_urls` are Google redirects and
    # identify nothing; these are what say whether a search written to run in
    # the local language actually reached local press.
    source_titles: list[str] = field(default_factory=list)


def build_search_prompt(
    angle: str,
    *,
    kind: str,
    place: str,
    exclusions: str,
    standard: str,
    wanted: int,
    role: str = BROAD,
) -> str:
    """What one angle is sent to the web as.

    The exclusions and the standard are in here because the first real run
    proved they are worthless anywhere else: the operator barred "general
    restaurants where ceviche is one line on the menu" and the Nikkei search
    returned four of exactly that, because nothing carried the bar from the
    interview to the search.

    They are composed here, from the order, rather than written into the angle.
    An angle is one route into the eligible pool; the requirements apply to
    every place however it was found, so an operator editing an angle cannot
    accidentally drop the commission's own conditions.
    """
    # A specific-discovery angle asked to "keep going until you have twelve"
    # will invent twelve. Saying plainly that a short honest answer is a good
    # answer is the only thing standing between a narrow angle and padding.
    if role == SPECIFIC:
        effort = (
            f"Find up to {wanted}. This is a narrow angle and there may only be "
            "one or two. Returning one real place is a good answer; do not pad "
            "the list with places that only loosely fit."
        )
    else:
        effort = (
            f"Find {wanted}. Keep going until you have {wanted} or have genuinely "
            "run out -- listing four when eight exist is the failure mode here, "
            "and a place you are reasonably confident about belongs on the list. "
            "Breadth first: this is a shortlist someone will check, not a final "
            "answer."
        )

    return f"""List real, currently open {kind} in {place} that match this description:
{angle}

{effort}

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

{f"Every place must satisfy this no matter which description found it: {standard}" if standard else ""}

{f"Leave out, no matter how good: {exclusions}" if exclusions else ""}

Write ONLY the list. One place per line, in exactly this format:
NAME | DISTRICT | evidence in under ten words

If a business has a branch qualifier -- a district, a street, a room inside a
hotel -- keep it in brackets after the name. Two branches are two entries.

No preamble, no numbering, no closing line."""


def strip_list_marker(line: str) -> str:
    """Remove a list marker without removing the name.

    Bounded on purpose. Anything that strips leading digits freely eats the
    year out of "Bodega Piselli 1915" the moment it starts a line, and a name
    damaged this way is not recoverable further down -- nothing knows what was
    taken off.
    """
    return _LIST_MARKER.sub("", line, count=1).strip().strip("*_ ").strip()


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
        name = strip_list_marker(parts[0])
        if not name or name.lower() in {"name", "place", "business", "restaurant"}:
            continue
        if _NOT_A_BUSINESS.search(name):
            logger.info("Dropped a row that is not one named business: %r", name)
            continue
        rows.append(
            (name, parts[1] if len(parts) > 1 else "", parts[2] if len(parts) > 2 else "")
        )
    return rows


def merge_contained(candidates: list[Candidate]) -> list[Candidate]:
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
    bar)" is a search's note about why it turned up. `found_by` and every
    original sighting absorb the other spelling's.

    A containment that `may_merge` refuses is recorded on both rows instead of
    performed. The screen can then show two entries and say they might be one,
    which is the honest reading -- this step cannot tell a second branch from a
    second spelling.
    """
    ordered = sorted(
        candidates, key=lambda c: (-len(name_tokens(c.name)), len(c.name))
    )
    kept: list[Candidate] = []
    for candidate in ordered:
        tokens = set(name_tokens(candidate.name))
        host = None
        blocked: list[Candidate] = []
        if len(tokens) >= _CONTAINMENT_MIN_TOKENS:
            for other in kept:
                if not tokens <= set(name_tokens(other.name)):
                    continue
                if may_merge(other, candidate):
                    host = other
                    break
                blocked.append(other)
        if host is None:
            for other in blocked:
                if candidate.name not in other.possible_duplicates:
                    other.possible_duplicates.append(candidate.name)
                if other.name not in candidate.possible_duplicates:
                    candidate.possible_duplicates.append(other.name)
            kept.append(candidate)
            continue
        _absorb(host, candidate)
    return kept


def _absorb(host: Candidate, other: Candidate) -> None:
    for angle in other.found_by:
        if angle not in host.found_by:
            host.found_by.append(angle)
    host.sightings.extend(other.sightings)
    for name in other.possible_duplicates:
        if name not in host.possible_duplicates:
            host.possible_duplicates.append(name)
    if other.district and not host.district:
        host.district = other.district
    if not host.evidence and other.evidence:
        host.evidence = other.evidence


def pool_sightings(sightings: list[Sighting]) -> list[Candidate]:
    """Every row every angle returned, gathered into places.

    Two passes, and both of them conservative. Exact-key pooling first, which
    is the safe case -- the same name written two lengths. Containment second,
    which is the case that can be wrong, and every merge there has to survive
    `may_merge`.
    """
    pool: list[Candidate] = []
    by_key: dict[str, list[Candidate]] = {}
    for sighting in sightings:
        key = normalise_name(sighting.name)
        if not key:
            continue
        host = next(
            (
                candidate
                for candidate in by_key.get(key, [])
                if may_merge(
                    candidate,
                    Candidate(
                        name=sighting.name,
                        district=sighting.district,
                        evidence=sighting.evidence,
                    ),
                )
            ),
            None,
        )
        if host is None:
            fresh = Candidate(
                name=sighting.name,
                district=sighting.district,
                evidence=sighting.evidence,
                found_by=[sighting.angle],
                sightings=[sighting],
            )
            for sibling in by_key.get(key, []):
                if sighting.name not in sibling.possible_duplicates:
                    sibling.possible_duplicates.append(sighting.name)
                if sibling.name not in fresh.possible_duplicates:
                    fresh.possible_duplicates.append(sibling.name)
            by_key.setdefault(key, []).append(fresh)
            pool.append(fresh)
            continue
        if sighting.angle not in host.found_by:
            host.found_by.append(sighting.angle)
        host.sightings.append(sighting)
        # Keep the longer name and fill a district the first row lacked:
        # "La Mar" and "La Mar Cebichería" are one place, and the fuller name
        # is the one worth printing.
        if len(sighting.name) > len(host.name):
            host.name = sighting.name
        if sighting.district and not host.district:
            host.district = sighting.district
        if not host.evidence and sighting.evidence:
            host.evidence = sighting.evidence
    return merge_contained(pool)


def contribution_of(
    candidates: list[Candidate], angle: str
) -> tuple[int, int, int]:
    """(found, shared, only this one) for one angle, against the whole pool.

    Calculated from the finished pool rather than accumulated as the searches
    run, so the first angle to return a place does not collect credit for it
    and reordering the searches cannot change the numbers.
    """
    found = [c for c in candidates if angle in c.found_by]
    exclusive = [c for c in found if len(c.found_by) == 1]
    return len(found), len(found) - len(exclusive), len(exclusive)


def _search_once(prompt: str, research) -> tuple[str, list[str], list[str]]:
    """Whatever the research callable returned, read tolerantly.

    Three elements is the long-standing shape and every test still sends it.
    A fourth, when it is there, is the list of publications behind the answer:
    the URLs are opaque Google redirects, so without this nothing stored can
    say where a search actually looked -- which is the first question anyone
    asks of a search written to run in the local language.
    """
    found = research(prompt)
    digest = found[0]
    urls = list(found[1] or [])
    titles = list(found[3] or []) if len(found) > 3 else []
    return digest, urls, titles


def run_one_angle(
    request: AngleRequest,
    *,
    kind: str,
    place: str,
    exclusions: str = "",
    standard: str = "",
    research=None,
) -> tuple[AngleResult, list[Sighting]]:
    """One angle, run and read. The unit that is stored and retried.

    Separated from the batch so a failure is one search to run again rather
    than an order to run again. Six searches cost real money and minutes, and
    the version this replaced threw five good ones away when the sixth timed
    out.
    """
    if research is None:  # pragma: no cover -- wiring error, not a runtime one
        raise ValueError("run_one_angle needs a research callable")

    prompt = build_search_prompt(
        request.text,
        kind=kind,
        place=place,
        exclusions=exclusions,
        standard=standard,
        wanted=request.wanted,
        role=request.role,
    )
    text, urls, titles, failure = "", [], [], ""
    for attempt in range(SEARCH_ATTEMPTS):
        try:
            text, urls, titles = _search_once(prompt, research)
            failure = ""
            break
        except Exception as exc:  # pragma: no cover -- network dependent
            failure = f"{type(exc).__name__}"
            logger.warning(
                "Angle search failed (attempt %s) for %r: %s",
                attempt + 1,
                request.text,
                exc,
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

    sightings = [
        Sighting(
            angle=request.text,
            angle_id=request.angle_id,
            name=name,
            district=district,
            evidence=evidence,
        )
        for name, district, evidence in rows
    ]
    result = AngleResult(
        angle=request.text,
        rows=len(rows),
        sources=len(urls),
        failed=bool(failure),
        reason=reason,
        angle_id=request.angle_id,
        role=request.role,
        wanted=request.wanted,
        source_urls=list(urls),
        source_titles=list(titles),
    )
    return result, sightings


def requests_for(
    angles: list[str] | list[AngleRequest], target_items: int
) -> list[AngleRequest]:
    """Plain angle lines read as an order of broad searches.

    The compatibility path. An order built by `spec.build_search_order` already
    carries roles and ids; a bare list of lines is what the pipeline had before
    it did, and what a test that only cares about pooling still passes.
    """
    if angles and isinstance(angles[0], AngleRequest):
        return list(angles)  # type: ignore[arg-type]
    lines = [str(a) for a in angles]
    allowances = role_allowances(target_items, [BROAD] * len(lines))
    return [
        AngleRequest(
            angle_id=f"a{index + 1}", text=text, role=BROAD, wanted=allowances[index]
        )
        for index, text in enumerate(lines)
    ]


def run_search_order(
    angles: list[str] | list[AngleRequest],
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

    requests = requests_for(angles, target_items)
    results: list[AngleResult] = []
    sightings: list[Sighting] = []
    for request in requests:
        result, found = run_one_angle(
            request,
            kind=kind,
            place=place,
            exclusions=exclusions,
            standard=standard,
            research=research,
        )
        results.append(result)
        sightings.extend(found)

    candidates = sorted(
        pool_sightings(sightings), key=lambda c: (-c.overlap, c.name.lower())
    )
    return candidates, results
