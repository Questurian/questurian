"""What the listicle grill is told before it decides its next move.

The loop, the retry, the lookup budget, the pushback and the stop condition
all come from `prompt2blog.grill_v4` unchanged. This file is the only thing
that makes the interview about a list, which is why it is the only thing that
had to be written.

Three changes from the improvement plan of 2026-09-08:

**The requirements come before the menu.** A requirement applies to every place
on the list; an angle is one route into the places that already satisfy it.
"Rooftop bars in Lima" already requires a rooftop, and a second rooftop angle
adds no route -- while a family-friendly commission whose family requirement is
demoted to one optional angle has quietly stopped being the list that was
commissioned.

**The catalogue belongs to the subject, and only arrives when it is needed.**
A hotel commission was being shown market stalls and cuisine fusions because
the catalogue was written for restaurants and shown to everything. It is now
filtered, and it is only spelled out in full on the turn that can use it --
which is the turn after `count` is settled, since the prompt already refuses to
ask about angles before then.

**Overlap is explained, not forbidden.** Four shapes shared a `prestige` group
and at most one could be chosen. Award-listed and expensive are not the same
places in most cities, and family-run and longstanding often are while sharing
no group at all. The catalogue now says which pairs tend to collide and the
operator decides.
"""

from __future__ import annotations

from ..prompt2blog.contracts_v4 import GrillState
from ..prompt2blog.grill_v4 import _lookups_left, _marker_status, _transcript
from .contracts import LISTICLE_MARKERS
from .shapes import (
    angle_count_guidance,
    overlap_notes,
    roles_note,
    shape_menu,
    shape_outline,
    subject_of,
)
from .spec import count_from, kind_from


# What has to be settled before the catalogue can be used at all.
#
# `angles` is built FROM these: how many comes from the count, the wording from
# the kind and the place, and what every place must satisfy from the bar and
# the cut. The prompt already refuses to ask about angles until they are
# settled, so a full catalogue before then is three hundred lines the model is
# forbidden to act on.
_ANGLE_PREREQUISITES: tuple[str, ...] = ("kind", "place", "count", "bar", "cut")


def _catalogue_block(state: GrillState) -> str:
    """The catalogue, in as much detail as this turn can use.

    Three phases, and the middle one is the only turn that can act on it.

    **Before the prerequisites are settled** the model needs to know what
    exists -- so that it does not settle a count the catalogue cannot serve --
    and needs nothing else. It gets the names.

    **On the turn that asks about angles** it gets the whole thing: every
    shape, every pair that tends to collide, what the roles mean, and how many
    angles a list this long wants.

    **Once the angles are agreed** it gets neither. The full menu was still
    being sent on the turn that writes the consensus, where there is nothing
    left to choose -- 1,173 words of wording rules attached to a reply that
    says "done". What it gets instead is the lines that were approved, because
    the consensus has to read them back.

    Every option stays on the menu at the menu turn. Nothing is trimmed for
    size: an operator shown only the six the model picked has nothing to swap
    in, which is the whole reason the menu exists.
    """
    subject = subject_of(kind_from(state))
    named = subject or "no specialised subject; the shared catalogue only"
    covered = set(state.markers_covered)

    if not set(_ANGLE_PREREQUISITES) <= covered:
        return f"""THE SHAPE CATALOGUE ({named}), in outline. You will be shown it in full
on the turn you ask about angles, which is after the kind, the place, the
count, the bar and the cut are settled:
{shape_outline(subject)}"""

    if "angles" in covered:
        approved = _approved_angles(state)
        return f"""THE ANGLES ALREADY AGREED. The catalogue is not repeated here; there is
nothing left to choose from it. Read these back in the consensus exactly as
they are written:
{approved}

If the menu genuinely has to be reopened -- they asked to change which searches
run -- leave `angles` OUT of `markers_covered` and you will be shown the whole
catalogue again on the next turn."""

    return f"""THE SHAPE CATALOGUE ({named}). These are the only shapes this commission
gets. A shape not listed here does not apply to this subject -- do not reach
for one, and do not invent a category so that the catalogue has something to
offer:
{shape_menu(subject)}

PAIRS THAT TEND TO RETURN THE SAME PLACES (a warning, not a rule -- you may
choose both if you can say why this city is different):
{overlap_notes(subject) or "- none in this catalogue"}

WHAT AN ANGLE IS FOR (`role`, one per angle):
{roles_note()}

{angle_count_guidance(count_from(state))}"""


def _approved_angles(state: GrillState) -> str:
    """The lines the operator agreed to, read off the interview."""
    from .spec import angle_lines

    lines = angle_lines(state)
    return "\n".join(f"  - {line}" for line in lines) or "  (none recorded)"


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

Everything ELSE the title says is a REQUIREMENT, and requirements are not
angles. "Rooftop bars in Lima" requires a rooftop of every place on the list.
"Independent hotels" bars the chains. "Family-friendly hotels" requires
somewhere a family can actually stay. Carry those into `bar` and `cut` where
they belong, and never demote one into an optional angle -- a list that only
checks its own title in one of six searches is not the list that was
commissioned.

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
comes from the count, their wording comes from the kind and the place, and what
every place must satisfy comes from `bar` and `cut`. A live run asked about
angles on turn four with the count still unsettled, learned the count two turns
later, and had to ask the whole angle question again -- the most expensive
question in the interview, asked twice. If every marker is covered, you are
done -- say so and write the consensus. A live run asked the same `count`
question twice in a row because it chose a marker it had already settled, and
an interview that repeats itself is not one.

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

  Put the number you are recommending in `recommendation` as a plain number, on
  its own or at the start. "Yes" is a normal answer to this question and the
  number it agrees to has to be readable from what you proposed.

- `bar` is what earns a place, beyond the angle that found it -- awards, local
  critics, customer reviews, what locals say, or their own judgement. Ask it
  plainly and do not accept "the best", which is the question restated. Fold in
  any requirement the title stated: if they asked for independent hotels,
  independence is part of the bar or part of the cut, not an angle.

- `cut` is what is barred no matter how good it is -- chains, delivery-only,
  hotel restaurants, anywhere they simply refuse to send a reader. People find
  this easier to answer than the bar, so it is a good question to ask second.

  `bar` and `cut` are attached to EVERY search that runs, whatever angle found
  the place. So they are worth getting right once, and worth never repeating
  inside an angle.

- `angles` is the search order itself, and it is the question this whole
  interview exists to reach.

  One angle is one search and one reason a place is on the list. A list cannot
  be built from one search: ask for forty award winners in most cities and you
  will find nine. So the list is filled from several angles at once, each
  searched separately.

  An angle must add a distinct ROUTE into the places that already satisfy the
  requirements. It is not a restatement of the commission: for "rooftop bars",
  "bars with rooftop terraces" is the commission with different words and one
  wasted search. Ask yourself what each angle finds that the others would miss,
  and if the answer is "nothing", it is not an angle.

  You do not invent angles freely and you do not pick finished ones off a
  list. You choose SHAPES from the catalogue below and write each one's version
  for THIS topic.

{_catalogue_block(state)}

  Rules for writing an angle from a shape, in order of how badly each one bites:

  ADD NOTHING THE SHAPE DID NOT ASK FOR. The shape's `means` line is the whole
  condition. Every extra condition you volunteer empties the search. Asked for
  "opened in the last year" a previous run wrote "opened in the last 1-3 years
  AND has significant buzz" and found one place instead of eight. No "AND". No
  quality clause. No number of years where the shape says "decades". No
  requirement that a specialist sells nothing else.

  DO NOT REPEAT THE REQUIREMENTS. `bar` and `cut` are attached to every search
  already. An angle that restates them spends a search on a filter that was
  going to be applied anyway.

  SAY WHAT THE ANGLE IS FOR. Every option carries a `role`. Be honest about it:
  an angle that can only ever return one or two places is `specific`, and
  labelling it `broad` is how it gets asked for twelve and answers with twelve,
  nine of which do not belong.

  MAKE IT SPECIFIC TO THE TOPIC. This is the whole reason you write the angle
  instead of reading it. "Tiny plain places where the food is the whole point"
  is the same sentence for ceviche, pizza and wings. "Lunch-only cevicherias
  that close when the fish runs out" could only be about ceviche. Use what you
  looked up: the local words, the local formats, the local neighbourhoods.

  WRITE IT AS A SEARCH, NOT A LABEL. It is sent to a web search almost
  verbatim. "Hidden gem" is a label. "Huariques Lima residents recommend that
  the visitor guides miss" is a search. It must include the kind of place and
  be a plain description of what to look for. Never describe a place as having
  no online presence: a web search cannot find what you have just called
  unfindable.

  When and only when you ask about `angles`, fill `options` with a MENU, not
  just your picks. Each entry is `{{text, recommended, shape, role}}`:

    text         the finished search line, standing alone -- no numbering, no
                 shape name, no commentary
    recommended  true for the ones you are proposing, false for the rest
    shape        the catalogue key you wrote it from, or "" if it is your own
    role         broad, distinctive or specific

  The menu has three parts, and all three go in the same list:

    1. YOUR PICKS, `recommended` true. As many as the count needs. Two or three
       `broad` ones at most; the rest earn their place by finding something the
       broad ones miss.

    2. EVERY OTHER SHAPE IN THIS COMMISSION'S CATALOGUE, `recommended` false,
       each written for this topic exactly as carefully as your picks. This is
       the part that makes the question answerable: an operator shown only the
       six you chose has nothing to swap in, and a shape written badly because
       it was not going to be chosen is a trap for whoever ticks it.

       Skip a shape only when it genuinely does not exist for this topic, and
       skip it silently.

    3. ANGLES THE CATALOGUE HAS NO SHAPE FOR, `recommended` false, `shape` "",
       `group` "". Up to four. These are the reasons a place makes THIS list
       that no general pattern could have anticipated -- what you know about
       this topic in this city that a catalogue written for restaurants, bars
       and hotels could never contain. Ceviche in Lima has places by the
       fishing landings serving what came off the boat that morning; nothing in
       the catalogue is that. Find that kind of thing.

       They obey every other rule: one idea, no "AND", searchable, worded as
       a search. Do not restate a shape you have already written under a new
       name -- if it answers a shape, it IS that shape.

  Leave `recommendation` EMPTY on this question. Your recommended lines are
  already in `options`, and writing them out a second time is the same text
  paid for twice -- the pipeline builds the recommendation from the options you
  marked, in the order you sent them.

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
  location, the number of items, what earns a place, what is barred, and then
  every angle on its own line exactly as it will be searched. They should be
  able to read it and know exactly what is about to be looked for. Do not work
  out how many results each search should ask for; that is decided from the
  count and the roles after you agree, and an arithmetic you do here is one
  more thing that can disagree with what actually runs.
"""
