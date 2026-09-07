"""What the rest of the article already said, for an edit that sees one section.

Improvement 03. A section edit is shown its own section, the brief and the
frozen facts, and nothing else. That is what keeps it from rewriting prose
nobody asked about -- and it is also why it will happily explain the price
range a second time, having no way to know the opening already did, or
recommend the vegetarian option the conclusion already settled on.

Built from what is already written down
---------------------------------------
The report says to start with the outline plus exact excerpts before adding
summarisation, and that is what this is: no model call, nothing paraphrased.
Every line of it is either a field the outline already recorded or a sentence
copied verbatim out of the draft.

A generated summary would be a fifth thing that can be wrong, arriving in the
same prompt as the evidence and looking exactly like it. An excerpt can be
badly *chosen*; it cannot say something the article does not say.

What it is not
--------------
It is navigation, and the prompt that carries it says so. Facts and caveats
come from the frozen packet, and the deterministic check on a proposal --
figures appearing in neither the original section nor the packet -- deliberately
does not consult this. So a figure that reaches an edit only through the memory
is flagged as introduced, exactly as one invented outright would be. A mistaken
memory cannot quietly become evidence; it can only waste a call.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .content.sections import ArticleSection, segment_article
from .support import _safe_dict, _safe_str

# How much of the opening travels. Enough to see what the piece committed to,
# short enough that the memory does not become a second copy of the article
# sitting in every edit prompt.
THESIS_CHARACTERS = 400

# The first line of a section, as written. One sentence is what an editor needs
# to recognise a section they are not looking at.
SECTION_EXCERPT_CHARACTERS = 200

# How many sentences of recommendation travel. A piece that recommends
# something in every paragraph is a piece whose recommendations are not the
# thing an edit needs to avoid contradicting.
MAX_DECISIONS = 8


# Wording that marks a sentence as telling the reader what to do. Deliberately
# narrow: a false positive costs a line in a prompt, and a false negative costs
# the thing this exists to prevent -- an edit contradicting a recommendation the
# article already made.
_DECISION = re.compile(
    r"""
    \b(?:
        go\s+to|book|choose|pick|skip|avoid|worth|not\s+worth|
        stick\s+to|head\s+for|start\s+at|start\s+with|opt\s+for|
        best\s+(?:bet|option|choice)|if\s+you|unless\s+you|
        the\s+one\s+to|the\s+answer\s+is|do\s+not\s+bother
    )\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

# A run of capitalised words: a place, a venue, an institution. The article's
# own vocabulary, found without asking anybody what it is about.
_PROPER_RUN = re.compile(r"\b([A-Z][\w’'-]*(?:\s+(?:de|del|la|el|of|the)\s+|\s+)?){1,4}")

# Capitalised words that start sentences and mean nothing on their own.
_SENTENCE_STARTERS = frozenset(
    """the a an this that these those it its there here they their you your we our
    but and or if when where while after before once every each both either
    for from with without into onto about across around at by in on to up
    what which who how why so then still also only just even now today""".split()
)


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    return [part.strip() for part in parts if part.strip()]


def _excerpt(text: str, limit: int) -> str:
    """Whole sentences up to a limit, never a sentence cut in half.

    A truncated sentence in a prompt reads as a fact stated incompletely, which
    is a worse thing to hand a writer than one sentence fewer.
    """
    kept: list[str] = []
    used = 0
    for sentence in _sentences(text):
        if kept and used + len(sentence) + 1 > limit:
            break
        kept.append(sentence)
        used += len(sentence) + 1
    return " ".join(kept)


def _named_things(sections: list[ArticleSection]) -> list[str]:
    """The names this article uses in more than one place.

    Two sections naming the same restaurant is what makes it the article's
    vocabulary rather than a passing mention, and it is the case an edit needs:
    introducing a place the piece already introduced is one of the two
    repetitions this exists to prevent.
    """
    per_section: list[set[str]] = []
    for section in sections:
        found: set[str] = set()
        for sentence in _sentences(f"{section.heading}. {section.body}"):
            # The first word of a sentence is capitalised for grammar, not for
            # being a name, so it is only kept when it appears capitalised
            # somewhere it did not have to be.
            for match in _PROPER_RUN.finditer(sentence):
                phrase = " ".join(match.group(0).split()).strip(" ,.;:'’-")
                if not phrase or phrase.casefold() in _SENTENCE_STARTERS:
                    continue
                if len(phrase) < 4:
                    continue
                found.add(phrase)
        per_section.append(found)

    counted: dict[str, int] = {}
    for found in per_section:
        for phrase in found:
            counted[phrase] = counted.get(phrase, 0) + 1
    return sorted(phrase for phrase, count in counted.items() if count > 1)


def _decisions(sections: list[ArticleSection]) -> list[dict[str, str]]:
    """Sentences that tell the reader what to do, quoted where they sit.

    Quoted rather than summarised. "The conclusion recommends the vegetarian
    option" is a claim about the article; the sentence itself is the article,
    and an edit can be asked not to contradict it without anybody having
    restated it first.
    """
    found: list[dict[str, str]] = []
    for section in sections:
        for sentence in _sentences(section.body):
            if len(found) >= MAX_DECISIONS:
                return found
            if _DECISION.search(sentence):
                found.append(
                    {
                        "section_id": section.section_id,
                        "heading": section.heading,
                        "sentence": sentence,
                    }
                )
    return found


@dataclass
class ArticleMemory:
    """What the rest of the piece already did, in its own words."""

    thesis: str = ""
    planned_answer: str = ""
    planned_close: str = ""
    sections: list[dict[str, str]] = field(default_factory=list)
    named_things: list[str] = field(default_factory=list)
    decisions: list[dict[str, str]] = field(default_factory=list)

    def as_record(self) -> dict[str, Any]:
        return {
            "thesis": self.thesis,
            "planned_answer": self.planned_answer,
            "planned_close": self.planned_close,
            "sections": [dict(item) for item in self.sections],
            "named_things": list(self.named_things),
            "decisions": [dict(item) for item in self.decisions],
        }

    def for_prompt(self, *, excluding: str = "") -> str:
        """The memory as an edit reads it, with the edited section left out.

        Left out because an edit is already shown that section in full, and
        including it twice invites a model to treat the excerpt as the thing
        to preserve rather than the prose in front of it.
        """
        lines: list[str] = []
        if self.thesis:
            lines.append(f"The article opens: {self.thesis}")
        if self.planned_answer:
            lines.append(f"The opening was planned to answer: {self.planned_answer}")
        if self.planned_close:
            lines.append(f"The close was planned to land on: {self.planned_close}")

        others = [
            section for section in self.sections if section["section_id"] != excluding
        ]
        if others:
            lines.append("")
            lines.append("The other sections, and what each is for:")
            for section in others:
                label = section["heading"] or "(the opening)"
                lines.append(f"- {label} — {section['payoff']}")
                if section["opening_line"]:
                    lines.append(f"    begins: {section['opening_line']}")

        if self.named_things:
            lines.append("")
            lines.append(
                "Named more than once already, so they have been introduced: "
                + ", ".join(self.named_things)
            )

        decisions = [
            decision for decision in self.decisions if decision["section_id"] != excluding
        ]
        if decisions:
            lines.append("")
            lines.append("What the article already tells the reader to do:")
            lines.extend(
                f"- {decision['heading'] or 'the opening'}: "
                f"“{decision['sentence']}”"
                for decision in decisions
            )
        return "\n".join(lines)


def build_article_memory(
    content: str, outline: dict[str, Any] | None = None
) -> ArticleMemory:
    """Read the draft and its plan into something an edit can navigate by.

    Deterministic and free. The outline is optional: a run whose plan was
    rejected still has an article, and the excerpts alone are most of the
    value.
    """
    sections = segment_article(content)
    plan = _safe_dict(outline)
    planned = {
        _safe_str(section.get("heading")).casefold(): section
        for section in (plan.get("sections") or [])
        if isinstance(section, dict)
    }

    described: list[dict[str, str]] = []
    for section in sections:
        # `segment_article` always produces an opening block so that a draft
        # beginning straight on a heading has somewhere to put one. An empty
        # one is scaffolding, not a section of the article, and listing it
        # tells an edit about a part of the piece that does not exist.
        if not section.heading and not section.body.strip():
            continue
        record = _safe_dict(planned.get(section.heading.casefold()))
        # `reader_payoff` is what the plan calls it once improvement 01 lands;
        # `purpose` is what it was called before. Read either, so this works on
        # a run planned under whichever was current -- the alternative is a
        # memory that silently loses every section purpose on older runs.
        payoff = _safe_str(record.get("reader_payoff")) or _safe_str(
            record.get("purpose")
        )
        described.append(
            {
                "section_id": section.section_id,
                "heading": section.heading,
                "payoff": payoff or "(the plan did not say)",
                "opening_line": _excerpt(section.body, SECTION_EXCERPT_CHARACTERS),
            }
        )

    opening = next(
        (section for section in sections if not section.heading), None
    )
    return ArticleMemory(
        thesis=_excerpt(opening.body, THESIS_CHARACTERS) if opening else "",
        planned_answer=_safe_str(plan.get("direct_answer_focus")),
        planned_close=_safe_str(plan.get("takeaway_focus")),
        sections=described,
        named_things=_named_things(sections),
        decisions=_decisions(sections),
    )
