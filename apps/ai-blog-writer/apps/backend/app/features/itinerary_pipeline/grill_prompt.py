"""What the day interview is told before it decides its next move.

The loop is shared; this file is the only thing that makes the interview about
a day. The rules below are each a failure that happened.

**It asks what the travellers want, in ordinary words.** The first version
framed the job as a "travel editor" settling a day's "angle" and asked for a
20 to 60 word suggestion. It got what it asked for: a Lima food day (workspace
22b3740952de, 2026-09-17) opened by contrasting "a ground-level tour of how
Lima eats" with "a climb toward one ambitious dinner", and its suggested answer
added a coffee ritual, a market, a regional dish and a destination dinner. The
operator wanted "an introduction to Peruvian food, a traditional breakfast and
a good lunch". So the suggestion is one short sentence that answers only the
question asked, and the examples below are food and not food on purpose.

**It decides what the day is for, not how research works.** Its summary is
what the day is for, how it differs from the other days, and the operator's
musts -- short enough to scan (ADR 0045). Choosing and checking places belongs
to the selection step, so the operator is never asked to look anything up.

**It cannot look anything up.** So it must never write a venue fact into a
recommendation. "Lunch at a cevicheria near the market" is a preference and is
fine; "Lunch at El Mercado, which opens at noon" is a fact it does not have and
the operator would be agreeing to a claim nobody checked.

**Easy is about effort, not about count.** The layout is approved and its stop
count is settled. An interview that quietly decides a relaxed day means four
stops instead of six has changed the layout without anybody approving it.

**Blank is an answer.** Dietary and access fields left empty mean unknown, not
none, and a recommendation that assumes none puts a safety claim into the day.
Unknown is not "everything" either: the audited Lima day turned two blanks
into "lunch and dinner must survive any dietary or access answer", which the
operator accepted, and the research then spent its searches proving step-free
bathrooms and cooked non-seafood mains for a reader nobody had described.

**A preference is not a rule.** "Prefer walkable" is not "no leg over fifteen
minutes", and "evergreen" is not "every venue open seven days". A hard number
belongs in the direction only when the operator wrote it or accepted it, and
"one transfer" means one ride, not a ban on walking between stops.

Only the current four topics are described. An interview begun on the older
eight is moved onto these four before it takes its next turn
(`grill.on_current_topics`), so no prompt is ever built for the old list.
"""

from __future__ import annotations

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.grill_v4 import _marker_status, _transcript
from .contracts import ITINERARY_MARKERS


def marker_rows(state: GrillState) -> tuple[tuple[str, str, str], ...]:
    described = dict(ITINERARY_MARKERS)
    return tuple(
        (key, key, described.get(key, key.replace("_", " "))) for key in state.marker_keys
    )


def build_itinerary_turn_prompt(state: GrillState, brief: str) -> str:
    asked = len(state.turns)
    return f"""You are helping someone plan ONE day of a trip by asking what the
travellers want from it. Nobody has chosen a place yet: a later step picks the
places and checks them. Talk like a friend helping plan a trip, in plain
everyday words, with no planning or editorial jargon.

THE DAY, AND EVERYTHING AROUND IT:
{brief}

THE CONVERSATION SO FAR:
{_transcript(state)}

TOPICS TO SETTLE:
{_marker_status(state, marker_rows(state))}

Decide the single most useful next move.

Output shape (mechanical): every reply carries `ask`, `recommendation`,
`consensus`, `markers_covered` and `asks_about`. When asking, fill `ask`,
`recommendation` and `asks_about`, and leave `consensus` empty. When done, set
`done` true, fill `consensus`, and leave the others empty. `markers_covered` is
always the full list you can now fill. Never set `lookup`.

THE QUESTION
- Ask about the ONE open thing that most changes which places get picked: what
  the travellers want to do, see, eat, spend or avoid. One question, one
  decision, short enough to read at a glance.
- Ask only what they can answer from their own wishes. Never ask them to find
  out, check or compare anything; what is open, close or good is the later
  step's job.
- DO NOT ASK WHAT IS ALREADY SETTLED. City, day count, times, stops, stays and
  notes are above, and earlier answers count, including answers given under an
  older list of topics. Mark a topic covered when the setup or the conversation
  plainly settles it; covering most of them on the first turn is good.

THE SUGGESTED ANSWER (`recommendation`)
It goes straight into their answer box, so write it as their answer: no "you",
no "I", no question mark. One short plain sentence, usually 10 to 25 words;
longer only when the question really needs it. Answer ONLY the question asked:
do not add other wishes, extra stops or a plan for the rest of the day. A
concrete example is good when it is a wish, like "a classic ceviche lunch".
Anything they accept is a preference the later step may adjust, not a rule.

  Asked: What should eating look like on this day?
  Good: An easy introduction to Peruvian food: a traditional breakfast and a really good lunch.
  Bad: A ground-level eating education that climbs from the coffee ritual to a destination dinner.

  Asked: How much of the day goes to museums?
  Good: One big history museum in the morning, then time outdoors.
  Bad: A layered encounter with the city's past, moving from ancient roots to colonial grandeur.

  Asked: How late should the night go?
  Good: A relaxed evening: dinner and one bar, back by midnight.

YOU CANNOT LOOK ANYTHING UP. Never state a fact about a real place: no venue
names, opening hours, prices, availability or distances.

KEEP WHAT IS ALREADY DECIDED
- THE LAYOUT IS APPROVED. "Easy" means effort, never fewer stops. Propose a
  stop change only as an explicit question.
- BLANK MEANS UNKNOWN. Empty dietary or access needs are neither "none" nor
  "every possible need". Do not ask about them unless they would change who
  the day is for.
- MUSTS COME FROM THEM. Ask which wishes are musts only when it matters; never
  turn a wish into a number or an absolute yourself.
- If an answer contradicts the setup or an earlier answer, set `pushback` and
  make the question resolve it.
- Set `asks_about` to the open topic your question settles. Never ask about the
  same topic twice.

WHEN TO STOP
Set `done` true only when every topic is covered, and as soon as it is: once
every topic reads COVERED, agree now instead of asking a follow-up.
The consensus plays the agreement back in plain words, addressed to them, in
at most six short lines: what the day is for and how it differs from the
other days; the area; any stop whose purpose is not obvious; what is a must
and what is only a preference.
No checklists and no research instructions.

{asked} questions asked so far.
"""
