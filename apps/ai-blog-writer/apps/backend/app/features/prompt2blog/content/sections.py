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

*The original bytes*, now literally. The first version of this module rebuilt
the whole document from its parsed sections, so an untargeted section came
back through `strip()` and a fresh `## ` line and lost whatever the author's
formatting had put there -- the two trailing spaces that make a Markdown line
break, an unusual blank line, the document's final newline. Sections carry the
exact slice they were cut from, an edit splices into that slice, and every
other byte in the document is the byte that was there before.

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

# Exported: the style cleanup walks the same lines to work out which
# section an error's line number falls in, and a second copy of this
# rule that drifted would put an edit in the wrong place.
H2_LINE = re.compile(r"^##[ \t]+(.+?)[ \t]*$")

# An H1 is not a section boundary here -- articles carry their title outside
# the body -- but it is still document structure, and a replacement for one
# paragraph has no business introducing one.
H1_LINE = re.compile(r"^#[ \t]+")

# ``` or ~~~ , with any info string. A heading-shaped line inside a fence is
# sample text, not structure, and reading it as a section boundary would give
# every section after it a shifted address.
FENCE_LINE = re.compile(r"^[ \t]{0,3}(?P<mark>```+|~~~+)")


def _hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:12]


def _as_text(value: Any) -> str:
    """A string, unchanged.

    `_safe_str` strips, which is right almost everywhere in this pipeline and
    wrong at exactly the boundary this module defends: a document whose final
    newline is removed on the way in cannot be handed back byte-for-byte on
    the way out. Section identity is unaffected -- `text_hash` is taken over
    the stripped heading and body either way.
    """
    return value if isinstance(value, str) else ""


def _structural_lines(text: str) -> list[tuple[int, str]]:
    """The heading lines in `text` that are document structure, with kinds.

    One walker, used both to cut an article into sections and to refuse a
    replacement that would change how it cuts. Two copies of this rule that
    drifted apart would let a body through validation and then have it split
    into a section.
    """
    found: list[tuple[int, str]] = []
    fence = ""
    for index, line in enumerate(_as_text(text).split("\n")):
        opening = FENCE_LINE.match(line)
        if opening:
            mark = opening.group("mark")
            if not fence:
                fence = mark[0] * 3
                continue
            if mark[0] * 3 == fence:
                fence = ""
            continue
        if fence:
            continue
        if H2_LINE.match(line):
            found.append((index, "h2"))
        elif H1_LINE.match(line):
            found.append((index, "h1"))
    return found


@dataclass(frozen=True)
class ArticleSection:
    """One addressable piece of an article."""

    section_id: str
    # Empty for the opening block, which has no heading of its own.
    heading: str
    body: str
    # Where this section sits in the document it was cut from, and the exact
    # bytes that were there. `raw` is what an untouched section is written
    # back as; `start`/`end` are what an edited one is spliced into.
    start: int = 0
    end: int = 0
    raw: str = ""

    @property
    def text_hash(self) -> str:
        """Identity of the current text, so a stale edit can be spotted.

        Over the body and the heading together: a pass that rewrote a heading
        against the previous draft is as stale as one that rewrote the prose.

        Deliberately over the parsed heading and body rather than over `raw`,
        so a hash taken before this module kept offsets still means the same
        thing, and so trailing whitespace an editor cannot see does not make a
        proposal stale.
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
    text = _as_text(content)
    lines = text.split("\n")
    # Where each line starts in `text`. Built once so a section can be cut out
    # of the original string rather than rebuilt from its lines.
    offsets: list[int] = []
    cursor = 0
    for line in lines:
        offsets.append(cursor)
        cursor += len(line) + 1

    boundaries = [index for index, kind in _structural_lines(text) if kind == "h2"]
    starts = [0, *(offsets[index] for index in boundaries)]
    ends = [*starts[1:], len(text)]

    sections: list[ArticleSection] = []
    for position, (start, end) in enumerate(zip(starts, ends)):
        raw = text[start:end]
        if position == 0:
            heading = ""
            body = raw
        else:
            first, _, rest = raw.partition("\n")
            match = H2_LINE.match(first)
            heading = match.group(1).strip() if match else ""
            body = rest
        sections.append(
            ArticleSection(
                section_id=f"s{position}",
                heading=heading,
                body=body.strip(),
                start=start,
                end=end,
                raw=raw,
            )
        )
    return sections


def render_article(sections: list[ArticleSection]) -> str:
    """Reassemble a document from its sections.

    Normalising: every section comes back through `render()`, so the gaps
    between them become one blank line and the document loses its trailing
    whitespace. That is right for a document being built out of parts and
    wrong for one being edited in place -- `apply_section_replacements` splices
    instead, and does not call this.
    """
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


def _structure_refusal(heading: str, body: str) -> str:
    """Why this replacement may not be written, or an empty string.

    A replacement changes what one section says. Changing how many sections
    the document has is a different operation, and it is not one any caller
    here is asking for -- so a body carrying its own `##` is refused rather
    than quietly turned into two sections whose addresses shift everything
    after them. H3 and fenced sample text are ordinary content and pass.
    """
    if "\n" in heading or "\r" in heading:
        return "a heading cannot span lines"
    if heading.lstrip().startswith("#"):
        return "a heading cannot carry its own `#` marks"
    kinds = {kind for _index, kind in _structural_lines(body)}
    if "h2" in kinds:
        return "the replacement body would open another `##` section"
    if "h1" in kinds:
        return "the replacement body would open an `#` heading"
    return ""


def apply_section_replacements(
    content: str,
    replacements: Any,
) -> SectionEditResult:
    """Replace named sections in the original document; keep the rest byte-for-byte.

    Every replacement is checked before anything is written:

    - the id must name a section this draft has;
    - it may name it only once -- and a repeated id refuses *every* edit for
      that section, because a response that named the same paragraph twice
      does not know what it wants there and applying the first half of that
      confusion is not better than applying none of it;
    - `text_hash` must be present and must match what is there now, so an edit
      written against an older draft, or one written against no draft at all,
      is refused rather than applied to prose it never read;
    - the replacement must not change the document's structure.

    A refused replacement drops out and the others still apply. A response
    where nothing survives returns the original content unchanged, which is
    the honest outcome: the draft the run already has is still saveable, and
    keep-best is not handed a mangled document to score.
    """
    original = _as_text(content)
    sections = segment_article(original)
    by_id = {section.section_id: index for index, section in enumerate(sections)}

    applied: list[str] = []
    rejected: list[dict[str, str]] = []

    if not isinstance(replacements, list):
        return SectionEditResult(
            content=original,
            applied=[],
            rejected=[{"section_id": "", "reason": "sections is not a list"}],
        )

    # Counted before anything is applied, so a duplicated id can refuse both
    # of its edits rather than only the one that arrived second.
    counts: dict[str, int] = {}
    for raw in replacements:
        section_id = _safe_str(_safe_dict(raw).get("section_id"))
        counts[section_id] = counts.get(section_id, 0) + 1

    pieces = [section.raw for section in sections]

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
        if counts[section_id] > 1:
            rejected.append(
                {"section_id": section_id, "reason": "named more than once"}
            )
            continue

        index = by_id[section_id]
        current = sections[index]
        supplied_hash = _safe_str(record.get("text_hash"))
        if not supplied_hash:
            # Absence used to be read as agreement: a replacement that carried
            # no hash skipped the staleness check entirely, which is the check
            # this whole module exists for.
            rejected.append(
                {"section_id": section_id, "reason": "no text_hash supplied"}
            )
            continue
        if supplied_hash != current.text_hash:
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

        refusal = _structure_refusal(heading, body)
        if refusal:
            rejected.append({"section_id": section_id, "reason": refusal})
            continue

        replaced = ArticleSection(
            section_id=section_id, heading=heading, body=body.strip()
        ).render()
        # The gap to the next section belongs to the slice being replaced, so
        # it is carried over rather than re-invented. Replacing one paragraph
        # must not close up the blank lines around it.
        trailing = current.raw[len(current.raw.rstrip()) :]
        pieces[index] = f"{replaced}{trailing}"
        applied.append(section_id)

    if not applied:
        return SectionEditResult(content=original, applied=[], rejected=rejected)
    return SectionEditResult(
        content="".join(pieces), applied=applied, rejected=rejected
    )
