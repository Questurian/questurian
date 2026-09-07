"""What the editor keeps having to fix, and when that is worth a rule.

Improvement 05. Every accepted section edit is a person saying the writer got
something wrong and this is what right looks like. One of those is a
correction. Twenty of the same shape, across different articles and different
forms, is a gap in the house voice -- and until now that signal existed only in
somebody's memory of having made the same edit before.

The whole design is about the difference between those two things.

Why it refuses to speak
-----------------------
The roadmap puts this last and says to wait until enough genuine edit history
exists to distinguish taste from recurring failure. That waiting is written into
the code rather than left as a note: below the thresholds this returns a
refusal naming what is still missing. It ships now and declines to draw
conclusions now, which is different from not shipping.

Two thresholds, and they guard different mistakes. Enough *distinct runs*,
because the same operator fixing the same article three times is one opinion
held loudly. Enough *distinct forms*, because a correction appropriate to a
service guide is not a rule about profiles -- the report says so directly, and
a voice file is read by every form there is.

Nothing here writes a rule
--------------------------
It produces evidence and, at most, a suggestion. The Questurian Voice file is
changed by a person editing it, and this records only whether a suggestion was
taken up so the same one is not offered forever. Silently learning a new
instruction is the failure this feature is one wrong turn away from, and the
turn is not taken.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .section_edit_v4 import AppliedEdit, EDIT_ACTIONS_BY_ID

# Bumped when a stored decision stops meaning what this code reads.
EDIT_PATTERN_SCHEMA_VERSION = 1

# Where an operator's answers to suggestions live. Not on a run: a pattern is
# about the writer across articles, and hanging it off whichever run happened
# to be open when it was noticed would lose it.
EDIT_PATTERN_STAGE = "prompt2blog_edit_patterns"
EDIT_PATTERN_RUN = "prompt2blog-editorial"

# How many separate articles must show the same fix before it is a pattern.
#
# Three, and it is a floor rather than a finding. Two is a coincidence with a
# witness. This does not make three a proof -- the point of the number is that
# below it the question is not worth asking, not that above it the answer is
# yes.
MIN_RUNS_FOR_A_PATTERN = 3

# How many different forms it must have happened on before it can be proposed
# as a change to the one voice everything shares.
#
# A correction appropriate to one article should not become a universal rule,
# and a voice file is read by every form there is. A pattern seen on one form
# is reported as exactly that -- something about how this pipeline writes
# service guides -- and is not offered as a voice change.
MIN_FORMS_FOR_A_VOICE_RULE = 2

# How much of the group is withheld when a suggestion is drawn from it. The
# report asks for comparison on held-out examples rather than on the excerpts
# that motivated the rule, and a rule checked only against what produced it
# cannot fail.
HELD_OUT_SHARE = 0.3


def _normalise(text: str) -> str:
    return " ".join(text.split()).casefold()


# What actually changed, said in a way that can be counted. Not a diff: a diff
# of two paragraphs is unique every time and would put every edit in its own
# group. These are the shapes an edit takes, and two edits sharing one are two
# edits doing the same kind of work.
_SHAPE_TESTS: tuple[tuple[str, str], ...] = (
    ("shortened", "the replacement is materially shorter"),
    ("lengthened", "the replacement is materially longer"),
    ("hedge_removed", "hedging in the original is gone from the replacement"),
    ("choice_named", "the replacement names a choice the original did not"),
    ("comparison_added", "the replacement compares where the original listed"),
    ("rephrased", "about the same length, no other shape matched"),
)

_HEDGES = re.compile(
    r"\b(?:might|maybe|perhaps|arguably|somewhat|fairly|quite|it\s+seems|"
    r"tends?\s+to|generally|typically|often|can\s+be|could\s+be)\b",
    re.IGNORECASE,
)
_CHOICE = re.compile(
    r"\b(?:go\s+to|book|choose|pick|skip|avoid|stick\s+to|the\s+one\s+to|"
    r"best\s+(?:bet|option|choice)|opt\s+for|if\s+you)\b",
    re.IGNORECASE,
)
_COMPARISON = re.compile(
    r"\b(?:better|worse|cheaper|faster|closer|quieter|rather\s+than|"
    r"instead\s+of|whereas|while|against|compared)\b",
    re.IGNORECASE,
)

# What counts as an edit having changed the length rather than the wording.
# Both floors, because either alone gets it wrong: a proportional test calls a
# five-word sentence gaining one word a 20% expansion, and an absolute test
# calls twenty words off a thousand-word section nothing.
LENGTH_SHIFT = 0.15
LENGTH_SHIFT_WORDS = 5


def edit_shape(before: str, after: str) -> str:
    """The kind of work one edit did, in a word two edits can share.

    Deliberately coarse. A finer classification would be more accurate about
    each edit and useless for the only question being asked, which is whether
    the same thing keeps happening.

    The editorial moves are tested before length, and that ordering is the
    whole of the classifier. Length is the least informative thing about an
    edit -- naming a choice usually makes a passage longer and removing hedging
    usually makes it shorter -- so testing it first put every editorial move
    into the two piles that say least about it.
    """
    gained_choice = bool(_CHOICE.search(after)) and not _CHOICE.search(before)
    gained_comparison = bool(_COMPARISON.search(after)) and not _COMPARISON.search(
        before
    )
    lost_hedging = bool(_HEDGES.search(before)) and not _HEDGES.search(after)

    # Most specific first. A passage that gained a recommendation *and* lost
    # its hedging did one editorial thing, and it is the recommendation.
    if gained_choice:
        return "choice_named"
    if gained_comparison:
        return "comparison_added"
    if lost_hedging:
        return "hedge_removed"

    before_words = len(before.split())
    after_words = len(after.split())
    delta = after_words - before_words
    if before_words and abs(delta) >= LENGTH_SHIFT_WORDS:
        shift = delta / before_words
        if shift <= -LENGTH_SHIFT:
            return "shortened"
        if shift >= LENGTH_SHIFT:
            return "lengthened"
    return "rephrased"


@dataclass(frozen=True)
class Occurrence:
    """One accepted edit, reduced to what a pattern is counted from."""

    run_id: str
    form_id: str
    action_id: str
    shape: str
    before: str
    after: str
    reason: str = ""
    applied_at: str = ""


@dataclass
class EditPattern:
    """The same kind of fix, made more than once."""

    action_id: str
    shape: str
    occurrences: list[Occurrence] = field(default_factory=list)

    @property
    def runs(self) -> list[str]:
        return sorted({item.run_id for item in self.occurrences})

    @property
    def forms(self) -> list[str]:
        return sorted({item.form_id for item in self.occurrences if item.form_id})

    @property
    def reasons(self) -> list[str]:
        return sorted({item.reason for item in self.occurrences if item.reason})

    @property
    def enough_history(self) -> bool:
        return len(self.runs) >= MIN_RUNS_FOR_A_PATTERN

    @property
    def can_be_a_voice_rule(self) -> bool:
        return self.enough_history and len(self.forms) >= MIN_FORMS_FOR_A_VOICE_RULE

    def split_for_review(self) -> tuple[list[Occurrence], list[Occurrence]]:
        """The examples a rule may be drawn from, and the ones it is checked on.

        Held out by run, not by occurrence: two edits from the same article are
        the same evidence twice, and holding one of them back would leave a
        "held-out" example the rule had effectively already seen.
        """
        runs = self.runs
        holdout_count = max(1, round(len(runs) * HELD_OUT_SHARE))
        held_back = set(runs[-holdout_count:])
        motivating = [item for item in self.occurrences if item.run_id not in held_back]
        held_out = [item for item in self.occurrences if item.run_id in held_back]
        # Never hold back so much that nothing is left to reason from.
        if not motivating:
            return self.occurrences, []
        return motivating, held_out

    def as_record(self) -> dict[str, Any]:
        motivating, held_out = self.split_for_review()
        action = EDIT_ACTIONS_BY_ID.get(self.action_id)
        return {
            "pattern_id": f"{self.action_id}:{self.shape}",
            "action_id": self.action_id,
            "action_label": action.label if action else self.action_id,
            "shape": self.shape,
            "shape_meaning": dict(_SHAPE_TESTS).get(self.shape, ""),
            "occurrences": len(self.occurrences),
            "runs": self.runs,
            "forms": self.forms,
            "reasons_given": self.reasons,
            "enough_history": self.enough_history,
            "can_be_a_voice_rule": self.can_be_a_voice_rule,
            # Named separately so the two refusals do not read as one. A
            # single-form pattern is a real finding about how this pipeline
            # writes that form; it is only a voice rule that it cannot be.
            "why_not_a_voice_rule": self._refusal(),
            "motivating_examples": [
                {"run_id": item.run_id, "before": item.before, "after": item.after}
                for item in motivating
            ],
            "held_out_examples": [
                {"run_id": item.run_id, "before": item.before, "after": item.after}
                for item in held_out
            ],
        }

    def _refusal(self) -> str:
        if not self.enough_history:
            missing = MIN_RUNS_FOR_A_PATTERN - len(self.runs)
            return (
                f"Seen on {len(self.runs)} article(s). {missing} more would make "
                "this worth asking about; below that, the same fix twice is a "
                "coincidence with a witness."
            )
        if len(self.forms) < MIN_FORMS_FOR_A_VOICE_RULE:
            forms = ", ".join(self.forms) or "one form"
            return (
                f"Only ever on {forms}. That is a real finding about how this "
                "pipeline writes that form, and not a rule about every article "
                "-- the voice file is read by all of them."
            )
        return ""


def gather_occurrences(
    histories: dict[str, Any],
    forms: dict[str, str] | None = None,
) -> list[Occurrence]:
    """Read accepted edits out of stored run histories.

    `histories` is run id to that run's stored edit history. `forms` supplies
    the form for runs recorded before the form travelled with the edit; an
    unknown form stays empty rather than being guessed, because guessing it is
    how a single-form pattern becomes a voice rule.
    """
    known_forms = forms or {}
    occurrences: list[Occurrence] = []
    for run_id, stored in histories.items():
        record = stored if isinstance(stored, dict) else {}
        for raw in record.get("edits") or []:
            edit = AppliedEdit.model_validate(raw)
            if not edit.before or not edit.after:
                # Recorded before the section text travelled with the edit.
                # Counted for nothing rather than counted as a rephrase.
                continue
            if _normalise(edit.before) == _normalise(edit.after):
                continue
            occurrences.append(
                Occurrence(
                    run_id=run_id,
                    form_id=edit.form_id or known_forms.get(run_id, ""),
                    action_id=edit.action_id,
                    shape=edit_shape(edit.before, edit.after),
                    before=edit.before,
                    after=edit.after,
                    reason=edit.reason,
                    applied_at=edit.applied_at,
                )
            )
    return occurrences


def group_patterns(occurrences: list[Occurrence]) -> list[EditPattern]:
    """The same action and the same shape, gathered.

    Ordered by how many separate articles show it, because that is the only
    axis on which one pattern is more worth a person's attention than another.
    """
    grouped: dict[tuple[str, str], EditPattern] = {}
    for item in occurrences:
        key = (item.action_id, item.shape)
        pattern = grouped.setdefault(
            key, EditPattern(action_id=item.action_id, shape=item.shape)
        )
        pattern.occurrences.append(item)
    return sorted(
        grouped.values(),
        key=lambda pattern: (-len(pattern.runs), -len(pattern.occurrences), pattern.action_id),
    )


def review(
    histories: dict[str, Any],
    forms: dict[str, str] | None = None,
) -> dict[str, Any]:
    """What the accepted edits say, and what they are not yet entitled to say."""
    occurrences = gather_occurrences(histories, forms)
    patterns = group_patterns(occurrences)
    ready = [pattern for pattern in patterns if pattern.can_be_a_voice_rule]
    return {
        "schema_version": EDIT_PATTERN_SCHEMA_VERSION,
        "edits_read": len(occurrences),
        "articles_edited": len({item.run_id for item in occurrences}),
        "patterns": [pattern.as_record() for pattern in patterns],
        "ready_for_review": [pattern.as_record()["pattern_id"] for pattern in ready],
        "means": (
            "A pattern is the same kind of fix made on several articles. It is "
            "evidence that the writer keeps needing the same correction, not "
            "proof that the voice file is wrong -- an editor's taste is also a "
            "pattern. Nothing here changes any rule: the Questurian Voice file "
            "is edited by a person, and this only records whether a suggestion "
            "was taken up so the same one is not offered forever."
        ),
    }


# ---------------------------------------------------------------------------
# What a person decided about a pattern
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PatternDecision:
    pattern_id: str
    # `adopted` means a person changed the voice file. `declined` means they
    # read it and disagreed. Both stop it being offered again; only one of them
    # means the writer will improve.
    verdict: str
    decided_at: str = ""
    decided_by: str = ""
    note: str = ""


def outstanding(
    reviewed: dict[str, Any], decisions: list[PatternDecision]
) -> list[dict[str, Any]]:
    """Patterns ready for a person, minus the ones a person has answered."""
    settled = {decision.pattern_id for decision in decisions}
    return [
        pattern
        for pattern in reviewed.get("patterns") or []
        if pattern.get("can_be_a_voice_rule")
        and pattern.get("pattern_id") not in settled
    ]
