# A research request reads its sources

Amends ADR 0039, *One place, one request, one profile*. Everything 0039 decided
about authorisation, readiness, the single active slot, the five terminal
states, curation and profile lifetime still holds. One thing changes: **what a
request does between the button and the findings.**

## Context

0039 bought one grounded generation per press and stored what it answered. Five
real requests were made under that design, and they are preserved as fixtures.
Three completed and produced thirteen findings. What those thirteen actually
rest on:

| what the packet claimed | what was behind it |
|---|---|
| thirteen findings with sources | twelve source rows, every URL a `vertexaisearch.cloud.google.com` redirect |
| "supporting excerpt" on a finding | a sentence the model wrote, about a page nothing in this process had opened |
| "The BarBarian brand, including its Huancayo branch, offers wings with specific prices" | one branch's price, offered as the brand's |
| "Customers have positively noted the 'ricas alitas'" | an aggregator's scraped keyword blob |
| `coverage: covered` | the model's own report of its own work |
| a 2020 opening article under a current menu claim | no distinction between the source's date and the claim's |

Two of the five requests returned something that was not the object asked for.
One of those spent 2,423 thinking tokens and returned a single output token.

The failure is not that the model was careless. It is that **the design had
nowhere to check anything.** A call that searches, reads, decides and reports in
one step produces a packet whose only evidence for itself is the packet. The
parser validated that citations pointed at ids the same reply had declared — so
a reply that invented a source and cited it passed every check there was.

The redirect URLs are the sharp end. They name no publisher, they expire, and
nobody — not a reader, not the person curating the profile, not the next run —
can open one and see whether the sentence is there.

## Decision

**A research action reads the pages it cites.** Between the search and the
findings there is now a fetch: public HTTP(S) only, redirects followed one hop
at a time with every hop re-checked against private address ranges, bounded by a
page count, a byte ceiling, a per-page timeout and a whole-attempt deadline.
Each page is recorded with the address the redirects ended at, its title, its
own publication date, its content hash and whether it could be read at all.

Following the redirect is most of the win by itself: the citation becomes the
publisher's own address, which still resolves next year.

**A finding is extracted from collected text, not from a search.** One
ungrounded generation receives the pages under stable ids and returns atomic
claims, each with the passage in a named page that carries it. It has no search
tool, so there is nothing for it to cite that was not collected.

**The passage is then checked in code, not by a model.** An excerpt that is not
in the page it names fails. A checker that is the same kind of thing as the
writer fails silently, and this one cannot: it is string matching over words,
with accents folded and whitespace normalised, and it either finds the run of
words or it does not.

Passing is `evidence_ready`. That is a lower bar than true — it means a person
can open the page and find the sentence — and the name says so.

**Four more checks, each paid for by a specific error in the preserved
baseline.** A `branch` claim needs a supporting page that carries this branch's
street, number or district, or it is recorded as `unknown` scope. A price
carries the channel it was seen on. A "review" with nobody identifiable behind
it is `review_needed`. A source's publication date comes off the page record and
never off the claim, and only from citations whose passage was found.

**The budget is two generations, and nothing inside the action can raise it.**
One grounded search, one extraction, and no path that makes a third. The
extraction runs only when at least one page was readable: with no collected
text, asking a model to restate its own search answer would be buying a second
opinion about a first one. Every call writes a receipt — stage, model, usage,
duration, outcome, finish reason — and a skipped call writes one too, with its
reason.

**`extract_only` is a fourth mode.** It re-reads the pages an earlier attempt
collected and buys no search. It exists because a malformed extraction must not
cost a second search to repair, and because "run it again" has to be able to
mean something narrower than "buy the whole thing again".

**The request is a brief, computed before anything is bought.** Priority
questions, known source leads with their origin, illustrative search strings,
scope notes and completion criteria — all derived from the identity, the list's
standard and the searches that found the place. No planning call. The brief is
stored on the attempt, so what was asked is readable without reading the prompt.

**A discovery lead carries the search that produced it.** The version before
this sent the snippet alone, which made a place found by *still serving wings
after midnight* and one found by *ají amarillo instead of Buffalo sauce* into an
identical request.

**A narrow follow-up asks one question.** The four standing directions the old
template sent whatever was asked are gone.

**Coverage is arithmetic over accepted evidence, kept apart from how the search
went.** The model's own coverage note survives as a note. Unsearched, searched
without result, inaccessible and budget-limited stay four different answers, and
none of them is "nothing is published about this place".

## What this deliberately does not do

**It does not run its own search scheduler.** Google's grounding tool chooses
its queries. The strings the brief supplies are recorded as illustrative and are
never printed as what was run; what the provider reports having searched is
stored separately. Building a deterministic scheduler while still claiming the
provider ran the supplied queries exactly would be a lie with extra machinery.

**It does not verify truth.** It verifies that a passage is in a page. A page
can be wrong, a menu can be stale, a business can flatter itself, and none of
that is detectable from the text.

**It does not retry.** Not on failure, not on a thin answer, not on a malformed
one. 0039's rule is unchanged and this design has more places to fail, which
makes it more important rather than less.

**It does not decide anything about candidates.** No ranking, no approval, no
removal. Evidence coverage cannot block a place or start another call.

## Consequences

A research action now takes longer and costs two generations rather than one.
The reading between them is free of provider charge and is the part that makes
the rest checkable.

The extraction call runs on a different model from the search, under its own job
id (`listicle.evidence_extract`), with a forced schema. Two of the five baseline
calls died on JSON shape after spending their whole output budget; a provider
that guarantees the shape removes that failure rather than handling it.

Findings gain `validation`, `validation_notes`, `who_said_it`, `who_name` and
`channel`. Attempts gain the brief, per-call receipts, page records, the
discovery report and a derived evidence summary. All of it is additive: the five
baseline attempts and the thirteen findings they produced keep their rows, their
ids and their curation, and read as material nothing has checked — which is what
they are.

A later pass may replace the validation verdict on a finding only when nobody
has touched that row. A hand edit bumps the version, and a version past one is a
row a person owns.

The whole-run pass (`build_profile`, `research_place`, `Claim`) is untouched and
still works. The old findings-envelope parser is deleted: the new path does not
speak that shape, and keeping a second parser for a request nothing makes would
be a compatibility layer for our own past.

**Not yet proven.** Two generations is a ceiling chosen against the shape of the
material, not a measured optimum. Eight pages is the same. The three-place pilot
this design was built for reports actual usage against the preserved baselines;
until it does, the numbers here are a budget and not a result.
