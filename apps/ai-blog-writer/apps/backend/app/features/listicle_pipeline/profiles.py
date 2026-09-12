"""What is known about one place, gathered once and reused.

A listicle needs two different things about a place and they are not the same
thing. Location Manager owns what a place **is** -- address, hours, cuisine,
photographs, taxonomy -- and syncs that to Payload. A blurb needs what has been
**said** about it: reviews, awards, who cooks there, what happened in 1978.
None of that belongs in a canonical store that publishes.

So a profile lives here, upstream of Location Manager, and it has to: the gate
that decides a place is not worth writing about runs before any record is
created, and a place that fails it must never reach LM at all. A profile
therefore exists for places LM will never hold.

The profile points at LM and LM does not point back. Nothing in Location
Manager changes to make this work.

Claims, not fields
------------------
A field schema decides in advance what matters, and every place is different. A
1920s bar has history; a rooftop that opened last year has a bartender's name
and nothing else. Fixed fields leave a profile mostly empty, and an empty field
reads as "we failed to find this" when the truth is "this does not apply here"
-- the same confusion that cost Prompt2Blog months (ADR 0031 lineage: the
`unpublished` and `nonexistent` verdicts exist for exactly this reason).

Pure prose is worse: it cannot be counted, traced to a source, or aged.

So the unit is one claim -- a sentence, its kind, where it came from, and when
we found it. A profile is a bag of dated, sourced claims. The gate counts them,
the blurb writer chooses among them, and a later listicle appends to them
rather than starting again.

Staleness belongs to the claim, not the profile
-----------------------------------------------
An award from 2019 never rots; it is history. A review ages into history and
stays usable. "Opened last year" is false twelve months later. Hours and prices
rot fastest, and those live in Location Manager, which is another reason the
two stores stay apart. One date on a profile cannot express that. A date on
each claim can.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# What a claim is about. Kept short on purpose: this is what the gate counts,
# and a taxonomy nobody can apply consistently counts nothing.
#
# `recognition` and `award` are separate because they age differently -- an
# award is a dated event that never stops being true, where "regularly called
# the best in the city" is a standing reputation that can quietly stop being
# said.
ClaimKind = Literal[
    "award",         # a named prize or guide listing, usually with a year
    "recognition",   # standing reputation, no single award behind it
    "review",        # a critic, a publication, or a customer writing about it
    "history",       # when it opened, who founded it, what changed
    "person",        # a named chef, bartender or owner
    "signature",     # the one dish or drink it is known for
    "setting",       # the room, the view, the building
    "practice",      # how it works -- lunch only, no reservations, cash only
    # What it costs. Its own kind rather than a `practice`, because a whole
    # class of list is about nothing else -- cheap eats, the splurge, good and
    # cheap -- and those lists need to find this claim without reading every
    # other thing said about the place.
    "price",
    "other",
]

# How long a claim of each kind stays worth trusting without being looked at
# again. `None` means it does not rot: an award in 2019 was still won in 2019.
#
# These are advisory. Nothing deletes a stale claim -- it is shown as old, and
# a person or the gate decides. Silently dropping material is how a profile
# becomes quietly wrong.
CLAIM_SHELF_LIFE_DAYS: dict[str, int | None] = {
    "award": None,
    "history": None,
    "person": 730,        # chefs and owners move
    "signature": 730,
    "setting": 1095,
    "recognition": 545,   # a standing reputation stops being said quietly
    "review": 1095,       # ages into history rather than expiring
    "practice": 365,      # opening patterns change with a season
    "price": 365,         # rots fast, and a wrong price is worse than none
    "other": 365,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Claim(BaseModel):
    """One thing that has been said about a place, and where it came from."""

    model_config = ConfigDict(extra="forbid")

    kind: ClaimKind = "other"
    # One sentence. Long enough to be usable in a blurb without going back to
    # the source, short enough that a gate can count what it has.
    text: str = Field(min_length=1, max_length=600)
    # Who published it -- "El Comercio", "Publimetro", "Summum". The durable
    # half of the attribution: grounded search returns its sources as opaque
    # `vertexaisearch.cloud.google.com/grounding-api-redirect/...` links that
    # name no publisher and do not last, so a claim held for two years would
    # otherwise become a sentence nobody can place.
    source_name: str = ""
    # Where it was published. Empty is allowed and is itself a finding: a claim
    # nobody can point at is weaker than one that cites a newspaper.
    source_url: str = ""
    # When we found it. Not when it happened.
    found_at: datetime = Field(default_factory=_now)
    # The year the claim is *about*, when it has one: an award's year, an
    # opening year. Separate from `found_at` because "won in 2019, found in
    # 2026" and "won in 2026, found in 2026" are different facts.
    about_year: int | None = None

    def is_stale(self, *, as_of: datetime | None = None) -> bool:
        shelf = CLAIM_SHELF_LIFE_DAYS.get(self.kind, 365)
        if shelf is None:
            return False
        moment = as_of or _now()
        found = self.found_at
        if found.tzinfo is None:
            found = found.replace(tzinfo=timezone.utc)
        return (moment - found).days > shelf


class Sighting(BaseModel):
    """One time a listicle search returned this place, and why.

    Recorded as an event rather than as a property of the place, because the
    angle belongs to the run that used it. A bar is not permanently "a rooftop
    bar"; it was returned by a rooftop search on a particular day.

    Accumulated across listicles, these are worth more than any single one: a
    place returned under nine angles across four different lists is objectively
    a major place, and that was learned for free.
    """

    model_config = ConfigDict(extra="forbid")

    angle: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    seen_at: datetime = Field(default_factory=_now)


class PastBlurb(BaseModel):
    """Something already written about this place, and where it ran.

    Kept so the next blurb is DIFFERENT, not so it can be reused. Two
    Questurian articles carrying the same paragraph compete with each other in
    search, and a place that earns a spot on four lists would otherwise be
    described in the same words four times.

    So this is read by the writer as a list of sentences already spent. It is
    not a library to draw from.
    """

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    # The run that produced it, and the angle it was written for. The angle
    # matters most: the same bar on a cheap-eats list and on a history list
    # should read as two different places to go, and knowing which angle was
    # already used is what makes that possible.
    run_id: str = ""
    angle: str = ""
    written_at: datetime = Field(default_factory=_now)


class PlaceProfile(BaseModel):
    """One place, everything said about it, and every list that found it."""

    model_config = ConfigDict(extra="forbid")

    # Our own id. Stable for the life of the profile even if the place is later
    # resolved to a Google Place ID or renamed.
    profile_id: str = Field(min_length=1)
    # The anchor. Google Place IDs survive renames, spelling variants and the
    # difference between a Spanish and an English source -- all three of which
    # already split entries within a single run. Location Manager is keyed on
    # the same thing, so a profile and an LM record point at one building
    # without either owning the other.
    #
    # Empty until resolution runs, which is allowed: a profile is created the
    # moment a search returns a name, and resolution may not have happened yet
    # or may have no API key to run with.
    place_id: str = ""
    # Location Manager's numeric id, once this place has a record there. Empty
    # for every place that has not reached LM -- which is most of them, because
    # LM is the last step and only receives what survives the gate.
    lm_location_id: int | None = None

    name: str = Field(min_length=1)
    city: str = ""
    district: str = ""

    claims: list[Claim] = Field(default_factory=list)
    sightings: list[Sighting] = Field(default_factory=list)
    past_blurbs: list[PastBlurb] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def angles_seen(self) -> list[str]:
        """Every distinct angle that has ever returned this place."""
        seen: list[str] = []
        for sighting in self.sightings:
            if sighting.angle not in seen:
                seen.append(sighting.angle)
        return seen

    @property
    def runs_seen(self) -> list[str]:
        seen: list[str] = []
        for sighting in self.sightings:
            if sighting.run_id not in seen:
                seen.append(sighting.run_id)
        return seen

    def claims_by_kind(self) -> dict[str, int]:
        """How much of each kind of material there is.

        What the gate reads. "Four reviews and no history" and "no reviews and
        four history claims" are both four claims and are not the same place to
        write about.
        """
        counts: dict[str, int] = {}
        for claim in self.claims:
            counts[claim.kind] = counts.get(claim.kind, 0) + 1
        return counts

    def fresh_claims(self, *, as_of: datetime | None = None) -> list[Claim]:
        return [claim for claim in self.claims if not claim.is_stale(as_of=as_of)]

    def claims_for(self, kinds: tuple[str, ...]) -> list[Claim]:
        """The material a particular kind of list is written from.

        A cheap-eats piece wants the price and what people say they paid; a
        history piece wants the founding and the family. One bag of claims,
        filtered -- rather than a separate profile, or a separate research
        pass, per angle.
        """
        return [claim for claim in self.claims if claim.kind in kinds]


# ---------------------------------------------------------------------------
# Per-place research: one prepared card, one research action, a reusable
# profile.
#
# Claims above were built for the whole-run pass: the gate counted them and a
# blurb was written from them. What follows is the same material asked a harder
# question -- is this finding about the topic this list is about, who said it,
# when, and does it still hold. A claim is a sentence with a kind; a finding is
# a sentence with a topic, a category, an attribution, three separate dates and
# a curation state a person set.
#
# They share a table. A finding IS a claim with more said about it, and
# splitting them would mean two stores for one kind of sentence and a migration
# that abandons what the earlier pass already found.
# ---------------------------------------------------------------------------

# What a finding is about, as a closed list. Fixed ids, because a category the
# operator can invent per place cannot be filtered across lists -- and reusing
# one place's research on the next list is the whole point of a profile.
#
# Any number of findings may carry a category, and a finding may carry several:
# "the anticucho is grilled over charcoal in the doorway" is a signature
# offering and a preparation at once.
RESEARCH_CATEGORIES: tuple[tuple[str, str], ...] = (
    ("signature_offering", "the dish, drink or thing it is known for"),
    ("preparation", "how the thing is made, cooked, aged or served"),
    ("customer_observations", "what individual customers reported"),
    ("value_portions", "what it costs, how much arrives, whether that is fair"),
    ("setting", "the room, the building, the street, the view"),
    ("occasion", "what kind of visit it suits -- lunch, late, a group"),
    ("drinks", "what there is to drink and whether that is a reason to go"),
    ("people", "a named cook, owner, bartender or family"),
    ("history", "when it opened, who founded it, what changed"),
    ("recognition", "awards, guide listings, standing reputation"),
    ("practical", "hours, queues, reservations, payment, access"),
    ("caveats", "what is wrong with it, or who it does not suit"),
    ("other", "material that matters and fits nothing above"),
)

CATEGORY_IDS: frozenset[str] = frozenset(key for key, _ in RESEARCH_CATEGORIES)

# How a finding ages, which is not the same as how old it is.
#
#   historical         an event that happened and stays happened
#   current_offering   what is on the menu or behind the bar now
#   current_role       who works there now
#   promotion          an offer, usually with an end date
#   observation        one person's dated experience
#
# Nothing expires automatically. An expiry timer would quietly delete the only
# evidence a list has, and "this was true in 2024" is a fact a person can read.
TemporalType = Literal[
    "historical",
    "current_offering",
    "current_role",
    "promotion",
    "observation",
    "unknown",
]

# Whether a finding is about this branch or about the business as a whole. A
# brand-wide award does not mean the Jesús María branch won anything, and a
# review of one branch is not evidence about another.
EvidenceScope = Literal["branch", "brand", "unknown"]

# What a person has decided about a finding. `discarded` hides it from the
# writing material and deletes nothing: the research still happened, it was
# still paid for, and a later list may want it.
CurationState = Literal["unreviewed", "kept", "discarded"]

# Where a finding came from. `research` is a grounded call; `operator` is
# somebody typing what they know or saw; `places` is what Google holds.
# `unknown` is what a row stored before findings had an origin reads as. It is
# not a fourth kind of author; it is the honest answer for material gathered
# before anybody recorded who gathered it.
FindingOrigin = Literal["research", "operator", "places", "unknown"]

# How well attributed a finding is. Derived, never asserted: a finding with no
# source of its own is `incomplete` and says so on screen, and it is never
# handed the first URL the search happened to return.
Attribution = Literal["attributed", "incomplete"]

# What a research request managed to cover, per topic and category.
#
#   covered       material was found
#   thin          something was found and it is not much
#   not_found     looked, found nothing
#   inaccessible  the source exists and could not be read
#   unsearched    not asked about
#
# A failed call produces none of these. "The request never ran" is not evidence
# that nothing is published.
CoverageState = Literal["covered", "thin", "not_found", "inaccessible", "unsearched"]


class ResearchSource(BaseModel):
    """Something published, as a thing in its own right.

    Separate from the finding because one article supports several findings and
    one finding may rest on several articles, and because a source has its own
    dates: when it was published, and when we read it. Reading a 2024 review
    today does not make it a 2026 review, and the version of this that stored a
    single `found_at` on the claim could not say the difference.
    """

    model_config = ConfigDict(extra="forbid")

    source_id: str = Field(min_length=1)
    url: str = ""
    # "El Comercio", "Summum", "a Google review". The half of the attribution
    # that still means something in two years, since grounded search returns
    # redirect URLs that name nobody and do not last.
    publisher: str = ""
    # `press`, `official`, `review_platform`, `social`, `unknown`. Free text
    # rather than an enum: the useful distinction is "the place said this"
    # against "somebody else said this", and a closed list of publishing
    # formats has never survived contact with the web.
    source_type: str = ""
    title: str = ""
    # When the source was published, as far as it says. A year alone is a real
    # answer and is kept as one.
    published_at: str = ""
    # When we read it. Never used to fill in the line above.
    retrieved_at: datetime = Field(default_factory=_now)


class FindingEvidence(BaseModel):
    """One source under one finding, and what in it says so."""

    model_config = ConfigDict(extra="forbid")

    source_id: str = Field(min_length=1)
    # The sentence in the source that carries the finding, when the reply gave
    # one. Not a quotation requirement -- a summary of a menu page has no
    # sentence to lift -- but where it exists, it is what makes a claim
    # checkable without re-reading the whole page.
    supporting_excerpt: str = ""
    # Whether THIS source is about the branch or the brand. Stored on the
    # relation rather than the finding, because a brand-level article and a
    # branch-level review can support the same sentence.
    evidence_scope: EvidenceScope = "unknown"


class ResearchFinding(BaseModel):
    """One thing that has been said about a place, with everything needed to
    judge whether it can be used."""

    model_config = ConfigDict(extra="forbid")

    finding_id: str = Field(min_length=1)
    profile_id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=1200)
    kind: ClaimKind = "other"
    categories: list[str] = Field(default_factory=list)
    # Which lists this finding is material for. A topic key, not an angle: the
    # wings list and the ceviche list are different topics about the same
    # restaurants, and researching cocktails must not replace the wings
    # evidence.
    topics: list[str] = Field(default_factory=list)
    scope: EvidenceScope = "unknown"
    temporal_type: TemporalType = "unknown"
    # The year or date the finding is ABOUT -- an award's year, an opening.
    event_date: str = ""
    # What the source itself is dated. Held on the finding as well as on the
    # source because a source can carry several findings of different ages.
    source_published_at: str = ""
    # An explicit end: a promotion that runs until March. Past this, the
    # finding is history and not a current claim.
    valid_until: str = ""
    curation: CurationState = "unreviewed"
    origin: FindingOrigin = "research"
    # Bumped on every edit. What an optimistic save checks against, so two
    # tabs cannot overwrite each other silently.
    version: int = 1
    # The research attempt that produced it, empty for a typed one.
    attempt_id: str = ""
    # Who typed it, for an operator finding.
    author: str = ""
    # When the operator saw the thing they are reporting. Their own date, not
    # a publication date and not a retrieval date.
    observed_at: str = ""
    evidence: list[FindingEvidence] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    @property
    def attribution(self) -> Attribution:
        return "attributed" if self.evidence else "incomplete"

    def expired(self, *, as_of: date | None = None) -> bool:
        """Past its own stated end. Only a promotion can be, and only when the
        reply gave a date -- nothing here guesses at one."""
        if not self.valid_until:
            return False
        try:
            ends = date.fromisoformat(self.valid_until[:10])
        except ValueError:
            return False
        return ends < (as_of or _now().date())


class PossibleAngle(BaseModel):
    """An editorial idea about a place, kept apart from the facts.

    "Excellent hidden gem" is not a finding: nobody published it and it cannot
    be attributed. It is a thought about how this place could be written, and
    it belongs in the profile because the person who had it will not be the
    person writing. Stored as an idea, pointing at the findings behind it, and
    never counted as evidence.
    """

    model_config = ConfigDict(extra="forbid")

    angle_id: str = Field(min_length=1)
    profile_id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=400)
    topic: str = ""
    supporting_finding_ids: list[str] = Field(default_factory=list)
    author: str = ""
    archived: bool = False
    created_at: datetime = Field(default_factory=_now)


class CoverageNote(BaseModel):
    """What one request managed to reach, per category."""

    model_config = ConfigDict(extra="forbid")

    topic: str = ""
    category: str = "other"
    state: CoverageState = "unsearched"
    note: str = ""


class ResearchAttempt(BaseModel):
    """One press of Research this place, whatever became of it.

    Execution, not content. A request that failed and a place with nothing
    written about it are different facts, and the version of this pipeline that
    stored one field for both recorded a 145-year-old bar as having no history.
    """

    model_config = ConfigDict(extra="forbid")

    attempt_id: str = Field(min_length=1)
    # What makes a repeated POST the same action. A browser that loses its
    # answer and asks again gets this attempt back rather than buying a second
    # call.
    idempotency_key: str = Field(min_length=1)
    profile_id: str = ""
    run_id: str = ""
    candidate_id: str = ""
    topic: str = ""
    # `initial`, `gap` or `refresh`.
    mode: str = "initial"
    gap_text: str = ""
    # `running`, `completed`, `completed_empty`, `failed`, `response_invalid`,
    # `interrupted`. Five terminal states rather than a boolean, because a
    # malformed reply, an empty one and a call that never came back need
    # different next steps and only one of them is worth retrying blind.
    state: str = "running"
    reason_code: str = ""
    reason: str = ""
    # Everything the prompt was built from, hashed and kept. A second `initial`
    # request over an unchanged snapshot is answered from storage instead of
    # being bought again.
    input_hash: str = ""
    input_snapshot: dict = Field(default_factory=dict)
    prompt: str = ""
    prompt_version: str = ""
    # What we asked it to look for, and what the provider says it actually
    # searched. Kept apart: the first is our intention and the second is
    # evidence, and printing ours as though it were theirs would claim
    # coverage nobody proved.
    requested_queries: list[str] = Field(default_factory=list)
    actual_queries: list[str] = Field(default_factory=list)
    raw_response: str = ""
    validation_issues: list[str] = Field(default_factory=list)
    coverage: list[CoverageNote] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    findings_added: int = 0
    findings_seen: int = 0
    sources_added: int = 0
    model: str = ""
    usage: dict = Field(default_factory=dict)
    duration_seconds: float | None = None
    # Who holds this attempt, and until when. A process that dies leaves a
    # lease that expires; the attempt is then marked interrupted and a late
    # write from the dead owner is refused.
    owner_token: str = ""
    lease_until: str = ""
    started_by: str = ""
    started_at: datetime = Field(default_factory=_now)
    finished_at: datetime | None = None
