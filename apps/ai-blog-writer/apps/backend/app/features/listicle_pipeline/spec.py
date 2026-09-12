"""Turning a finished interview into the order the searches run from.

The grill's `consensus` is prose, written to be read by a person. It is the
wrong thing to execute: a number parsed out of a sentence is a number that can
be parsed wrong, and silently. The first real run agreed on twenty items,
searched for forty, and nothing anywhere noticed.

The fix is not a better expression. `count_from` was already careful -- it
skipped years, it bounded the range -- and it still took 40 out of "20, not
40", because it took the largest plausible number it could see. No regular
expression interprets "yes" either, and "yes" is the most common answer to a
question that already carries its own recommendation.

So the decision is resolved once, here, against what was actually proposed, and
written down on a `SearchOrder`. What the screen shows and what the searches run
are then the same object rather than two readings of the same paragraph.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from ..prompt2blog.contracts_v4 import GrillState
from .contracts import InterviewBaseline, SearchOrder, SelectedAngle
from .contracts import ANGLE_ROLES
from .search import BROAD, DISTINCTIVE, role_allowances
from .shapes import SHAPES_BY_KEY, resolve_subject

# A list length. Small on purpose: this is what keeps a price, a year and a
# street number out of the count.
_MIN_COUNT = 3
_MAX_COUNT = 200

# "20, not 40" and "not 40, 20". Both were said in real interviews and both
# used to resolve to 40.
_CORRECTION_FIRST = re.compile(
    r"\b(\d{1,3})\b[\s,;]*(?:not|instead of|rather than|and not)\s+\b\d{1,3}\b",
    re.IGNORECASE,
)
_CORRECTION_SECOND = re.compile(
    r"\bnot\s+\d{1,3}\b[\s,;]*(?:but\s+|make it\s+|use\s+)?\b(\d{1,3})\b",
    re.IGNORECASE,
)
# A number that is a count rather than a price, a year or a percentage.
_PLAIN_NUMBER = re.compile(r"(?<![\d$€£%.,/-])\b(\d{1,3})\b(?![\d%]|\s*(?:soles|usd|dollars|euros))")

_LIST_MARKER = re.compile(r"^\s*(?:[-*•·–—]+|\(?\d{1,2}\s*[.)\]]|#\d{1,2})\s+")


@dataclass
class CountDecision:
    """How many items, and how sure the pipeline is that it read it right."""

    value: int
    source: str
    ambiguous: bool = False
    note: str = ""


def _turn_for(state: GrillState, marker: str):
    """The last exchange about one marker.

    Last rather than first for the things a repeat is *about* -- the question
    that was asked, the menu it offered -- which is what `selected_angles` and
    `resolve_count` read it for. What the marker is *worth* does not come from
    here; see `resolve_answer`.
    """
    for turn in reversed(state.turns):
        if turn.question.asks_about == marker:
            return turn
    return None


def _turns_for(state: GrillState, marker: str) -> list:
    """Every exchange about one marker, in the order they were asked."""
    return [turn for turn in state.turns if turn.question.asks_about == marker]


# Markers whose second answer adds to the first instead of replacing it.
#
# `bar` and `cut` are prose criteria, and the grill's repeat about them is an
# additive follow-up: run 292e71e3 settled the cut, then asked "are there any
# other types of establishments ... you would like to exclude?" and
# recommended "No hotel restaurants." Taking the last answer there throws away
# chains, delivery-only and ceviche-not-primary, and the run looks entirely
# normal while searching under a quarter of the operator's exclusions.
#
# Everything else replaces, deliberately. `kind` and `place` are single nouns
# and a second one is a correction. `angles` arrives from the picker as the
# complete current selection, so un-ticking a box already IS the explicit
# replace -- accumulating there would put back the angle the operator just
# dropped, and each angle is a paid search. `count` is resolved on its own in
# `resolve_count`, against the number that was proposed.
_ACCUMULATING_MARKERS = frozenset({"bar", "cut"})

# Where one criterion ends and the next begins. Deliberately generous: this
# only ever decides whether a later answer already SAYS what an earlier one
# said, and splitting too finely makes that test stricter, which errs towards
# keeping both.
_CLAUSE = re.compile(r"[\n;,.]+|\band\b|\bor\b|\balso\b|\bplus\b", re.IGNORECASE)
# Words that carry no criterion. "no chains" and "chains" have to match, or a
# restated exclusion list reads as a new one and every rule is stored twice.
_NOT_CONTENT = frozenset(
    {
        "the", "a", "an", "any", "all", "no", "not", "none", "nor", "but",
        "and", "or", "also", "plus", "with", "without", "for", "from", "of",
        "in", "on", "at", "to", "by", "as", "is", "are", "was", "were", "be",
        "been", "it", "its", "that", "this", "these", "those", "where",
        "which", "who", "what", "when", "than", "then", "there", "they",
        "them", "would", "should", "like", "want", "wants", "other", "others",
        "else", "more", "only", "just", "very", "really", "sure", "yes",
    }
)


def _content_words(text: str) -> set[str]:
    """The words in a phrase that say something about the world."""
    return {
        word
        for word in _words(text)
        if len(word) > 2 and word not in _NOT_CONTENT
    }


def _restates(earlier: str, later: str) -> bool:
    """Does `later` already say everything `earlier` said?

    This is the whole difference between a correction and an addition, and it
    is decided from the two answers rather than from the question's wording,
    because the wording is the model's and the answers are the operator's.

    The test is deliberately strict: every clause of the earlier answer has to
    survive whole in the later one. A partial overlap -- three rules restated
    and a fourth quietly gone -- reads as an addition and both are kept, which
    over-restricts a search rather than silently widening it. Of the two ways
    to be wrong, only one is invisible.
    """
    later_words = _words(later)
    clauses = [
        content
        for content in (_content_words(part) for part in _CLAUSE.split(earlier))
        if content
    ]
    if not clauses:
        # The earlier answer had nothing checkable in it -- "yes, that" and
        # friends. Nothing to lose by taking the later one.
        return True
    return all(clause <= later_words for clause in clauses)


@dataclass
class AnswerDecision:
    """What a marker is worth, and how more than one answer got there.

    `source` is one of: `missing`, `single`, `restated` (a later answer said
    everything the earlier one said, so the later one stands), `combined` (two
    answers said different things and both are used) or `replaced` (a marker
    that only ever takes one value was answered twice).
    """

    text: str
    source: str
    note: str = ""

    @property
    def revisited(self) -> bool:
        """Was this marker answered more than once in a way worth showing?"""
        return self.source in ("combined", "replaced")


def _times(count: int) -> str:
    return "twice" if count == 2 else f"{count} times"


def _joined(parts: list[str]) -> str:
    """Several answers read as one instruction.

    Terminated, because these are pasted straight into a search prompt as one
    line and "no chains no hotel restaurants" is a different sentence from
    "no chains. No hotel restaurants."
    """
    return " ".join(
        part if part.endswith((".", "!", "?")) else part + "."
        for part in parts
    )


def resolve_answer(state: GrillState, marker: str) -> AnswerDecision:
    """What one marker is worth, across every turn that answered it.

    The bug this replaces: the value was read from the LAST turn that settled
    a marker, so an additive follow-up silently deleted the earlier answer.
    The run that hit it looked entirely normal.

    Neither engine nor prompt can fix that. Refusing to show the repeated
    question trades silent data loss for a stuck interview, and the engine
    already retries once and then shows it anyway on purpose. So the decision
    is made here, from the answers themselves, and it is written down.
    """
    answers = [
        turn.answer.strip()
        for turn in _turns_for(state, marker)
        if turn.answer.strip()
    ]
    if not answers:
        return AnswerDecision("", "missing")
    if len(answers) == 1:
        return AnswerDecision(answers[0], "single")

    if marker not in _ACCUMULATING_MARKERS:
        latest = answers[-1]
        lost = [earlier for earlier in answers[:-1] if not _restates(earlier, latest)]
        if not lost:
            return AnswerDecision(latest, "restated")
        return AnswerDecision(
            latest,
            "replaced",
            note=(
                f"This was answered {_times(len(answers))} and the last answer "
                "is the one being used. The earlier one said: " + _joined(lost)
            ),
        )

    kept: list[str] = []
    for answer in answers:
        if kept and _restates(_joined(kept), answer):
            # They retyped the whole thing. Keeping both would say every rule
            # twice; the later wording is theirs and is the one to keep.
            kept = [answer]
        else:
            kept.append(answer)
    if len(kept) == 1:
        return AnswerDecision(kept[0], "restated")
    return AnswerDecision(
        _joined(kept),
        "combined",
        note=(
            f"This was answered {_times(len(kept))} and every answer is being "
            "used. Correct it here if one of them was meant to replace the "
            "others."
        ),
    )


def _answer_for(state: GrillState, marker: str) -> str:
    return resolve_answer(state, marker).text


def _counts_in(text: str) -> list[int]:
    return [
        n
        for n in (int(m) for m in _PLAIN_NUMBER.findall(text))
        if _MIN_COUNT <= n <= _MAX_COUNT
    ]


def resolve_count(state: GrillState, default: int = 20) -> CountDecision:
    """How many items the list is aiming at, and where that came from.

    Four cases, in the order they are trusted:

    1. The answer corrects a number -- "20, not 40". The correction wins.
    2. The answer carries exactly one number. That is the number.
    3. The answer carries no number at all. "Yes, that's right" is a perfectly
       good answer to "is 40 the number?", and the number it agrees to is the
       recommendation the question arrived with -- not the largest number
       anywhere in the transcript.
    4. The answer carries several numbers and none of them is a correction.
       This is genuinely ambiguous. A number is still chosen so the run is not
       stuck, the first one because it is the conservative read, and the
       decision is marked so the screen can ask.
    """
    turn = _turn_for(state, "count")
    if turn is not None:
        answer = turn.answer.strip()
        for pattern in (_CORRECTION_FIRST, _CORRECTION_SECOND):
            found = pattern.search(answer)
            if found:
                value = int(found.group(1))
                if _MIN_COUNT <= value <= _MAX_COUNT:
                    return CountDecision(value, "corrected")
        numbers = _counts_in(answer)
        if len(numbers) == 1:
            return CountDecision(numbers[0], "answered")
        if not numbers:
            # They agreed to what was proposed. Read the proposal, not the
            # transcript: the seed may carry a number the interview talked them
            # out of, and taking that one silently reverses the conversation.
            proposed = _counts_in(turn.question.recommendation) or _counts_in(
                turn.question.ask
            )
            if proposed:
                return CountDecision(proposed[0], "accepted")
        if numbers:
            return CountDecision(
                numbers[0],
                "answered",
                ambiguous=True,
                note=(
                    "The answer mentioned "
                    + ", ".join(str(n) for n in numbers)
                    + ". Read as "
                    + str(numbers[0])
                    + " -- correct it if that is wrong."
                ),
            )

    seed_numbers = _counts_in(state.seed)
    if seed_numbers:
        return CountDecision(
            seed_numbers[0],
            "seed",
            ambiguous=len(seed_numbers) > 1,
            note=(
                "Read off the title; the interview never settled a number."
                if len(seed_numbers) == 1
                else "The title mentions several numbers and the interview settled none."
            ),
        )
    return CountDecision(
        default,
        "default",
        ambiguous=True,
        note="Nothing in the interview or the title said how many.",
    )


def count_from(state: GrillState, default: int = 20) -> int:
    """The count alone, for callers that only need the number."""
    return resolve_count(state, default).value


def _clean_line(line: str) -> str:
    return _LIST_MARKER.sub("", line, count=1).strip().strip("*_ ").strip()


def angle_lines(state: GrillState) -> list[str]:
    """The agreed angles, one per line, in the order they were chosen."""
    raw = _answer_for(state, "angles")
    return [
        cleaned
        for cleaned in (_clean_line(line) for line in raw.splitlines())
        if cleaned
    ]


# Kept under its old name: `service` and the tests both call it, and the lines
# are what they wanted.
angles_from = angle_lines


# What a headline puts around the searchable noun. Stripped, in this order,
# when the interview never asked about `kind` -- which is the normal case and
# the good one: the prompt tells it not to spend a turn confirming what the
# operator just typed.
_SEED_ARTICLE = re.compile(r"^\s*(?:the|a|an)\s+", re.IGNORECASE)
_SEED_COUNT = re.compile(r"^\s*\d{1,3}\s+")
_SEED_SUPERLATIVE = re.compile(
    r"^\s*(?:best|top|greatest|finest|essential|ultimate|coolest|must[- ]visit|"
    r"must[- ]try|unmissable|favourite|favorite)\s+",
    re.IGNORECASE,
)
# What is left when a headline had no noun in it to begin with.
_NOT_A_NOUN = {
    "best", "top", "greatest", "finest", "essential", "ultimate", "coolest",
    "the", "a", "an", "places", "place", "spots", "spot",
}
# Where the noun ends and the location begins.
_SEED_LOCATION = re.compile(r"\s+(?:in|around|near|across|of)\s+", re.IGNORECASE)


def searchable_kind(seed: str) -> str:
    """The searchable noun inside a headline.

    "The 40 best cevicherias in Lima" is a title, not a noun, and sending it as
    one puts "40 best" into every search -- the SEO phrase the interview is
    told never to treat as a criterion, pushed into the one place it cannot be
    argued with. A real run on 2026-09-08 reached the search step with
    `kind` set to the whole seed, because the interview had correctly declined
    to spend a turn confirming a word the operator had already typed.

    Leading count, article and superlative come off; everything from the first
    location preposition is dropped. A seed that reduces to nothing keeps its
    original text, because a wrong noun is better than no noun.
    """
    text = seed.strip()
    for _ in range(3):
        # Twice around, because "The 40 best" and "The best 40" both occur and
        # neither order can be assumed.
        for pattern in (_SEED_ARTICLE, _SEED_COUNT, _SEED_SUPERLATIVE):
            text = pattern.sub("", text, count=1)
    head = _SEED_LOCATION.split(text, maxsplit=1)[0].strip(" ,.:;-")
    # A head that is nothing but headline furniture is not a noun. "The 40
    # best" reduces to "best", and searching for "best" is worse than searching
    # for the title it came from.
    if not head or head.lower() in _NOT_A_NOUN:
        return seed.strip()
    return head


def kind_from(state: GrillState) -> str:
    """The searchable noun.

    Falls back to the seed with its headline furniture removed, rather than to
    the raw seed. Everything downstream searches with this word.
    """
    return _answer_for(state, "kind") or searchable_kind(state.seed)


def place_from(state: GrillState) -> str:
    """Where to search.

    The seed is the last resort and is stripped the same way, so a run whose
    location was never recorded searches "Lima" rather than the whole headline.
    """
    answered = _answer_for(state, "place") or state.location
    if answered:
        return answered
    tail = _SEED_LOCATION.split(state.seed.strip(), maxsplit=1)
    return (tail[1].strip(" ,.:;-") if len(tail) > 1 else state.seed).strip()


def standard_from(state: GrillState) -> str:
    return _answer_for(state, "bar")


def exclusions_from(state: GrillState) -> str:
    return _answer_for(state, "cut")


# How a revisited marker is said to a person. The marker keys are the
# pipeline's; nobody wants to read "cut" on a screen.
_MARKER_NAMES = {
    "kind": "what kind of place",
    "place": "where",
    "count": "how many",
    "bar": "what earns a place",
    "cut": "what is left out",
    "angles": "the angles",
}


def answer_notes(state: GrillState) -> list[str]:
    """What to say about every marker the interview answered twice.

    Empty for an interview that asked each thing once, which is the normal
    case and the one worth staying quiet about.
    """
    notes: list[str] = []
    for marker in _MARKER_NAMES:
        if marker == "count":
            # The count carries its own note, resolved against the number that
            # was proposed rather than against the earlier answer's words.
            continue
        decision = resolve_answer(state, marker)
        if decision.revisited and decision.note:
            notes.append(f"{_MARKER_NAMES[marker].capitalize()}: {decision.note}")
    return notes


def drop_note_for(notes: list[str], marker: str) -> list[str]:
    """The notes that still apply once the operator has corrected one marker.

    A note about the cut is a question -- "both answers are being used, is that
    what you meant?" -- and typing the cut out by hand answers it. Leaving it
    on screen afterwards would ask again about a value nobody inferred.
    """
    prefix = f"{_MARKER_NAMES.get(marker, marker).capitalize()}:"
    return [note for note in notes if not note.startswith(prefix)]


def _fold(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]+", " ", folded)).strip()


def _words(text: str) -> set[str]:
    return set(_fold(text).split())


def _closest_option(line: str, options: list) -> tuple[object | None, bool]:
    """The menu entry a line came from, and whether it was changed.

    Exact first, which is the normal case -- the picker sends the option's own
    text back. Then a similarity match, which is how an edited line keeps its
    lineage: knowing that this was the `new-wave` option before the operator
    narrowed it is worth having, as long as nothing then treats the shape's
    opinion about overlap as still true. That is what `edited` is for.
    """
    folded = _fold(line)
    for option in options:
        if _fold(option.text) == folded:
            return option, False
    line_words = _words(line)
    if not line_words:
        return None, True
    best, best_score = None, 0.0
    for option in options:
        option_words = _words(option.text)
        if not option_words:
            continue
        shared = len(line_words & option_words)
        score = shared / max(1, min(len(line_words), len(option_words)))
        if score > best_score:
            best, best_score = option, score
    # Two thirds of the shorter line's words. Below that it is a different
    # search that happens to be about the same city.
    return (best, True) if best_score >= 0.66 else (None, True)


def _role_for(shape_key: str, fallback: str = DISTINCTIVE) -> str:
    shape = SHAPES_BY_KEY.get(shape_key)
    return shape.role if shape else fallback


def _checked_role(claimed: str, shape_key: str) -> str:
    """The role this angle runs under.

    A role the model chose is kept, because how hard to ask an angle is a
    judgement about this topic in this city and the model is the one looking at
    it. A role that is not one of the three is not a judgement, it is noise,
    and the catalogue answers instead.
    """
    return claimed if claimed in ANGLE_ROLES else _role_for(shape_key)


def _theme_for(shape_key: str, claimed: str) -> str:
    """A shape's theme, from the catalogue rather than from the model.

    The model was asked for the theme and sent the shape's LABEL on one turn
    and its KEY on the next -- both real values, neither the theme. Since the
    screen groups by this field to warn about two angles that collide, every
    option landed in a group of one and the warning could never fire.

    Code holds catalogue metadata; the model writes the wording. An angle whose
    shape is unknown keeps whatever it was given, because there is nothing to
    look up.
    """
    shape = SHAPES_BY_KEY.get(shape_key)
    return shape.theme if shape else claimed


def selected_angles(
    state: GrillState, selections: list[dict] | None = None
) -> list[SelectedAngle]:
    """The approved searches, each still knowing what it is.

    `selections` is what the picker sent alongside the answer: the option each
    line came from, and whether it was edited. It is authoritative when it is
    there, because the screen knows what the operator did and this module can
    only infer it.

    Without it -- an interview answered as plain text, or one from before the
    picker sent anything -- the lines are matched back against the menu the
    question offered. That inference is where `edited` comes from, and an
    inferred lineage is exactly as provisional as it sounds.
    """
    lines = angle_lines(state)
    turn = _turn_for(state, "angles")
    options = list(turn.question.options) if turn else []
    by_text = {}
    for entry in selections or []:
        text = str(entry.get("text", "")).strip()
        if text:
            by_text[_fold(text)] = entry

    chosen: list[SelectedAngle] = []
    for index, line in enumerate(lines):
        entry = by_text.get(_fold(line))
        if entry is not None:
            shape_key = str(entry.get("shape_key", "") or "")
            chosen.append(
                SelectedAngle(
                    angle_id=str(entry.get("angle_id") or f"a{index + 1}"),
                    text=line,
                    shape_key=shape_key,
                    group=_theme_for(shape_key, str(entry.get("group", "") or "")),
                    role=_checked_role(str(entry.get("role") or ""), shape_key),
                    edited=bool(entry.get("edited")),
                    custom=bool(entry.get("custom")) or not shape_key,
                )
            )
            continue
        option, edited = _closest_option(line, options)
        shape_key = getattr(option, "shape", "") if option is not None else ""
        chosen.append(
            SelectedAngle(
                angle_id=f"a{index + 1}",
                text=line,
                shape_key=shape_key,
                group=_theme_for(
                    shape_key,
                    getattr(option, "group", "") if option is not None else "",
                ),
                role=_role_for(shape_key, BROAD if option is None else DISTINCTIVE),
                edited=edited,
                custom=option is None,
            )
        )
    return chosen


def build_search_order(
    state: GrillState,
    *,
    revision: int = 1,
    selections: list[dict] | None = None,
    target_count: int | None = None,
) -> SearchOrder:
    """The whole agreement, written down once.

    `target_count` overrides the resolved one. That is how a correction works:
    the operator says twenty, the order is rewritten at a new revision, and
    every stored result is checked against the new request rather than
    presented as though it answered it.
    """
    decision = resolve_count(state)
    angles = selected_angles(state, selections)
    count = target_count if target_count is not None else decision.value
    allowances = role_allowances(count, [angle.role for angle in angles])
    for angle, allowance in zip(angles, allowances):
        angle.wanted = allowance
    kind = kind_from(state)
    subject, source = resolve_subject(kind)
    return SearchOrder(
        run_id=state.run_id,
        revision=revision,
        kind=kind,
        place=place_from(state),
        target_count=count,
        standard=standard_from(state),
        exclusions=exclusions_from(state),
        angles=angles,
        count_source="corrected by operator" if target_count is not None else decision.source,
        count_ambiguous=False if target_count is not None else decision.ambiguous,
        count_note="" if target_count is not None else decision.note,
        answer_notes=answer_notes(state),
        catalogue_subject=subject,
        subject_source=source,
    )


def resolve_interview(
    state: GrillState, selections: list[dict] | None = None
) -> InterviewBaseline:
    """Everything the transcript currently settles, resolved once.

    The same resolution `build_search_order` does, without building an order.
    Re-agreement needs to ask "did the interview change its mind about this
    field", and asking that of a freshly built order would compare against the
    order's own corrections rather than against the interview.
    """
    return InterviewBaseline(
        run_id=state.run_id,
        kind=kind_from(state),
        place=place_from(state),
        target_count=resolve_count(state).value,
        standard=standard_from(state),
        exclusions=exclusions_from(state),
        angles=[angle.text for angle in selected_angles(state, selections)],
    )


def baseline_of(order: SearchOrder) -> InterviewBaseline:
    """An order read back as though the interview had just said it.

    The fallback for a run stored before baselines were written down. It is
    right for every field the operator never corrected and wrong for the ones
    they did -- so a re-agreement that overrides one of those says so, rather
    than silently undoing a correction it cannot see.
    """
    return InterviewBaseline(
        run_id=order.run_id,
        revision=order.revision,
        kind=order.kind,
        place=order.place,
        target_count=order.target_count,
        standard=order.standard,
        exclusions=order.exclusions,
        angles=[angle.text for angle in order.angles],
    )


def catalogue_subject_of(order: SearchOrder) -> str:
    """Which catalogue this order draws on.

    Stored on the order from the moment it is built. An order written before
    the subject was recorded computes it here, on read, from the kind it
    already carries -- no call, no revision, and nothing invented: a kind the
    catalogue does not recognise stays unknown rather than being filed under
    whichever subject happens to share a word with it.
    """
    if order.subject_source:
        return order.catalogue_subject
    return resolve_subject(order.kind)[0]


def planned_capacity(order: SearchOrder) -> int:
    """How many places the order can ask for at all.

    An order made entirely of narrow angles cannot fill a long list, and that
    is worth saying before the money is spent rather than after. It is a
    warning and nothing else: no search is added that the operator did not
    approve.
    """
    return sum(angle.wanted for angle in order.angles)


def summary_of(order: SearchOrder) -> str:
    """The order read back plainly, derived from the order itself.

    The summary the operator reads and the request the searches make now come
    from one object, so the two cannot say different things -- which is the
    whole fault this record was added to fix.
    """
    lines = [
        f"{order.target_count} {order.kind or 'places'} in {order.place or 'the location'}.",
    ]
    # First, because a run driven from the command line has no screen and this
    # is the one thing on the order that is asking a question rather than
    # stating a fact.
    for note in order.answer_notes:
        lines.append(f"! {note}")
    if order.standard:
        lines.append(f"Earns a place: {order.standard}")
    if order.exclusions:
        lines.append(f"Left out: {order.exclusions}")
    lines.append("")
    lines.append(f"{len(order.angles)} searches:")
    for angle in order.angles:
        note = []
        if angle.role != BROAD:
            note.append(angle.role)
        note.append(f"asks for {angle.wanted}")
        if angle.edited:
            note.append("edited")
        lines.append(f"  - {angle.text}  [{', '.join(note)}]")
    return "\n".join(lines)
