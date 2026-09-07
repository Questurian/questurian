"""Style cleanup that edits sections instead of rewriting the article.

Finding 05. The anti-AI enforcement pass is still wired in after compose and
after repair (ADR 0032 says it was dropped; it was not, and a test in
`test_prompt2blog_voice_files.py` has been recording that discrepancy). What
it receives is the finished article and a list of style errors -- not the
brief, not the facts, not the caveats attached to them. So a pass sent to
remove an em dash is holding the whole document with no idea which of its
sentences is carefully qualified, and "offered in March" can come back as
"offers today" while the dash is duly gone.

Two changes, and neither of them is a firmer instruction.

The cheap deterministic half is unchanged: the validator still runs on every
draft and still costs nothing. What changes is the expensive half. The errors
carry line numbers, so the sections that actually contain them are known
before any model is asked anything; only those are sent, only those may come
back, and the rest of the document is untouched bytes. And what is sent with
them is the repair lock -- the brief's scope and the limitations on the facts
this article used -- so the pass can see what a qualification is for.

A cleanup is advisory, and it stays advisory. One attempt. A result that is
not cleaner than what it started with is discarded and the draft it was given
is kept, because a style error is never worth a damaged fact.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.shared.text import validate_anti_ai_tells_markdown

from ..dependencies import PipelineDependencies
from ..support import _safe_dict, _safe_str
from .sections import (
    H2_LINE,
    ArticleSection,
    apply_section_replacements,
    segment_article,
)

logger = logging.getLogger(__name__)

_LINE_PREFIX = re.compile(r"^Line (\d+):")

STYLE_CLEANUP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["sections"],
    "properties": {
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["section_id", "text_hash", "content"],
                "properties": {
                    "section_id": {"type": "string"},
                    "text_hash": {"type": "string"},
                    "heading": {"type": "string"},
                    "content": {"type": "string"},
                },
            },
        }
    },
}

STYLE_CLEANUP_PROMPT = """You are fixing style errors in one or more sections \
of a finished article.

Goal:
Remove the listed errors and change nothing else.

Return strict JSON only:
{{
  "sections": [
    {{
      "section_id": "string",
      "text_hash": "string",
      "content": "string"
    }}
  ]
}}

Rules:
- Return one entry per section below, with its `section_id` and `text_hash`
  copied exactly. `content` is the full replacement body for that section,
  without its `##` heading line.
- Fix only the listed errors. This is a style pass on prose somebody has
  already checked for accuracy.
- Change no fact. Not a date, a price, a currency, a duration, a number, a
  place, a name, or a negation. "offered in March" does not become "offers
  today" because the sentence around it was rephrased.
- Keep every qualification exactly as it stands. An as-of date, a season, a
  route only some operators run, a "for most travellers" -- each of those is
  part of the fact and the article is not permitted to state the fact without
  it. Removing one is a worse outcome than leaving the style error.
- Keep first-hand experience in the words it is written in.
- Never replace a dash with a comma-bracketed aside. Rewrite the sentence into
  clean prose instead; length comes from subordination, and splitting a
  sentence is the last resort.
- Hyphenated compounds are rationed, not banned. When the count is over
  budget, keep the ones where the hyphen is the word and rephrase the rest.
  Never delete a hyphen or split a word in place.
- Fix sourcing language by stating the fact as a plain sentence and deleting
  the publication, never by swapping in another attribution verb. If a fact
  cannot stand without a source named in the sentence, delete the sentence.
- Fix a sentence that reports on the research by deleting it or by replacing
  it with something the article does know. Never soften it into a vaguer
  version of the same absence.
- If an error cannot be fixed without changing a fact, leave that sentence
  alone and fix the rest.

{guard}

SECTIONS TO FIX:
{sections}
"""


def _section_line_spans(content: str) -> dict[str, tuple[int, int]]:
    """First and last 1-based line number of each section, in the original text.

    The same `## ` rule `segment_article` splits on, walked over the same
    lines the validator numbered, so an error's line number lands in exactly
    one section.
    """
    spans: dict[str, tuple[int, int]] = {}
    index = 0
    start = 1
    lines = content.split("\n")
    for number, line in enumerate(lines, start=1):
        if H2_LINE.match(line):
            spans[f"s{index}"] = (start, number - 1)
            index += 1
            start = number
    spans[f"s{index}"] = (start, len(lines))
    return spans


def sections_with_errors(
    content: str, errors: list[str]
) -> tuple[dict[str, list[str]], list[str]]:
    """Route each style error to the section whose lines it names.

    Returns the per-section errors and the ones with no line number of their
    own. The hyphenated-compound budget is the second kind: it is counted over
    the whole document, so it belongs to every section that has compounds in
    it rather than to one.
    """
    spans = _section_line_spans(content)
    by_section: dict[str, list[str]] = {}
    unplaced: list[str] = []
    for error in errors:
        match = _LINE_PREFIX.match(error)
        if not match:
            unplaced.append(error)
            continue
        line_number = int(match.group(1))
        for section_id, (start, end) in spans.items():
            if start <= line_number <= end:
                by_section.setdefault(section_id, []).append(error)
                break
        else:  # pragma: no cover - a number outside every span cannot happen
            unplaced.append(error)
    return by_section, unplaced


def _sections_block(
    sections: list[ArticleSection],
    errors_by_section: dict[str, list[str]],
    unplaced: list[str],
) -> str:
    blocks: list[str] = []
    for section in sections:
        listed = errors_by_section.get(section.section_id)
        if not listed:
            continue
        label = section.heading or "(opening — no heading)"
        problems = "\n".join(f"  - {error}" for error in [*listed, *unplaced])
        blocks.append(
            f"SECTION {section.section_id} [{section.text_hash}] — {label}\n"
            f"Errors:\n{problems}\n"
            f"Current text:\n{section.body}"
        )
    return "\n\n".join(blocks)


def clean_up_style(
    content: str,
    *,
    dependencies: PipelineDependencies,
    job_id: str,
    model_name: str | None,
    max_tokens: int,
    context: str,
    guard: str = "",
) -> tuple[str, dict[str, Any]]:
    """Fix the style errors in the sections that have them, or keep the draft.

    Returns the content to use and a report. The report is the point of the
    second return value: a cleanup that ran, found nothing it could fix, and
    left the draft alone is a different outcome from one that never ran, and
    the old whole-article pass could not tell them apart.
    """
    original = _safe_str(content).strip()
    result = validate_anti_ai_tells_markdown(original)
    if result.valid:
        return original, {"status": "clean", "errors": []}

    sections = segment_article(original)
    errors_by_section, unplaced = sections_with_errors(original, result.errors)
    if not errors_by_section:
        # Every error is document-wide with nothing to attach it to. Nothing
        # to send that would not be the whole article again, which is the
        # thing this replaces.
        logger.warning(
            "%s has style errors with no section to place them in: %s",
            context,
            result.errors,
        )
        return original, {
            "status": "unplaceable",
            "errors": list(result.errors),
            "sections_sent": [],
        }

    approved = list(errors_by_section)
    prompt = STYLE_CLEANUP_PROMPT.format(
        guard=guard or "No additional scope guard was supplied for this pass.",
        sections=_sections_block(sections, errors_by_section, unplaced),
    )
    try:
        parsed, _raw = dependencies.llm.invoke_json(
            job_id=job_id,
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=0.0,
            model_name=model_name,
            schema=STYLE_CLEANUP_SCHEMA,
        )
    except Exception as exc:  # noqa: BLE001
        # Style is advisory. A cleanup that could not run never fails a run
        # that already has an article.
        logger.warning("%s style cleanup call failed: %s", context, exc)
        return original, {
            "status": "call_failed",
            "errors": list(result.errors),
            "sections_sent": approved,
            "detail": str(exc),
        }

    proposed = _safe_dict(parsed).get("sections")
    off_target: list[str] = []
    if isinstance(proposed, list):
        allowed = []
        for raw in proposed:
            section_id = _safe_str(_safe_dict(raw).get("section_id"))
            if section_id in approved:
                allowed.append(raw)
            else:
                off_target.append(section_id or "(missing)")
        proposed = allowed
    edit = apply_section_replacements(original, proposed)

    if not edit.changed:
        logger.warning(
            "%s style cleanup changed nothing: %s", context, edit.rejected
        )
        return original, {
            "status": "no_change",
            "errors": list(result.errors),
            "sections_sent": approved,
            "off_target_sections": off_target,
            "rejected": edit.as_dict()["rejected"],
        }

    after = validate_anti_ai_tells_markdown(edit.content)
    if len(after.errors) >= len(result.errors):
        # Not cleaner. The article it was given is the one the run keeps: a
        # style pass has no licence to make a draft worse on its way to
        # tidying it.
        logger.warning(
            "%s style cleanup did not reduce the errors (%d -> %d); keeping "
            "the original",
            context,
            len(result.errors),
            len(after.errors),
        )
        return original, {
            "status": "rejected",
            "errors": list(result.errors),
            "errors_after": list(after.errors),
            "sections_sent": approved,
            "off_target_sections": off_target,
        }

    if after.errors:
        # Advisory, not a loop. A second attempt on the same sections is the
        # repeated-rewrite behaviour this replaces.
        logger.warning(
            "%s style cleanup left issues unresolved: %s", context, after.errors
        )
    return edit.content, {
        "status": "applied",
        "errors": list(result.errors),
        "errors_after": list(after.errors),
        "sections_sent": approved,
        "sections_changed": list(edit.applied),
        "off_target_sections": off_target,
        "rejected": edit.as_dict()["rejected"],
    }
