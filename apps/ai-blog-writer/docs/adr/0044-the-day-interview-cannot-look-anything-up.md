# The day interview cannot look anything up

The itinerary day workflow is one loop the operator drives: an interview that
settles what a day is *for*, a structured direction it agrees, a prompt that is
copied out to a research-capable model, and a JSON answer that is checked and
saved. This ADR records the three decisions that shape it. All three are about
the same thing: **where a fact is allowed to come from.**

## Context

The Grill engine in `prompt2blog/grill_v4.py` looks its subject up before it
asks anything (G2 of ADR 0030), and may look something up mid-interview. That
is right for an article: the interview is shortened by every fact it does not
have to ask about.

It is wrong for a day of a trip, and the reason is not cost.

A day interview's recommendations are about *places*. "Lunch at a cevicheria
near the fish market" is a preference and is fine. "Lunch at El Mercado, which
opens at noon" is a claim about the world. A grounded interview would produce
the second kind constantly, the operator would accept them — they arrive
pre-filled in the answer box, which is the whole point of the recommendation —
and an accepted recommendation becomes a requirement that the research step
must honour. The system would then be researching against venue facts it
invented one screen earlier, and nothing downstream would ever check them,
because by then they are requirements rather than findings.

The dry run of 2026-09-15 showed the other half: an external research-capable
model, given the day and the agreed direction, returns real named places with
sources it actually read. That is where venue facts belong.

## Decision

**The interview reaches no search, and that is enforced in the engine.**
`GrillDependencies` gains `seed_research_enabled` and `mid_turn_lookup_enabled`,
both defaulting to true so every existing interview is unchanged. The itinerary
interview sets both false. A model that ignores its prompt and asks for a lookup
has the request dropped rather than obeyed — the rest of its reply is still
used, because refusing a good question to punish a stray field would cost a turn
for nothing.

**The research is a separate step with a hard boundary, and that boundary is a
hash.** The prompt is assembled deterministically from the accepted direction
and the saved setup; no model call is made to write it, and copying it is free.
The export carries an identity envelope, and a packet answering a request the
day has since outgrown is refused with an explanation rather than retargeted.

*Amended 2026-09-16.* That step can now be run inside the app, on the Claude
subscription, with `WebSearch` and `WebFetch` and the day's generated schema
passed to the CLI as `--json-schema`. The boundary has not moved: the research
is still a separate step, still judged by the same validator, and still
reviewed by the operator before anything is saved. What changed is who does the
copying.

The reason is measured rather than theoretical. Every hand-pasted attempt
failed, and failed the same way — the packet is twelve kilobytes of nested
JSON, a chat window has nothing enforcing its shape, and something was always
missing. The CLI validates the reply against the schema before this app sees
it. Two consequences follow. The `required` lists in the generated schema were
cut to the fields that decide what a thing *is*, because "a selected place
needs an address" is a semantic rule with a readable answer and a schema
expressing it produces an error nobody can act on. And the five identity fields
are no longer asked for on the in-app path: a call this app made is by
construction the answer to the export it was made for, so they are stamped from
what we already hold. On the paste path they are still echoed and checked,
because there the operator could paste anything.

*Amended again 2026-09-16: a smaller assignment.* An audit of the first
seven-stop in-app run found the research call was handed 49,412 characters
(the direction as pretty-printed JSON plus the whole interview replayed, the
Prompt2Blog house rules, and a 13,928-character schema), ran 75 turns with 51
searches and 20 page reads, and returned about 40,000 characters that said
most things several times. The research step is still ONE call and nothing was
added around it — no planner, verifier, second writer or automatic repair.
What changed is what it is asked for:

- The export is built from sections (instructions, day brief, voice and
  writing, answer format). The interview trace is no longer sent; the
  direction is printed once as labelled lines with each stop's requirements
  folded into that stop; only exact repeats are removed. A normal seven-stop
  day measures about 15,000 characters including the system prompt and the
  schema. A larger agreement is labelled with its largest section and still
  runs; nothing accepted is ever cut.
- New exports ask for the **compact answer** (`itinerary-day-research-v2`):
  the article once, evidence attached to the stop it supports, the journeys
  between consecutive stops, and one issue record per concern. One adapter
  turns it into the existing saved `DayResult`, so no stored day, screen or
  continuity reader changed shape. Answers to v1 exports still import.
- The export's identity now includes the answer format and a prompt policy
  revision, because a different format or research policy is a different
  question. The wording is still outside it.
- The prompt states a **research allowance** (about 2N + 4 searches and N + 5
  page reads for N venue stops). It is guidance; the transport cannot stop a
  call at a tool boundary and still get an answer, so the timeout remains a
  failure ceiling and nothing is retried automatically. What the run actually
  did is read off its own transcript, found by the session id the CLI
  returns, and shown as unknown when that transcript cannot be read.
- The interview and the extraction were told to stop inflating scope at the
  source: an unknown need stays unknown rather than becoming "suit every
  need", a preference is not hardened into a number, "one transfer" means one
  ride, and each requirement is written once in the field that owns it.
- Planning completeness now includes the route. A day is complete only when
  every pair of consecutive selected venues has a journey with a known time
  that fits before the next start, after free time and rest. Code proves that
  arithmetic; it does not prove the geography, and says so.

`ITINERARY_RESEARCH_WIRE=v1` restores the original export for new builds;
the compact reader stays, because compact answers already exist.

**Validity, completeness and verification are three separate things, and the app
only decides the first two.** Import validity is deterministic: the shape, the
stop list, the evidence graph, the arithmetic. Planning completeness is whether
every required stop resolved and got a time. Verification is a person reading
the sources, and nothing in the app can do it — a resolving claim graph proves
that references connect, never that a page says what a claim says it says. The
model's own `status` is stored and displayed as the model's opinion of its own
work; it never becomes the app's badge.

## Consequences

The interview asks more questions than a grounded one would, and every one of
them is about something only the operator can answer. On the first real run it
settled three of its eight areas straight from the setup without asking, and
reached agreement in five turns.

A day can be saved incomplete, labelled "Needs work". Research that found five
of six places is progress worth keeping, and calling it a finished day is the
lie this distinction exists to prevent.

Evidence stays marked unchecked until an operator ticks a box saying they read
it. That tick is stored beside the result and never inside it: a review is a
person saying they looked, and rewriting a claim to match would destroy the
thing they reviewed.

Nothing here publishes. The saved day lives in the itinerary workspace; mapping
it to Payload is separate work with its own contract.

## Evidence

- `apps/backend/app/features/itinerary_pipeline/` — contracts, store, grill,
  direction, prompt export, validation, API.
- `apps/backend/tests/test_itinerary_grill.py` — proves zero research calls with
  a research callable that records every invocation, and proves the article
  grill still researches.
- `apps/backend/tests/test_itinerary_import.py` — one test per way a packet can
  be wrong, each asserting the specific outcome rather than "it was rejected".
- `apps/backend/tests/test_itinerary_research.py` — proves the in-app path is
  held to the same checks as a paste, that identity is stamped rather than
  asked for, and that every way the call can fail lands somewhere an operator
  can act on.
- The `--json-schema`-plus-`WebSearch` combination was measured before anything
  was built on it: five turns, real posted hours, a real URL, and a
  `structured_output` object rather than a string to be salvaged.
- `apps/backend/tests/test_itinerary_compact.py` and
  `apps/backend/tests/fixtures/itinerary_lima_audit/` — the audited Lima run
  frozen offline: the export reproduces at 49,412 characters, the compact
  export of the same agreement loses no accepted requirement, and the audited
  answer still imports and is still not complete.
- `docs/experiments/itinerary-research-reduction/` — the controlled live
  comparison against that baseline.
- `docs/experiments/itinerary-day1-dry-run/` — the synthetic dry run this
  contract generalises. Kept as a fixture; it is not the production schema.
