"""What this place's customers said, from the Local Business Data API.

Replaces the reviews half of `places.py`. Google's Places Details endpoint
returns **five** reviews, chosen by Google as "most relevant", with no date on
them beyond "2 years ago" and no link to any one of them. That shaped the old
design: because Google publishes no per-review permalink, all five had to be
carried as a single page with a passage per claim.

This endpoint answers the same question better in four ways that each change
what can be written from the result:

* **Up to a hundred reviews**, not five.
* **`sort_by`**, so recent opinion can be asked for rather than hoped for. The
  standing weakness in this feature is a dated fact phrased in the present
  tense; being able to ask for the newest reviews is the first real answer to
  it.
* **`query`**, so the reviews about the wings can be asked for instead of the
  five Google happened to pick, most of which are about parking and the music.
* **`review_link` and `review_datetime_utc`** -- each review has its own
  address and its own exact day, so a claim can name the review it came from
  and the date check has something real to check.

The same endpoint Location Manager calls in `reviews-api.client.ts`, on the
same account key. Kept here rather than shared for the reason `places.py` gives
about itself: LM is a Bun service, this is Python, and a GET with six query
parameters is not worth a service boundary.

**Billed per review object returned, not per request**, on a free plan of five
hundred. Nothing in this module may run without asking `reviews_budget` first,
and every answer -- including a failed one -- is written to that ledger. See
that module for why there are two counters.

**What this is not.** It is Google's reviews, fetched through a vendor who
scrapes them and resells them. Storing the text is what the pipeline has always
done. Quoting one in a published article is a separate decision with its own
terms to read, and nobody has made it.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.shared.api_usage import observe_external_call

logger = logging.getLogger(__name__)

API_HOST = "local-business-data.p.rapidapi.com"
_ENDPOINT = f"https://{API_HOST}/business-reviews-v2"
TIMEOUT_SECONDS = 25

# How many reviews one press asks for. Twenty is four times what Google gave
# and one twenty-fifth of the free allowance, so the whole board can be
# researched twice over without crossing it.
DEFAULT_LIMIT = 20

# Peru, in Spanish. The reviews are written in Spanish and are left that way:
# the API will translate them, but a translated sentence is not a verbatim
# passage, and the check downstream is that the quoted words are really in the
# text. Translation is the writer's job, done knowingly, not a flag set here.
DEFAULT_REGION = "pe"
DEFAULT_LANGUAGE = "es"


def api_key() -> str:
    """The account's RapidAPI key. One key opens every API on that account."""
    return os.getenv("RAPID_API_KEY", "").strip()


@dataclass
class ReviewFetch:
    """The reviews for one place, or why there are none.

    `failed` and an empty `reviews` are different answers and are kept apart:
    a place nobody has reviewed is a finding about the place, and a refused
    quota is a finding about us.
    """

    business_id: str
    reviews: list[dict] = field(default_factory=list)
    # This endpoint answers with reviews and a cursor and nothing about the
    # business, so the name is only ever what a caller put here. Rating and
    # rating count stay on the Places path, which is where they come from.
    place_name: str = ""
    failed: bool = False
    reason: str = ""
    # What this call spent and what is left after it, for the caller to report
    # without going back to the ledger.
    objects: int = 0
    remaining: int | None = None
    cursor: str = ""

    @property
    def with_text(self) -> list[dict]:
        """Only the reviews that actually say something.

        A large share of Google reviews are a star rating and nothing else.
        They count against the quota all the same, so the gap between what was
        bought and what can be read from is worth carrying rather than
        discovering downstream.
        """
        return [r for r in self.reviews if str(r.get("review_text") or "").strip()]


def fetch_reviews(
    place_id: str,
    *,
    limit: int = DEFAULT_LIMIT,
    sort_by: str = "most_relevant",
    query: str = "",
    region: str = DEFAULT_REGION,
    language: str = DEFAULT_LANGUAGE,
) -> ReviewFetch:
    """Ask for one place's reviews. Never raises.

    `place_id` is a Google Place ID -- the same `ChIJ...` this pipeline already
    stores. The endpoint accepts it directly, so nothing is re-resolved and the
    branch anchoring is unchanged.
    """
    from . import reviews_budget

    if not place_id:
        return ReviewFetch(place_id, failed=True, reason="place is not resolved")
    key = api_key()
    if not key:
        return ReviewFetch(place_id, failed=True, reason="no RAPID_API_KEY")

    limit = max(1, min(int(limit), 100))

    # The switch, before the money. Asked with the whole of what the call could
    # cost, because the answer decides whether it runs at all.
    refusal = reviews_budget.check(limit)
    if refusal is not None:
        logger.warning("Reviews not fetched for %s: %s", place_id, refusal.reason)
        return ReviewFetch(
            place_id,
            failed=True,
            reason=refusal.reason,
            remaining=refusal.budget.remaining,
        )

    params = {
        "business_id": place_id,
        "limit": str(limit),
        "sort_by": sort_by,
        "region": region,
        "language": language,
    }
    if query.strip():
        params["query"] = query.strip()

    import requests

    try:
        with observe_external_call(
            provider="local-business-data",
            feature="listicle.place_reviews",
            endpoint="business-reviews-v2",
        ) as observed:
            response = requests.get(
                _ENDPOINT,
                params=params,
                headers={
                    "x-rapidapi-host": API_HOST,
                    "x-rapidapi-key": key,
                },
                timeout=TIMEOUT_SECONDS,
            )
            observed.http_status = response.status_code
            headers = response.headers
            if response.status_code != 200:
                # Recorded before returning. A rejected call spends nothing,
                # but their counter travels on the rejection too and is the
                # freshest thing we will see.
                budget = reviews_budget.record(
                    business_id=place_id,
                    requested=limit,
                    objects=0,
                    http_status=response.status_code,
                    headers=headers,
                    note=f"HTTP {response.status_code}",
                    params=params,
                )
                observed.add_metadata(status=str(response.status_code))
                return ReviewFetch(
                    place_id,
                    failed=True,
                    reason=f"HTTP {response.status_code}",
                    remaining=budget.remaining,
                )
            body = response.json()
            observed.add_metadata(status=str(body.get("status") or ""))
    except Exception as exc:  # pragma: no cover -- network dependent
        # No headers and no count. The call may or may not have been billed;
        # the whole request is charged to the ledger as if it were, because
        # undercounting is the only error here that costs money.
        logger.warning("Reviews failed for %s: %s", place_id, exc)
        reviews_budget.record(
            business_id=place_id,
            requested=limit,
            objects=limit,
            headers=None,
            note=f"{type(exc).__name__}: no answer, charged in full",
            params=params,
        )
        return ReviewFetch(place_id, failed=True, reason=f"{type(exc).__name__}")

    data = body.get("data") or {}
    # `data` is the reviews object on this endpoint; older shapes of the same
    # vendor's API nested them under `reviews_data`, so both are accepted
    # rather than letting a vendor-side rename read as a place with no reviews.
    reviews = data.get("reviews")
    if reviews is None:
        reviews = data.get("reviews_data")
    reviews = [r for r in (reviews or []) if isinstance(r, dict)]

    budget = reviews_budget.record(
        business_id=place_id,
        requested=limit,
        objects=len(reviews),
        http_status=200,
        headers=headers,
        note=str(body.get("status") or ""),
        params=params,
    )

    return ReviewFetch(
        business_id=place_id,
        reviews=reviews,
        place_name=str(data.get("name") or ""),
        objects=len(reviews),
        remaining=budget.remaining,
        cursor=str(data.get("cursor") or ""),
    )


# ---------------------------------------------------------------------------
# The reviews as something evidence can be quoted from.
#
# Still one page rather than one page per review, for the reason the page
# budget exists: twenty reviews would be twenty of an eight-page allowance, and
# reviews are meant to cost none of it. What is new is that every block inside
# carries its own link and its own exact date, so a claim drawn from one names
# that review rather than "the reviews".
# ---------------------------------------------------------------------------

# Each review has its own permalink on this endpoint, and it is deliberately
# NOT written into the page text. A Google Maps review URL is ~170 characters,
# which across twenty reviews is 28% of the page's character budget -- and
# nothing downstream reads them: the extraction cites a page id (`p3`), not a
# per-review link. Spending a quarter of the budget on URLs no reader follows
# costs four or five real opinions, which is the material the page exists for.
#
# What IS kept per review is short and load-bearing: who wrote it (the speaker
# check), the exact day (the date check), and how many reviews they have
# written (whether this is one voice or four hundred).
REVIEWS_URL = "https://search.google.com/local/reviews?placeid={place_id}"


def _render_block(review: dict) -> str:
    """One review, as the extraction will read it.

    The header is not decoration. `who_said_it` is decided from the name, the
    date check reads the day, and the reviewer's standing is the only signal
    separating one voice from four hundred -- none of which survives if the
    block is just the text.
    """
    text = str(review.get("review_text") or "").strip()
    who = str(review.get("author_name") or "").strip() or "an unnamed reviewer"
    stars = review.get("rating")
    if stars is None:
        stars = review.get("review_rating")
    when = _review_date(review)

    standing = []
    count = review.get("author_review_count")
    if isinstance(count, int) and count > 0:
        standing.append(f"{count} reviews written")
    level = review.get("author_local_guide_level")
    if isinstance(level, int) and level > 0:
        standing.append(f"Local Guide level {level}")

    header = f"REVIEW by {who}"
    if stars is not None:
        header += f" \u2014 {stars} stars"
    if when:
        header += f" \u2014 written {when}"
    if standing:
        header += f" \u2014 {', '.join(standing)}"

    block = f"{header}\n{text}"
    owner = str(review.get("owner_response_text") or "").strip()
    if owner:
        owner_when = _iso_date(review.get("owner_response_datetime_utc"))
        block += "\nOWNER REPLY" + (f" ({owner_when})" if owner_when else "")
        block += f": {owner}"
    return block


def reviews_as_page(
    fetched: ReviewFetch,
    place_id: str,
    place_name: str = "",
    *,
    terms: list[str] | None = None,
):
    """The reviews worth reading, as one page. `None` when there are none.

    `terms` are this list's subject words (see `review_selection`). Given them,
    the reviews about the subject are chosen first and the ones about the
    parking fill whatever space is left. Without them nothing is off-topic and
    the ranking falls back to the reviewer's standing and the length -- still
    better than the order the API happened to return.

    `None` is a real answer about a place, not a failure, and it is a different
    answer from `fetched.failed`, which the caller checks separately.

    Branch-anchored: a Google review hangs off the Place ID, and the Place ID
    is the branch. Without that the address check would reject every review
    claim for want of an address reviews do not print.
    """
    from . import review_selection, source_reader
    from .source_reader import PageRead

    if fetched.failed:
        return None

    chosen = review_selection.select(
        fetched.reviews,
        terms=list(terms or []),
        # The same ceiling every fetched page is held to. Without it the
        # reviews would be the only text in the extraction prompt that ignores
        # the limit the rest obey.
        budget_chars=source_reader.MAX_TEXT_CHARS,
        render=_render_block,
    )
    if not chosen.kept:
        return None

    return PageRead(
        requested_url=REVIEWS_URL.format(place_id=place_id),
        final_url=REVIEWS_URL.format(place_id=place_id),
        state="ok",
        http_status=200,
        title=(
            "Google reviews for "
            f"{place_name or fetched.place_name or 'this place'}"
        ),
        text="\n\n".join(_render_block(review) for review in chosen.kept),
        # The page has no publication date of its own. Each review carries its
        # own, inline, and a claim drawn from one takes that as its event date.
        published_at="",
        origin="google_reviews",
        branch_anchored=True,
        note=_page_note(chosen),
    )


def _page_note(chosen) -> str:
    """What was bought, what was kept, and why the rest was not.

    Written out rather than summarised because a thin page has several very
    different causes -- a quiet place, a place whose reviewers talk about
    something else, a budget that ran out -- and a reader deciding whether to
    trust six findings needs to know which one happened.
    """
    parts = [f"{len(chosen.kept)} review(s) of {chosen.bought} bought"]
    if chosen.terms:
        parts.append(
            f"{chosen.on_topic} of them mention {' / '.join(chosen.terms)}"
        )
    else:
        parts.append("no subject terms were available, so none were filtered by topic")
    if chosen.silent:
        parts.append(f"{chosen.silent} were a star rating with no words")
    if chosen.too_short:
        parts.append(f"{chosen.too_short} were too short to carry a claim")
    if chosen.dropped_for_space:
        parts.append(
            f"{chosen.dropped_for_space} ranked lower and did not fit the page"
        )
    return (
        "; ".join(parts)
        + ". Chosen by subject, then by the reviewer's standing, then by length."
    )


def _review_date(review: dict) -> str:
    """The day the review was written, as a plain date.

    Prefers the ISO datetime the API sends. Falls back to the epoch seconds
    beside it, because one of the two has been missing on real answers.
    """
    iso = _iso_date(review.get("review_datetime_utc"))
    if iso:
        return iso
    stamp = review.get("review_timestamp")
    if isinstance(stamp, (int, float)):
        try:
            return (
                datetime.fromtimestamp(float(stamp), tz=timezone.utc).date().isoformat()
            )
        except (OverflowError, OSError, ValueError):  # pragma: no cover
            return ""
    return ""


def _iso_date(value) -> str:
    if not isinstance(value, str) or not value.strip():
        return ""
    return value.strip()[:10]
