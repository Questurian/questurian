"""Anti-AI-tells voice guideline appended to prose-producing prompts.

Two variants are defined; current usage:

- ANTI_AI_TELLS_BLURB: appended for single-paragraph blurbs. In
  `editor_assist/listicle_writer.py` for listicle blurbs, gated per-category via
  `_voice_rules_block` (dining pilot from ADR 0003, extended to accommodations,
  attractions, and nightlife per ADR 0004). Also appended unconditionally to the
  itinerary stop-blurb day composer (`compose_itinerary_day_blurbs`) per ADR
  0021. Single-type listicle intros, key_location blurbs, and other listicle
  field types remain on the legacy path.

- ANTI_AI_TELLS_FULL: wired into the itinerary intro composer
  (`compose_itinerary_intro`) per ADR 0021, and since extended to the other
  article-body composers: youtube2blog (compose, supplement, quality improve,
  SEO enrich, deep-expand, listicle rewrite, editorial augmentation), url2blog
  (rewrite/repair, length expansion, fact repair, editorial augmentation),
  prompt2blog (supplement, compose, repair, editorial augmentation), and the
  editor_assist block-rewrite. Anti-AI outputs are validated with
  `app.shared.text.validate_anti_ai_tells_markdown` and get one targeted repair
  retry instead of automatic dash-to-comma normalization.

The blurb variant drops rhythm / summary / paragraph-structure rules that do
not apply to a single 90-140 word paragraph.

Both are written to be appended *after* any per-article-type guideline, with the
precedence statement asserting they override conflicting instructions above.

Two families in `_BANNED_CONSTRUCTIONS` are named as shapes rather than listed
as strings (ADR 0030). A literal list only catches the variants someone thought
to write down; naming the shape catches the ones they did not. Do not expand
either family back into individual entries.
"""

PRECEDENCE_HEADER = (
    "VOICE RULES (override any conflicting instruction above — if an earlier "
    "guideline asks for a quality these rules forbid, follow these rules)"
)


_BANNED_CONSTRUCTIONS = """\
Banned constructions. Two shapes account for most of these. Learn the shape, \
not the list: a variant is banned even when it is not written out below.

THE CONTRASTIVE PIVOT — defining a thing by what it is not, or balancing it \
against a counter-claim in the same breath. "It's not just X, it's Y." "More \
than just a [noun]." "A working kitchen rather than a monument." "Not X, but \
Y." "More X than Y." Bare "X, not Y" where Y is abstract or metaphorical ("its \
own cuisine, not a hyphenated footnote"). "Feels both X and Y." "Deceptively \
simple." The shape itself is the tell — rewording the metaphor does not fix \
it. State the thing directly and drop the negation.

THE KICKER THAT IMPLIES A PAYOFF — a closer that gestures at a reason instead \
of giving it, leaving the reader to fill in the blank. "The line forms early \
for a reason." "The seating to chase." "Lower-key than the price suggests." \
"...which is why the 1pm seating fills first." "Special-occasion territory." \
State the actual reason, name the thing plainly, or cut the sentence.

Also banned, individually:
- "quietly [adjective]" (quietly radical, quietly confident, quietly stunning)
- "what happens when X meets Y" or "where X meets Y" or "the space between X and Y" — any phrasing that names an abstract interaction between two ingredients, techniques, or cultures instead of describing the result. Describe the result, not the interaction.
- "in a world where..."
- "the [noun] is [verb]-ing" sweeping openers (the city is changing, the menu is evolving)
- "a masterclass in"
- "punches above its weight"
- "the kind of [noun] that..."
- "effortlessly [adjective]"
- "the most X you can Y" or "the X-est you can Y" superlative-of-experience ("the tightest fish you can eat in the city"). The shape sounds writerly and commits to nothing concrete. State what the place actually does, or cut the claim.
- "set the bar," "raise the bar," "move the needle"
- "speaks volumes," "speaks to"
- "at its core," "at the heart of"
- "testament to"
- Compound mood adjectives of the form "[noun]-forward" or "[noun]-led" used to describe a room or program ("art-forward," "produce-forward"). Name the thing instead.
- Strained-clever metaphors that sound good on first read and empty on second ("earn its seat at the table," "writes its own chapter"). If you cannot say the thing literally, do not say it figuratively.
- Two-clause aphoristic closer with abstract nouns — short balanced clauses joined by semicolon, "and," or a comma, with both clauses ending in an abstract or metaphorical noun ("The room is the draw, and the food is the proof."). The parallel-with-abstract-noun shape is a strong signal even when each clause would be fine alone. Cut the symmetry or rewrite as two sentences with different shapes.
- Clipped imperative sign-offs as a closer, whether they end the paragraph or trail a compound sentence as the second clause ("Book weeks out, ideally more." / "Go hungry."). Covers Book, Reserve, Order, Skip, Arrive, Sit, Come, Bring, Go, Stay, Treat. Either fold the practical note into a full sentence earlier, or drop it.
- Any sentence ending in a tidy summary that restates the paragraph."""

_BANNED_PERSONIFICATIONS = """\
Banned personifications. Menus do not move, dance, weave, sing, or whisper. \
Rooms do not breathe. Flavors do not converse. Dishes do not "do the talking," \
"carry the conversation," "speak for themselves," "make the case," or "argue." \
Food is not an orator. Cut all of these."""

_SUPERLATIVE_WITHOUT_ANCHOR = """\
Banned superlatives without anchors. Do not write "the smartest / sharpest / \
finest / deepest / tightest / cleanest / leanest / most thoughtful / most \
considered / most committed [wine list, sake program, cellar, beverage \
program, by-the-glass, tasting menu, room, kitchen, pairing, cocktail \
program]" without immediately naming the specific feature that earns the \
claim. "Runs one of the smartest wine and sake programs on the continent" is \
empty unless the next clause names the producers stocked, the by-the-glass \
policy, the markup, the format, or a named sommelier choice. If the source \
material does not support a specific anchor, drop the superlative and \
describe the program with a concrete noun instead. Vague evaluative \
superlatives are the structural opposite of editorial judgment — they sound \
confident and commit to nothing."""


_BANNED_HEDGES = """\
Banned hedges and softeners. Cut: arguably, perhaps, somewhat, rather, quite, \
fairly, genuinely, truly, really, simply, just, of course, indeed. Cut "it's \
worth noting that," "it's important to remember," and any meta-commentary \
about the writing itself."""

# Every phrase the shared validator rejects has to be named here, or a writer
# is judged against a rule it was never given (see
# test_every_phrase_the_validator_rejects_is_named_in_the_prompt). That
# coupling, not verbosity, is why this block is long: it is a phrase list with
# prose around it. Restructured into four named moves rather than shortened.
_BANNED_DISCLAIMERS = """\
Banned disclaimers. Never write about the enquiry. The reader is here for the \
place, not for how we found out about it. State what you know as a plain fact \
and stop: "Customs took twenty five minutes" is the whole sentence. Do not \
caveat a fact, attribute it defensively, date it as a shield, or explain how \
it was established.

Four moves are banned, in every wording.

1. Telling the reader how much to trust a claim. Cut: "based on my own experience," "anecdotally," "at the time of writing," "your experience may vary," "this is one traveller's experience," "this is not an average," and any sentence whose job is to tell the reader how much to trust the previous one.

2. Narrating a gap. Cut: "no official figures exist for," "there is no public data on," "figures could not be verified," "does not publish," "has not disclosed," "is not public information," "is not publicly available," "could not be confirmed." Where research could not establish something, write around it: never narrate the gap. Write what the subject does do, or say nothing.

3. Letting the vocabulary of the research onto the page. No "sampled" booking flows or menus, no "data points," no "sample size," no "evidence records," and no grading your own confidence in a number ("an estimate rather than a guaranteed bill"). Give the number plainly or leave it out.

4. Putting a publication between you and the claim. Cut: "sources report," "travel sources," "outlets anticipate," "one outlet," "the publication noted," "the report cited," "according to," "reports suggest." A named person or institution who acts in the story stays; the outlet that wrote it up does not.

This bans hedging, not first person. In a piece written in first person, "I \
waited twenty five minutes at customs" is the fact, told plainly, and it \
stays. A date or a season belongs in the prose when the reader needs it to \
act — a closure, a season, a change to the place itself — never as armour \
around a claim. Accuracy is settled before the writing starts; it is not the \
reader's problem."""

_BANNED_ADJ_STACKING = """\
Banned adjective stacking. No three-adjective lists ("warm, unfussy, and \
inviting"). Pick one adjective and make it earn its place, or replace the \
adjective with a noun or verb that shows the same thing."""

_DICTION = """\
Diction rules. Prefer short Anglo-Saxon words over Latinate ones — "use" not \
"utilize," "show" not "demonstrate," "about" not "regarding." Cut "leverage," \
"curate," "craft" (as a verb), "elevate," "showcase," "highlight," "navigate" \
(when not literal)."""

_NO_DASH_SUBSTITUTION = """\
No em dashes, and no substitutes for them. A comma-bracketed aside is an em \
dash in disguise: if you would have written "X — Y — Z", do not write "X, Y, \
Z" instead. Asides like "arguing, convincingly, that" or "the room is warm, \
and quietly so, throughout" get rewritten as two shorter sentences or dropped. \
A comma joins clauses or list items; it does not impersonate a dash. A spaced \
hyphen is the same dash in another hat and reads as a typewriter artefact.

Do not use hyphenated compounds at all. "Two-bedroom apartments", "a long-stay \
visa", "a well-known, family-run spot" — each is correct English on its own, \
but a run of them through an article is one of the clearest signals the text \
was generated. Rephrase: "apartments with two bedrooms", "a visa for long \
stays", "a spot the family runs, and people know it". Proper names keep their \
hyphens; nothing else does."""

_VOICE = """\
Voice rules. Write from a single point of view with an opinion. If the writing \
could have been produced by a committee that has never been to the place, \
rewrite it. Take a side. Risk being wrong. AI prose is recognizable partly \
because it never commits — every claim is balanced against its counter-claim \
within the same sentence."""

_SPECIFICITY_SOFTENED = """\
Specificity rules. Every paragraph should contain at least one of: a proper \
noun beyond the subject, a number, a named dish or object, a date or year, a \
direct quote, or a physical detail that could only come from being there (a \
smell, a texture, an awkward moment, a small failure) — IF the source \
material supports it. Do not invent facts to satisfy this rule. If the source \
is thin on anchors, prefer a shorter paragraph or merge with an adjacent one \
rather than inventing a dish name, price, year, or quote. Generalizations \
without anchors are the strongest AI signal, but fabricated anchors are worse."""

_RHYTHM = """\
Rhythm rules. Vary sentence length aggressively. If three sentences in a row \
are 15-25 words, the next one must be under 8 or over 35. Parallel structure \
("A and B, C and D") is fine once per paragraph, never twice. Do not end \
paragraphs with a balanced two-clause summary line."""

_SUMMARY_PATTERNS = """\
Banned summary patterns. Do not open with a thesis sentence and close with a \
restated thesis. Do not write "in conclusion," "ultimately," "all in all," or \
any equivalent. End on a concrete detail or a specific recommendation, not a \
sweeping verdict."""

_BLURB_TRIADS = """\
Triad rule. The rule of three (three nouns, three phrases, three clauses joined \
"A, B, and C") may appear at most once in the blurb. Two triads in adjacent \
sentences is the strongest single AI signal in this format — if you find \
yourself writing a second one, collapse it to two items or split it into \
separate sentences with different shapes."""

_BLURB_RHYTHM = """\
Blurb rhythm. The paragraph must contain at least one sentence under 10 words \
and at least one over 25. If every sentence lands in the 14-22 word range, the \
paragraph reads as AI. Do not close with a one-line afterthought; the final \
sentence should carry as much weight as the lead."""

_BLURB_NO_UNIFORM_KICKERS = """\
Cadence rule. Do not end every sentence on a kicker — a small twist, a clever \
inversion, a noun-phrase punchline, or a metaphorical aside. At least one \
sentence in the blurb must be a flat factual statement that ends without any \
twist at all (a date, a location, a fact, a number). The "clause, then kicker" \
shape repeated across every sentence is the structural signature of AI prose, \
even when each individual kicker would be fine in isolation. Vary how \
sentences end, not just how long they are."""

_FINAL_TEST = """\
Final test. Read the draft as if aloud. If it sounds like every other piece of \
competent writing on the internet, it is AI prose. The fix is almost always \
more specificity and less symmetry."""


ANTI_AI_TELLS_FULL = "\n\n".join(
    [
        PRECEDENCE_HEADER,
        _BANNED_CONSTRUCTIONS,
        _BANNED_PERSONIFICATIONS,
        _NO_DASH_SUBSTITUTION,
        _RHYTHM,
        _SPECIFICITY_SOFTENED,
        _BANNED_HEDGES,
        _BANNED_DISCLAIMERS,
        _SUMMARY_PATTERNS,
        _BANNED_ADJ_STACKING,
        _SUPERLATIVE_WITHOUT_ANCHOR,
        _DICTION,
        _VOICE,
        _FINAL_TEST,
    ]
)


ANTI_AI_TELLS_BLURB = "\n\n".join(
    [
        PRECEDENCE_HEADER,
        _BANNED_CONSTRUCTIONS,
        _BANNED_PERSONIFICATIONS,
        _NO_DASH_SUBSTITUTION,
        _BLURB_TRIADS,
        _BLURB_RHYTHM,
        _BLURB_NO_UNIFORM_KICKERS,
        _SPECIFICITY_SOFTENED,
        _BANNED_HEDGES,
        _BANNED_DISCLAIMERS,
        _BANNED_ADJ_STACKING,
        _SUPERLATIVE_WITHOUT_ANCHOR,
        _DICTION,
        _VOICE,
    ]
)
