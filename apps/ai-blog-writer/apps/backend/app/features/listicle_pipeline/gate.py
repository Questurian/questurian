"""Is there enough here to write about?

The step that decides a candidate stays on the list. It runs before Location
Manager sees anything, which is the reason profiles live upstream of LM at all:
a place that fails here never becomes a canonical record.

It is not a quality bar for the place. A famous restaurant with nothing written
about it and an unknown one with a newspaper feature both get judged on the
same thing -- whether a writer opening this profile has something to say.

Three verdicts, not two
-----------------------
`missing` and `thin` are different findings and Prompt2Blog spent months
proving it. A place with two solid history claims is publishable at short
length; a place with nothing is not; and collapsing them into "no" throws away
most of a long list. So the gate returns which of the three it is, and what it
would take to change its mind.

Source quality is weighed, not counted
--------------------------------------
The first real profiles came back citing Infobae and Trome -- national
newspapers -- alongside Facebook, a place's own website, and something called
"WanderBoat AI Trip Planner". They are not the same evidence. A claim sourced
to the subject itself is not independent at all, and a claim sourced to
AI-generated copy is a machine repeating a machine.

Nothing is discarded for its source. It is weighted, and the weighting is
visible in the verdict, because a place carried entirely by its own website is
a fact the operator should see rather than a row that quietly vanished.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from .profiles import PlaceProfile

Verdict = Literal["enough", "thin", "nothing"]

# Publishers that are not independent evidence about the place.
#
# Self-published first: a bar's own site saying the bar is historic is the bar
# saying it. Then user-generated aggregators, which are real signal about what
# customers think and weak signal about anything factual. Then AI-written
# directories, which are a machine repeating a machine and are the one source
# type worth naming out loud, because they look like publications.
_SELF_PUBLISHED = ("website", "official site", "instagram", "facebook")
_AI_WRITTEN = ("ai ", " ai", "wanderboat", "trip planner", "gpt")
_AGGREGATOR = (
    "tripadvisor", "wanderlog", "yelp", "restaurant guru", "google review",
    "foursquare", "thefork",
)

# What a claim of each source class is worth. A newspaper is the unit.
WEIGHT_INDEPENDENT = 1.0
WEIGHT_AGGREGATOR = 0.4
WEIGHT_SELF_PUBLISHED = 0.2
WEIGHT_AI_WRITTEN = 0.0

# What a blurb needs. Derived from the three profiles built by hand rather than
# chosen: Bar Rovira scored 8.4 and had a paragraph in it; Antigua Taberna
# Queirolo scored 1.4 across three claims all repeating its founding year and
# did not.
ENOUGH_WEIGHT = 4.0
THIN_WEIGHT = 1.5
# Kinds that carry a blurb on their own. A place with four reviews and nothing
# else is a place with no story, however many reviews there are.
SUBSTANTIVE_KINDS = ("award", "history", "person", "signature", "setting", "recognition")


def source_weight(source_name: str) -> float:
    """What one claim is worth, by who published it."""
    name = source_name.lower().strip()
    if not name:
        # Unattributed. Not nothing -- something was read to write it -- but it
        # cannot be checked, so it counts as little as a self-published claim.
        return WEIGHT_SELF_PUBLISHED
    if any(marker in name for marker in _AI_WRITTEN):
        return WEIGHT_AI_WRITTEN
    if any(marker in name for marker in _SELF_PUBLISHED):
        return WEIGHT_SELF_PUBLISHED
    if any(marker in name for marker in _AGGREGATOR):
        return WEIGHT_AGGREGATOR
    return WEIGHT_INDEPENDENT


def _shape(text: str) -> str:
    """A claim reduced to what it is about, for spotting repetition.

    Queirolo's three claims were "began around 1880", "began in 1880 when Don
    Santiago Queirolo founded it", and "arrived from Genoa around 1877". Three
    rows, one fact. Counting them as three is how a place with one sentence to
    its name passes a gate that counts.
    """
    words = re.findall(r"[a-z0-9]+", text.lower())
    return " ".join(sorted(set(words))[:12])


@dataclass
class GateResult:
    verdict: Verdict
    weight: float
    reason: str
    # What would change the verdict. Said in words because a person reads this
    # when deciding whether to keep a place the gate wanted to drop.
    missing: list[str] = field(default_factory=list)
    counted: int = 0
    discounted: int = 0


def assess(profile: PlaceProfile) -> GateResult:
    """Decide whether this place can carry a blurb."""
    fresh = profile.fresh_claims()
    if not fresh:
        return GateResult(
            "nothing",
            0.0,
            "nothing published about this place was found",
            missing=["anything at all"],
        )

    weight = 0.0
    counted = 0
    discounted = 0
    seen_shapes: set[str] = set()
    substantive = 0

    for claim in fresh:
        shape = _shape(claim.text)
        if shape in seen_shapes:
            # The same fact worded again. Real -- it is corroboration -- but it
            # is not a second thing to say.
            discounted += 1
            continue
        seen_shapes.add(shape)

        value = source_weight(claim.source_name)
        if value == 0.0:
            discounted += 1
            continue
        weight += value
        counted += 1
        if claim.kind in SUBSTANTIVE_KINDS:
            substantive += 1

    missing: list[str] = []
    if not substantive:
        missing.append("something beyond reviews -- a history, an award, a person")
    if weight < ENOUGH_WEIGHT:
        missing.append("more from independent publications")

    if weight >= ENOUGH_WEIGHT and substantive:
        verdict: Verdict = "enough"
        reason = f"{counted} distinct claims, weighted {weight:.1f}"
    elif weight >= THIN_WEIGHT:
        verdict = "thin"
        reason = (
            f"{counted} distinct claims, weighted {weight:.1f} -- enough for a "
            "short entry, not for a full one"
        )
    else:
        verdict = "nothing"
        reason = f"only {counted} distinct claims, weighted {weight:.1f}"

    if discounted:
        reason += f"; {discounted} discounted as repeats or unusable sources"
    return GateResult(verdict, weight, reason, missing, counted, discounted)
