# A Prompt2Blog run begins at the seed, and v3 and v2 are deleted

## Context

In v3 a run is created when writing starts. Everything before it — the direction
round trip, the commission approval, the research round trip — happens in the
browser, and both model calls are made by the operator pasting a generated
prompt into their own chatbot and pasting the result back. Nothing about that
work is recorded anywhere the system can see.

That arrangement made three things impossible at once. The cost receipt could
not account for research, because research was not a system event. An
interrupted intake could not be resumed, because there was nothing to resume.
And the object the whole v4 design turns on — the Article Brief — had no home
until the moment it was already finished.

ADR 0029 kept `POST /run` and `POST /pipeline-v2` alive "until the owner's
controlled real run proves v3 end to end". That run never happened. The
condition is circular: v2 cannot retire until a run proves v3, and no run gets
made while two systems need maintaining. v4 replaces v3's intake entirely, so
leaving both in place would mean three ways to start an article.

## Decision

**The run is created when the operator types the seed.** The grill, the Article
Brief, the work order and both research passes are recorded as stages on that
run, in the same store and the same stage vocabulary as the writing stages.

Three things follow for free. The token ledger already follows runs, so moving
research and the grill in-app does not need separate accounting to stay visible
on the receipt. The resume machinery already restores a run from its last
completed stage, so an abandoned grill is resumable by the mechanism that
already exists. And the brief has a durable home from the first keystroke rather
than living in a browser tab.

**A run is what the operator started, not what got written.** Runs that never
reach an article are normal and are kept.

**A hard per-run token ceiling refuses to continue, and shows its number.** The
grill stops at agreement rather than at a question count, and research is now
grounded web search; neither has an upper bound. The ceiling exists so that a
bug which asks forty questions costs a defined amount and then stops, and it is
visible so a ceiling set wrong is obvious rather than mysterious.

**v3 and v2 are deleted, not deprecated.** The routes, the engines, the v3
contracts and the clipboard composer all go. There is no fallback intake path
and no backward compatibility: v4 is the only way to start an article.

**Existing Prompt2Blog rows are backed up once, then cleared.** The whole
pipeline database is copied to a dated file at cutover before any deletion. The
Lima run and the Medellín run are the only evidence of what failure and success
look like and the v4 design is built on both, so they are preserved as
reference material even though nothing will read them programmatically again.

## Consequences

- The receipt covers the whole run for the first time. Research stops being
  free-to-the-system work paid for out of the operator's own chatbot
  subscription, and starts being a cost the run reports.
- Every article started after the cutover is a v4 run. Nothing before it opens.
  This is deliberate and was chosen over preserving history.
- Resume gains a new class of entry point: a run whose furthest completed stage
  is a grill turn. The stage-name-to-node mapping has to cover intake stages,
  not only graph nodes.
- A run row no longer implies an article. Any query that assumed otherwise —
  listings, counts, the drafts view — has to say which kind it wants.
- The per-run ceiling can stop a legitimate long run. That is preferred to an
  unbounded one, and the number is tunable in one place.
- Deleting v2 removes the only path that could still produce an article if v4
  breaks. This is accepted: keeping it is what prevented v3 from ever being
  proven.
