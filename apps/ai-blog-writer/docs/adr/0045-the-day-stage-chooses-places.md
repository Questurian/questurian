# The day stage chooses places; it does not write the day

Plan: `docs/plans/itinerary-selection-simplification-plan.html`. This amends
ADR 0044, whose boundary (the interview reaches no search; the research step
is separate, checked and saved by a person) is unchanged.

## Context

After ADR 0044 the day stage asked one call to research a day, prove every
choice, and write it for readers: a title, an introduction, a paragraph per
stop in the house voice, a claim graph, feasibility judgements, rest windows
and a minute-by-minute schedule. The screen then turned each of those into
something for the editor to clear — red and yellow grades, "needs work",
a source-review checkbox, review notes.

The saved Lima day (2026-09-16) shows what that cost. Its copied prompt was
24,802 characters after one round of compression (49,412 before), with a
4,280-character writing section; the answer came back as seven stops, reader
paragraphs, 16 sources, 17 claims, five proposed changes and four editor
notes, with one closure concern repeated across several of them. And its
accepted agreement had turned two blank setup fields into venue requirements
("lunch and dinner must survive any dietary or access answer"), which the
research then spent its searches proving.

The editor's actual question at this stage is smaller: are these good places,
arranged sensibly, for this trip?

## Decision

**The day stage returns a proposal.** One pick per stop with a one-sentence
reason and at most one practical note; a two-or-three-sentence overview; one
sentence on how the day fits the trip; journey estimates labelled as
estimates; the pages relied on, kept behind "View details"; and a question
only when a firm requirement cannot be met as stated. No article copy, no
voice, no schedule, no evidence graph. The article is a later step, fed by a
read-only handoff of the chosen places.

**The checks shrink to what the app can know.** The answer must belong to
this day's current request and fill every stop once, in order, in an allowed
category, with a reason for anything left open. Repeats are warnings. A
proposal is complete when every required stop has a pick and nothing is
asked. There is no model verdict, no review checkbox, no editorial grade.

**The interview writes a short summary, and "firm" is checked in code.**
The summary keeps the operator's requirements apart from preferences. Each
requirement must name its source — the setup's stated musts, or a question the
operator answered in their own words — and that is checked against the
engine's own transcript. A requirement sourced from an accepted suggestion is
kept as a preference. This was not the first design: prompt wording alone was
tried on the saved Lima conversation (five answers, all accepted suggestions)
and still produced step-free seating and a non-seafood main as musts. With the
source check, the same conversation produced no requirements and five short
preferences.

**Stays are part of the setup.** A Location Manager hotel, or a request for a
recommendation, over a run of nights. Night N is after day N; a day starts
from last night's stay and ends at tonight's; the last day ends in a
departure. A recommended stay is chosen by the first day that needs it and
reused. Stays are in no approval signature — a hotel change reopens no
layout — and they age only the days whose start or end they move.

**The editor acts on the proposal directly.** Swap a place by hand (free,
saved as a new version, neighbouring journey estimates cleared), ask for
another place or a revised day (one call, previewed before it replaces
anything), or answer a question (which becomes a revision request).

**Days depend only on earlier days.** A request's context includes the places
each earlier day uses, not later ones. With both directions counted, saving
day 2 aged day 1 and re-choosing day 1 aged day 2, so every day read as out
of date. Later days' places are still shown, and a repeat is still flagged at
import.

**Old work stays readable and is not built on.** Article-shaped days are shown
as previous versions. An agreement in the long format is shown as history and
the day offers to write the short summary from the same conversation; nothing
is regenerated on its own. Answers in the retired formats are refused by name.
The v1/v2 request builders, the adapter and their schemas are deleted rather
than kept behind a switch: nothing should be generated from them again.

*Amended 2026-09-17: plain questions, and old interviews move on.* The
interview's prompt asked a "travel editor" for a day's "angle" and a 20 to 60
word suggestion, and got a Lima food question contrasting "a ground-level tour
of how Lima eats" with "one ambitious dinner", answered by a paragraph that
added a coffee ritual, a market, a regional dish and a destination dinner. It
now asks what the travellers want to do, see, eat, spend or avoid; the
suggestion is one short sentence (about 10 to 25 words) that answers only the
question asked; and the operator is never asked to look anything up. No stage,
model or schema changed.

An interview begun on the eight older topics is moved onto the four when the
operator answers or reopens it, and saved with that action; viewing it changes
nothing. Every question, suggestion, answer, id and `asks_about` is kept as
said. A current topic counts as settled only when every old topic it needs was
asked and answered (`angle` needs `purpose` and `continuity`; `area`
`geography`; `stops` `slot_intent`; `limits` `change_policy`); `anchors`,
`rhythm` and `unknowns` settle nothing, and what the old interview claimed
without asking is not carried. The next turn reads the whole conversation and
may mark more covered. Renaming the old topics instead would have let
`purpose` alone settle `angle`, and the engine would then refuse to ask it.

## Consequences

- The Lima day's request is 8,223 characters including the hotel (target
  10,000), against 24,802 before. Run live on 2026-09-16 (claude-sonnet-5):
  all seven stops chosen with a reason each, no questions, 4m00s, 24 round
  trips, 16 searches and 5 page reads, about $0.75. The same day under the
  compact article format took 12.6 minutes and $2.15 (the first version: 21.4
  minutes, 71 tool calls, $3.67). The venues themselves were not re-checked
  for this record.
- An existing workspace's stored setup gains an empty `stays` list the first
  time the browser pushes it. That moves its revision once and changes no
  approval, fingerprint or export.
- `itinerary_day_work.review_notes` and `evidence_reviewed` are no longer
  written or shown. The columns stay; nothing was dropped.
- The job id stays `itinerary.day_research`, so the dashboard and the model
  choice for it are unchanged.
