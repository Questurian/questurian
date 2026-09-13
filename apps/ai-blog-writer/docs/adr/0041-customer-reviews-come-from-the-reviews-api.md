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
* **`review_datetime_utc`**: each review has its own exact day, so the date
  check has a real date rather than "2 years ago". (`review_link` also exists
  per review; see below for why it is not carried into the page.)

**Reviews are still one collected page, not one page per review.** Twenty
reviews would be twenty of an eight-page allowance, and 0040 decided reviews
spend none of it. What changed is what is inside: every block now carries its
exact date and the reviewer's standing (how many reviews they have written,
their Local Guide level). One review from an account with four hundred behind
it and one from an account with one are not the same evidence, and nothing
downstream could tell them apart unless it is said here.

**That page obeys the same 12,000-character ceiling as every fetched page**,
and whole reviews are dropped rather than the text being cut at the limit. A
review sliced in half fails the passage check for a sentence its author really
wrote, which reads as a fabricated quote rather than as a page that was too
long. The page note says how many were bought and how many fitted.

**The per-review permalinks are deliberately not written into that page.** They
exist on the response and they are real, but a Google Maps review URL is ~170
characters; across twenty reviews that is 28% of the page's budget, and nothing
downstream follows them — the extraction cites a page id, not a review link.
Measured on BarBarian's twenty: with the links, 16 reviews fit; without them,
all 20 do. Four real opinions is too much to pay for URLs no reader opens.

**The reviews are left in Spanish.** The API will translate them. A translated
sentence is not a verbatim passage, and the check this whole design rests on is
that the quoted words are really in the text. Translation is the writer's job,
done knowingly, not a flag set in a fetch.

**Google Places keeps everything else.** `resolve_place` still resolves names
to Place IDs, and Places Details still supplies rating, rating count, price
level, website and editorial summary to the whole-run pass. Only the reviews
moved. `places.reviews_as_page` is deleted rather than left beside its
replacement.

### Something chooses which reviews are worth the page

Twenty reviews handed whole to the extraction is shovelling, not research. Most
of any twenty Google reviews are about the parking, the music and the service;
a list about chicken wings is written from the six that are about chicken
wings. Before `review_selection` nothing chose: the reviews entered the prompt
in the order the API returned them and were cut at the first twelve thousand
characters, so the material that decided what got written was whatever happened
to be near the top.

**The subject's words are read off the run's own search evidence.** The API can
filter reviews by text, but only if it is told what the subject is called
*where the reviews were written*. This list's topic is "chicken wings"; every
review of it is in Spanish. Asking for "chicken wings" finds almost nothing.

Nothing translates it and no model is asked. The sentences that put these
places on the board say `alitas` under sixty-five candidates, `wings` under
sixteen and `salsas` under eight — a measurement of how the subject is actually
written about, taken from data the run already paid for, costing no call and no
translation table that would be wrong for the next city. Two rules keep the
list clean: calendar words are excluded by name (`agosto` otherwise outranks
real subject words and marks any review mentioning August as on-topic), and a
term must clear a tenth of the dominant term's count — which is what separates
`salsas` at eight from `sede`, Spanish for "branch", at six.

**Subject decides the order, never survival.** The first version of this
filtered on those terms and that was a bug with teeth: the terms are *derived*,
so a run whose terms came out narrow silently destroyed real material and
produced no page — a place with opinions reading as a place with none. A review
reading "las alitas estaban con mal sabor" would have been deleted by terms
that happened to come out as `pollo, salsas`.

So the only hard refusal is a review with too few words to carry a passage a
check could stand on. Everything else is ranked — subject, then substance, then
the reviewer's standing, then length — and the page budget does the cutting.
What it cuts is whatever ranked last, which is a statement about crowding and
not a judgement that a review was worthless.

**The reviewer's standing is carried because it is invisible in the text.** One
review from an account with four hundred behind it and one from an account with
a single review are not the same witness, and nothing downstream could tell
them apart unless the block says so.

**The page note says what was bought, what was kept, and why the rest was
not** — a star rating with no words, too short to carry a claim, or ranked
lower and did not fit. A thin page has several very different causes, and a
person deciding whether to trust six findings needs to know which one happened.

**The derived terms are shown on the research drawer.** They are derived, not
typed: if they come out wrong, the reviews that were bought are the wrong ones,
and a thin result would otherwise read as a fact about the place.

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

**`sort_by` is still unused.** It defaults to `most_relevant`. Asking for the
newest reviews is the sharpest remaining answer to the dated-fact weakness and
it is a separate decision: `most_relevant` is recency-weighted already (the
twenty bought for BarBarian span 2017 to 2026), so what `newest` buys over it
has to be measured rather than assumed. Buying both sorts is two calls and
halves how many places the free allowance covers.

**Selection is rules, not judgement.** Nothing here reads a review and decides
whether it is any good — it counts words, matches terms and sorts. A review
saying "las alitas estaban ricas" outranks one saying nothing about wings, and
that is as far as it goes. What survives still has to be read by the extraction
and checked in code. This removes the worst of the noise; it does not pick the
best material.

**The extraction's output ceiling was not raised, and nothing checks whether
its reply was truncated.** `EXTRACTION_MAX_TOKENS` is 8,192 and the structured
call reports no finish reason, so a reply cut off at the ceiling is
indistinguishable from one that finished. Four times the review material makes
that more likely, not less. Two things hold the risk down rather than remove
it: the page ceiling above bounds how much the input actually grew, and 0040's
`extract_only` mode re-runs the extraction over pages already collected without
buying a second search. Threading a finish reason through the model gateway's
structured path is the real fix and is not done here.

**Not yet proven.** One probe of six reviews was made while building this. It
showed the mechanism works and the filter is fuzzy rather than exact: asking
for `alitas` returned five reviews of which three clearly discussed them. No
place has been researched end to end through this path. Until one is, what is
written here is a design and not a result.
