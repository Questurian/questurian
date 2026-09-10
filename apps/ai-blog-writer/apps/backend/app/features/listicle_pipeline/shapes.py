"""The shapes an angle can take, which ones belong to a subject, and how many
a list needs.

An *angle* is one reason a place is on the list, and one search. A *shape* is
the pattern behind it, with the topic left blank.

The difference is the whole design. A fixed list of finished angles said "tiny,
plain, unglamorous places where the food is the whole point" for ceviche, for
pizza and for wings -- the same sentence three times, generic because it was
written to survive any topic. A shape says *the humble one* and makes the model
write ceviche's version of it: places that shut when the fish runs out.

So the model writes the words and the shapes hold the discipline. That split is
not a preference; it is what two failed runs on 2026-09-03 cost. Asked to
choose AND word its own angles for Lima restaurants, gemini-2.5-flash:

- **Over-tightened its own wording.** Given "open for decades" it wrote
  "operating for 50+ years" and found 3 places instead of 9. It wrote "opened
  in the last 1-3 years AND has significant buzz" and found 1 instead of 8.
  Every condition it volunteered emptied a search.
- **Picked the same angle three times.** "Iconic", "Where Chefs Eat" and
  "Experiential Dining" all returned Central, Maido and Astrid y Gastón. 49
  rows collapsed into 30 places.

Three things changed on 2026-09-08, from the improvement plan:

**The catalogue belongs to the subject.** A hotel list was being offered
market-stall and cuisine-fusion angles, because the catalogue was written for
restaurants and shown to everything. Every shape now says what it applies to,
and subjects bring their own.

**The wording stopped over-tightening itself.** "Known for one thing and little
else" excludes a specialist with a broad menu. "No sign, no listing" asks the
web to find something the shape has just declared unfindable. The prompt could
not prevent over-tightening while the catalogue was asking for it.

**Groups became explanations, not prohibitions.** `cheap`, `informal` and
`lesser-known` were one group and are not one idea -- a cheap neighbourhood bar
and an expensive hidden one are both real and both worth searching for. What
survives is a per-shape note about which other shapes tend to return the same
places, said to the operator and to the model, and enforced by neither.

**An angle carries a job.** "Affordable hotels" can supply a dozen; "the place
credited with inventing the dish" supplies one. They were being asked for the
same number, and the narrow one answered by padding.
"""

from __future__ import annotations

import re
import unicodedata

# Discovery roles. What an angle is for, and therefore what it may be asked
# for. Defined in `search`, named here because a shape is where the role is
# decided.
BROAD = "broad"
DISTINCTIVE = "distinctive"
SPECIFIC = "specific"

# The subjects the catalogue knows something extra about. A subject it does not
# know keeps every shared shape and gets no invented category.
RESTAURANTS = "restaurants"
BARS = "bars"
HOTELS = "hotels"
SUBJECTS: tuple[str, ...] = (RESTAURANTS, BARS, HOTELS)

# What a `kind` has to say to be read as one of them. Matched on whole words
# against the searchable noun the interview settled, in the local spelling as
# well as English -- "cevicheria" is a restaurant and "cantina" is a bar.
_SUBJECT_WORDS: dict[str, tuple[str, ...]] = {
    RESTAURANTS: (
        "restaurant", "restaurants", "restaurante", "restaurantes", "eatery",
        "eateries", "cevicheria", "cevicherias", "cebicheria", "cebicherias",
        "pizzeria", "pizzerias", "trattoria", "trattorias", "taqueria",
        "taquerias", "bistro", "bistros", "diner", "diners", "cafe", "cafes",
        "cafeteria", "cafeterias", "brasserie", "brasseries", "izakaya",
        "steakhouse", "steakhouses", "bakery", "bakeries", "panaderia",
        "marisqueria", "marisquerias", "chifa", "chifas", "picanteria",
        "picanterias", "huarique", "huariques", "food", "dining", "brunch",
    ),
    BARS: (
        "bar", "bars", "cocktail", "cocktails", "pub", "pubs", "taproom",
        "taprooms", "brewery", "breweries", "cerveceria", "cervecerias",
        "cantina", "cantinas", "speakeasy", "speakeasies", "wine", "winery",
        "bodega", "bodegas", "nightclub", "nightclubs", "club", "clubs",
        "pisco", "mezcaleria", "distillery", "distilleries",
    ),
    HOTELS: (
        "hotel", "hotels", "hostel", "hostels", "hostal", "hostales", "inn",
        "inns", "guesthouse", "guesthouses", "guest", "b&b", "bnb", "lodge",
        "lodges", "resort", "resorts", "aparthotel", "aparthotels", "stay",
        "stays", "accommodation", "accommodations", "posada", "posadas",
    ),
}


# Where a secondary description begins. "Hotels WITH rooftop bars" is a list of
# hotels; the bars are a condition on them. The head of the phrase decides the
# subject, and everything from one of these words onward is the condition.
_QUALIFIER_JOINS = (
    " with ",
    " featuring ",
    " that have ",
    " that has ",
    " which have ",
    " which has ",
    " offering ",
    " serving ",
    " containing ",
    " and their ",
)

# A genuinely mixed head. "Hotels and bars" is two subjects and the catalogue
# has no honest answer; the interview's own kind question is what settles it.
_MIXED_HEAD = re.compile(
    r"(?:\b(?:and|or|plus)\b|&)(?!\s+(?:their|its|the)\b)", re.IGNORECASE
)

# How a subject was decided, kept beside the answer. "Nobody could tell" and
# "the catalogue knows nothing about this" are different states, and a screen
# that shows one for the other invites the operator to fix the wrong thing.
SUBJECT_SOURCES: tuple[str, ...] = ("head", "only-match", "unknown", "mixed")


def normalise_kind(kind: str) -> str:
    """The searchable noun, folded for matching and for matching only.

    "cevicherías" and "cevicherias" are one word. The catalogue matched on
    ASCII and the accented spelling -- which is the correct one, and the one an
    interview in Lima produces -- matched nothing, so a list of cevicherías got
    the shared catalogue and none of the restaurant shapes.

    The approved spelling is never touched. This is a key for lookup; the noun
    the operator agreed to is what reaches every prompt.
    """
    folded = unicodedata.normalize("NFKD", kind.casefold())
    return "".join(c for c in folded if not unicodedata.combining(c))


def _words_of(kind: str) -> set[str]:
    return set(re.findall(r"[a-z&]+", normalise_kind(kind)))


def _subject_in(text: str) -> tuple[str, ...]:
    """Every subject the catalogue can see in one phrase, in declaration order."""
    words = _words_of(text)
    return tuple(
        subject
        for subject in (BARS, RESTAURANTS, HOTELS)
        if words & set(_SUBJECT_WORDS[subject])
    )


def resolve_subject(kind: str) -> tuple[str, str]:
    """Which catalogue this commission gets, and how that was decided.

    Two rules, in order.

    **The head of the phrase decides.** "Hotels with rooftop bars" is a list of
    hotels and "hotel bars" is a list of bars, and the version this replaced
    answered `bars` to both -- it matched words anywhere in the string and let
    a fixed precedence break the tie, so a hotel commission was handed the bar
    catalogue on the strength of the word describing its balconies.

    **A genuinely mixed head is not resolved.** "Hotels and bars" is two
    subjects; guessing one of them hands half the commission a catalogue
    written for the other half. It stays `unknown`, keeps the shared shapes,
    and the interview's own kind question is what settles it.

    Returns ("" , "unknown") for a subject the catalogue knows nothing about,
    which is a real answer and the common one. A list of museums keeps the
    shared shapes and the operator's own lines; it is not filed under
    restaurants so that the catalogue has something to offer it, which is how
    a hotel list came to be offered market stalls.
    """
    folded = normalise_kind(kind)
    head = folded
    for join in _QUALIFIER_JOINS:
        index = head.find(join)
        if index != -1:
            head = head[:index]
    head = head.strip()

    in_head = _subject_in(head)
    if len(in_head) == 1:
        if _MIXED_HEAD.search(head):
            return "", "mixed"
        return in_head[0], "head"
    if len(in_head) > 1:
        # Two subjects in the head itself. "Hotel bars" is one of these and is
        # not mixed: it is a compound noun whose head is `bars`.
        if _MIXED_HEAD.search(head):
            return "", "mixed"
        return _head_noun(head, in_head), "head"

    # Nothing in the head. The condition may still name one, and a phrase whose
    # only subject word is in the condition is a phrase whose head the
    # catalogue does not know -- so this is the shared catalogue, not the
    # condition's.
    return "", "unknown"


def _head_noun(head: str, candidates: tuple[str, ...]) -> str:
    """Which of several subjects a compound noun is actually about.

    English puts the head last: "hotel bars" are bars, "bar food" is food. So
    the subject whose word appears latest in the phrase is the one the list is
    of.
    """
    positions: dict[str, int] = {}
    for subject in candidates:
        for word in _SUBJECT_WORDS[subject]:
            match = re.search(rf"\b{re.escape(word)}\b", head)
            if match:
                positions[subject] = max(positions.get(subject, -1), match.start())
    return max(positions, key=lambda subject: positions[subject]) if positions else ""


def subject_of(kind: str) -> str:
    """Which subject's catalogue a commission gets, or "" for none."""
    return resolve_subject(kind)[0]


class Shape:
    """One pattern an angle can take.

    `core` is what the shape means, in as few words as it takes. `instruction`
    is what the model is told to write. They are separate because the failure
    they exist to prevent is a shape whose finished wording quietly says more
    than the shape means -- and the only way to see that is to have the meaning
    written down beside it.

    `example` shows the same shape instantiated for two unlike topics, because
    one example reads as a template to copy and two read as a pattern to apply.

    `applies_to` is the subjects this shape belongs to. Empty means all of
    them.

    `overlaps_with` names shapes that tend to return the same places. It is
    explained and never enforced: `award` and `luxury` overlap in some cities
    and not in others, and the operator knows which city this is.
    """

    __slots__ = (
        "key", "label", "core", "instruction", "example",
        "theme", "overlaps_with", "applies_to", "role",
    )

    def __init__(
        self,
        key: str,
        label: str,
        core: str,
        instruction: str,
        example: str,
        *,
        theme: str = "",
        overlaps_with: tuple[str, ...] = (),
        applies_to: tuple[str, ...] = (),
        role: str = DISTINCTIVE,
    ) -> None:
        self.key = key
        self.label = label
        self.core = core
        self.instruction = instruction
        self.example = example
        # A descriptive family, shown as a label. Not a rule: two shapes
        # sharing a theme may both be worth searching.
        self.theme = theme
        self.overlaps_with = overlaps_with
        self.applies_to = applies_to
        self.role = role

    def applies(self, subject: str) -> bool:
        return not self.applies_to or subject in self.applies_to

    def __repr__(self) -> str:  # pragma: no cover -- diagnostics only
        return f"Shape({self.key!r})"


SHAPES: tuple[Shape, ...] = (
    # --- shared: every subject gets these ------------------------------------
    Shape(
        "world-renowned",
        "World renowned",
        "Known outside the country.",
        "The ones known outside the country. International lists, foreign press.",
        "ceviche: cevicherias the foreign press writes about | "
        "pizza: pizzerias written up in the international food press",
        theme="prestige",
        overlaps_with=("award", "luxury"),
    ),
    Shape(
        "luxury",
        "The splurge",
        "The expensive end.",
        "The expensive end. Price is the whole condition -- do not add a"
        " quality, reputation or occasion clause.",
        "ceviche: expensive cevicherias people save up for | "
        "hotels: the most expensive hotels in the city",
        theme="price",
        overlaps_with=("world-renowned",),
        role=BROAD,
    ),
    Shape(
        "award",
        "Award listed",
        "Formally recognised by a guide, award or national body.",
        "Formally recognised by a guide, award or national body. Name the kind"
        " of recognition, not a level of fame.",
        "ceviche: cevicherias that have won a national restaurant award | "
        "pizza: AVPN-certified pizzerias",
        theme="prestige",
        overlaps_with=("world-renowned",),
    ),
    Shape(
        "institution",
        "Local institution",
        "Longstanding. Nothing about landmark status.",
        "Open for decades. Say 'decades', never a specific number of years -- a"
        " number empties the search. Do not add that it must be famous or a"
        " landmark; being old is the whole condition.",
        "ceviche: cevicherias that have been open for decades | "
        "hotels: hotels that have been operating for decades",
        theme="heritage",
        overlaps_with=("family", "origin"),
        role=BROAD,
    ),
    Shape(
        "origin",
        "Where it started",
        "Credited with starting this locally.",
        "The place credited with starting this locally, or with one dish"
        " everyone else now copies. There may only be one or two, and one is a"
        " good answer.",
        "ceviche: the cevicheria credited with starting Lima's ceviche boom | "
        "pizza: the pizzeria credited with inventing the local style",
        theme="heritage",
        overlaps_with=("institution",),
        role=SPECIFIC,
    ),
    Shape(
        "lesser-known",
        "Less visitor coverage",
        "Written about locally, missing from visitor lists.",
        "Written up in local sources but absent from the familiar visitor"
        " lists. Do NOT say it has no sign, no listing or no online presence --"
        " a search cannot find something described as unfindable.",
        "ceviche: huariques Lima residents recommend that visitor guides miss |"
        " bars: neighbourhood bars local press writes about and guidebooks do not",
        theme="locality",
        overlaps_with=("district",),
    ),
    Shape(
        "cheap",
        "Cheap and good",
        "Very cheap, rated well anyway.",
        "Very cheap, and rated highly anyway. Price is the point.",
        "ceviche: very cheap cevicherias that people rate highly | "
        "hotels: very cheap places to stay that people rate highly",
        theme="price",
        role=BROAD,
    ),
    Shape(
        "new-wave",
        "Just opened",
        "Opened inside an explicit recent window.",
        "Opened recently, with the window said explicitly and counted back from"
        " today's date -- 'opened since <year>' or 'opened in the last year'."
        " Nothing else. No buzz clause, no quality clause. Adding one is what"
        " found a single place instead of eight.",
        "ceviche: cevicherias that opened in the last year | "
        "hotels: hotels that opened in the last year",
        theme="recency",
    ),
    Shape(
        "one-thing",
        "Signature specialty",
        "Known especially for one item.",
        "Known especially for a single item. Do NOT require that it sells"
        " little else -- a specialist with a full menu is still a specialist.",
        "ceviche: places known above all for their leche de tigre | "
        "wings: places famous for one sauce",
        theme="specialty",
    ),
    Shape(
        "insider",
        "Where the trade goes",
        "Where people in this trade go themselves.",
        "Where people who work in this field eat, drink or stay themselves.",
        "ceviche: where Lima chefs say they eat ceviche on their days off | "
        "bars: where bartenders drink after their shift | "
        "hotels: hotels travel writers and guides recommend to their own"
        " clients",
        theme="locality",
    ),
    Shape(
        "family",
        "Family run",
        "Run by one family.",
        "Run by one family. Say nothing about how long -- age is what"
        " `institution` is for, and asking for both narrows this to the"
        " overlap of two shapes.",
        "ceviche: family-run cevicherias in Lima | "
        "hotels: guesthouses run by the family who own them",
        theme="heritage",
        overlaps_with=("institution",),
    ),
    Shape(
        "setting",
        "For the room or the view",
        "Chosen for where you are, not what you get.",
        "Chosen for where you are rather than what you get -- the room, the"
        " view, the terrace, the street.",
        "ceviche: cevicherias people go to for the view of the sea | "
        "bars: rooftop bars people go to for what they can see | "
        "hotels: hotels people book for the room's view",
        theme="setting",
        role=BROAD,
    ),
    Shape(
        "district",
        "One neighbourhood's own",
        "Belongs to one named neighbourhood.",
        "In one named district. Name it. Do not add that visitors miss it --"
        " that is `lesser-known`, and requiring both empties the search.",
        "ceviche: cevicherias in Barranco | bars: bars in Pueblo Libre | "
        "hotels: hotels in Barranco",
        theme="locality",
        overlaps_with=("lesser-known",),
        role=BROAD,
    ),
    # --- restaurants and bars ------------------------------------------------
    Shape(
        "the-experience",
        "The set experience",
        "Fixed format, booked ahead.",
        "Booked in advance, fixed format, you sit down for the whole thing.",
        "ceviche: cevicherias serving a tasting menu | "
        "bars: bars with a reservation-only cocktail programme",
        theme="prestige",
        overlaps_with=("world-renowned",),
        applies_to=(RESTAURANTS, BARS),
    ),
    Shape(
        "purist",
        "The orthodox version",
        "Known for the traditional version.",
        "Known for doing it the traditional way. Do NOT invent a refusal --"
        " 'no fusion, no variations, nothing else on the menu' is a condition"
        " the shape did not ask for and it empties the search.",
        "ceviche: cevicherias known for classic Limeño ceviche | "
        "pizza: pizzerias known for wood-fired Neapolitan",
        theme="tradition",
        applies_to=(RESTAURANTS, BARS),
    ),
    Shape(
        "crossed",
        "Crossed with something else",
        "Put through another cuisine or culture.",
        "The same thing put through another cuisine, culture or technique.",
        "ceviche: nikkei cevicherias doing Japanese-Peruvian preparations | "
        "pizza: pizzerias doing a non-Italian style",
        theme="tradition",
        applies_to=(RESTAURANTS, BARS),
    ),
    Shape(
        "hours",
        "Defined by when",
        "Exists at one time of day.",
        "Only exists at one time of day. Lunch only, late night, breakfast.",
        "ceviche: lunch-only cevicherias | "
        "bars: places busiest after most bars have closed",
        theme="format",
        applies_to=(RESTAURANTS, BARS),
    ),
    # --- restaurants ---------------------------------------------------------
    Shape(
        "informal",
        "Stall, counter or market",
        "Not a sit-down restaurant.",
        "Not a restaurant. A stall, a counter, a stand, a spot in a market."
        " Name individual businesses, never the market itself.",
        "ceviche: ceviche counters inside the city's markets | "
        "pizza: pizza served by the slice from a counter",
        theme="format",
        applies_to=(RESTAURANTS,),
    ),
    Shape(
        "regional-tradition",
        "A region's own version",
        "Cooks one region's version of it.",
        "Cooks the version belonging to one region or tradition of the country."
        " Name the region.",
        "ceviche: cevicherias cooking the northern Piuran style | "
        "pizza: pizzerias cooking the Roman style",
        theme="tradition",
        overlaps_with=("purist",),
        applies_to=(RESTAURANTS,),
    ),
    Shape(
        "producer-links",
        "Close to the producer",
        "Sources direct, and says so.",
        "Buys direct from a named supplier -- a fisherman, farm, market or"
        " maker -- and is written about for it.",
        "ceviche: cevicherias that buy direct from named Lima fishermen | "
        "steak: steakhouses that name the ranch",
        theme="sourcing",
        applies_to=(RESTAURANTS,),
        role=SPECIFIC,
    ),
    # --- bars ----------------------------------------------------------------
    Shape(
        "drink-specialty",
        "Built around one drink",
        "One drink or category is the point.",
        "Built around one drink or one category of drink.",
        "bars: pisco bars with the deepest macerado lists | "
        "bars: bars built around natural wine",
        theme="specialty",
        overlaps_with=("one-thing",),
        applies_to=(BARS,),
    ),
    Shape(
        "live-music",
        "Live music or performance",
        "Live performance is the reason to go.",
        "Live music or performance is the reason people go. Say what kind.",
        "bars: bars with live criolla music most nights | "
        "bars: jazz bars with a nightly set",
        theme="format",
        applies_to=(BARS,),
    ),
    Shape(
        "dancing",
        "Somewhere to dance",
        "People go to dance.",
        "People go to dance. Say what to.",
        "bars: salsa bars with a full dance floor | "
        "bars: cumbia venues that stay open late",
        theme="format",
        overlaps_with=("live-music",),
        applies_to=(BARS,),
    ),
    Shape(
        "service-format",
        "How it serves you",
        "The format of the service itself.",
        "Defined by how it serves rather than what it pours -- standing only,"
        " a counter, table service, a window onto the street.",
        "bars: standing-only bars with a single counter | "
        "bars: bars serving through a street window",
        theme="format",
        applies_to=(BARS,),
    ),
    Shape(
        "local-drinking",
        "A local drinking tradition",
        "Belongs to how the city drinks.",
        "Belongs to a drinking custom particular to this place. Name the"
        " custom.",
        "bars: bodegas-bar where Limeños drink standing among the shelves | "
        "bars: pulquerías serving the old way",
        theme="tradition",
        applies_to=(BARS,),
    ),
    # --- hotels --------------------------------------------------------------
    Shape(
        "lodging-format",
        "The kind of stay",
        "The format of the lodging.",
        "Defined by the kind of lodging rather than its price -- aparthotel,"
        " guesthouse, hostel with private rooms, serviced flat. Name it.",
        "hotels: aparthotels with self-catering kitchens | "
        "hotels: guesthouses with fewer than ten rooms",
        theme="format",
        applies_to=(HOTELS,),
        role=BROAD,
    ),
    Shape(
        "building-character",
        "The building itself",
        "The building is the reason.",
        "The building is the reason to stay -- a converted house, a period"
        " façade, a piece of architecture people write about.",
        "hotels: hotels in converted republican-era casonas | "
        "hotels: hotels in buildings by a named architect",
        theme="setting",
        overlaps_with=("setting",),
        applies_to=(HOTELS,),
    ),
    Shape(
        "long-stay",
        "Set up for longer stays",
        "Built for weeks, not nights.",
        "Set up for staying weeks rather than nights -- kitchens, laundry,"
        " monthly rates, desks.",
        "hotels: aparthotels with monthly rates and kitchens | "
        "hotels: places advertising weekly and monthly stays",
        theme="format",
        overlaps_with=("lodging-format",),
        applies_to=(HOTELS,),
        role=BROAD,
    ),
    Shape(
        "family-facilities",
        "Set up for families",
        "Facilities families need.",
        "Set up for families -- family rooms, cots, a pool, somewhere for"
        " children to be.",
        "hotels: hotels with family rooms and a pool | "
        "hotels: places that put a cot in the room",
        theme="audience",
        applies_to=(HOTELS,),
    ),
    Shape(
        "transport-access",
        "Where it is, for getting about",
        "Placed for getting around.",
        "Chosen for how easy it is to get in and out -- near a named station,"
        " line, terminal or airport.",
        "hotels: hotels within walking distance of the Metropolitano | "
        "hotels: hotels beside the airport terminal",
        theme="locality",
        overlaps_with=("district",),
        applies_to=(HOTELS,),
    ),
)

SHAPES_BY_KEY: dict[str, Shape] = {shape.key: shape for shape in SHAPES}


def shapes_for(subject: str) -> tuple[Shape, ...]:
    """The catalogue this commission actually gets."""
    return tuple(shape for shape in SHAPES if shape.applies(subject))


def shape_menu(subject: str = "") -> str:
    """The catalogue as the model is shown it."""
    lines: list[str] = []
    for shape in shapes_for(subject):
        lines.append(f"{shape.key} -- {shape.label}  [{shape.role}]")
        lines.append(f"    means: {shape.core}")
        lines.append(f"    write: {shape.instruction}")
        lines.append(f"    e.g.  {shape.example}")
        if shape.overlaps_with:
            lines.append(
                f"    tends to overlap: {', '.join(shape.overlaps_with)}"
            )
    return "\n".join(lines)


def overlap_notes(subject: str = "") -> str:
    """Which pairs tend to return the same places, said once.

    A note rather than a rule. The version this replaced put four shapes in one
    `prestige` group and refused to let two of them be chosen together, which
    is wrong in both directions: award-listed and expensive are different
    places in most cities, and family-run and longstanding are often the same
    ones while sitting in no shared group at all.
    """
    seen: set[tuple[str, str]] = set()
    lines: list[str] = []
    available = {shape.key for shape in shapes_for(subject)}
    for shape in shapes_for(subject):
        for other in shape.overlaps_with:
            if other not in available:
                continue
            pair = tuple(sorted((shape.key, other)))
            if pair in seen:
                continue
            seen.add(pair)
            lines.append(f"- {pair[0]} and {pair[1]}")
    return "\n".join(lines)


# Where each subject is actually written about.
#
# The search already says to run in the local language; this says WHERE that
# language is written down, and it differs by subject. A hotel is covered by
# accommodation and travel reporting and by listing and review sites; a
# restaurant or a bar is covered by the local food and drink press. Sending a
# hotel search looking for food writing is how a hotel commission comes back
# thin -- the sources exist and the search was not pointed at them.
#
# Never a restriction. Nothing is excluded, and every source still counts the
# same whatever language it is in.
_SOURCE_GUIDANCE: dict[str, str] = {
    HOTELS: (
        "Local accommodation and travel reporting, hotel listing and review"
        " sites, and the places' own pages are where this is written down."
    ),
    RESTAURANTS: (
        "Local food reporting, local restaurant critics and local food blogs"
        " are where this is written down."
    ),
    BARS: (
        "Local drink and nightlife reporting, local bar critics and local"
        " drink blogs are where this is written down."
    ),
}


def source_guidance(subject: str = "") -> str:
    """Where to look for this subject, said to the search.

    Empty for a subject the catalogue does not know. A guess about where
    museums are written up is worse than nothing: it points the search
    somewhere specific and wrong, and the search obeys.
    """
    return _SOURCE_GUIDANCE.get(subject, "")


def roles_note() -> str:
    """What the three roles mean, for the model choosing them."""
    return (
        f"{BROAD}       -- supplies a large share of the list. Two or three at most.\n"
        f"{DISTINCTIVE} -- a format, a locality or a specialty the broad searches miss.\n"
        f"{SPECIFIC}    -- a handful of unusually relevant places. One result is a"
        " good result; never asked to fill a quota."
    )


def suggested_angle_count(target_items: int) -> int:
    """How many angles a list of this length gets built from.

    Roughly seven items per angle. A short list wants few angles asked hard; a
    long one cannot be filled from a handful and needs the spread.

    A starting heuristic and nothing more. It lives here, in code, so the
    prompt stops carrying the same arithmetic written out as prose -- which is
    how the two came to disagree.
    """
    if target_items <= 8:
        return 2
    if target_items <= 15:
        return 3
    return max(4, min(10, round(target_items / 7)))


def angle_count_guidance(target_items: int) -> str:
    """The recommendation, said as the model should read it."""
    return (
        f"For {target_items} items, recommend about {suggested_angle_count(target_items)}"
        " angles. That is a recommendation, not a quota: more or fewer coming"
        " back is their answer and settles the marker."
    )
