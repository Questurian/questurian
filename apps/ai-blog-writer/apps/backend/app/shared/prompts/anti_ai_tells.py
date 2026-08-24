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
"""

PRECEDENCE_HEADER = (
    "VOICE RULES (override any conflicting instruction above — if an earlier "
    "guideline asks for a quality these rules forbid, follow these rules)"
)


_BANNED_CONSTRUCTIONS = """\
Banned constructions. Do not use any of these:
- "quietly [adjective]" (quietly radical, quietly confident, quietly stunning, quietly devastating)
- "what happens when X meets Y" or "where X meets Y" or "what happens between X and Y" or "the space between X and Y" — any phrasing that names an abstract interaction between two ingredients, techniques, or cultures instead of describing the result ("refining what happens between Japanese technique and an Amazonian ingredient"). Describe the result, not the interaction.
- "X territory" as a closer (special-occasion territory, dangerous territory)
- "It's not just X, it's Y"
- "more than just a [noun]"
- "in a world where..."
- "the [noun] is [verb]-ing" sweeping openers (the city is changing, the menu is evolving)
- "feels both X and Y" or "reads as both X and Y"
- "a masterclass in"
- "punches above its weight"
- "the kind of [noun] that..."
- "deceptively simple"
- "effortlessly [adjective]"
- "the most X you can Y" or "the X-est you can Y" superlative-of-experience ("the most committed expression of Nikkei you can sit down to," "the tightest fish you can eat in the city," "the smartest pairing you can order"). The shape sounds writerly and commits to nothing concrete. State what the place actually does, or cut the claim.
- "set the bar," "raise the bar," "move the needle"
- "speaks volumes," "speaks to"
- "at its core," "at the heart of"
- "testament to"
- "X rather than Y" contrastive pivots ("a working kitchen rather than a monument," "a find rather than a scene"). Also any "not X, but Y" or "more X than Y" pivot used to flip an expectation.
- Bare "X, not Y" contrastive where Y is an abstract or metaphorical noun phrase ("its own cuisine, not a hyphenated footnote"; "a kitchen, not a stage"). The shape itself is the tell — rewording the metaphor does not fix it. State X directly and drop the negation.
- "for a reason" as a closing kicker ("reservations open weeks ahead for a reason," "the line forms early for a reason"). The phrase signals an unstated payoff the reader is supposed to fill in — state the actual reason or cut the sentence.
- "the [noun] to chase / to beat / to want / to know" as a kicker noun phrase ("the seating to chase," "the table to want"). Name the thing plainly.
- "[adj]-er than [noun] suggests / implies / lets on" comparative tells ("lower-key than the price suggests," "smaller than the reputation lets on"). They are kickers in disguise — cut the comparative frame.
- "X, which is why Y" causal pivots used to justify a recommendation ("low-key for the price tag, which is why the 1pm seating..."). State the recommendation directly.
- Compound mood adjectives of the form "[noun]-forward" or "[noun]-led" used to describe a room or program ("art-forward," "produce-forward," "vinyl-led"). Name the thing instead.
- Strained-clever metaphors that sound good on first read and empty on second ("build the case that X deserves its own shelf," "earn its seat at the table," "writes its own chapter"). If you cannot say the thing literally, do not say it figuratively.
- Two-clause aphoristic closer with abstract nouns — short balanced clauses joined by semicolon, "and," or a comma, with both clauses ending in an abstract or metaphorical noun ("Lunch is the calmer way in; dinner is the full argument." / "The room is the draw, and the food is the proof."). The parallel-with-abstract-noun shape is a strong signal even when each clause would be fine alone. Cut the symmetry or rewrite as two sentences with different shapes.
- Clipped imperative sign-offs as a closer, whether they end the paragraph or trail a compound sentence as the second clause ("Book weeks out, ideally more." / "Reserve early." / "Go hungry." / "Book months ahead, and treat it as the centerpiece of the trip."). Covers Book, Reserve, Order, Skip, Arrive, Sit, Come, Bring, Go, Stay, Treat. Either fold the practical note into a full sentence earlier, or drop it.
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
Do not substitute em-dash cadence with comma-bracketed asides. If you would \
have written "X — Y — Z" before the no-em-dash rule, do not write "X, Y, Z" \
instead. Comma-bracketed adverbials like "arguing, convincingly, that" or \
"the room is warm, and quietly so, throughout" are em dashes in disguise — \
rewrite the sentence into two shorter sentences, or drop the aside entirely. \
A comma should join clauses or list items, not impersonate a dash.
Do not substitute a hyphen either. "The room is warm - and quietly so" is the \
same dash wearing a different hat, and a spaced hyphen reads as a typewriter \
artefact rather than punctuation anyone chose. Hyphens do not bracket asides and they do not break sentences.
Do not use hyphenated compounds at all. "Two-bedroom apartments", \
"a long-stay visa", "a well-known, family-run spot" -- each is correct \
English on its own, but a run of them through an article is one of the \
clearest signals the text was generated. Rephrase instead: "apartments with \
two bedrooms", "a visa for long stays", "a spot the family runs, and people \
know it". Proper names keep their hyphens; nothing else does."""

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


ANTI_AI_TELLS_FULL = "\n\n".join([
    PRECEDENCE_HEADER,
    _BANNED_CONSTRUCTIONS,
    _BANNED_PERSONIFICATIONS,
    _NO_DASH_SUBSTITUTION,
    _RHYTHM,
    _SPECIFICITY_SOFTENED,
    _BANNED_HEDGES,
    _SUMMARY_PATTERNS,
    _BANNED_ADJ_STACKING,
    _SUPERLATIVE_WITHOUT_ANCHOR,
    _DICTION,
    _VOICE,
    _FINAL_TEST,
])


ANTI_AI_TELLS_BLURB = "\n\n".join([
    PRECEDENCE_HEADER,
    _BANNED_CONSTRUCTIONS,
    _BANNED_PERSONIFICATIONS,
    _NO_DASH_SUBSTITUTION,
    _BLURB_TRIADS,
    _BLURB_RHYTHM,
    _BLURB_NO_UNIFORM_KICKERS,
    _SPECIFICITY_SOFTENED,
    _BANNED_HEDGES,
    _BANNED_ADJ_STACKING,
    _SUPERLATIVE_WITHOUT_ANCHOR,
    _DICTION,
    _VOICE,
])
