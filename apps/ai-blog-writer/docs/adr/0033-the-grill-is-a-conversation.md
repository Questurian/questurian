# The grill is a conversation, and it stops when the brief can be filled

## Context

ADR 0030 replaced the commission form with an interview and wrote down five
rules for it: every question carries a recommended answer, it researches before
it asks, one question at a time, it pushes back on contradictions, and it stops
at agreement rather than at a count. The rules are right. The implementation
does not deliver three of them, and the first live runs showed why.

**The grill cannot see its own half of the conversation.** Each turn is a fresh
call built from the run's stored state, and the transcript it is handed carries
only the question asked and the answer received. The recommendation it wrote is
stripped out. So when the operator accepts a recommendation unchanged — which
is the single click the design is built around — the grill reads its own
sentence coming back as a confident, detailed answer from a writer.

Run `1b441532` (2026-08-30 15:40Z) is the whole problem in one record. Two
questions asked, both recommendations accepted verbatim, agreement declared.
From the grill's side that was a productive interview. In fact nothing was
learned: the brief would have been assembled almost entirely from a model's
guesses about an article, which is the failure ADR 0030 exists to prevent.
The grill was talking to itself and had no way to know.

**Stopping at agreement is unsafe while that blindness exists.** G5 stops at
agreement rather than at a question count, and that is still right — but
agreement is currently judged by a model that cannot tell the operator's words
from its own. A stop condition that reads its own echo as consent is not a stop
condition.

**The recommendation is described as the wrong thing, and models write what
they are asked for.** The field is named `recommendation` and the prompt asks
for "the answer you actually expect", so the model supplies its expectation:
run `cac73671` (2026-08-30 16:42Z) returned *"I'm guessing you recently spent
some time there and want to build the piece around your own firsthand
experiences."* The screen loads that into the answer box and one click sends
it, so accepting records the operator saying "I'm guessing you" about their own
trip. The brief builder then takes first-hand material by copying an answer
verbatim, and first-hand material is excused from fact-checking by design.
Model speculation can therefore enter the brief wearing the operator's voice,
where nothing downstream is permitted to question it. The same prompt produced
a correct recommendation at 16:04Z and a wrong one at 16:42Z; it is a coin
flip, because nothing carries the good form forward.

**One question at a time is read as one sentence.** Every live grill so far has
joined two questions with "and" — "what angle do you want, and what material do
you have" — so four things were asked across two turns and two were answered.

Underneath all of this: the model client is already a chat model that accepts a
list of messages, and it is handed one flat string per turn. The conversation is
rebuilt lossily each time from a record that keeps half of it. What exists is
not a form and not a chat; it is a chat with amnesia about its own contribution.

## Decision

**The grill keeps the real conversation, both halves, and replays it.** The run
stores what the grill said and what the operator said, in order, and every turn
receives all of it. This is what a chat is — a stored message list replayed on
each call — so nothing is being simulated. It is stored as a stage row on the
run exactly as now, so resumability, the receipt and the stage vocabulary of
ADR 0031 are unchanged.

The lossy transcript is the reason for most of what follows, and restoring it is
the prerequisite for the rest: the grill cannot tell "they said it" from "I said
it" until it can see both.

**The recommendation is the grill's own best answer, stated as an answer.** Not
advice about their answer, and not a sentence about who holds it: no "you", no
"I", no hedge, no question mark. It is the strongest proposal the grill can
defend from the seed and what it looked up, specific enough to argue with,
because this is the one place its expertise is any use to them.

Writing it in the operator's first person was tried and is wrong. For a
question only the operator can answer, "write it as them" means inventing a
trip they may never have taken — and an invented experience they accept becomes
first-hand material, which is exempt from fact-checking by design and therefore
uncatchable downstream. **The grill may judge what the article should be; it
may not invent a fact about their life.** For anything only they can answer the
recommendation is the research-led case, which is both the common one and the
safe one, and they correct it upward.

The pre-filled answer itself is not up for negotiation: the people using this
write about places they may never have been, and composing into an empty box is
the failure the form already had.

**The grill stops when the brief can be filled from what the operator actually
said, not when it feels agreement.** The brief cannot be assembled without six
things — the form, the reader, the question it answers, the outcome, the spine,
and the fails-if line — and those become the stop condition. A marker counts
only when it is covered by something the operator contributed; a recommendation
they accepted unchanged is weaker evidence than an answer they wrote or
corrected, and the grill can now tell the difference. Agreement is still played
back and still has to be accepted; it is no longer the whole test.

**One question asks about one thing.** Two questions joined by "and" are two
questions: the grill keeps the one it needs first and saves the other.

**The interviewing instructions move into their own file, in English.** How to
run this interview is editable by a person without touching code, the same move
ADR 0032 made for the voice and for the same reason: this text will be revised
by feel, repeatedly, and it should not require a deploy to try a wording.

**The screen is a chat.** The conversation is visible and scrolls, the operator
may type anything, and the input arrives pre-filled with the grill's draft of
their answer. Looking like a chat and being one are the same thing here.

**What does not change.** The stage graph, the storage, the run-starts-at-the-
seed decision, the brief's schema-forced extraction at the end, and the rule
that the brief is not hand-editable. The extraction step already reads a whole
conversation and returns a structured object; that pattern is kept and the
per-turn form-filling is what goes.

## Consequences

- The grill gets longer. Five or six turns is a plausible interview where two
  was not, and each turn is a call on the most expensive model in the pipeline.
  This is the cost of the thing working, and it was chosen deliberately over a
  cheap interview that learns nothing.
- Replaying the whole conversation grows the prompt every turn. That is the
  normal cost of a chat and is bounded by the interview being short.
- The per-run token ceiling matters more than it did, and it is currently
  watching a number that is too small: the grill's own call is recorded as
  `unattributed` because the model is called before the stage is opened, and the
  grounded lookup is not counted at all. Fixing the accounting is a prerequisite
  for trusting the ceiling over a chattier grill, and is tracked separately
  because it is not a design question.
- A marker-based stop can be satisfied by six shallow answers. The markers are a
  floor, not a definition of a good interview, and this ADR does not claim
  otherwise.
- `P2B_V4_GRILL_TEMPERATURE` is inert: the Gemini 3.x wrapper accepts a
  temperature and does not forward it, on Google's own recommendation. The dial
  is left in place and documented as inert rather than removed, because the
  model behind this role is expected to change.
- Mid-interview lookups are deliberately not part of this. The grill researches
  the seed once and cannot check anything it learns later, so by the fourth turn
  it may be working from a briefing the conversation has moved past. That is a
  real limitation, it is accepted for now, and it is the next thing to build
  once the conversation itself is right.

  **Built on 2026-09-01 (#447).** The grill can now set `lookup` on any turn to
  ask the web something before it decides, bounded by
  `P2B_V4_GRILL_MAX_LOOKUPS` and recorded on the state as the queries it made.
  It waited on the token accounting (#440): adding unbounded searches to a
  stage while the run's ceiling could not see grounded search at all would have
  been spending against a number that did not exist.
- Nothing here is evidence that articles improve. This makes the interview an
  interview; whether the brief it produces is any good is read by a person.
