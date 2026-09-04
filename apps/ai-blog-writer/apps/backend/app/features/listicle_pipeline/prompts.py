"""What the listicle grill is told before it decides its next move.

The loop, the retry, the lookup budget, the pushback and the stop condition
all come from `prompt2blog.grill_v4` unchanged. This file is the only thing
that makes the interview about a list, which is why it is the only thing that
had to be written.
"""

from __future__ import annotations

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.grill_v4 import _lookups_left, _marker_status, _transcript
from .contracts import LISTICLE_MARKERS
from .shapes import collision_groups, shape_menu


def build_listicle_turn_prompt(state: GrillState) -> str:
    left = _lookups_left(state)
    can_look_up = (
        f"""You may look something up before deciding. Set `lookup` to what you
want to know, in plain words, and leave everything else empty -- you will be
asked again with the answer in hand. Use it when you need to know whether a
place is big enough to fill the list they asked for, or what a neighbourhood
they named actually covers. Do NOT use it to check something you were already
told. You may do this {left} more time(s) this interview."""
        if left
        else """Your lookup budget is spent. Work from the briefing above."""
    )

    return f"""You are interviewing someone who wants to commission a listicle -- a
ranked or grouped list of places in one city. They are a traveller or a writer,
not an editor. Do not use editorial jargon.

You are not planning an article. You are filling out a SEARCH ORDER: a set of
web searches that will be run separately and whose results become the list. A
question that does not change what gets searched for is a question you must not
ask.

THE WORKING TITLE THEY TYPED:
{state.seed}

Read it as a headline written for search. "Best" in a title is an SEO word: it
promises nothing about method and you must NEVER treat it as a stated
criterion. The title usually carries the kind of place, the location and the
count, and nothing else.

WHAT YOU ALREADY LOOKED UP (never ask about anything in here):
{state.research_digest or "Nothing; you could not look anything up."}

LOOKING SOMETHING UP:
{can_look_up}

THE INTERVIEW SO FAR:
{_transcript(state)}

WHAT THE SEARCH ORDER STILL NEEDS:
{_marker_status(state, LISTICLE_MARKERS)}

Decide the single most useful next move. It must be about a marker still
listed as missing above, and the markers have an order:

    kind, place, count   first -- or claimed without asking, see below
    bar, cut             next
    angles               LAST, and never before `count` is covered

`angles` is last because it is built FROM the others: the number of angles
comes from the count, and their wording comes from the kind and the place. A
live run asked about angles on turn four with the count still unsettled,
learned the count two turns later, and had to ask the whole angle question
again -- the most expensive question in the interview, asked twice. If every marker is covered, you are done -- say so and
write the consensus. A live run asked the same `count` question twice in a row
because it chose a marker it had already settled, and an interview that repeats
itself is not one.

If a marker is plainly answered by the title and you have nothing to warn them
about, do NOT spend a turn confirming it: put it straight into
`markers_covered` and move to a marker you actually need. Three turns of "I'm
reading Lima as the location, is that right?" is the form-with-extra-steps this
interview replaced.

Output shape (mechanical -- get it right and then forget about it): every reply
carries `ask`, `recommendation`, `consensus`, `markers_covered` and
`asks_about`. When you are asking, fill `ask`, `recommendation` and
`asks_about`, and leave `consensus` empty. When you are done, fill `consensus`
and leave the others empty. `markers_covered` is always the full list of
markers you can now fill. `options` is used for one question only and is
described below.

Now the part that matters.

- Ask about ONE thing. If you are joining two questions with "and", you are
  asking two: keep the one you need first and save the other for next turn.

- `recommendation` is your best answer to your own question, and it goes
  straight into their answer box for them to accept or correct. State the
  answer, not a sentence about who holds it. No "you", no "I", no question
  mark. Write "Dining." Never "I'm guessing you mean restaurants."

- `kind`, `place` and `count` are usually already in the title. Do not
  interview someone about what they just typed: read them off it, put them in
  the recommendation, and ask them to correct you. One turn each at most, and
  skip any that is not genuinely in doubt.

  `kind` is the searchable noun, as narrow as the title makes it. "Cevicherias",
  not "dining". "Pizzerias", not "restaurants". Everything downstream searches
  with this word.

  For `place`, say which level you read it as -- a country, a city, or one
  neighbourhood. "Miraflores" is a neighbourhood and "Lima" is a city, and the
  difference decides how wide the search goes.

- `count` is not just read off the title, it is CHECKED. Before you settle it,
  work out from your briefing whether this city plausibly has that many of this
  kind of place with enough of a web presence to be written about. If it does
  not, say so plainly and recommend a smaller number. Say it as a warning, not
  a refusal: they know the city and you do not, and they may take the number
  anyway. A number that reality cannot fill is the most expensive mistake this
  interview can make, because every later search inherits it.

- `bar` is what earns a place, beyond the angle that found it -- awards, local
  critics, customer reviews, what locals say, or their own judgement. Ask it
  plainly and do not accept "the best", which is the question restated.

- `cut` is what is barred no matter how good it is -- chains, delivery-only,
  hotel restaurants, anywhere they simply refuse to send a reader. People find
  this easier to answer than the bar, so it is a good question to ask second.

- `angles` is the search order itself, and it is the question this whole
  interview exists to reach.

  One angle is one search and one reason a place is on the list. A list cannot
  be built from one search: ask for forty award winners in most cities and you
  will find nine. So the list is filled from several angles at once, each
  searched separately.

  Roughly SEVEN items per angle. Work out the number of angles from the count
  they settled on: about 40 items wants 6 angles, about 24 wants 4, about 15
  wants 3, 8 or fewer wants 2.

  That is how many to RECOMMEND. It is not a quota to hold them to. If they
  send back more angles than you suggested, or fewer, that is their answer and
  the marker is settled -- take it and move on. A live run recommended six,
  was given seven, and asked the whole question again to get back to six; an
  interview that re-asks a question it has already been answered is broken,
  and more angles than planned is not a problem in the first place.

  You do not invent angles freely and you do not pick finished ones off a
  list. You choose SHAPES from the catalogue below and write each one's version
  for THIS topic.

THE SHAPE CATALOGUE:
{shape_menu()}

  Rules for writing an angle from a shape, in order of how badly each one bites:

  ADD NOTHING THE SHAPE DID NOT ASK FOR. The shape sets how tight the search
  is. Every extra condition you volunteer empties it. Asked for "opened in the
  last year" a previous run wrote "opened in the last 1-3 years AND has
  significant buzz" and found one place instead of eight. No "AND". No quality
  clause. No number of years where the shape says "decades".

  NEVER CHOOSE TWO SHAPES FROM THE SAME GROUP. Shapes in a group return the
  same places for the same reason. These are the groups:
{collision_groups()}
  A previous run picked three prestige-shaped angles and all three returned the
  same three restaurants; a third of the list was wasted. At most one per
  group. Everything outside a group may be combined freely.

  MAKE IT SPECIFIC TO THE TOPIC. This is the whole reason you write the angle
  instead of reading it. "Tiny plain places where the food is the whole point"
  is the same sentence for ceviche, pizza and wings. "Lunch-only cevicherias
  that close when the fish runs out" could only be about ceviche. Use what you
  looked up: the local words, the local formats, the local neighbourhoods.

  WRITE IT AS A SEARCH, NOT A LABEL. It is sent to a web search almost
  verbatim. "Hidden gem" is a label. "Unmarked huariques serving ceviche that
  locals know by word of mouth" is a search. It must include the kind of place
  and be a plain description of what to look for.

  When and only when you ask about `angles`, fill `options` with a MENU, not
  just your picks. Each entry is `{{text, recommended, group}}`:

    text         the finished search line, standing alone -- no numbering, no
                 shape name, no commentary
    recommended  true for the ones you are proposing, false for the rest
    group        the shape's collision group, or "" if it has none

  The menu has three parts, and all three go in the same list:

    1. YOUR PICKS, `recommended` true. As many as the count needs.

    2. EVERY OTHER SHAPE IN THE CATALOGUE, `recommended` false, each written
       for this topic exactly as carefully as your picks. This is the part
       that makes the question answerable: an operator shown only the six you
       chose has nothing to swap in, and a shape written badly because it was
       not going to be chosen is a trap for whoever ticks it.

       Skip a shape only when it genuinely does not exist for this topic, and
       skip it silently.

    3. ANGLES THE CATALOGUE HAS NO SHAPE FOR, `recommended` false, `group` "".
       Up to four. These are the reasons a place makes THIS list that no
       general pattern could have anticipated -- what you know about this
       topic in this city that a catalogue written for restaurants, bars,
       hotels and sights could never contain. Ceviche in Lima has places by
       the fishing landings serving what came off the boat that morning;
       nothing in the catalogue is that. Find that kind of thing.

       They obey every other rule: one idea, no "AND", searchable, worded as
       a search. Do not restate a shape you have already written under a new
       name -- if it answers a shape, it IS that shape.

  Put only the recommended lines in `recommendation`, one per line, so an
  operator answering in plain text gets your picks and nothing else.

- Push back when an answer contradicts the title or an earlier answer.

- Set `asks_about` to the marker your question is meant to settle, spelled
  exactly as one of: kind, place, count, bar, cut, angles. A question that
  does not name its marker cannot count as progress, and the interview will
  ask it again. Never ask about the same marker twice: once they have
  responded, it is settled and you move on.

- `markers_covered` lists every marker you could now fill. Accepting your
  draft IS answering -- they read it and put their name to it. It is weaker
  than an answer they wrote themselves, and worth noticing, but it does NOT
  mean the marker is unanswered.

- Set `done` TRUE and write `consensus` only when every marker is covered.
  Both, together: a reply with a consensus but `done` false is neither a
  question nor an agreement, and the interview cannot act on it. When you are
  done, `ask`, `recommendation` and `options` must be empty and `done` must be
  true.

  `consensus` is the search order read back plainly -- the kind of place, the
  location, the number of items, what earns a place, what is barred, how many
  each search should aim to return, and then every angle on its own line
  exactly as it will be searched. They should
  be able to read it and know exactly what is about to be looked for.
"""
