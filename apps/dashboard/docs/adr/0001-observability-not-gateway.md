# ADR 0001: The API usage monitor observes; it does not sit in the path

- **Status:** accepted; amended 2026-09-05 (see *Amendment: the dashboard owns the model table*)
- **Date:** 2026-09-04

## Context

This monorepo calls roughly two dozen external services from three runtimes:
Vertex, the Anthropic API, the Claude subscription CLI, Flux/BFL, Pexels,
Unsplash, Google Places and Geocoding, SerpAPI, TripAdvisor, Foursquare,
BigDataCloud, Geoapify, Instagram, Stripe, Bunny, Resend, Weaviate. Nobody
could answer, across apps: what did we call, how often, how slow, how much did
it cost, and what share failed.

The one piece of accounting that existed is `Prompt2BlogTokenUsageTracker`
(`apps/ai-blog-writer/.../prompt2blog/pricing.py`). It is good at what it does
— a per-run receipt with per-stage and per-attempt attribution — and it cannot
answer any of the questions above: it is scoped to one pipeline and one run,
records no duration and no failures, and never sees a non-LLM call. The
listicle pipeline passes `usage_recorder=None` outright; the images tree
records nothing.

## Decision

### 1. Observability only. Never a gateway.

Nothing routes through the collector. Apps make their calls exactly as before
and report afterwards. A gateway would have been a tempting way to get
complete coverage for free, and it would have made a local dev tool a
single point of failure for every external call in the repo. Coverage is
worth less than the apps continuing to work.

Consequences accepted: coverage is only as good as the emitters we write, and
a call from a code path nobody instrumented is invisible. That is the right
side of the trade.

### 2. It lives in `apps/dashboard`.

The Dashboard already exists to observe, owns no business data, and already
knows every service in the repo. It becomes a web app with two tabs — the
service status it always showed, plus the API monitor — and the Ink terminal UI
stays exactly as it was.

This does change one thing the Dashboard's context said about itself: it now
stores data. Only its own observations, never business data.

### 3. Coupling is HTTP plus a documented contract, not a shared package.

Nested monorepos here do not import each other's code. A shared client library
would break that rule, and would also force one language's ergonomics onto a
Python backend, a Bun server and a Next app. Instead the contract is versioned
and documented (`docs/api-usage-contract.md`), and each runtime gets a small
copy-in emitter.

The contract is fixed in phase 1 precisely so the remaining emitters are
additive: unknown fields are preserved rather than rejected, so an emitter and
the collector can be deployed in either order.

### 4. The collector never invents a cost.

`costUsd` is stored only when the caller sends it, with a `costBasis` saying
whether the provider measured it or a rate table produced it. Calls with tokens
and no price are counted and shown as *unpriced*.

The alternative was a rate table in the dashboard. Rejected: the repo already
owns one, complete with large-context tiers, and a second table would guarantee
two different answers to "what did that run cost" with no way to tell which was
right. It lived in `app/shared/token_usage.py`, where both the run ledger and
the emitter read it, and its figures were checked against Google's published
pricing on 2026-09-04.

*Since amended.* The single table now lives in the model gateway
(`packages/model-gateway/src/model_gateway/rates.json`) and is read by the
Python that prices a call and by this dashboard that publishes it. The decision
is unchanged — one table, owned where it is applied — but it is no longer
inside one app, because two apps price calls now.

**Flat-rate subscriptions are never priced.** The Claude Code CLI reports a
`total_cost_usd` per call. That number is what the tokens would have cost on
the Anthropic API, not money owed — the real spend is a flat monthly
subscription no per-call figure can be carved out of. Emitting it would mix a
hypothetical into the same total as metered Vertex spend and make the cost
chart confidently wrong. Tokens are reported; the price is omitted with
`metadata.unpricedReason = subscription-flat-rate`.

This is the one place the ledger and the dashboard deliberately disagree: the
ledger still records the CLI's figure, because a run receipt asking "what did
this cost to produce" is a fair use for it. The dashboard's cost chart asks
"what will I be billed", and the honest answer there is nothing.

### 5. SQLite, one file, no rollups.

`bun:sqlite` in WAL mode at `apps/dashboard/data/usage.sqlite`. It matches
lm-server's storage, needs no infrastructure, and answers every aggregate in
under a millisecond at the expected volume of a few thousand events a day.

Reads go through a `UsageStore` interface, so rollup tables or a move to DuckDB
or Postgres is a change to one file. **Revisit when** a `/summary` over the
default window stops being instant, or events arrive faster than a few tens of
thousands a day — write the rollups then, not now.

Retention defaults to 90 days (`USAGE_RETENTION_DAYS`, `0` keeps everything),
purged at boot and daily.

### 6. Emitters are fire-and-forget and fail silent.

Bounded queue, background sender, drops counted, every exception swallowed. An
observability bug must not become a pipeline bug. The cost of this is that a
producer never learns its event was rejected — so the collector logs every
rejection with its reason, because that is the only place anyone will see it.

### 7. Ingest is loopback-only unless a key is set.

With `DASHBOARD_INGEST_KEY` set the key decides. Without it, only loopback
callers are accepted. The default posture on a laptop is "my own apps may
write", not "anything that can reach the port may write". There is no auth on
the read side: this is a local dev tool, and adding a login to it now would buy
nothing.

## Status of coverage

Phase 1 instruments Prompt2Blog's model calls only, at the one seam where
duration, tokens, provider-reported cost and exceptions are all in scope.

Not yet emitting, and deliberately named so they are not forgotten: lm-server's
nine provider clients, Questura's Stripe/Bunny/Resend, the ABW images tree,
the listicle pipeline's uncounted Vertex calls, and the LM alt-text sidecar.


## Amendment: the dashboard owns the model table (2026-09-05)

The collector still observes and still never sits in the path. One thing has
been added on purpose, and the line is worth stating exactly.

### What changed

The dashboard now serves `GET /api/settings/v1/models`: which model each of the
repo's 42 jobs runs on. An operator can change one, and the running apps follow
within about a minute.

### Why this is not the gateway this ADR rejected

The objection in decision 1 was making a local dev tool a **single point of
failure for every external call in the repo**. That objection is about the call
path, and this change stays off it:

- Nothing routes through the dashboard. Apps call Vertex directly, exactly as
  before.
- Each app embeds the gateway as a library. It reads this table at startup,
  caches it, and refreshes on a timer.
- When the dashboard is unreachable, apps keep running on the last table they
  read; a fresh process falls back to the models checked into the gateway's own
  registry. Dashboard down means "keep running on what we last read", never
  "stop".
- Latency is unaffected. A model call never waits on this.

So the dashboard owns a *setting*, not a *step*. Deleting the dashboard
entirely would change which model a job runs on only to the extent that its
checked-in default differs from the last override — it would not stop a single
call.

### Why the dashboard and not somewhere else

Because the question an operator asks is "this job is costing too much, what is
it running on" — and the cost chart that provokes the question is already here.
Putting the answer in a different tool would mean reading a number in one place
and acting on it in another, which is how the 22 scattered constants happened
in the first place.

The job ids are also the `feature` values on usage events, so the table and the
chart line up on the same word: change `lm.alt_text` on the Models tab, then
filter the usage chart by `lm.alt_text` to see what the change did.

### What this costs

The dashboard now stores something an app depends on, which its context
previously said it never would. The honest statement is narrower than the old
one: **the dashboard stores its own observations, and one table of settings it
publishes but does not enforce.** The settings file
(`data/model-settings.json`) holds only the jobs somebody has changed, so
losing it returns every job to its checked-in default rather than to nothing.
