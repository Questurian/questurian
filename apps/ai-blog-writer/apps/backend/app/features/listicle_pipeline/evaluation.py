"""The commissions the angle system is judged on, and how a case is scored.

The plan of 2026-09-08 asks for a small, varied set of cases rather than more
of what already exists. Every interview this pipeline has ever run -- all six
of them -- was about Lima cevicherias, and the database copied for the audit
had no saved search results at all. Six interviews about one dish in one city
are not a baseline for a catalogue that has to serve bars and hotels.

Two halves, deliberately separated:

**What can be checked without spending anything.** Whether a hotel commission
is offered hotel dimensions, whether a narrow requirement survives into every
search, whether an order of narrow angles admits it may not fill the list.
These are properties of the catalogue and the order, they are checked by the
test suite, and they need no model and no network.

**What cannot.** Whether the angles find better places. That needs real
searches against real money, and the plan is explicit that it must not be run
until identity handling and result recording are trustworthy -- otherwise the
measurements are measuring the bug. `scripts/listicle_angle_comparison.py`
runs it, refuses to run without an explicit spend acknowledgement, and has not
been run.

Nothing in this module claims a case has been evaluated. It says what the case
is and what would count as passing it.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Case:
    """One commission, and what a good answer to it looks like.

    `must_offer` and `must_not_offer` are catalogue keys, checkable in code.
    `must_survive` are requirements that have to reach every search whatever
    angle found the place -- also checkable in code, because the requirements
    are composed into the prompt rather than written into the angles.

    `judged_by` is the part a person has to read. It is written down so the
    criteria are fixed before any paid run, rather than chosen afterwards to
    flatter whichever result came back.
    """

    key: str
    seed: str
    kind: str
    subject: str
    target_count: int
    standard: str = ""
    exclusions: str = ""
    must_offer: tuple[str, ...] = ()
    must_not_offer: tuple[str, ...] = ()
    must_survive: tuple[str, ...] = ()
    judged_by: tuple[str, ...] = ()
    note: str = ""


CASES: tuple[Case, ...] = (
    Case(
        key="broad-restaurants",
        seed="The 30 best restaurants in Lima",
        kind="restaurants",
        subject="restaurants",
        target_count=30,
        standard="written about by someone other than the restaurant",
        must_offer=("institution", "cheap", "regional-tradition", "informal"),
        judged_by=(
            "Does the mix reach past the same six prestigious names every "
            "list in the city already has?",
            "How many of the returned places appear on no international list?",
        ),
    ),
    Case(
        key="specialist-restaurants",
        seed="The 20 best cevicherias in Lima",
        kind="cevicherias",
        subject="restaurants",
        target_count=20,
        exclusions="general restaurants where ceviche is one line on the menu",
        must_offer=("regional-tradition", "producer-links", "hours"),
        must_survive=("general restaurants where ceviche is one line on the menu",),
        judged_by=(
            "Do the angles add variety without drifting off the specialty?",
            "Does the exclusion hold in every search, or only in the one that "
            "mentions it?",
        ),
        note=(
            "The only commission this pipeline has real history with. The first "
            "run's Nikkei search returned four general restaurants because "
            "nothing carried the exclusion out of the interview."
        ),
    ),
    Case(
        key="broad-bars",
        seed="The 25 best bars in Lima",
        kind="bars",
        subject="bars",
        target_count=25,
        must_offer=("drink-specialty", "local-drinking", "service-format", "setting"),
        must_not_offer=("informal", "regional-tradition"),
        judged_by=(
            "Are price, format, setting and local drinking traditions treated "
            "as different things rather than four words for 'good bar'?",
        ),
    ),
    Case(
        key="narrow-bars",
        seed="The 15 best rooftop bars in Lima",
        kind="rooftop bars",
        subject="bars",
        target_count=15,
        standard="an actual roof terrace open to guests",
        must_survive=("an actual roof terrace open to guests",),
        judged_by=(
            "Does every returned place actually have a roof terrace?",
            "Does any angle spend itself restating 'rooftop', which every "
            "search already carries?",
        ),
    ),
    Case(
        key="broad-hotels",
        seed="The 30 best hotels in Lima",
        kind="hotels",
        subject="hotels",
        target_count=30,
        must_offer=("lodging-format", "building-character", "transport-access"),
        must_not_offer=("informal", "crossed", "hours"),
        judged_by=(
            "Does the catalogue reach for lodging dimensions, or for the "
            "restaurant ones with the nouns changed?",
        ),
    ),
    Case(
        key="narrow-hotels",
        seed="20 independent hotels in Lima suitable for longer stays",
        kind="independent hotels",
        subject="hotels",
        target_count=20,
        standard="independently owned, and set up for stays of a week or more",
        exclusions="chains and international groups",
        must_offer=("long-stay", "lodging-format"),
        must_survive=(
            "independently owned, and set up for stays of a week or more",
            "chains and international groups",
        ),
        judged_by=(
            "Do independence and long-stay survive every search, or does one "
            "optional angle carry the whole commission?",
        ),
        note="The worked example in the plan of 2026-09-08.",
    ),
    Case(
        key="sparse-location",
        seed="The 20 best cevicherias in Huaraz",
        kind="cevicherias",
        subject="restaurants",
        target_count=20,
        judged_by=(
            "Does the system accept a genuinely small pool and report the "
            "shortfall, or invent volume to reach the number?",
            "Does the interview warn about the count before the searches run?",
        ),
        note=(
            "A mountain city three hundred kilometres from the sea. The right "
            "answer is a short list and a warning."
        ),
    ),
    Case(
        key="operator-edited",
        seed="The 20 best cevicherias in Lima",
        kind="cevicherias",
        subject="restaurants",
        target_count=20,
        judged_by=(
            "Is a narrowing the operator wrote on purpose still in the search "
            "that runs, word for word?",
            "Is an angle they wrote themselves treated as theirs rather than "
            "re-filed under the nearest catalogue shape?",
        ),
        note=(
            "Run by editing two lines in the picker before approving. The "
            "system must explain the likely effect on breadth and not repair "
            "the intent."
        ),
    ),
)

CASES_BY_KEY: dict[str, Case] = {case.key: case for case in CASES}


# What has to be reported, separately, whenever a comparison is run. Listed
# here so a run cannot quietly report only the flattering half.
REPORTED_OUTCOMES: tuple[tuple[str, str], ...] = (
    ("eligibility", "how many checked candidates fit the requirements and the angle"),
    ("coverage", "how many suitable distinct venues the whole pool holds, and what is missing"),
    ("contribution", "which angles supply otherwise-missed candidates, and what they share"),
    ("identity_errors", "false merges and unresolved duplicates, counted separately"),
    ("wording_drift", "unrequested restrictions added, and requirements silently broadened"),
    ("operator_effort", "edits, confusing choices, repeated questions, recovery actions"),
    ("spend", "input and output usage, provider cost where available, latency, retries"),
)


@dataclass
class CaseReport:
    """One case's result. Every field starts empty and stays empty until a run
    fills it: an unmeasured outcome must read as unmeasured, not as zero."""

    case_key: str
    outcomes: dict[str, str] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def unreported(self) -> list[str]:
        return [name for name, _ in REPORTED_OUTCOMES if name not in self.outcomes]
