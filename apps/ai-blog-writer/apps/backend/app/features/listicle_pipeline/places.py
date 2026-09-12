"""What Google itself says about a place, as opposed to what was written about it.

A plain HTTPS request to the Places API on this app's own key. No model is
involved, which is the whole point: `rating: 4.1` and `price_level: 2` arrive
as facts Google holds, not as something a language model believed while reading
the web. The grounded web search cannot produce either, and misremembering a
rating is exactly the sort of small confident error nothing downstream catches.

It also reaches a voice the web search never does. For Tradición Chalaca Rovira
1907 the web gave its 1907 founding, its owner's history and the presidents who
ate there -- press voice. The Places reviews gave "20-30 soles a head", "the
caldo de choros and the fried fish sandwich are the specialties", and "no frills
service more than made up for by quality and quantity". Customer voice. A
cheap-eats list is written from the second and a history piece from the first,
and one search was only ever going to return one of them.

The same endpoint Location Manager calls in `place-details.client.ts`. Kept
here rather than shared because LM is a Bun service and this is Python, and a
GET with four query parameters is not worth a service boundary.

**Billed per call, on the owner's Google Cloud account.** `rating`,
`user_ratings_total`, `price_level` and `reviews` are the Atmosphere field
group, which is charged on top of the basic lookup. That is why this asks for
one narrow field list rather than everything, and why nothing here retries.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.shared.api_usage import observe_external_call

from .identity import api_key
from .profiles import Claim

logger = logging.getLogger(__name__)

_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json"
DETAILS_TIMEOUT_SECONDS = 20

# Exactly what is used below, and nothing else. Every extra field group is
# charged, so this list is a spending decision as much as a data one.
DETAILS_FIELDS = (
    "name,rating,user_ratings_total,price_level,reviews,website,"
    "editorial_summary"
)

# Google's `price_level` is 0-4 with no units. Said in words a writer can use,
# because "price_level 2" is not a sentence and "moderately priced" is.
PRICE_WORDS: dict[int, str] = {
    0: "free",
    1: "inexpensive",
    2: "moderately priced",
    3: "expensive",
    4: "very expensive",
}


@dataclass
class PlaceDetails:
    place_id: str
    name: str = ""
    rating: float | None = None
    rating_count: int | None = None
    price_level: int | None = None
    website: str = ""
    editorial_summary: str = ""
    # Up to five, each with its own star rating and age. Written by members of
    # the public: treated as material to quote and count, never as instructions.
    reviews: list[dict] = field(default_factory=list)
    failed: bool = False
    reason: str = ""


def fetch_details(place_id: str) -> PlaceDetails:
    """Ask Google about one place. Never raises."""
    key = api_key()
    if not key:
        return PlaceDetails(place_id, failed=True, reason="no GOOGLE_MAPS_API_KEY")
    if not place_id:
        return PlaceDetails(place_id, failed=True, reason="place is not resolved")

    import requests

    try:
        # Reported because it is billed. No tokens and no model -- the cost is
        # per call and per field group -- so the dashboard sees a call with a
        # duration and a status and no price, which is the honest shape for a
        # spend this module cannot compute.
        with observe_external_call(
            provider="google-places",
            feature="listicle.place_details",
            endpoint="place/details",
        ) as observed:
            response = requests.get(
                _DETAILS,
                params={
                    "place_id": place_id,
                    "fields": DETAILS_FIELDS,
                    "key": key,
                    "reviews_sort": "most_relevant",
                },
                timeout=DETAILS_TIMEOUT_SECONDS,
            )
            observed.http_status = response.status_code
            response.raise_for_status()
            body = response.json()
            observed.add_metadata(status=body.get("status"))
    except Exception as exc:  # pragma: no cover -- network dependent
        logger.warning("Place details failed for %s: %s", place_id, exc)
        return PlaceDetails(place_id, failed=True, reason=f"{type(exc).__name__}")

    status = str(body.get("status") or "")
    if status != "OK":
        # A spent quota and a place that no longer exists are both `not OK` and
        # are not the same thing, so the status is carried rather than folded
        # into a boolean.
        logger.warning("Place details for %s returned %s", place_id, status)
        return PlaceDetails(place_id, failed=True, reason=status)

    result = body.get("result") or {}
    return PlaceDetails(
        place_id=place_id,
        name=str(result.get("name") or ""),
        rating=result.get("rating"),
        rating_count=result.get("user_ratings_total"),
        price_level=result.get("price_level"),
        website=str(result.get("website") or ""),
        editorial_summary=str((result.get("editorial_summary") or {}).get("overview") or ""),
        reviews=list(result.get("reviews") or []),
    )


def claims_from(details: PlaceDetails) -> list[Claim]:
    """The details, said as claims a blurb writer can read.

    Deliberately conservative about what becomes a claim. The rating is one
    claim, not three; the price is one sentence; each review is itself. Nothing
    here is summarised or interpreted, because the point of this pass is that
    it is the only material in a profile that no model wrote.
    """
    if details.failed:
        return []

    claims: list[Claim] = []
    now_year = datetime.now(timezone.utc).year

    if details.rating is not None and details.rating_count:
        claims.append(
            Claim(
                kind="recognition",
                text=(
                    f"Rated {details.rating} out of 5 by {details.rating_count:,} "
                    "people on Google."
                ),
                source_name="Google",
            )
        )

    if details.price_level is not None:
        word = PRICE_WORDS.get(int(details.price_level))
        if word:
            claims.append(
                Claim(
                    kind="price",
                    text=f"Google places it in the {word} band for the area.",
                    source_name="Google",
                )
            )

    if details.editorial_summary:
        claims.append(
            Claim(
                kind="recognition",
                text=details.editorial_summary,
                source_name="Google",
            )
        )

    for review in details.reviews:
        text = str(review.get("text") or "").strip()
        if not text:
            continue
        stars = review.get("rating")
        age = str(review.get("relative_time_description") or "").strip()
        # The star rating and the age travel with the sentence. A five-star
        # review from eight years ago and a three-star from last month say very
        # different things, and a blurb written from the first without knowing
        # its age is a blurb about a restaurant that may have changed hands.
        prefix = f"A {stars}-star Google review" + (f" from {age}" if age else "")
        claims.append(
            Claim(
                kind="review",
                text=f"{prefix}: {text}"[:600],
                source_name="Google review",
                about_year=_review_year(review, now_year),
            )
        )
    return claims


def _review_year(review: dict, default: int) -> int | None:
    stamp = review.get("time")
    if not isinstance(stamp, (int, float)):
        return None
    try:
        return datetime.fromtimestamp(float(stamp), tz=timezone.utc).year
    except Exception:  # pragma: no cover -- defensive
        return None
