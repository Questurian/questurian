# Prompt2Blog v4: the eleven open issues, in phases

Written 2026-09-01, the morning after the handoff. This plan orders issues
**#440 to #450** into phases and says why each phase sits where it does.

## How this relates to the polish plan

`p2b-v4-polish-plan.md` was written 2026-08-31 and is **mostly delivered**.
Its phase 1 (sentence rhythm, and `measure_sentence_spread` reporting the
spread), its phase 2 (the write button disabling, the page following the run,
per question research progress, a finished article screen) and its phase 5
(country pinning, omit as a third move at the gate) are all in `main`.

Three of its items survived as issues, and they are carried here rather than
there:

| Polish plan | Now |
|---|---|
| Phase 2e, spend display | #440 — blocked on the accounting being true |
| Phase 3, delete the title stage | #444 — blocked on the resume suite |
| Phase 4, the copy out polish prompt | Built as `polish_v4.py`; #443 is about what it says |

Read the polish plan for the reasoning behind the parts already shipped. Read
this one for what is left.

## The two clusters, and the seven singletons

Eleven issues, and they are **not** eleven separate projects.

- **#441 and #442 are one flaw seen twice.** The app tracks exactly one run,
  in the browser, and discards the pointer on any failure. One phase.
- **#440 and #448 are the same business blocker.** You cannot hand this to a
  stranger without knowing what an article costs. #448 is not a bug at all; it
  is a written statement of what nobody knows, and it closes by other people
  using the thing, not by a commit.
- Everything else is genuinely independent.

## The phases

### Phase 1 — Run the searches at the same time (#450, part one)

Research is 20½ minutes of a ~40 minute run. The whole writing graph is 7.
`gather_research` loops the work order's requirements one at a time, and
nothing in question four depends on question three. Concurrency turns roughly
six minutes into roughly one.

**Same searches, same prompts, same results. No quality change of any kind.**
This is the only item on the whole list with no downside to weigh, which is
why it goes first and alone.

Two things the issue flags and this phase must handle:

- The progress callback reports `done: index - 1`, which assumes searches
  finish in the order they started. It has to **count completions** instead.
- Grounded search rate limits are unknown. Fan out **bounded**, not all seven
  at once, and make the bound a named constant so it can be lowered without a
  code hunt.

Not in this phase: the 14½ minute structuring call, also described in #450.
That one has a real quality risk (cross question deduplication and conflict
detection get harder when each call sees only its own slice) and one run is
not a pattern. **Measure it across several runs before touching it.**

### Phase 2 — Make the receipt true (#440)

Two gaps put a run's receipt wrong by most of its actual cost. Grounded
search — the grill's seed lookup and every research search — goes out through
`invoke_google_grounded_text` directly rather than the tracked client, so ten
searches appear as nothing. And `begin_intake` calls the model before `_record`
opens the stage, so the grill's own call is filed as `unattributed`.

This is second because three other things sit on it:

- `enforce_run_budget` reads the ledger to decide whether a run may continue.
  The ceiling is currently guarding a number that omits the most expensive step.
- The spend display is deliberately unbuilt because it would lie.
- **Phase 7 must not happen before this.** Adding unbounded searches to the
  grill while the ceiling ignores searches is the wrong order.

It is also the only phase that speaks to the stated goal. Ghost-writing for
travelling creators needs a price, and per article cost has never been measured.

### Phase 3 — Stop losing runs (#441 and #442, together)

`useIntake` wipes the remembered run on **any** failure — a timeout, a
restarting dev server, a momentary fault — and treats that as proof the run is
gone. On 2026-08-31 the operator left the page exactly as the screen invites
("You can leave this page. The work carries on."), came back to nothing, and
the run had completed normally.

Forget a run only on a definitive 404.

Then give the page a way to find a run at all, because today there is none: a
short list of what is running now and what ran recently, from the `runs` table,
which already carries `status` and `stage`. A run is now something the operator
started rather than something that got written (ADR 0031), so runs that never
reached an article are normal and have to be listed too.

The list is what makes the pointer stop being load bearing, which is why these
two are one phase and not two.

### Phase 4 — Stop the polish prompt undoing the rhythm fix (#443)

`polish_v4.py` tells a flagship model to vary sentence length and, in the same
breath, bans em dashes and hyphenated compounds. A model given both has one
tool left for restructuring: the full stop. Which is the flatness the rhythm
change just fixed.

The evidence is suggestive rather than proven — a version of the Medellín
article came back with sentences over 25 words falling from 6 to zero, every
cut landing on a subordinate clause — and the operator had also been editing by
hand. But it is the same trap the article rule itself had before `2bd89fb1`.

Prompt only. Say what the anti-AI rules now say: length comes from
subordination, splitting is the last resort, and a banned dash is not a reason
to reach for a full stop.

**Judge it with `measure_sentence_spread`, before and after, not by eye.**

### Phase 5 — Let the operator re-ask one question (#446)

At the research gate a question can be answered, marked unpublished, or
dropped. It cannot be **rewritten**. Run `76b36468` needed exactly that: a
question about a project in Medellín's Buenos Aires neighbourhood was answered
about Argentina, and came back marked `supported`, so nothing downstream would
have caught it.

Dropping it throws away a good question. Answering it by hand means doing the
research yourself.

This sits after phase 1 on purpose: phase 1 turns the gather loop into
something that runs a question, which is most of what re-running exactly one
question needs.

The work order's fingerprint has to be handled — changing a question changes
the plan the evidence answers.

### Phase 6 — The title stage, and the safety net under it (#444)

The decision is recorded and unchanged: the seed becomes the title, the
operator edits it, and the AI title stage is **deleted rather than repaired**.
Partly mitigated already in `7638bcb7`.

It was attempted twice on 2026-08-31 and backed out both times, and the
blocker is not the graph. `TitleFailsLLM` raises on `invoke_text`, and the
title stage is the only stage in the graph that calls `invoke_text` at all — so
it is the only way eight resume tests can simulate a run dying near the end.

Those tests protect money. Resume exists so a run that dies late is not paid
for twice.

**The work is choosing a new last fallible stage** — the audit is the obvious
candidate — **and re-deriving what a second leg should re-buy from it.** That
is a deliberate change to the safety net, not a mechanical rename. It goes late
because it wants attention, not because it is unimportant.

### Phase 7 — Let the grill look things up again (#447)

The grill researches the seed before its first question and never again. By
turn four the conversation may have narrowed to one neighbourhood while the
grill still works from the general city briefing.

That matters because looking things up is what keeps the interview short
(ADR 0030, rule G2): anything it can find out, it never asks. A grill that
cannot look up where the conversation went is pushed back into asking, which is
the form-with-extra-steps failure the interview replaced.

The plumbing exists — the grill already has a `research` dependency separate
from its `llm`. What is missing is a way to decide mid interview that a lookup
is needed, and a **budget rule** for doing it.

**Blocked on phase 2**, explicitly.

## Not phases

**#445, the vanishing Keychain token.** Already mitigated: a copy outside the
repo repairs it on the next run, and it costs nothing today. The cause is
unknown and the one observation that would separate time based expiry from
event triggered removal is **when** it goes — relative to a sleep, a restart,
or the last use. That is a note to make when it next happens, not a task to
schedule.

**#448, the sample of two.** Not a bug. It closes when somebody who is not the
owner uses the intake, and when phase 2 produces a cost figure. Keep it open as
the honest scoreboard.

**#449, one grill three modes.** Design only, nothing built, and the honest
prerequisite is reading `itineraries_pipeline/` properly — `retrieval.py`,
`candidate_scoring.py`, `lodging_selection.py`, `day_shells.py`, `ordering.py`,
behind ADRs 0013 to 0021. Nobody has. That reading is the first real task in
this thread and it is not a phase in this plan.

## The order, and why

1. **Phase 1** — free, felt on the next run, no risk. Also the groundwork for phase 5.
2. **Phase 2** — the goal depends on it, the spending ceiling is currently wrong, and it gates phase 7.
3. **Phase 3** — stops the loss that actually happened to the operator.
4. **Phase 4** — cheap, but wants a real article to judge it, so it wants phase 1's faster run.
5. **Phase 5** — builds on phase 1.
6. **Phase 6** — careful work on the safety net; do it awake.
7. **Phase 7** — must not precede phase 2.

**One real article between phase 4 and phase 6**, so the polish prompt change is
judged on its own rather than tangled with a title change.

## The standing rule this plan inherits

From the handoff, and it held again on 2026-09-01 when two more instances were
found and fixed: **a schema exists so the model knows what to send, not so the
parser can reject what arrived.** When a stage fails, read the recorded payload
before theorising. `apps/backend/scripts/replay_dossier.py` replays a recorded
failure offline in a second, for nothing.
