"""What the day interview is told before it decides its next move.

The loop is shared; this file is the only thing that makes the interview about
a day. The rules below are each a failure that happened.

**It decides what the day is for, not how research works.** Its summary is
the day's angle, how it differs from the other days, and the operator's firm
limits -- short enough to scan (ADR 0045). Checklists and failure conditions
belong to nobody: the selection already checks what affects a choice.

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
"""

from __future__ import annotations

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.grill_v4 import _marker_status, _transcript
from .contracts import ITINERARY_MARKERS

# The topics an interview started before ADR 0045 still has to settle. A
# GrillState keeps its own keys, so its prompt must describe those keys.
_EARLIER_MARKERS = {
    "purpose": "the day's promise and what it contributes to this trip",
    "geography": "the area, the progression and how far a transfer may go",
    "anchors": "which experience drives the day, or that there is no anchor",
    "slot_intent": "what every slot is for, and what it must and must not be",
    "rhythm": "effort, meal balance, rest and what is optional",
    "continuity": "what other days cover, and which overlaps are deliberate",
    "change_policy": "what must stay, and what may be proposed instead",
    "unknowns": "what would make this day wrong",
}


def marker_rows(state: GrillState) -> tuple[tuple[str, str, str], ...]:
    described = {**_EARLIER_MARKERS, **dict(ITINERARY_MARKERS)}
    return tuple(
        (key, key, described.get(key, key.replace("_", " "))) for key in state.marker_keys
    )


def build_itinerary_turn_prompt(state: GrillState, brief: str) -> str:
    asked = len(state.turns)
    return f"""You are helping a travel editor decide what ONE day of a trip is FOR,
before anybody chooses a single place. They are a writer planning a day for
readers. Do not use editorial jargon.

You are not choosing places and not writing anything. You are settling what a
separate selection step will work from: the day's angle, how it differs from
the other days, where it happens, what a stop is for where that is not
obvious, and which of the operator's wishes are firm.

THE DAY, AND EVERYTHING AROUND IT:
{brief}

YOU CANNOT LOOK ANYTHING UP. Never state a fact about a real place: no venue
names, hours, prices or distances. Opinions about SHAPE are what they came for.

THE CONVERSATION SO FAR:
{_transcript(state)}

WHAT IS STILL OPEN:
{_marker_status(state, marker_rows(state))}

Decide the single most useful next move.

Output shape (mechanical): every reply carries `ask`, `recommendation`,
`consensus`, `markers_covered` and `asks_about`. When asking, fill `ask`,
`recommendation` and `asks_about`, and leave `consensus` empty. When done, set
`done` true, fill `consensus`, and leave the others empty. `markers_covered` is
always the full list you can now fill. Never set `lookup`.

- Ask about ONE decision, the one that most changes the day.

- `recommendation` is your best answer to your own question and goes straight
  into their answer box. State the answer; no "you", no "I", no question mark.
  Keep it to what the decision needs, in 20 to 60 words. Anything they accept
  is a preference the selection may adjust, not a rule.

- DO NOT ASK WHAT THE SETUP ALREADY SAYS. City, day count, window, stops,
  stays and notes are above. Cover a topic straight from the setup when it is
  plainly settled; covering most of them on the first turn is good.

- THE LAYOUT IS APPROVED. "Easy" means effort, never fewer stops. Propose a
  stop change only as an explicit question.

- BLANK MEANS UNKNOWN. Empty dietary or access needs are neither "none" nor
  "every possible need". Do not ask about them unless they would change who
  the day is for.

- FIRM LIMITS COME FROM THEM. Ask which wishes are musts only when it matters;
  never harden a preference into a number or an absolute yourself.

- If an answer contradicts the setup or an earlier answer, set `pushback`.

- Set `asks_about` to the open topic your question settles. Never ask about the
  same topic twice.

- Set `done` true only when every topic is covered. The consensus plays the
  agreement back in plain English, addressed to them, in at most six short
  lines: the angle and how it differs from the other days; the area; any stop
  whose role is not obvious; their firm limits, and what is only a preference.
  No checklists and no research instructions.

{asked} questions asked so far.
"""
