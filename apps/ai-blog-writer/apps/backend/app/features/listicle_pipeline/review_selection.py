"""Which reviews are worth the space, and in which words to ask for them.

Buying twenty reviews and handing all twenty to the extraction is not research,
it is shovelling. Most of any twenty Google reviews are about the parking, the
music and the service; a list about chicken wings is written from the six that
are about chicken wings. Something has to choose, and until this module existed
nothing did -- the reviews went into the prompt in the order the API returned
them and were truncated at the first twelve thousand characters, which meant
the material that decided what got written was whatever happened to be near the
top.

Two jobs, and they are different.

**Which words to ask for.** The API can filter reviews by text, but only if it
is told what the subject is called *where the reviews were written*. This list's
topic is "chicken wings" and every review of it is in Spanish. Asking Google for
"chicken wings" finds almost nothing; asking for "alitas" finds the lot.

Nothing translates it. The words come from the run's own stored search
evidence -- the sentences that put these places on the board in the first place.
Across run `efd5a7cd` those sentences say `alitas` for sixty-five of the
twenty-two candidates, `wings` for sixteen and `salsas` for eight, well clear of
the noise. That is a measurement of how this subject is actually written about,
taken from data the run already paid for, and it costs no model call and no
translation table that would be wrong for the next city.

**Which reviews to keep.** Scored and ranked here rather than left to the
extraction, because the extraction never sees the ones that did not fit. A
review that mentions the subject beats one that does not; a review with
something in it beats a sentence; a reviewer with four hundred reviews behind
them beats an account with one. Nothing is deleted -- the count and the reason
travel with the page, so a thin result reads as "this place has six reviews
about wings" rather than as a mystery.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.core.database import get_db_connection

# Words that carry no subject. Both languages, because the board's own evidence
# is written in both and a list's topic may be phrased in either.
_STOPWORDS = set(
    """
    de la el los las un una unos unas y o en con por para del al que se es son
    su sus mas más muy lo le como pero si no sin sobre entre desde hasta cuando
    donde este esta estos estas ese esa eso aqui aquí alli allí hay han ser
    estar tiene tienen puede pueden todo todos toda todas otro otra otros otras
    bien mejor mejores buena bueno buenas buenos gran grande lugar lugares
    the of and in for to with is are at on best top its it this that from you
    your we our they their there here what when where which while also more
    most very much some any all can will has have had been being about into
    over under after before then than them these those such only just even
    open until offers offer serves serve located

    # Calendar words. A run's evidence is full of "desde agosto" and "since
    # 2019", and on document frequency alone `agosto` outranks real subject
    # words -- which would then mark any review mentioning August as on-topic.
    enero febrero marzo abril mayo junio julio agosto septiembre setiembre
    octubre noviembre diciembre
    january february march april june july august september october november
    december
    lunes martes miercoles miércoles jueves viernes sabado sábado domingo
    monday tuesday wednesday thursday friday saturday sunday
    """.split()
)

# A term has to be said about several different places before it counts as this
# list's subject. "alitas" appears under sixty-five candidates; the name of one
# bar appears under one. This threshold is what separates the two without
# needing a list of names to exclude.
MIN_CANDIDATES = 3

# And it has to be in the same league as the word that dominates. On run
# `efd5a7cd` the counts run alitas 65, wings 16, salsas 8, sede 6 -- and `sede`
# is Spanish for "branch", a word about premises rather than about wings. A
# fixed cut-off cannot tell those apart across runs; a floor set as a share of
# the top term can, because the gap between a subject word and background
# chatter is proportional rather than absolute.
NOISE_FLOOR_SHARE = 0.1

# How many terms are carried. The API's filter takes one string, and the local
# scoring reads them all; past four the tail is noise.
MAX_TERMS = 4

# The only hard filter. Below this a review is "Muy bueno" -- a rating with
# punctuation, with no passage a check could stand on.
#
# It is deliberately the ONLY one. An earlier version of this module also threw
# away any review under eighty characters that did not mention a subject term,
# and that was a bug with teeth: the terms are *derived*, so when they are
# narrow or wrong the filter deletes real material and the page vanishes
# entirely. A wings review reading "las alitas estaban con mal sabor" would be
# destroyed by terms that happened to come out as `pollo, salsas`.
#
# So subject and substance decide the ORDER, never survival. The page budget
# does the cutting, and what it cuts is whatever ranked last -- which is a
# statement about crowding, not a judgement that a review was worthless.
MIN_USABLE_CHARS = 25

# Long enough to be saying something rather than reacting. Used only to rank
# reviews that do not mention the subject against each other.
SUBSTANTIAL_CHARS = 80


def subject_terms(run_id: str, *, topic_label: str = "") -> list[str]:
    """The words this run's own searches use for its subject, commonest first.

    Read-only and deterministic. A run with no stored search evidence falls
    back to the topic's own words, and a run with neither returns `[]` -- a
    real answer, on which the caller buys unfiltered reviews and the ranking
    falls back to substance and standing rather than guessing at a subject.
    """
    # Document frequency, not raw count: a term repeated ten times under one
    # candidate is that candidate's obsession, not the list's subject.
    seen_per_text: dict[str, int] = {}
    for text in _evidence_texts(run_id):
        for word in set(re.findall(r"[a-záéíóúñü]{4,}", text.lower())):
            if word not in _STOPWORDS:
                seen_per_text[word] = seen_per_text.get(word, 0) + 1

    top = max(seen_per_text.values(), default=0)
    floor = max(MIN_CANDIDATES, top * NOISE_FLOOR_SHARE)
    ranked = sorted(
        ((word, count) for word, count in seen_per_text.items() if count >= floor),
        key=lambda pair: (-pair[1], pair[0]),
    )
    terms = [word for word, _ in ranked[:MAX_TERMS]]

    # The topic's own words, when the board has them and the evidence did not.
    # Kept last: what the reviews actually say beats what the list calls itself.
    for word in re.findall(r"[a-záéíóúñü]{4,}", topic_label.lower()):
        if word not in _STOPWORDS and word not in terms and len(terms) < MAX_TERMS:
            terms.append(word)
    return terms


def _evidence_texts(run_id: str) -> list[str]:
    """Every `evidence` sentence this run's searches returned.

    One string per sighting. The structure is walked rather than indexed
    because the payload's shape belongs to the search stage and has moved
    before; a missing key here must degrade to "no terms", never raise.
    """
    try:
        with get_db_connection() as conn:
            row = conn.execute(
                "SELECT payload FROM listicle_search_results WHERE run_id = ?",
                (run_id,),
            ).fetchone()
    except Exception:  # pragma: no cover -- defensive
        return []
    if row is None:
        return []
    try:
        payload = json.loads(row["payload"])
    except (TypeError, ValueError):  # pragma: no cover -- defensive
        return []

    found: list[str] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "evidence" and isinstance(value, str) and value.strip():
                    found.append(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    return found


@dataclass
class Selection:
    """The reviews that made it, and an honest account of the ones that did not.

    `dropped_*` are counts rather than a boolean, because "we kept six of
    twenty" and "there were only six" are different facts about a place and the
    page note has to be able to tell them apart.
    """

    kept: list[dict] = field(default_factory=list)
    terms: list[str] = field(default_factory=list)
    bought: int = 0
    silent: int = 0
    # Reviews with words, but too few of them to carry a passage. The only
    # thing this module refuses outright.
    too_short: int = 0
    off_topic_kept: int = 0
    dropped_for_space: int = 0

    @property
    def on_topic(self) -> int:
        return len(self.kept) - self.off_topic_kept


def mentions_subject(text: str, terms: list[str]) -> bool:
    if not terms:
        return False
    lowered = text.lower()
    return any(term in lowered for term in terms)


def score(review: dict, terms: list[str]) -> tuple:
    """How much this review is worth the space, highest first.

    A tuple rather than a number so the ordering is readable and so ties break
    on something meaningful instead of on dictionary order.

    Subject first: a review about the wings is the material this list is made
    of, and one about the parking is not, however well written. Then whether it
    is substantial, which separates an account of a meal from a reaction to
    one. Then standing -- an account with four hundred reviews behind it is not
    the same witness as one with a single review, and that difference is
    invisible in the text. Then length, to break the remaining ties.

    Note what is NOT here: nothing is excluded. A review that scores last still
    goes on the page if there is room for it. The terms are derived and can be
    wrong, and a wrong term must cost a review its place in the queue, never
    its existence.
    """
    text = str(review.get("review_text") or "")
    standing = 0
    count = review.get("author_review_count")
    if isinstance(count, int):
        standing += min(count, 400)
    level = review.get("author_local_guide_level")
    if isinstance(level, int):
        standing += level * 20
    return (
        1 if mentions_subject(text, terms) else 0,
        1 if len(text) >= SUBSTANTIAL_CHARS else 0,
        standing,
        len(text),
    )


def select(
    reviews: list[dict],
    *,
    terms: list[str],
    budget_chars: int,
    render,
) -> Selection:
    """Choose which reviews go into the page, best first, within the budget.

    `render` turns one review into the block that will appear on the page, so
    the budget is measured against what is actually spent rather than against
    the review text alone -- the header carrying the name, the date and the
    reviewer's standing is a third of a short block.

    Off-topic reviews fill the space the on-topic ones did not need. They are
    ranked last, not excluded: the extraction is told to ignore what is off
    subject, so they cost little, and keeping them means a run whose derived
    terms came out wrong still has material to work from instead of a page that
    silently disappeared.
    """
    bought = len(reviews)
    with_text = [
        review for review in reviews if str(review.get("review_text") or "").strip()
    ]
    silent = bought - len(with_text)

    long_enough = [
        review
        for review in with_text
        if len(str(review.get("review_text") or "").strip()) >= MIN_USABLE_CHARS
    ]
    too_short = len(with_text) - len(long_enough)

    ordered = sorted(long_enough, key=lambda review: score(review, terms), reverse=True)

    kept: list[dict] = []
    spent = 0
    dropped_for_space = 0
    for review in ordered:
        block = render(review)
        # The first one goes in whatever its length: an empty page reads as a
        # place nobody has reviewed, which would be a lie about the place.
        if kept and spent + len(block) + 2 > budget_chars:
            dropped_for_space += 1
            continue
        kept.append(review)
        spent += len(block) + 2

    off_topic_kept = sum(
        1
        for review in kept
        if not mentions_subject(str(review.get("review_text") or ""), terms)
    )
    return Selection(
        kept=kept,
        terms=list(terms),
        bought=bought,
        silent=silent,
        too_short=too_short,
        off_topic_kept=off_topic_kept,
        dropped_for_space=dropped_for_space,
    )
