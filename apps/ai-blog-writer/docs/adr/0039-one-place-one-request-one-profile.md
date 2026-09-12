# One place, one request, one profile

## Context

The board tells you a place exists and that several searches found it. It does
not tell you anything you could write a sentence from. The step that does that
was specified twice: first as seven grounded calls per place, then — after the
first version was costed against a real run of thirty-five retained candidates —
as one call per place, pressed by a person, on a card they had prepared.

What existed before this decision:

| what was there | what it did |
|---|---|
| a checklist in component state | two boxes, neither saved, both lost on reload |
| a progress bar counting an optional link | a place with no TripAdvisor page read as half-finished |
| `profile_research.research_place` | the same prompt up to three times until six claims came back |
| the same function's fallback attribution | an unsourced sentence was handed the first grounding URL |
| `Claim` | a sentence, a kind, one date, and no topic |
| `gate.assess` | counts material; cannot say whether any of it is about this list |

The three-attempt loop is the expensive one. It exists because a thin answer
was read as a failure — but "little is published about this place" is a real
answer, and the person looking at the card is the one who should see it and
decide. The fallback URL is the dangerous one: it makes an unattributed claim
look cited, which is exactly the thing a reader cannot check.

## Decision

**A research request is an action a person takes on one prepared card.** Not a
batch, not a consequence of finishing a checklist, and not something a screen
does when it loads. The button is the authorisation; there is no second
confirmation dialog, because the press is already one.

**One server function computes readiness, and both the card and the request
read it.** It returns a list of blockers with the screen that fixes each, never
a silently disabled button. The request recomputes it before spending anything,
so a screen that has drifted cannot talk the server into a call.

**A confirmation is bound to what it was made about.** Ticking "still open"
against a Google record is a statement about that record; if the identity or
the status underneath moves, the tick is stale and says so. Editing an optional
link does not touch it. Optional is optional: an empty TripAdvisor box is a
valid answer and contributes nothing to required progress.

**The attempt is written down before the call goes out.** One short transaction
reserves the single active-research slot, stores the input snapshot and marks
the attempt running, and commits — then the network is touched, outside any
transaction. A process that dies leaves an attempt somebody can find and a
lease that expires; its late answer is refused by an ownership check rather
than written over whatever happened since.

**Five terminal states, not a boolean.** `completed`, `completed_empty`,
`failed`, `response_invalid`, `interrupted`. A call that never ran and a place
nothing is published about are different facts, and the pipeline has already
paid once for conflating them — Antigua Taberna Queirolo, founded 1880, was
recorded as having nothing written about it because the call had failed.

**Nothing retries by itself.** Not on failure, not on reload, not on mount. A
repeated idempotency key returns the existing attempt. An unchanged question
already answered returns the stored answer. "Try again" is a new key and a
separate press.

**A finding carries its own attribution and three separate dates** — when the
source was published, when we read it, and when the thing happened — plus an
explicit end date for a promotion. Unknown stays null. A finding with no source
is marked as unattributed and is never given somebody else's link.

**A profile outlives the list.** Findings are filed under a topic derived from
what the interview agreed the list is about. Researching the same restaurant
for a cocktail list appends to the same profile; it does not replace the wings
evidence. Opening any saved profile, from any list, costs nothing.

**Curation is not deletion.** Keep, discard and restore change what the writing
sees. The research still happened, it was still paid for, and a later list may
want it. Every edit writes a revision, and a later research pass cannot
overwrite a finding a person has corrected.

## Consequences

Preparation is now a round trip. Ticking a box is a save, and the card says
Saving / Saved / Could not save. That is the price of a checklist that survives
a reload, and the old one did not.

One research request runs at a time across the whole feature. Two would not
break anything technically; the limit exists because a second concurrent call
is money spent by a mis-click rather than by a decision. Reading and
hand-editing every other profile stays available while one runs.

The POST is synchronous and can take minutes. A queue would be a service to run
and a state machine to debug before anybody has read a single finding. The
durable record is SQLite, the client polls the board while a call is in flight,
and a reload reads the attempt back rather than buying it again.

`gate.py` is not wired in. It weighs whether enough is published about a place;
it cannot say whether any of that is about this list's topic, and this step does
not block, remove or score anything.

The old whole-run path (`build_profile`, `research_place`, `Claim`) is left
where it is and still works. The new path does not call it. Its three attempts
and its fallback attribution are the behaviours this decision replaces, and
they are replaced on the new path rather than edited underneath the existing
caller and its tests.

What this does not decide: blurbs, intros, AI angle selection, automatic
fact-checking, research-all, and anything Location Manager holds. A finding is
evidence in a store. Turning evidence into a paragraph is a separate step with
its own decision to make.
