"""Where a sentence in the finished article came from.

Improvement 02. A finished Prompt2Blog article is a wall of prose with the
evidence behind it two stage rows away, so checking one price means reading the
dossier and matching it up by eye. The article itself must stay clean -- house
rules forbid in-article attribution, and that is not being relaxed -- so this
is an internal map from a passage to the material behind it, read by an
operator and never by a reader.

What a link is, and what it is not
----------------------------------
A link says: this passage and this chosen fact share something specific -- the
same figure, or the same distinctive phrase. That is evidence about provenance.
It is not a check that the sentence means what the fact means, and nothing here
pretends otherwise. Every automatic link is `provisional`, the summary counts
links and never calls them verified, and the one thing that can make a link
`confirmed` is a person saying so.

This is deliberately not the grounding stage. Grounding asks a model whether
the draft outruns its evidence and is authoritative about that; this is a
finding aid, computed deterministically, that costs nothing and can be wrong
without costing the run anything either.

Invalidation is recomputation
-----------------------------
Links are not stored. They are derived from the article and the frozen packet
whenever they are asked for, so a link can never describe prose that has since
changed. What *is* stored is the small set of confirmations a person made, each
against the hash of the passage they read. Edit that passage and the
confirmation is dropped, because what they confirmed is no longer what is
there.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Literal

from pydantic import BaseModel, Field

from .content.sections import _hash, segment_article
from .support import _safe_dict, _safe_str

# Bumped when a stored confirmation stops meaning what this code reads.
PROVENANCE_SCHEMA_VERSION = 1

# The stage row a run's confirmations live in. Its own row rather than part of
# the article artifact: confirmations are an operator's later work on a
# finished run, and writing them into the artifact would rewrite the record of
# what the pipeline produced.
PROVENANCE_STAGE = "stage_v4_provenance"


# ---------------------------------------------------------------------------
# Passages
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Passage:
    """One addressable paragraph of the finished article.

    A paragraph rather than a sentence. Sentence addresses move whenever a
    comma does, so a confirmation against one would be invalidated by copy
    edits that changed nothing about where the fact came from -- and the
    operator question this exists to answer ("where did that price come
    from?") is answered as well by the paragraph holding it.
    """

    passage_id: str
    section_id: str
    heading: str
    text: str

    @property
    def text_hash(self) -> str:
        # The same hash the section machinery uses, over this paragraph alone.
        return _hash(self.text)


# Markdown lines that are structure rather than prose. A heading is already
# addressed by its section and a bare list marker carries no claim of its own.
_STRUCTURAL_LINE = re.compile(r"^\s*(#{1,6}\s|>\s*$|[-*+]\s*$|\|)")


def segment_passages(content: str) -> list[Passage]:
    """Split a finished article into addressed paragraphs, in document order.

    Positional ids under the section's, so a passage address says which section
    it belongs to without a second lookup, and two identical paragraphs under
    different headings cannot collide.
    """
    passages: list[Passage] = []
    for section in segment_article(content):
        blocks = [
            block.strip()
            for block in re.split(r"\n\s*\n", section.body)
            if block.strip()
        ]
        index = 0
        for block in blocks:
            if all(
                _STRUCTURAL_LINE.match(line) or not line.strip()
                for line in block.split("\n")
            ):
                continue
            passages.append(
                Passage(
                    passage_id=f"{section.section_id}.p{index}",
                    section_id=section.section_id,
                    heading=section.heading,
                    text=block,
                )
            )
            index += 1
    return passages


# ---------------------------------------------------------------------------
# What two pieces of text have in common
# ---------------------------------------------------------------------------

# Figures a reader acts on: money, times, durations, dates, percentages, plain
# quantities. These are what the operator question is almost always about, and
# they are the one thing whose presence in both a passage and a fact is hard to
# explain any way but provenance.
# Units, longest first. Alternation is ordered, so `m` written before
# `minutes` matches only the "m" of "45 minutes" and the figure becomes
# "45 m" -- which collides with 45 metres and reads as a bug to anybody shown
# it.
_UNITS = (
    "kilometres|kilometers|kilometre|kilometer|minutes|minute|months|month|"
    "nights|night|hours|hour|weeks|week|years|year|days|day|miles|mile|"
    "km|min|hrs|hr|mi|m"
)

_FIGURE = re.compile(
    r"""
    (?P<money>[$€£¥]\s?\d[\d,.]*)
  | (?P<currency>\d[\d,.]*\s?(?:USD|EUR|GBP|PEN|COP|MXN|BRL|CLP|ARS|soles?|pesos?))
  | (?P<clock>\d{1,2}[:.]\d{2}\s?(?:am|pm)?)
  | (?P<percent>\d[\d,.]*\s?(?:%|percent))
  | (?P<measure>\d[\d,.]*\s?(?:__UNITS__)\b)
  | (?P<year>\b(?:19|20)\d{2}\b)
  | (?P<bare>\b\d[\d,.]*\b)
    """.replace("__UNITS__", _UNITS),
    re.VERBOSE | re.IGNORECASE,
)

# Small bare numbers mean nothing on their own. "2" appearing in both a
# paragraph and a fact is a coincidence, not provenance, and a link built on
# one is noise an operator has to read past.
#
# Bare numbers only. A figure carrying a currency symbol or a unit is specific
# even when it is small -- "$8" is the price the whole passage turns on, and
# filtering it because eight is a small number was the first thing this got
# wrong.
_UNREVEALING_BARE_NUMBERS = frozenset(str(number) for number in range(11))


def _figures(text: str) -> set[str]:
    found = set()
    for match in _FIGURE.finditer(text):
        token = " ".join(match.group(0).split()).casefold().rstrip(".,")
        if (
            match.lastgroup == "bare"
            and token.replace(",", "") in _UNREVEALING_BARE_NUMBERS
        ):
            continue
        found.add(token)
    return found


# Words that appear in every article and so distinguish nothing.
_COMMON_WORDS = frozenset(
    """a an the and or but if then than that this these those of for to in on at by with
    from is are was were be been being it its as not no you your they their there here
    can could will would should may might must do does did have has had about into over
    under between more most less least some any all each other same such only just also
    who whom which what when where why how one two three""".split()
)


def _phrases(text: str, length: int = 3) -> set[str]:
    """Distinctive word runs, for matching a passage to a fact by wording.

    Runs of three, because two-word overlaps between a paragraph and a fact
    about the same place are ordinary and prove nothing, while three
    consecutive uncommon words shared with a specific record are not.
    """
    words = [
        word
        for word in re.findall(r"[\w'’-]+", text.casefold())
        if word not in _COMMON_WORDS
    ]
    return {
        " ".join(words[index : index + length])
        for index in range(len(words) - length + 1)
    }


LinkBasis = Literal["figure", "phrase"]
LinkStatus = Literal["provisional", "confirmed"]
SourceKind = Literal["claim", "material"]


class ProvenanceLink(BaseModel):
    """One passage and one piece of material that share something specific."""

    passage_id: str
    # What the passage said when this link was made. A confirmation is only
    # about this text; the moment it changes, the confirmation is gone.
    passage_hash: str
    source_kind: SourceKind
    source_id: str
    basis: LinkBasis
    # The figure or phrase they share, so an operator can see *why* this was
    # matched instead of trusting that it was.
    shared: list[str] = Field(default_factory=list)
    status: LinkStatus = "provisional"
    # What the fact says, its date, and the limits on stating it. The whole
    # point of the feature: the answer without a trip to the dossier.
    text: str = ""
    as_of: str = ""
    confidence: str = ""
    operator_note: str = ""
    caveats: list[str] = Field(default_factory=list)


def _packet_caveats(packet: dict[str, Any]) -> dict[str, list[str]]:
    """Which limits bear on which chosen fact.

    Carried onto the link rather than left in the packet, because "is there a
    caveat on this price" is the second thing an operator asks and a link that
    does not answer it sends them back to the dossier anyway.
    """
    caveats: dict[str, list[str]] = {}
    for note in packet.get("notes") or []:
        record = _safe_dict(note)
        text = _safe_str(record.get("text"))
        if not text:
            continue
        for claim_id in record.get("claim_ids") or []:
            caveats.setdefault(_safe_str(claim_id), []).append(text)
    return caveats


def _material_id(index: int) -> str:
    """First-hand material has no id of its own in the packet.

    Positional, and stable for a frozen packet -- which is the only packet
    there is, because the packet is frozen at the moment writing is asked for
    and never widened.
    """
    return f"m{index}"


@dataclass(frozen=True)
class _Source:
    kind: SourceKind
    source_id: str
    text: str
    as_of: str = ""
    confidence: str = ""
    operator_note: str = ""


def _sources(packet: dict[str, Any]) -> list[_Source]:
    sources = [
        _Source(
            kind="claim",
            source_id=_safe_str(_safe_dict(fact).get("claim_id")),
            text=_safe_str(_safe_dict(fact).get("text")),
            as_of=_safe_str(_safe_dict(fact).get("as_of")),
            confidence=_safe_str(_safe_dict(fact).get("confidence")),
            operator_note=_safe_str(_safe_dict(fact).get("operator_note")),
        )
        for fact in packet.get("facts") or []
    ]
    # The operator's own words count as provenance. A sentence that traces to
    # "I waited 45 minutes on my visit" is supported by supplied experience,
    # and a map that only knew about web claims would report it as unsourced --
    # which is the exact mistake the grounding checker used to make.
    sources.extend(
        _Source(
            kind="material",
            source_id=_material_id(index),
            text=_safe_str(_safe_dict(item).get("statement")),
            operator_note=_safe_str(_safe_dict(item).get("note")),
        )
        for index, item in enumerate(packet.get("supplied_material") or [])
    )
    return [source for source in sources if source.source_id and source.text]


def link_passage(
    passage: Passage,
    sources: Iterable[_Source],
    caveats: dict[str, list[str]],
) -> list[ProvenanceLink]:
    """Every source this passage demonstrably shares something with.

    Every one of them, not the best one. Picking a winner would be this module
    forming an opinion about which fact a sentence rests on, which is exactly
    the judgement it is not entitled to make; an operator looking at three
    candidates can see that there are three.
    """
    passage_figures = _figures(passage.text)
    passage_phrases = _phrases(passage.text)
    links: list[ProvenanceLink] = []

    for source in sources:
        shared_figures = sorted(passage_figures & _figures(source.text))
        shared_phrases = sorted(passage_phrases & _phrases(source.text))
        if shared_figures:
            basis: LinkBasis = "figure"
            shared = shared_figures
        elif shared_phrases:
            basis = "phrase"
            shared = shared_phrases
        else:
            continue
        links.append(
            ProvenanceLink(
                passage_id=passage.passage_id,
                passage_hash=passage.text_hash,
                source_kind=source.kind,
                source_id=source.source_id,
                basis=basis,
                shared=shared,
                text=source.text,
                as_of=source.as_of,
                confidence=source.confidence,
                operator_note=source.operator_note,
                caveats=caveats.get(source.source_id, []),
            )
        )
    # A shared figure is stronger evidence than shared wording, so it reads
    # first. Within a basis, most overlap first.
    links.sort(key=lambda link: (link.basis != "figure", -len(link.shared), link.source_id))
    return links


class PassageProvenance(BaseModel):
    passage_id: str
    section_id: str
    heading: str
    text: str
    text_hash: str
    links: list[ProvenanceLink] = Field(default_factory=list)
    # Carries a figure but no link to a fact carrying it. The most useful thing
    # this map produces, and the reason it is worth computing at all: a price
    # in the prose that matches nothing on the desk is either a fact stated
    # differently from its record, or one that came from nowhere.
    unmatched_figures: list[str] = Field(default_factory=list)


class ProvenanceReport(BaseModel):
    schema_version: Literal[1] = PROVENANCE_SCHEMA_VERSION
    run_id: str
    passages: list[PassageProvenance] = Field(default_factory=list)
    summary: dict[str, Any] = Field(default_factory=dict)


def _summary(passages: list[PassageProvenance]) -> dict[str, Any]:
    """Counts, and a sentence saying what they are not.

    The report asks for missing links and lost qualifications to be measured
    and for link count never to be used as proof of truth. The refusal is
    written into the payload rather than left to whoever reads it, because a
    number labelled "linked" on a screen will be read as "checked" by the third
    person who sees it.
    """
    linked = [passage for passage in passages if passage.links]
    confirmed = [
        passage
        for passage in passages
        if any(link.status == "confirmed" for link in passage.links)
    ]
    unmatched = [passage for passage in passages if passage.unmatched_figures]
    return {
        "passages": len(passages),
        "passages_with_links": len(linked),
        "passages_with_a_confirmed_link": len(confirmed),
        "passages_with_no_link": len(passages) - len(linked),
        "passages_with_an_unmatched_figure": len(unmatched),
        "means": (
            "A link means a passage and a chosen fact share a figure or a "
            "distinctive phrase. It is not a check that the sentence means "
            "what the fact means, and these counts are not a measure of how "
            "much of the article is true. Passages with no link are often "
            "judgement, transition, or general background, which are allowed "
            "to have no fact behind them."
        ),
    }


def build_provenance(
    run_id: str,
    markdown: str,
    packet: dict[str, Any],
    confirmations: dict[str, Any] | None = None,
) -> ProvenanceReport:
    """Map a finished article onto the material it was written from.

    Derived every time rather than stored, so the map can never describe prose
    that has since changed.
    """
    sources = _sources(packet)
    caveats = _packet_caveats(packet)
    confirmed = _confirmed_pairs(confirmations)

    passages: list[PassageProvenance] = []
    for passage in segment_passages(markdown):
        links = link_passage(passage, sources, caveats)
        for link in links:
            if (passage.text_hash, link.source_kind, link.source_id) in confirmed:
                link.status = "confirmed"
        matched = {figure for link in links for figure in link.shared}
        passages.append(
            PassageProvenance(
                passage_id=passage.passage_id,
                section_id=passage.section_id,
                heading=passage.heading,
                text=passage.text,
                text_hash=passage.text_hash,
                links=links,
                unmatched_figures=sorted(_figures(passage.text) - matched),
            )
        )
    return ProvenanceReport(
        run_id=run_id, passages=passages, summary=_summary(passages)
    )


# ---------------------------------------------------------------------------
# What a person said they had checked
# ---------------------------------------------------------------------------


class Confirmation(BaseModel):
    """A person read this passage against this fact and agreed they match."""

    passage_hash: str = Field(min_length=1)
    source_kind: SourceKind
    source_id: str = Field(min_length=1)
    reviewer: str = ""
    confirmed_at: str = ""
    note: str = ""


class ConfirmationRecord(BaseModel):
    schema_version: Literal[1] = PROVENANCE_SCHEMA_VERSION
    confirmations: list[Confirmation] = Field(default_factory=list)


def _confirmed_pairs(
    confirmations: dict[str, Any] | None,
) -> set[tuple[str, str, str]]:
    if not confirmations:
        return set()
    record = ConfirmationRecord.model_validate(confirmations)
    return {
        (item.passage_hash, item.source_kind, item.source_id)
        for item in record.confirmations
    }


def prune_confirmations(
    confirmations: dict[str, Any] | None, markdown: str
) -> ConfirmationRecord:
    """Drop every confirmation whose passage is no longer what was read.

    This is the invalidation the report asks for, and it is a deletion rather
    than a flag on purpose: a confirmation kept beside changed prose is worse
    than none, because it is the one thing on the screen that says somebody
    checked.
    """
    if not confirmations:
        return ConfirmationRecord()
    live = {passage.text_hash for passage in segment_passages(markdown)}
    record = ConfirmationRecord.model_validate(confirmations)
    return ConfirmationRecord(
        confirmations=[
            item for item in record.confirmations if item.passage_hash in live
        ]
    )


# ---------------------------------------------------------------------------
# Reading one run
# ---------------------------------------------------------------------------


class PacketNotStored(LookupError):
    """This run has no frozen packet, so it has no provenance to show.

    Every run started before improvement 02 is in this position: the packet
    reached the writer, the run finished, and the only durable trace left is
    its receipt. Rebuilding one from the selection would produce a *different*
    packet whenever the operator has since changed their mind -- which is
    precisely when somebody asks where a sentence came from -- so this refuses
    instead. A refusal is honest and costs nothing; a plausible wrong map
    would be read as an answer.
    """


def frozen_packet(run_id: str) -> dict[str, Any]:
    from app.core import read_stage_result

    from .intake_v3 import RUN_INPUT_STAGE

    stored = _safe_dict(
        _safe_dict(read_stage_result(run_id, RUN_INPUT_STAGE)).get("data")
    )
    packet = _safe_dict(stored.get("packet"))
    if not packet.get("facts") and not packet.get("supplied_material"):
        raise PacketNotStored(
            f"Run {run_id} did not record the packet its writer was given, so "
            "where each passage came from cannot be shown for it."
        )
    return packet


def stored_confirmations(run_id: str) -> dict[str, Any]:
    from app.core import read_stage_result

    return _safe_dict(
        _safe_dict(read_stage_result(run_id, PROVENANCE_STAGE)).get("data")
    )
