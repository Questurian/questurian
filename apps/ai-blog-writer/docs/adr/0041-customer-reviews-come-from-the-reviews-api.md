# Customer reviews come from the reviews API, on a capped free plan

Amends ADR 0040, *A research request reads its sources*. Everything 0040 decided
about the sequence, the page budget, the checks in code, and the two-generation
ceiling still holds. Two things change: **where customer reviews come from**,
and **the fact that they now run against a hard cap.**

## Context

0040 read Google's reviewers through one Places Details call. That was the
right call at the time — it was already written, it cost one request, and it
produced the first attributable customer opinion this project has ever had
(Israel Ruiz, 2025-08-09, via attempt `0e07e0e64514`).

It was also thin, and the pilot report said so. Places Details returns **five**
reviews, chosen by Google as "most relevant" — not a sample anybody designed.
They carry no publication date beyond `relative_time_description` ("2 years
ago"), and **Google publishes no per-review permalink**, which is why 0040 had
to carry all five as a single page with a passage per claim rather than as five
sources.

The one release criterion the pilot missed compounds it: a dated fact phrased
in the present tense passes every check. McCarthy's "thirteen sauces" rests on
a 2020 article, the passage is really there, so it passes. Nothing in the
design could *ask for recent opinion* — Places Details has no sort.

The operator's instruction was to move reviews to RapidAPI. The endpoint is
Local Business Data's `business-reviews-v2`, already integrated in Location
Manager on the same account key.

## Decision

**Customer reviews come from `business-reviews-v2`, addressed by Place ID.**

The endpoint accepts a Google Place ID directly, so nothing is re-resolved and
the branch anchoring of 0040 is unchanged: a review still hangs off the Place
ID, the Place ID is still the branch, and the address check still knows it.

Four things it gives that Places Details could not, each of which changes what
can be written:

* **Up to a hundred reviews** instead of five. Twenty is what one press asks
  for.
* **`sort_by`**, so recent opinion can be *asked for*. This is the first
  mechanism in the feature that addresses the present-tense-dated-fact
  weakness rather than merely reporting it.
* **`query`**, so the reviews about the subject can be asked for instead of
  the five Google happened to pick — most of any five being about parking and
  the music.
* **`review_link` and `review_datetime_utc`**: each review has its own address
  and its own exact day. A claim can name the review it came from, and the date
  check has a real date rather than "2 years ago".

**Reviews are still one collected page, not one page per review.** Twenty
reviews would be twenty of an eight-page allowance, and 0040 decided reviews
spend none of it. What changed is what is inside: every block now carries its
own link, its own exact date, and the reviewer's standing (how many reviews
they have written, their Local Guide level). One review from an account with
four hundred behind it and one from an account with one are not the same
evidence, and nothing downstream could tell them apart unless it is said here.

**The reviews are left in Spanish.** The API will translate them. A translated
sentence is not a verbatim passage, and the check this whole design rests on is
that the quoted words are really in the text. Translation is the writer's job,
done knowingly, not a flag set in a fetch.

**Google Places keeps everything else.** `resolve_place` still resolves names
to Place IDs, and Places Details still supplies rating, rating count, price
level, website and editorial summary to the whole-run pass. Only the reviews
moved. `places.reviews_as_page` is deleted rather than left beside its
replacement.

### The cap, and the switch

**The plan is billed per review object returned, not per request**, free up to
five hundred. Twenty reviews spend twenty. The owner's instruction is that it
must never cross that and become a charge, so:

**Nothing buys a review without asking `reviews_budget` first, and the refusal
happens before the request leaves.** A refusal is not an exception and not an
error state — it arrives at the pipeline as a place with no reviews and a
reason, which the sequence already knows how to carry.

**A call is refused on the whole of what it could cost, not on what it will
probably cost.** A request for twenty may return twenty, so twenty must be
there before it runs. Charging the difference to optimism is how a ceiling gets
crossed by exactly one call.

**There are two counters and the stricter one gates.** Ours is a ledger in
`pipeline.db`; theirs is `x-ratelimit-businesses-remaining`, read off every
response. Ours cannot see a call made from Location Manager on the same key.
Theirs cannot see a call that never came back. Neither alone is safe. When they
disagree by more than one place's worth, the screen says so rather than
resolving it, because the usual cause is another app spending the same quota
and that is worth knowing.

**A call with no answer is charged in full.** It may or may not have been
billed. Counting it as zero is the only error here that costs money.

**The quota resets and the counter does not.** The free plan rolls over on a
timer. Nothing reads that timer and starts spending again on the strength of
it: a machine deciding on its own that it is safe to buy is the exact failure
this guard exists to prevent. A person clears it with `reviews_budget.reset()`
and gives a reason, which is stored.

**The remaining budget is said in places, not in review objects**, wherever a
person reads it — the board, the research drawer, the pilot's `--dry-run`.
"About eleven more places" is a decision. "224 reviews left" is arithmetic
somebody has to do first.

## Consequences

**An exhausted allowance does not stop research.** It stops reviews. The
request still runs, still searches, still reads pages, still extracts. The
screen says that in those words, because "you cannot research this place" would
be false and would stop work that costs nothing extra.

**The vendor is a reseller.** Local Business Data scrapes Google Maps and sells
the result. This changes who bills for the fetch; it changes nothing about what
may be done with the text. Storing review text is what the pipeline has always
done. **Quoting a review in a published article remains a separate decision
with its own terms to read, and nobody has made it.**

**A third party now sits in a path that used to be first-party.** If they
change the response shape or go away, reviews stop. Two shapes of their own
response (`reviews` and `reviews_data`) are already accepted for that reason, so
a rename reads as a rename and not as a place nobody has reviewed.

**Quota buys reviews, not readable reviews.** A large share of Google reviews
are a star rating and no words. They cost the same. The page record says how
many of the bought reviews had text, so the gap is visible rather than
discovered downstream.

**Five reviews per place became twenty, and the sort and filter are unused so
far.** `sort_by` defaults to `most_relevant` and `query` defaults to nothing —
the same selection Places Details made, so the swap can be judged against the
baseline without two variables moving at once. Choosing `newest`, or filtering
to the subject, is a separate decision with its own evidence to gather.

**Not yet proven.** One probe of six reviews was made while building this. It
showed the mechanism works and the filter is fuzzy rather than exact: asking
for `alitas` returned five reviews of which three clearly discussed them. No
place has been researched end to end through this path. Until one is, what is
written here is a design and not a result.
