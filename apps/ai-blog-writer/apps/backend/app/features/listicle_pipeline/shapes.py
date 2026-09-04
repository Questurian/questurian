"""The shapes an angle can take, and how many a list needs.

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

Hand-picked angles on the same model, same city, same day: 53 rows, 42 distinct
places, from five searches instead of eight.

A shape fixes both. It sets the tightness, so there is no blank to bolt an
extra condition onto; and it belongs to a `collides_with` group, so the three
angles that are all "the prestigious one" can no longer be chosen together.

The groups are the second failure written down. `prestige` exists because
world-renowned, luxury, award-winning and tasting-menu return the same handful
of restaurants in every city on earth. One of them is the strongest thing on a
list. Three of them is a third of the list wasted.
"""

from __future__ import annotations


class Shape:
    """One pattern an angle can take.

    `instruction` is addressed to the model and says what to write. `example`
    shows the same shape instantiated for two unlike topics, because one
    example reads as a template to copy and two read as a pattern to apply.
    """

    __slots__ = ("key", "label", "instruction", "example", "collides_with")

    def __init__(
        self,
        key: str,
        label: str,
        instruction: str,
        example: str,
        collides_with: str = "",
    ) -> None:
        self.key = key
        self.label = label
        self.instruction = instruction
        self.example = example
        # Shapes sharing a group return the same places for the same reason.
        # At most one of a group may be chosen.
        self.collides_with = collides_with

    def __repr__(self) -> str:  # pragma: no cover -- diagnostics only
        return f"Shape({self.key!r})"


SHAPES: tuple[Shape, ...] = (
    # --- prestige: these four find the same short list in every city ---------
    Shape(
        "world-renowned",
        "World renowned",
        "The ones known outside the country. International lists, foreign press.",
        "ceviche: cevicherias that appear on world's-best restaurant lists | "
        "pizza: pizzerias written up in the international food press",
        collides_with="prestige",
    ),
    Shape(
        "luxury",
        "The splurge",
        "The expensive end. What people book for an anniversary.",
        "ceviche: expensive cevicherias people save up for | "
        "hotels: the most expensive hotels in the city",
        collides_with="prestige",
    ),
    Shape(
        "award",
        "Award listed",
        "Formally recognised by a guide, award or national body.",
        "ceviche: cevicherias that have won a national restaurant award | "
        "pizza: AVPN-certified pizzerias",
        collides_with="prestige",
    ),
    Shape(
        "the-experience",
        "The set experience",
        "Booked in advance, fixed format, you sit down for the whole thing.",
        "ceviche: cevicherias serving a tasting menu | "
        "bars: bars with a reservation-only cocktail programme",
        collides_with="prestige",
    ),
    # --- heritage: the old one and the first one are usually one place -------
    Shape(
        "institution",
        "Local institution",
        "Open for decades. Predates whatever is fashionable now. Say 'decades',"
        " never a specific number of years -- a number empties the search.",
        "ceviche: cevicherias that have been open for decades | "
        "hotels: hotels that have been operating for decades",
        collides_with="heritage",
    ),
    Shape(
        "origin",
        "Where it started",
        "The place credited with starting this locally, or with one dish"
        " everyone else now copies.",
        "ceviche: the cevicheria credited with starting Lima's ceviche boom | "
        "pizza: the pizzeria credited with inventing the local style",
        collides_with="heritage",
    ),
    # --- humble: cheap, hidden and informal are close but not the same -------
    Shape(
        "hidden",
        "Hard to find",
        "No sign, no listing, someone's front room, known by word of mouth.",
        "ceviche: unmarked huariques serving ceviche that locals know by word"
        " of mouth | bars: unmarked bars behind another business",
        collides_with="humble",
    ),
    Shape(
        "cheap",
        "Cheap and good",
        "Very cheap, and rated highly anyway. Price is the point.",
        "ceviche: very cheap cevicherias that people rate highly | "
        "hotels: very cheap places to stay that people rate highly",
        collides_with="humble",
    ),
    Shape(
        "informal",
        "Stall, counter or market",
        "Not a restaurant. A stall, a counter, a stand, a spot in a market.",
        "ceviche: ceviche stalls inside the city's markets | "
        "pizza: pizza served by the slice from a counter",
        collides_with="humble",
    ),
    # --- standalone: none of these answer each other -------------------------
    Shape(
        "new-wave",
        "Just opened",
        "Opened in the last year. Nothing else -- no buzz clause, no quality"
        " clause. Adding one is what found a single place instead of eight.",
        "ceviche: cevicherias that opened in the last year | "
        "hotels: hotels that opened in the last year",
    ),
    Shape(
        "purist",
        "The orthodox version",
        "Does it the traditional way and refuses to vary it.",
        "ceviche: cevicherias serving classic ceviche with no fusion | "
        "pizza: pizzerias doing only wood-fired Neapolitan",
    ),
    Shape(
        "crossed",
        "Crossed with something else",
        "The same thing put through another cuisine, culture or technique.",
        "ceviche: nikkei cevicherias doing Japanese-Peruvian preparations | "
        "pizza: pizzerias doing a non-Italian style",
    ),
    Shape(
        "one-thing",
        "Known for one thing",
        "Famous for a single item and little else.",
        "ceviche: places known above all for their leche de tigre | "
        "wings: places famous for one sauce",
    ),
    Shape(
        "insider",
        "Where the trade goes",
        "Where people who work in this field eat, drink or stay themselves.",
        "ceviche: where Lima chefs say they eat ceviche on their days off | "
        "bars: where bartenders drink after their shift",
    ),
    Shape(
        "family",
        "Family run",
        "Run by one family, often across generations.",
        "ceviche: cevicherias run by the same family for more than one"
        " generation | hotels: guesthouses run by the family who own them",
    ),
    Shape(
        "setting",
        "For the room or the view",
        "Chosen for where you sit rather than what you get.",
        "ceviche: cevicherias people go to for the view of the sea | "
        "bars: rooftop bars people go to for what they can see",
    ),
    Shape(
        "hours",
        "Defined by when",
        "Only exists at one time of day. Lunch only, late night, breakfast.",
        "ceviche: lunch-only cevicherias that close when the fish runs out | "
        "bars: places busiest after most bars have closed",
    ),
    Shape(
        "district",
        "One neighbourhood's own",
        "The place people in one specific district go to, that visitors miss.",
        "ceviche: cevicherias that one Lima neighbourhood keeps to itself | "
        "hotels: places chosen for the street they are on",
    ),
)

SHAPES_BY_KEY: dict[str, Shape] = {shape.key: shape for shape in SHAPES}


def shape_menu() -> str:
    """The catalogue as the model is shown it."""
    lines: list[str] = []
    for shape in SHAPES:
        group = f"  [group: {shape.collides_with}]" if shape.collides_with else ""
        lines.append(f"{shape.key} -- {shape.label}{group}")
        lines.append(f"    write: {shape.instruction}")
        lines.append(f"    e.g.  {shape.example}")
    return "\n".join(lines)


def collision_groups() -> str:
    """The groups, named, so the rule can be stated rather than implied."""
    groups: dict[str, list[str]] = {}
    for shape in SHAPES:
        if shape.collides_with:
            groups.setdefault(shape.collides_with, []).append(shape.key)
    return "\n".join(
        f"- {name}: {', '.join(keys)}" for name, keys in sorted(groups.items())
    )


def suggested_angle_count(target_items: int) -> int:
    """How many angles a list of this length gets built from.

    Roughly seven items per angle. A short list wants few angles asked hard; a
    long one cannot be filled from a handful and needs the spread. Capped at
    the number of shapes that can actually be chosen together -- an angle with
    no places behind it is a search that returns nothing and a slot that
    becomes padding.
    """
    if target_items <= 8:
        return 2
    if target_items <= 15:
        return 3
    return max(4, min(10, round(target_items / 7)))
