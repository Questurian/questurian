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

import hashlib
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone

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

# Which rules produced a candidate's membership. Part of a candidate's
# identity, so a pool built under one set of pooling rules cannot be silently
# compared with -- or reviewed as -- a pool built under another.
POOLING_VERSION = "2"

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
# "La Mar Cebichería" are one place.
#
# This list was written for restaurants, and the live run of 2026-09-10 found
# the same fault the shape catalogue had one layer up: a hotel commission was
# being judged by a restaurant's vocabulary. Nine unrelated aparthotels --
# Inkari, El Doral, San Martín, La Paz, Caminos del Inca -- were all linked to
# each other as possible duplicates, because "apart" and "hotel" counted as
# distinguishing words and every one of them shares both.
#
# Seventeen of thirty-four hotels came back flagged. A label that fires on half
# the list is a label the operator learns to scroll past, which costs exactly
# the pairs it exists to catch.
#
# Only ever used for the SIMILARITY hint. Grouping compares the full name with
# nothing removed, because a word that is generic across a subject can still be
# the whole of one business's name.
_NOISE_WORDS = {
    # articles and connectives
    "el", "la", "los", "las", "de", "del", "don", "dona", "the", "and", "y",
    "at", "by", "in",
    # eating and drinking
    "restaurant", "restaurante", "cevicheria", "cebicheria", "ceviche",
    "cebiche", "marisqueria", "bar", "bars", "cafe", "lounge", "pub",
    # lodging
    "hotel", "hotels", "hostal", "hostel", "apart", "aparthotel", "aparthotels",
    "suites", "suite", "inn", "lodge", "resort", "guesthouse", "casa", "house",
    # what kind of thing it is rather than which one
    "boutique", "rooftop", "terraza", "terrace", "sky",
}

# What to drop from a BRACKETED ASIDE, which is almost nothing.
#
# Deliberately not `_NOISE_WORDS`. The two lists answer opposite questions. A
# word that is generic across a subject tells you nothing when it is in the
# business's name -- every aparthotel contains "apart hotel" -- and is the
# whole distinction when it is in the aside: "(Lobby bar)" and "(Rooftop bar)"
# are two bars in one building, and they are told apart by exactly the words a
# venue-name list would throw away.
#
# Using one list for both merged "Hotel B" into "Hotel B (Rooftop bar)" and
# would have merged the lobby bar into the rooftop bar. The suite caught it.
_ASIDE_NOISE = {"el", "la", "los", "las", "de", "del", "the", "and", "y", "at", "by", "in"}

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


# A bracketed aside, in any bracket a model actually uses.
#
# This read round brackets only, and the live run of 2026-09-10 is what it
# cost: "27 Tapas", "27 Tapas (Iberostar Selection Miraflores)" and "27 Tapas
# [Iberostar Selection Miraflores]" arrived from three searches and became
# THREE candidates, because the square-bracketed one kept the hotel's name as
# part of its own. One bar, counted three times, its overlap split three ways.
# The search prompt asks for "brackets" and does not say which kind.
_ASIDE = re.compile(r"\([^)]*\)|\[[^\]]*\]|\{[^}]*\}")


def name_tokens(name: str) -> list[str]:
    """The words in a name that distinguish it from another place.

    A bracketed aside is dropped before anything else. Searches qualify a name
    with what the row is about -- "Gran Hotel Bolívar (Bar Catedral)", "Hotel B
    (Rooftop bar)" -- and that qualifier is the row's reason, not part of the
    business's name. It is not thrown away: `qualifier_tokens` reads it back,
    because two rows qualified differently may be two different businesses
    inside one building.
    """
    without_aside = _ASIDE.sub(" ", name)
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
    asides = " ".join(match.strip("()[]{}") for match in _ASIDE.findall(name))
    folded = unicodedata.normalize("NFKD", asides.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]+", folded) if w not in _ASIDE_NOISE}


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


# How many distinguishing words a shorter name needs before a longer one that
# contains it is even worth mentioning as a possible duplicate.
#
# One, plus a condition. This was two, justified by "Museo del Pisco" linking
# to "Pisco Bar" on the single word they share -- but that justification went
# stale when `_full_words` stopped discarding noise. Containment is a subset
# test over EVERY word now, and {pisco, bar} is not a subset of {museo, del,
# pisco} at any threshold. The two-token floor was no longer buying the safety
# it was written for.
#
# What it was still doing was silencing exactly the pairs that need the hint
# most. A model that writes a place out in full under one angle and abbreviates
# it under another abbreviates it to ONE word: the bars run returned "Saha" and
# "SAHA Rooftop" as two venues, the cevicherias run returned "Sonia" and
# "Cevichería Sonia" in the SAME district, and neither pair was flagged.
#
# The condition is what keeps one token from linking a bare "Casa" or "Bar" to
# every longer name in the pool: a lone token links only when it is not a word
# that is generic across the subject. That is the question `_NOISE_WORDS`
# already answers, and it is the right one -- "Saha" identifies a bar and
# "Rooftop" does not.
#
# Measured on all three live runs of 2026-09-10: two new links, both correct,
# no false ones.
_CONTAINMENT_MIN_TOKENS = 1


def observation_key(name: str, district: str) -> tuple[str, str, tuple[str, ...]]:
    """What two rows must share to be the same OBSERVATION of a place.

    Three things, all of them written down in the rows themselves: the full
    name after Unicode folding, the district as stated, and the bracketed
    qualifier. Nothing is stripped as "not part of the identity" -- not the
    year, not the article, not the business word. "Hotel Sol" and "Hotel Sol
    Palace" share a normalised key under the old rules and are two hotels; a
    rule that discards words as noise is a rule that discards the word which
    turns out to be the name.

    Still provisional, and deliberately so. Two rows that agree on all three
    are two sources writing the same string; that is the strongest thing this
    step can say, and it is not proof they mean one real business.
    """
    folded = unicodedata.normalize("NFKD", _ASIDE.sub(" ", name).casefold())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    full = " ".join(re.findall(r"[a-z0-9]+", folded))
    return full, _district_key(district), tuple(sorted(qualifier_tokens(name)))


def candidate_id(sightings: list["Sighting"]) -> str:
    """A candidate's identity: which observations it is made of.

    A hash of the sorted member sighting ids plus the pooling version. Two
    consequences, and both of them are the point:

    - **Order cannot change it.** The same evidence pooled in any order
      produces the same candidates with the same ids, so a retry that happens
      to finish in a different order does not silently renumber the list.
    - **Changed membership changes it.** A candidate that gained or lost a
      sighting is a different snapshot, and anything filed against the old id
      -- a cut verdict above all -- does not apply to it and cannot be made to
      by accident.

    Names are not part of it. Two candidates may legitimately display the same
    name; they must never share an id.
    """
    members = "␟".join(sorted(s.sighting_id for s in sightings if s.sighting_id))
    material = f"{POOLING_VERSION}␟{members}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def _districts_conflict(a: str, b: str) -> bool:
    """Two rows that name different districts are two branches until proven not.

    A chain with a branch in Centro and a branch at the airport is two entries
    on a list and two different addresses. Merging them keeps one and loses the
    other, and the loss is invisible: the surviving row looks like an ordinary
    candidate.

    Now a description rather than a gate. Nothing merges on a district
    agreeing, so this exists to say WHY a pair is only a possible duplicate.
    """
    left, right = _district_key(a), _district_key(b)
    if not left or not right:
        return False
    return left != right and left not in right and right not in left


def _qualifiers_conflict(a: str, b: str) -> bool:
    """Two rows qualified differently name two things inside one building."""
    left, right = qualifier_tokens(a), qualifier_tokens(b)
    if not left or not right:
        return False
    return left.isdisjoint(right)


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
    # Attempt id plus the row's position in that attempt's reply. Stable for
    # one execution's evidence however the rows are later ordered, which is
    # what lets a candidate's identity be a function of its members rather
    # than of the order they happened to be pooled in.
    sighting_id: str = ""


@dataclass
class Candidate:
    """One place, and every angle that found it."""

    name: str
    district: str
    evidence: str
    found_by: list[str] = field(default_factory=list)
    sightings: list[Sighting] = field(default_factory=list)
    # Rows that look like this place but were not folded into it. Shown rather
    # than resolved: this step cannot tell a second branch from a second
    # spelling, and pretending otherwise is how a venue disappears.
    possible_duplicates: list[str] = field(default_factory=list)
    # The same relation by id. Two candidates may legitimately display one
    # name, so a name is not enough to point at one of them.
    possible_duplicate_ids: list[str] = field(default_factory=list)
    # A hash of this candidate's member sightings and the pooling version.
    # Stable under reordering; different the moment the membership changes,
    # which is what stops a stale cut verdict landing on new evidence.
    candidate_id: str = ""

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
    # The invocation this request belongs to. Travels with the request so each
    # returned row can be named without the runner having to reach back into
    # the result and stamp it afterwards.
    attempt_id: str = ""


@dataclass
class ProviderReceipt:
    """One request actually put to the provider inside one invocation.

    Recorded because an invocation is not a billable call: `run_one_angle`
    retries up to three times, and a request whose answer never arrived may
    still have been processed and charged for. A cost figure built from the
    number of attempts is a cost figure built from the wrong number.
    """

    at: str
    outcome: str
    detail: str = ""


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
    # Every request that reached the provider inside this invocation.
    provider_calls: list[ProviderReceipt] = field(default_factory=list)


def build_search_prompt(
    angle: str,
    *,
    kind: str,
    place: str,
    exclusions: str,
    standard: str,
    wanted: int,
    role: str = BROAD,
    subject: str = "",
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
{_where_to_look(subject)} An English-only search reaches the places written up
for visitors and stops there. Evidence in the local language counts exactly the
same. Write the results in English, but keep every business name exactly as it
is written locally.

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


def _where_to_look(subject: str) -> str:
    """Where this subject is written about, or the general answer.

    A hotel list used to be sent hunting through food and drink blogs, because
    one sentence written for restaurants was in every search prompt. The
    sources differ by subject and saying which is free.
    """
    from .shapes import source_guidance

    return source_guidance(subject) or (
        "Local press, local blogs and local review sites are where most of "
        "this is written down."
    )


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


def link_possible_duplicates(candidates: list[Candidate]) -> list[Candidate]:
    """Say which rows might be one place. Never decide that they are.

    This used to merge. Containment -- one name's distinguishing words being a
    subset of another's -- was treated as sufficient, and it is not: "Hotel
    Sol" in Centro and "Hotel Sol Palace" in Centro became one candidate with
    two sightings and no warning, and a real hotel disappeared with nothing on
    the screen to notice. "Bar Inglés at the Country Club Hotel" and "Bar
    Inglés del Country Club" really are one bar, and this step cannot tell the
    two cases apart from the strings.

    So the relation stays and the merge goes. A pair that looks contained is
    recorded on both rows as a possible duplicate, the distinct count is
    reported as provisional while any such pair is open, and every original
    sighting survives on the candidate it was observed as.

    More visible duplicates is the accepted cost. A duplicate left standing is
    a row the operator glances at; a false merge deletes a real venue.
    """
    ordered = sorted(
        candidates, key=lambda c: (-len(_full_words(c.name)), len(c.name), c.name)
    )
    for index, candidate in enumerate(ordered):
        words = _full_words(candidate.name)
        if len(words) < _CONTAINMENT_MIN_TOKENS:
            continue
        if not _identifies_on_its_own(words):
            continue
        for other in ordered[:index]:
            if not words <= _full_words(other.name):
                continue
            if not _may_be_same(candidate, other):
                continue
            _link(candidate, other)
    return candidates


def _identifies_on_its_own(words: set[str]) -> bool:
    """Whether a name this short is specific enough to point at one business.

    Only asked of the SHORTER name in a containment pair, and only bites at one
    word. "Saha" is a bar's name; "Rooftop" is what kind of bar it is, and a row
    that says only "Rooftop" is contained in half the pool. Longer names carry
    their own specificity and are not second-guessed here -- a two-word name is
    allowed to be two generic words, because "El Mercado" is a real restaurant.
    """
    if len(words) > 1:
        return True
    return not (words <= _NOISE_WORDS)


def _full_words(name: str) -> set[str]:
    """Every word in a name, with nothing discarded as noise.

    The containment hint reads these rather than `name_tokens`. Dropping
    articles and business words to compare names loses the pairs most worth
    raising -- "La Mar" and "La Mar Cebichería" share one word once "la" and
    "cebicheria" are gone, which is below the threshold, so the strongest
    entry in the first real run would have been split with no hint attached.
    Keeping every word raises that pair and still refuses "Museo del Pisco"
    against "Pisco Bar", which is not a containment at all.
    """
    return set(observation_key(name, "")[0].split())


# How much of the shorter name's distinguishing words two rows must share
# before the pair is worth raising. Two words at minimum, and most of the
# shorter name -- one shared word is a coincidence, and "Museo del Pisco"
# against "Pisco Bar" is what one shared word looks like.
_SIMILARITY_MIN_SHARED = 2
_SIMILARITY_MIN_SHARE = 0.6


def link_similar(candidates: list[Candidate]) -> list[Candidate]:
    """Raise pairs that neither contain each other nor match exactly.

    "Bar Inglés at the Country Club Hotel" and "Bar Inglés del Country Club"
    are one bar. Neither name contains the other and their normalised keys
    differ, so containment cannot see them -- and both spellings turned up in
    the same real run, because searching in the local language means more
    sources and therefore more spellings of one place.

    A hint and only ever a hint. Nothing here merges, so being wrong costs a
    line on the screen.
    """
    for index, candidate in enumerate(candidates):
        mine = set(name_tokens(candidate.name))
        if len(mine) < _SIMILARITY_MIN_SHARED:
            continue
        for other in candidates[:index]:
            theirs = set(name_tokens(other.name))
            shared = mine & theirs
            shorter = min(len(mine), len(theirs)) or 1
            if len(shared) < _SIMILARITY_MIN_SHARED:
                continue
            if len(shared) / shorter < _SIMILARITY_MIN_SHARE:
                continue
            if not _may_be_same(candidate, other):
                continue
            _link(candidate, other)
    return candidates


def _may_be_same(one: Candidate, other: Candidate) -> bool:
    """Whether a pair is worth raising at all.

    One case is excluded outright: rows whose bracketed qualifiers disagree.
    "Hotel Azul (Lobby bar)" and "Hotel Azul (Rooftop bar)" are two bars the
    searches deliberately told apart, and calling them possible duplicates
    would train the operator to dismiss the label on the pairs that matter.
    """
    return not _qualifiers_conflict(one.name, other.name)


def _link(one: Candidate, other: Candidate) -> None:
    """Record a possible duplicate on both rows, by id and by name.

    Both, because they answer different questions. The id is what the screen
    keys on and what a cut verdict is filed against; the name is what a person
    reads, and two candidates are allowed to share one.
    """
    if other.candidate_id and other.candidate_id not in one.possible_duplicate_ids:
        one.possible_duplicate_ids.append(other.candidate_id)
    if one.candidate_id and one.candidate_id not in other.possible_duplicate_ids:
        other.possible_duplicate_ids.append(one.candidate_id)
    if other.name not in one.possible_duplicates:
        one.possible_duplicates.append(other.name)
    if one.name not in other.possible_duplicates:
        other.possible_duplicates.append(one.name)


def _named(sightings: list[Sighting]) -> list[Sighting]:
    """Every sighting with an identity, giving one to any that arrived without.

    A row observed by this pipeline is named by its attempt and its position in
    that attempt's reply. A sighting that reaches pooling without one -- a
    caller building evidence by hand, a row stored before observations had
    identities -- is named from its content instead, with a counter for exact
    repeats. Content rather than position, so the ids do not depend on the
    order the sightings arrive in.
    """
    seen: dict[str, int] = {}
    named: list[Sighting] = []
    for sighting in sightings:
        if sighting.sighting_id:
            named.append(sighting)
            continue
        material = "␟".join(
            [
                sighting.angle_id,
                sighting.angle,
                sighting.name,
                sighting.district,
                sighting.evidence,
            ]
        )
        digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:12]
        seen[digest] = seen.get(digest, 0) + 1
        named.append(
            Sighting(
                angle=sighting.angle,
                angle_id=sighting.angle_id,
                name=sighting.name,
                district=sighting.district,
                evidence=sighting.evidence,
                sighting_id=f"{digest}~{seen[digest]}",
            )
        )
    return named


def pool_sightings(sightings: list[Sighting]) -> list[Candidate]:
    """Every row every angle returned, gathered into places.

    Two passes with a hard line between them. **Grouping** is exact: rows that
    agree on the folded full name, the district and the bracketed qualifier are
    one observation of one place. **Linking** is everything else: a row that
    might be the same place as another is said to be, and is not folded into
    it.

    A row that names no district does not group with one that does. That splits
    entries a looser rule would have joined, and it is the direction that can
    be recovered: an operator looking at two linked rows can say they are one
    place, and cannot get back a venue that was silently deleted.

    Every input sighting appears in exactly one candidate's membership, and the
    candidates and their ids are the same whatever order the sightings arrive
    in.
    """
    groups: dict[tuple[str, str, tuple[str, ...]], Candidate] = {}
    pool: list[Candidate] = []
    for sighting in _named(sightings):
        if not normalise_name(sighting.name):
            continue
        key = observation_key(sighting.name, sighting.district)
        host = groups.get(key)
        if host is None:
            host = Candidate(
                name=sighting.name,
                district=sighting.district,
                evidence=sighting.evidence,
                found_by=[sighting.angle],
                sightings=[sighting],
            )
            groups[key] = host
            pool.append(host)
            continue
        if sighting.angle not in host.found_by:
            host.found_by.append(sighting.angle)
        host.sightings.append(sighting)
        # The longer spelling of the same key is the one worth printing: the
        # rows agree on every word that identifies the place and one of them
        # wrote it out more fully.
        if len(sighting.name) > len(host.name):
            host.name = sighting.name
        if not host.evidence and sighting.evidence:
            host.evidence = sighting.evidence

    for candidate in pool:
        candidate.candidate_id = candidate_id(candidate.sightings)

    # Rows that share a key but not a district, or a district but not a
    # qualifier, are the pairs most likely to be one place written two ways.
    by_name: dict[str, list[Candidate]] = {}
    for candidate in pool:
        by_name.setdefault(observation_key(candidate.name, "")[0], []).append(candidate)
    for siblings in by_name.values():
        for index, candidate in enumerate(siblings):
            for other in siblings[:index]:
                if _may_be_same(candidate, other):
                    _link(candidate, other)

    link_possible_duplicates(pool)
    link_similar(pool)
    for candidate in pool:
        candidate.possible_duplicates.sort()
        candidate.possible_duplicate_ids.sort()
    return pool


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
    subject: str = "",
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
        subject=subject,
    )
    text, urls, titles, failure = "", [], [], ""
    receipts: list[ProviderReceipt] = []
    for attempt in range(SEARCH_ATTEMPTS):
        started = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            text, urls, titles = _search_once(prompt, research)
            failure = ""
            receipts.append(ProviderReceipt(at=started, outcome="answered"))
            break
        except Exception as exc:  # pragma: no cover -- network dependent
            failure = f"{type(exc).__name__}"
            # A request that was sent and did not answer is recorded as a
            # request that was sent. This retry loop can put three of them to
            # the provider, and any of the three may have been processed and
            # charged for: counting invocations counts the wrong thing.
            receipts.append(
                ProviderReceipt(at=started, outcome="failed", detail=failure)
            )
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

    # The row's position in this reply is half its identity. Combined with the
    # attempt it came from, it names one observation for good -- which is what
    # a candidate's identity is built out of, so that reordering the pooling
    # cannot change what the candidates are.
    sightings = [
        Sighting(
            angle=request.text,
            angle_id=request.angle_id,
            name=name,
            district=district,
            evidence=evidence,
            sighting_id=f"{request.attempt_id}#{index}" if request.attempt_id else "",
        )
        for index, (name, district, evidence) in enumerate(rows)
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
        provider_calls=receipts,
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
