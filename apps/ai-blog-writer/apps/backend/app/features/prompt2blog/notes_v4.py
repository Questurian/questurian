"""What a person should fix by hand, once the article exists.

A run ends with an article, a readiness stamp and some measurements, and
nothing that says what to actually do about it. The gap was found by accident
on 2026-09-01: after run 062c0b86 the owner asked what I thought of the output,
and the resulting read -- what works, what is missing, what is buried -- was
more useful than any mechanical check the run already produces. It named things
no measurement in the system can see.

So: a short ranked list of specific, placeable edits, for a person to spend
twenty minutes on. Not for another model to rewrite the piece, and not to make
the pipeline more perfect. `polish_v4` already assembles the paste-into-a-
chatbot path; this is the other branch, where the operator edits it themselves.

**The hard part is that it must never supply the missing fact.**

Run 062c0b86 was titled "Lima Has a Pyramid Older Than the Inca Empire" and the
article never gives a date. The tempting note is "add a sentence saying it
dates to around 400 AD" -- a number invented at the last possible moment, after
every evidence check in the pipeline has already run, entering the article
through the one door with no guard on it.

Three things stop that here:

1. Every item is one of two kinds, and says which. **You have this already**
   cites claims from the dossier, and the quoted text is looked up from the
   dossier rather than taken from the model, so it cannot be misquoted. **Nobody
   established this** says what is missing and nothing more.
2. An item claiming the run has something, that cites nothing the dossier
   contains, is demoted to "nobody established this". The safe direction is
   never asserting the run holds a fact it does not.
3. No note may contain a number the run does not already have. Every figure in
   the punch list must appear in the article or in the dossier. "Around 400 AD"
   appears in neither, so the note carrying it is dropped.

It is not a gate, not a score, and not a rewrite. It runs after the article is
finished and stored, so a failure here loses the notes and not the piece.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from .contracts_v4 import ArticleBrief, EvidencePackage
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

PUNCH_LIST_STAGE = "stage_v4_punch_list"
PUNCH_LIST_MAX_TOKENS = 4000

# Six items a person will act on beats thirty they will scroll past.
MAX_ITEMS = 6

ITEM_KINDS = ("add_sentence", "add_paragraph", "move", "rephrase", "cut")

# What the operator is told about where each item's fact would come from.
HAVE_IT = "have_it"
NOT_ESTABLISHED = "not_established"

_NUMBER = re.compile(r"\d[\d,.]*")
_HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
# A word that is capitalised without starting a sentence: a name, a place, a
# brand. Long enough to be distinctive rather than "The" or "And".
_PROPER = re.compile(r"(?<![.!?]\s)(?<!^)\b([A-Z][\w'’-]{3,})\b", re.MULTILINE)


def _numbers(text: str) -> set[str]:
    """Every figure in a piece of text, comparable across its own formatting.

    "16,000" and "16000" are the same number written twice, and a note that
    reformatted one would otherwise read as introducing a new one.
    """
    found = set()
    for raw in _NUMBER.findall(text or ""):
        cleaned = raw.rstrip(".,")
        if not cleaned:
            continue
        found.add(cleaned)
        found.add(cleaned.replace(",", ""))
    return found


def _proper_nouns(text: str) -> set[str]:
    return {match.casefold() for match in _PROPER.findall(text or "")}


def article_headings(markdown: str) -> list[str]:
    """The headings an item is allowed to point at.

    "In the introduction" is not a place. A note the operator cannot put their
    finger on is a note they will not act on.
    """
    return [heading.strip() for heading in _HEADING.findall(markdown or "") if heading.strip()]


def unused_claims(
    evidence: EvidencePackage,
    article_markdown: str,
) -> list[dict[str, str]]:
    """Claims the run researched, graded and then did not use.

    Fully deterministic, which is the point: these are the items that can be
    raised without any risk of inventing something, because the fact was
    researched, checked and graded before the writing started.

    A claim counts as used when any figure or name in it appears in the
    article. Deliberately generous -- one match is enough -- because telling an
    operator they left something out when they did not is worse than staying
    quiet about one they did.
    """
    article_numbers = _numbers(article_markdown)
    article_names = _proper_nouns(article_markdown)
    missed: list[dict[str, str]] = []
    for claim in evidence.claims:
        figures = _numbers(claim.text)
        names = _proper_nouns(claim.text)
        if not figures and not names:
            # Nothing distinctive enough to look for. Saying "this claim is
            # unused" on a guess is exactly the kind of noise that gets a list
            # ignored.
            continue
        if figures & article_numbers or names & article_names:
            continue
        missed.append({"claim_id": claim.claim_id, "text": claim.text})
    return missed


def numbers_the_run_does_not_have(
    text: str,
    *,
    article_markdown: str,
    evidence: EvidencePackage,
) -> list[str]:
    """Figures in a note that appear nowhere in the run's own material.

    The guard on the one door with no other guard on it. A note may repeat a
    number the article has, or one the dossier established and the article
    dropped. A number from neither was invented while writing the note, which
    is the failure this whole module is shaped around avoiding.
    """
    known = _numbers(article_markdown)
    for claim in evidence.claims:
        known |= _numbers(claim.text)
    for requirement in evidence.requirements:
        known |= _numbers(requirement.gap)
    return sorted(figure for figure in _numbers(text) if figure not in known)


PUNCH_LIST_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": list(ITEM_KINDS)},
                    "heading": {"type": "string"},
                    "where": {"type": "string"},
                    "note": {"type": "string"},
                    "needs": {"type": "string", "enum": [HAVE_IT, NOT_ESTABLISHED]},
                    "claim_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["kind", "heading", "note", "needs"],
            },
        }
    },
    "required": ["items"],
}


def build_punch_list_prompt(
    *,
    brief: ArticleBrief,
    title: str,
    article_markdown: str,
    evidence: EvidencePackage,
    unused: list[dict[str, str]],
) -> str:
    """Ask for the read a person would give it, with the run's own material."""
    headings = "\n".join(f"- {heading}" for heading in article_headings(article_markdown))
    dossier = (
        "\n".join(f"- [{claim.claim_id}] {claim.text}" for claim in evidence.claims)
        or "- Nothing. Every item you raise is the second kind."
    )
    never_used = (
        "\n".join(f"- [{item['claim_id']}] {item['text']}" for item in unused)
        or "- None. Everything researched reached the piece in some form."
    )
    return f"""Read this finished article the way an editor would, and list what one
person should fix by hand in twenty minutes.

Not a rewrite. Not a score. Somebody else is going to open this article and
make these edits themselves, so every item has to be small, specific, and
somewhere they can put their finger on.

WHAT THIS ARTICLE IS FOR
Reader: {brief.reader.primary_reader}
Their question: {brief.reader_question}
What it should make them do: {brief.outcome}
What it is built on: {brief.spine}

IT FAILS IF: {brief.fails_if}

That line defines failure for this specific piece and nothing in this system
has ever read it. Read it now. If the article is drifting toward it, that is
your first item.

THE HEADLINE IT WILL BE PUBLISHED UNDER
{title}

Whatever that line asserts is a promise to a reader who clicked it. If it names
an age, a number, a superlative, a first or an oldest, and the article does not
answer it, that is an item -- and check the dossier below before you decide
which kind it is.

THE HEADINGS YOU MAY POINT AT
{headings or "- The article has no headings."}

WHAT THE RESEARCH ESTABLISHED
{dossier}

RESEARCHED AND NEVER USED
These were checked and graded before the writing started, and did not make the
article. They are the safest items on the list: the article can use them today.
{never_used}

THE ARTICLE
{article_markdown}

WHAT TO RETURN

At most {MAX_ITEMS} items, best first. Six a person will act on beats thirty
they will scroll past. Most of the value is rearranging and re-pointing what
the article already earned, so most items should need no new information at
all.

Each item has:
- `kind`: one of add_sentence, add_paragraph, move, rephrase, cut.
- `heading`: exactly one of the headings listed above, copied as written. Use
  the heading the edit happens in, not the one it moves to.
- `where`: a few words quoted from the article so the person can find the spot.
- `note`: one line, in the reader's terms. What is wrong and what to do. Not
  "improve flow" -- say what a reader experiences and what fixes it.
- `needs`: `{HAVE_IT}` or `{NOT_ESTABLISHED}`.
- `claim_ids`: on a `{HAVE_IT}` item, the dossier claims that answer it.

THE RULE THAT MATTERS MOST

`{HAVE_IT}` means the dossier above already contains the fact and the article
did not use it. Name the claim ids. Do not retype the fact; it will be quoted
from the dossier.

`{NOT_ESTABLISHED}` means nothing in the dossier answers it. Say what is
missing and that it needs looking up. **Never state the value.** If the
headline promises an age and no research established one, the item is "the
headline promises an age, the research never established one, you need a date
before this headline is honest" -- and nothing more. Writing a plausible date
here would put an invented fact into a published article through the only step
with nothing checking it.

Any figure you write must already appear in the article or in the dossier. A
note carrying a number from neither will be thrown away.

WHAT AN ABSENCE IS FOR

Some claims in the dossier record what the research could not establish: that
nobody publishes a figure, that a list does not exist, that a price is not
posted anywhere. Those are internal. They never become a reader-facing
sentence, and an article that leaves them out has done the right thing rather
than missed something.

Never ask for one to be stated. "State clearly that repeated searches returned
no official published ranking" is not an edit anyone may make: the house rules
refuse a sentence that announces what the research could not find, so an
operator who followed it would write a sentence the pipeline rejects. If an
absence matters, the item is to cut or rewrite whatever the article built on
top of it, in terms of what the article does know.
"""


def _items_in(payload: Any) -> list[Any]:
    """The list of edits, under whichever shape the read came back in.

    Run 849ae5aa returned a bare array of four good items -- including the one
    that caught the article's own rainfall contradiction -- against a schema
    asking for `{"items": [...]}`. All four were thrown away, and the operator
    got an empty list on an article with real problems in it.

    Same lesson the evidence parser has learned three times: a schema exists so
    the model knows what to send, not so the parser can reject what arrived.
    """
    if isinstance(payload, list):
        return payload
    record = _safe_dict(payload)
    for name in ("items", "edits", "notes", "punch_list", "fixes"):
        value = record.get(name)
        if isinstance(value, list):
            return value
    return []


def _valid_items(
    payload: Any,
    *,
    article_markdown: str,
    evidence: EvidencePackage,
) -> tuple[list[dict[str, Any]], list[str]]:
    """The items that survive their own rules, and what was dropped.

    Degrade rather than fail: a run whose notes came back half usable gives the
    operator the usable half. Nothing here can stop or endanger the article,
    which is already written and stored by the time this is asked for.
    """
    headings = article_headings(article_markdown)
    by_heading = {heading.casefold(): heading for heading in headings}
    claims = {claim.claim_id: claim.text for claim in evidence.claims}

    items: list[dict[str, Any]] = []
    dropped: list[str] = []
    for raw in _items_in(payload):
        record = _safe_dict(raw)
        note = _safe_str(record.get("note"))
        kind = _safe_str(record.get("kind"))
        if not note or kind not in ITEM_KINDS:
            dropped.append("an item with no note or no kind")
            continue

        invented = numbers_the_run_does_not_have(
            note, article_markdown=article_markdown, evidence=evidence
        )
        if invented:
            # The guard doing its job. Logged loudly because a model reaching
            # for a number at this stage is the failure mode this module was
            # built around, and it should be visible when it happens.
            logger.warning(
                "Dropped a punch list item carrying figures the run does not "
                "have: %s",
                ", ".join(invented),
            )
            dropped.append(
                f"an item that introduced a figure the run does not have "
                f"({', '.join(invented)})"
            )
            continue

        cited = [
            claim_id
            for claim_id in (record.get("claim_ids") or [])
            if _safe_str(claim_id) in claims
        ]
        needs = _safe_str(record.get("needs"))
        # A claim of "you have this already" that cites nothing the dossier
        # contains is demoted rather than trusted. Telling someone the research
        # covered something it did not is how a fact gets written from memory.
        if needs != HAVE_IT or not cited:
            needs = NOT_ESTABLISHED
            cited = []

        heading = by_heading.get(_safe_str(record.get("heading")).casefold(), "")
        items.append(
            {
                "kind": kind,
                # Empty when the model named a heading the article does not
                # have. The item still reads; it just points at the piece as a
                # whole.
                "heading": heading,
                "where": _safe_str(record.get("where")),
                "note": note,
                "needs": needs,
                # Quoted from the dossier, never from the model, so an item
                # cannot misstate the fact it is pointing at.
                "have": [{"claim_id": claim_id, "text": claims[claim_id]} for claim_id in cited],
            }
        )
        if len(items) == MAX_ITEMS:
            break
    return items, dropped


def build_punch_list(
    *,
    brief: ArticleBrief,
    title: str,
    article_markdown: str,
    evidence: EvidencePackage,
    llm: Any,
    model_name: str | None,
) -> dict[str, Any]:
    """One model call over a finished article, plus the checks that are free."""
    unused = unused_claims(evidence, article_markdown)
    parsed, _raw = llm.invoke_json(
        prompt=build_punch_list_prompt(
            brief=brief,
            title=title,
            article_markdown=article_markdown,
            evidence=evidence,
            unused=unused,
        ),
        model_name=model_name,
        schema=PUNCH_LIST_SCHEMA,
        max_tokens=PUNCH_LIST_MAX_TOKENS,
        temperature=0.0,
    )
    items, dropped = _valid_items(
        parsed,
        article_markdown=article_markdown,
        evidence=evidence,
    )
    return {
        "items": items,
        # Kept beside the list because it is the deterministic half and it
        # stands on its own: these were researched, graded, and never used,
        # whatever the model did or did not say about them.
        "researched_and_unused": unused,
        "dropped": dropped,
    }
