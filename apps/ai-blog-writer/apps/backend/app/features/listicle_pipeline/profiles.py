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
    "review",        # a critic or publication writing about it
    "history",       # when it opened, who founded it, what changed
    "person",        # a named chef, bartender or owner
    "signature",     # the one dish or drink it is known for
    "setting",       # the room, the view, the building
    "practice",      # how it works -- lunch only, no reservations, cash only
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
