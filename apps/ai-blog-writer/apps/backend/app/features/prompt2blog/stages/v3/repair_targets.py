"""Which sections repair is allowed to touch, decided before it is asked.

Finding: `_screen_section_edits` refuses an edit that cites a fact outside the
packet, and that is the only thing it refuses. Scope was left entirely to the
prompt -- "change length inside the sections that exist", "resolve each
required revision directly" -- and a pass that came back with a rewritten
opening nobody complained about had its edit applied, because the opening's id
was real and its hash was current.

So the targets are worked out first, from what the audit and the grounding
check actually named, and enforced in code afterwards. The prompt is told the
same list, so repair is not being refused for doing what it was asked.

Everything here is deterministic. Resolving a revision to a section by asking
a model would be a second call on the stage that already costs the most, and
it would put the scope decision back inside a response nobody can check.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ...content.sections import ArticleSection
from ...support import _safe_str

# A revision quoting the draft is the common case and the reliable one: the
# auditor is told to quote the sentence it objects to, and a quote can be
# looked up rather than interpreted.
_QUOTED = re.compile(r"[\"“”'‘’]([^\"“”\n]{8,200})[\"“”'‘’]")



@dataclass(frozen=True)
class RepairTargets:
    """The sections repair may change, and how that was decided."""

    allowed: frozenset[str]
    # "targeted" -- every revision resolved to named sections.
    # "article_wide" -- a revision that legitimately covers the whole draft.
    # "unresolved" -- nothing resolved, so the scope is not known.
    scope: str
    resolved: dict[str, list[str]] = field(default_factory=dict)
    unresolved: list[str] = field(default_factory=list)

    def permits(self, section_id: str) -> bool:
        return section_id in self.allowed

    def as_dict(self) -> dict[str, Any]:
        return {
            "scope": self.scope,
            "allowed_section_ids": sorted(self.allowed),
            "resolved_revisions": {
                revision: list(ids) for revision, ids in self.resolved.items()
            },
            "unresolved_revisions": list(self.unresolved),
        }


def _normalise(text: str) -> str:
    return " ".join(text.split()).casefold()


def _sections_named_by(
    revision: str, sections: list[ArticleSection]
) -> list[str]:
    """The sections a revision points at, by quoted prose or by heading."""
    text = _normalise(revision)
    found: list[str] = []
    quotes = [_normalise(match.group(1)) for match in _QUOTED.finditer(revision)]
    for section in sections:
        haystack = _normalise(f"{section.heading} {section.body}")
        heading = _normalise(section.heading)
        hit = any(quote and quote in haystack for quote in quotes)
        # A heading has to be worth matching on. "Getting there" names a
        # section; a two-letter heading would match half the sentences in the
        # language and hand repair the whole document.
        if not hit and len(heading) >= 6 and heading in text:
            hit = True
        if hit:
            found.append(section.section_id)
    return found


def resolve_repair_targets(
    *,
    sections: list[ArticleSection],
    required_revisions: list[str],
    flagged: dict[str, list[str]],
    article_wide: list[str] | None = None,
) -> RepairTargets:
    """Work out which sections this repair pass is for.

    `article_wide` names the revisions the caller already knows cover the whole
    draft -- in practice the length instruction, which this pipeline computes
    itself from the counts that failed the check. Passed in rather than
    recognised from its wording: the one revision whose meaning the code is
    certain of is the one the code wrote, and matching an auditor's prose for
    words like "throughout" would be guessing about the rest.

    `flagged` is what `locate_claims` found: sections holding a claim the
    grounding check called unsupported. Those are targets by definition -- the
    policy is to delete the assertion, and the section holding it is where.

    When nothing resolves, every section is allowed and the scope is recorded
    as `unresolved`. That is a deliberate choice over refusing the pass: an
    audit can raise a real problem with the whole draft -- it never answers
    what the reader came for -- that no quote and no heading will locate, and
    a repair that refuses those is a repair that only ever fixes the easy half.
    What it must not do is happen quietly, so the reason is on the run's
    record and the pass is not describable afterwards as targeted.
    """
    every = frozenset(section.section_id for section in sections)
    allowed: set[str] = set(flagged)
    resolved: dict[str, list[str]] = {
        section_id: ["a claim the grounding check refused"]
        for section_id in sorted(flagged)
    }
    unresolved: list[str] = []
    wide = {_normalise(item) for item in (article_wide or []) if _safe_str(item)}
    covers_everything = False

    for revision in required_revisions:
        text = _safe_str(revision)
        if not text:
            continue
        if _normalise(text) in wide:
            covers_everything = True
            resolved[text] = sorted(every)
            continue
        named = _sections_named_by(text, sections)
        if named:
            allowed.update(named)
            resolved[text] = named
        else:
            unresolved.append(text)

    if covers_everything:
        return RepairTargets(
            allowed=every,
            scope="article_wide",
            resolved=resolved,
            unresolved=unresolved,
        )
    if allowed:
        return RepairTargets(
            allowed=frozenset(allowed),
            scope="targeted",
            resolved=resolved,
            unresolved=unresolved,
        )
    return RepairTargets(
        allowed=every,
        scope="unresolved",
        resolved=resolved,
        unresolved=unresolved,
    )


def screen_against_targets(
    raw_sections: Any, targets: RepairTargets
) -> tuple[Any, list[dict[str, str]]]:
    """Drop edits to sections this pass was not for.

    Runs beside the claim-id screen rather than replacing it. They refuse
    different things: that one refuses an edit resting on a fact the article
    was not written from, this one refuses an edit to a paragraph nobody
    complained about, and an edit can be either without being the other.
    """
    if not isinstance(raw_sections, list):
        return raw_sections, []
    kept: list[Any] = []
    rejected: list[dict[str, str]] = []
    for raw in raw_sections:
        section_id = _safe_str(
            raw.get("section_id") if isinstance(raw, dict) else ""
        )
        if not targets.permits(section_id):
            rejected.append(
                {
                    "section_id": section_id or "(missing)",
                    "reason": (
                        "outside the sections this repair was for "
                        f"({targets.scope})"
                    ),
                }
            )
            continue
        kept.append(raw)
    return kept, rejected


def targets_block(targets: RepairTargets, sections: list[ArticleSection]) -> str:
    """What repair is told it may change, in the words of the section map."""
    if targets.scope == "article_wide":
        return (
            "Every section. A required revision changes the whole draft's "
            "length, which cannot be done inside one paragraph."
        )
    if targets.scope == "unresolved":
        return (
            "Every section. No revision named a particular one, so the scope "
            "of this pass could not be narrowed -- change as little as the "
            "revisions allow."
        )
    headings = {
        section.section_id: section.heading or "(opening)" for section in sections
    }
    lines = [
        f"- {section_id} {headings.get(section_id, '')}".rstrip()
        for section_id in sorted(targets.allowed)
    ]
    return "\n".join(lines) or "- (none)"
