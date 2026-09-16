# Itinerary day workflow — what was built

Implements `docs/plans/itinerary-grill-copy-import-plan.html`, all seven slices.
This is the record of what exists, what was decided where the plan left a
choice, and what was deliberately not built.

## The loop

An approved day now goes: **Grill → direction → prompt → paste → saved day.**

1. **Grill.** An in-app interview about what the day is *for*. Eight areas to
   settle (purpose, geography, anchors, slot intent, rhythm, continuity, change
   policy, unknowns). It reaches no search at all.
2. **Direction.** A second, structured call writes the agreement down as the
   object research runs from. Shown as a candidate; accepted by revision.
3. **Prompt.** One self-contained packet, assembled deterministically. No model
   call, no cost, no research started.
4. **Research.** Either run it here — Claude searches the web, reads pages and
   answers in the day's own schema, enforced by the CLI — or copy the prompt and
   run it yourself. Either way the answer arrives at the same place.
5. **Check.** The returned JSON is checked server-side in seven layers and
   previewed before anything is saved.
6. **Saved day.** Rendered as a day, with evidence behind disclosures and marked
   unchecked until a person says otherwise.

## Why the copy/paste step grew an in-app twin

Copy-and-paste was the plan's deliberate boundary and it is still there. It was
also the part that failed in practice: every attempt came back missing
something, because the packet is twelve kilobytes of nested JSON and a chat
window has nothing enforcing its shape.

The Claude CLI does. `--json-schema` is not a request — the CLI validates the
reply against the schema and returns a parsed object — and it does that with
`WebSearch` and `WebFetch` available. That combination had never been used in
this repo (the research writer returns free text; the structured writer has no
tools), so it was measured before anything was built on it: five turns, real
posted hours, a real URL, a `structured_output` object.

Three things deliberately did not change. The operator still reviews — a
researched answer lands in the import panel as a preview, not as a saved day.
The same validator judges it, so an answer arriving by API gets no easier ride
than one arriving by clipboard. And the boundary is intact: research is still a
separate step from the interview, and the interview still cannot search.

**What is asked for and what is accepted are now deliberately different,** and
that asymmetry is what actually fixed the failures.

The *request* — the generated schema — is demanding. It names every key,
because the CLI enforces exactly what the schema names and a merely-optional key
is a key a model skips. That is measured, not assumed: the first live run came
back after sixty turns with every address, every source, and no reader prose at
all, because `readerCopy` had been made optional. Values stay permissive (null,
empty string, empty array), so an unresolved stop still answers every field.

*Acceptance* is forgiving. Almost nothing is required by the contract the app
validates against, because a person pasting by hand is not a transport with a
validator attached, and refusing their day over a key the app does not need is
strictness that protects nothing. What a row must actually carry depends on its
kind and its status, and that is asked afterwards in words — "a selected place
or experience needs an address or a meeting point" — on both paths. Unknown
fields are dropped and named rather than refusing the packet; that strictness
was catching a model adding one helpful key and costing the entire day.

## Decisions taken where the plan offered a choice

Section 15 of the plan listed seven. All seven took the recommended default,
and two needed a judgement the plan did not make:

**Approval is verified with the server's own signature, not the browser's.**
The plan asked for the browser's canonical rules to be reproduced or shared by
fixture. Two hand-written canonical serialisations in two languages eventually
disagree — object key order alone will do it — so the server instead computes
its own signature over the setup it holds, records it at the moment the browser
hands a day over as approved, and measures staleness against that. A row is
rewritten only when the browser's own approval pair changes, which is what lets
an edited-but-not-reapproved layout be detected at all. See `approval.py`.

**The export's hash covers what was asked for, not the prose that asked.** So
improving an instruction or editing the voice files does not invalidate a prompt
somebody is still working from. Verified live: adding the house rules to the
export grew the prompt by 2,240 characters and the already-saved result still
validated.

## What is enforced in code rather than requested in a prompt

- **No research during the interview.** `GrillDependencies` gained
  `seed_research_enabled` and `mid_turn_lookup_enabled`, both defaulting to true
  so every existing interview is unchanged. A model that asks for a lookup
  anyway has the request dropped and its question kept.
- **One model call per intent.** Every spending route takes an idempotency key,
  reserved before dispatch. A duplicate returns 409 rather than buying a second
  turn. A process that dies mid-call leaves a `pending` row, and the screen says
  a request may have been charged rather than offering a fresh Start.
- **A save is pinned to the text that was checked.** Editing the paste after a
  preview invalidates it. A reused import key carrying different content is a
  conflict, not a duplicate.
- **Nothing retargets.** A packet for the wrong day, or answering a request the
  day has outgrown, is refused with the reason. Ids are never edited to fit.

## Model jobs

Two new entries in `packages/model-gateway/src/model_gateway/jobs.json`:

| Job | Default | Why |
|---|---|---|
| `itinerary.grill` | `claude-opus-5-high` | The interview decides what the day is, and everything downstream inherits it. Same tier as `p2b.grill` and `listicle.grill`, for the same reason. |
| `itinerary.day_direction` | `claude-sonnet-5-medium` | Writing down an agreement that was already reached. Judgement, but not a tier of its own. |
| `itinerary.day_research` | `claude-sonnet-5-high` | Searching, reading and writing the day. Sonnet rather than Opus because this is many round trips inside one job and it draws on a Pro subscription's limits; change it in the dashboard if that stops being the right trade. |

Nothing else in this feature reaches a provider. Building and copying the prompt
still cost nothing.

## Proven on a real run

A three-stop Lima day, 2026-09-15, workspace `20c6daba898b`:

- The interview covered three of eight areas straight from the setup without
  asking, and agreed in **five turns** at about 22 seconds each.
- It named no real place anywhere in the transcript, and produced a research
  checklist instead.
- Extraction kept "dietary needs unspecified — assume nothing" rather than
  writing "none", which is the rule it was most likely to get wrong.
- The export took **54 ms** and no model call.
- A returned packet validated, saved as "Needs work" with one unresolved stop,
  and a duplicate save with the same key created no second result.

A second, six-stop run (`f40bda512327`) was driven through the real UI and is
still in the dev database if you want something to open.

## Four things found by running it

None of these were caught by the tests. All four now have one that fails
without the fix.

- **The read that follows linking could land on the started interview.**
  Starting links the workspace, and linking starts a read of the day. The read
  returns in milliseconds and the turn takes twenty seconds, so both are in the
  air at once; if the read landed last it replaced the conversation with a day
  that had none.
- **The "never came back" warning fired during our own call.** The same race
  meant a read saw this screen's own in-flight request still open and reported
  it as lost.
- **Accepting a direction aged the conversation.** The interview's staleness
  was measured with the export's context key, which includes the accepted
  direction — so the ordinary next step immediately told the operator their
  conversation was out of date. The interview now has its own key without it. A
  false alarm is worse than no alarm: it teaches people to ignore the real one.
- **A day could read "Needs work" with nothing saying why.** Three things make
  a day incomplete and only two of them pointed at a stop on screen. The third,
  a question the model itself left unresolved, is now named in
  `outstanding_checks` and shown.

Two smaller ones, both cosmetic and both fixed: the prompt and paste boxes
collapsed to two rows because `.ip-page textarea { min-height: 0 }` outranks a
bare class, and links inside the result rendered in the app's terracotta rather
than this page's blue — two accents on one screen.

## Not built, on purpose

- **No publishing.** The saved day lives in the itinerary workspace. Mapping it
  to Payload needs its own agreed contract.
- **No prose editing.** A result is replaced through the preview, not edited in
  place. Versioned edits can come later without the risk of a reimport silently
  overwriting them.
- **No automatic verification.** Nothing fetches a pasted URL or checks a claim
  against its page. Evidence stays unchecked until an operator ticks the box.
- **No template changes.** "Easy" describes effort, not stop count, and the
  layout the operator approved is preserved exactly. One consequence worth
  knowing: none of the seven built-in templates marks any slot `optional`, so a
  research run can never legitimately drop the evening stop — it comes back
  unresolved instead, and the day reads "Needs work". Deciding which slots are
  genuinely optional is a separate, small change to `templates.ts`.

## Three things the live runs taught, each costing a run

- **`$schema` has to come off before the CLI sees it.** The CLI validates the
  schema itself and cannot resolve the 2020-12 meta-schema by URL; it refuses
  the whole call with "no schema with key or ref". The copy embedded in the
  prompt keeps it, because there it tells a human which dialect this is.
- **A merely-optional key is a key the model skips.** Covered above: sixty turns
  of research, no prose.
- **The model name comes from `cli_writer._canonical_model`.** Reading a key off
  the payload by hand recorded it as blank — and the reason that helper exists
  is that an earlier version of this mistake stamped every Claude call in the
  repo's history as haiku.

## Two things about running research in the app

**It takes minutes.** A three-stop day measured at twelve minutes and sixty
provider round trips. That is why the route answers 202 and the page polls
rather than waiting on the request.

**Editing backend code during a run used to make the dev server look dead.**
`--reload` restarts on the edit, graceful shutdown waits for the background
task, and the task is a twelve-minute subprocess — so every request hung until
the research finished. It happened twice while building this and looked exactly
like a crash both times.

The dev serve command now passes `--timeout-graceful-shutdown 10`, so a reload
takes ten seconds instead of the rest of the run. The trade is that the reload
kills the research, which leaves its row saying "running" with nothing behind
it — and that is precisely the case the day screen reports as *sent and never
heard from again*, rather than as failed. The app knows the call went out; it
does not know whether the provider answered or billed, and it says so.

Still the better habit: do not edit the backend while a day is being
researched.

**A run that is never heard from again is reported as exactly that.** The usual
cause is the server restarting mid-call, which kills the background task and
leaves the row saying "running". After the call's own ceiling plus a little, the
day says the run was sent and never came back, that it may still have used some
usage, and lets you start a fresh one. It deliberately does not say "it failed":
the app knows the call went out and does not know whether the provider answered
or billed, and claiming otherwise would be inventing a fact.

## Running it

Backend: `.venv/bin/python -m pytest apps/backend/tests/test_itinerary_*.py`
Frontend: `pnpm exec vitest run --config apps/frontend/vite.config.ts
apps/frontend/src/features/itineraryPipeline`

The screen is at `/itinerary-pipeline`. Nothing about this feature needs the
Linux box or a live domain.

Two workspaces from the real runs are still in the dev database if you want
something to open rather than start from scratch: `20c6daba898b` (three stops,
driven by API) and `f40bda512327` (six stops, driven through the UI, day 1
saved and day 2 waiting to be interviewed).
