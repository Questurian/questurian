"""Stable section identity for an article, and edits applied in code.

Finding 06: repair regenerated the whole article and was asked, in prose, to
return every untouched section "exactly as it was, word for word". Nothing
enforced it. The code measured which sections moved and recorded the answer,
so a pass asked to fix one paragraph could rewrite the opening and the run
would note it and carry on -- and keep-best would happily retain the broad
rewrite whenever the audit liked the score.

The fix is not a firmer instruction. It is that untargeted prose is never
regenerated at all: repair returns replacements for the sections it is
changing, and the rest of the document is the original bytes.

Everything here is pure and deterministic. `split_markdown_sections` in
`markdown.py` is unchanged and still keyed by heading -- it answers "did this
move", where a collision between two identical headings is harmless. It is not
safe as an edit address, which is what this module is for.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any

from ..support import _safe_dict, _safe_str

# The block before the first `##`. It is a real part of the article -- often
# the direct answer -- and it needs an address like everything else.
OPENING_SECTION_ID = "s0"

_H2 = re.compile(r"^##[ \t]+(.+?)[ \t]*$")


def _hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:12]


@dataclass(frozen=True)
class ArticleSection:
    """One addressable piece of an article."""

    section_id: str
    # Empty for the opening block, which has no heading of its own.
    heading: str
    body: str

    @property
    def text_hash(self) -> str:
        """Identity of the current text, so a stale edit can be spotted.

        Over the body and the heading together: a pass that rewrote a heading
        against the previous draft is as stale as one that rewrote the prose.
        """
        return _hash(f"{self.heading}\n{self.body}")

    def render(self) -> str:
        if not self.heading:
            return self.body.strip()
        return f"## {self.heading}\n\n{self.body}".strip() if self.body else (
            f"## {self.heading}"
        )


def segment_article(content: str) -> list[ArticleSection]:
    """Split an article into addressed sections, in document order.

    Positional ids, not headings. Two sections can carry the same heading --
    "Getting there" under two neighbourhoods is ordinary writing -- and a
    heading-keyed address silently merges them, which would let a repair aimed
    at one overwrite the other.

    The opening block is always present, even when empty, so a draft that
    begins straight on a heading still has somewhere to put an opening.
    """
    heading = ""
    body: list[str] = []
    sections: list[ArticleSection] = []

    def flush() -> None:
        sections.append(
            ArticleSection(
                section_id=f"s{len(sections)}",
                heading=heading,
                body="\n".join(body).strip(),
            )
        )

    for line in _safe_str(content).split("\n"):
        match = _H2.match(line)
        if match:
            flush()
            heading = match.group(1).strip()
            body = []
            continue
        body.append(line)
    flush()
    return sections


def render_article(sections: list[ArticleSection]) -> str:
    """Reassemble a document from its sections."""
    return "\n\n".join(
        rendered for section in sections if (rendered := section.render())
    ).strip()


def section_manifest(sections: list[ArticleSection]) -> str:
    """What repair is shown so it can name what it wants to change."""
    lines: list[str] = []
    for section in sections:
        label = section.heading or "(opening — no heading)"
        words = len(section.body.split())
        lines.append(
            f"- {section.section_id} [{section.text_hash}] {label} "
            f"({words} words)"
        )
    return "\n".join(lines) or "- (the draft has no sections)"


def locate_claims(
    sections: list[ArticleSection], claims: list[dict[str, Any]]
) -> dict[str, list[str]]:
    """Which section each flagged claim sits in, by quoted text.

    Best effort, and deliberately not a gate: a checker that paraphrased its
    own quote should not cost the run its repair. What it buys is a repair
    prompt that can say "this section contains a claim you must delete"
    instead of handing the whole list to a pass that has to search for them.
    """
    located: dict[str, list[str]] = {}
    for claim in claims:
        quote = _safe_str(_safe_dict(claim).get("claim"))
        if not quote:
            continue
        needle = " ".join(quote.split()).casefold()
        for section in sections:
            haystack = " ".join(f"{section.heading} {section.body}".split()).casefold()
            if needle and needle in haystack:
                located.setdefault(section.section_id, []).append(quote)
                break
    return located


@dataclass(frozen=True)
class SectionEditResult:
    """What a set of proposed replacements did, and what it was refused."""

    content: str
    applied: list[str]
    rejected: list[dict[str, str]]

    @property
    def changed(self) -> bool:
        return bool(self.applied)

    def as_dict(self) -> dict[str, Any]:
        return {
            "applied_section_ids": list(self.applied),
            "rejected": [dict(item) for item in self.rejected],
        }


def apply_section_replacements(
    content: str,
    replacements: Any,
) -> SectionEditResult:
    """Replace named sections in the original document; keep the rest byte-for-byte.

    Every replacement is checked before anything is written:

    - the id must name a section this draft has;
    - it may name it only once, so two edits cannot silently race for the same
      paragraph;
    - `text_hash` must match what is there now, so an edit written against an
      older draft is refused rather than applied to prose it never read.

    A refused replacement drops out and the others still apply. A response
    where nothing survives returns the original content unchanged, which is
    the honest outcome: the draft the run already has is still saveable, and
    keep-best is not handed a mangled document to score.
    """
    sections = segment_article(content)
    by_id = {section.section_id: index for index, section in enumerate(sections)}

    applied: list[str] = []
    rejected: list[dict[str, str]] = []
    seen: set[str] = set()

    if not isinstance(replacements, list):
        return SectionEditResult(
            content=_safe_str(content),
            applied=[],
            rejected=[{"section_id": "", "reason": "sections is not a list"}],
        )

    for raw in replacements:
        record = _safe_dict(raw)
        section_id = _safe_str(record.get("section_id"))
        if section_id not in by_id:
            rejected.append(
                {
                    "section_id": section_id or "(missing)",
                    "reason": "unknown section id",
                }
            )
            continue
        if section_id in seen:
            rejected.append(
                {"section_id": section_id, "reason": "named more than once"}
            )
            continue
        seen.add(section_id)

        index = by_id[section_id]
        current = sections[index]
        supplied_hash = _safe_str(record.get("text_hash"))
        if supplied_hash and supplied_hash != current.text_hash:
            rejected.append(
                {
                    "section_id": section_id,
                    "reason": (
                        f"stale text_hash {supplied_hash} for "
                        f"{current.text_hash}"
                    ),
                }
            )
            continue

        body = _safe_str(record.get("content"))
        if not body.strip():
            # Repair cannot delete a section. Removing one is a plan decision
            # and this pass does not hold the plan; an empty body is far more
            # likely to be a truncated response than a considered cut.
            rejected.append(
                {"section_id": section_id, "reason": "empty replacement body"}
            )
            continue

        heading = _safe_str(record.get("heading"))
        if current.heading and not heading:
            heading = current.heading
        if not current.heading and heading:
            # The opening block has no heading, and a replacement that
            # invents one would push a new `##` above the first section.
            rejected.append(
                {
                    "section_id": section_id,
                    "reason": "the opening block cannot take a heading",
                }
            )
            continue

        sections[index] = ArticleSection(
            section_id=section_id, heading=heading, body=body.strip()
        )
        applied.append(section_id)

    if not applied:
        return SectionEditResult(
            content=_safe_str(content), applied=[], rejected=rejected
        )
    return SectionEditResult(
        content=render_article(sections), applied=applied, rejected=rejected
    )
