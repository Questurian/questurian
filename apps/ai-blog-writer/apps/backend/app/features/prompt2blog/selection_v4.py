"""Which facts the article is written from (#534).

Research finds around a hundred facts. Until now nothing decided which of them
the article needed, and the writer received all of them.

Run 9e66bf84, the Lima chifa article, 1,155 words:

    105 claims, 110 sources, from 13 requirements
    the outline assigned  102 of 105 claims across 6 sections
    compose received      105 of 105

The outline did not select. It distributed -- it found a home for almost
everything and called that a plan. One 200-word section was given 56 claims,
which is three and a half words per claim, and there is no sentence you can
write at that density except a list. The article read like a database because
it was one.

Three passes stand between research and the outline.

**Deduplicate.** A model groups claims that are the same fact and names which
one survives. It never writes new claim text: a merged claim composed by a
model is prose asserting a fact, and a drifted date or price inside one would
pass groundedness, because groundedness checks the draft against the claim and
the claim is the thing that moved. Every survivor is verbatim what research
returned, and it inherits the sources and questions of everything merged into
it, so nothing loses its provenance.

**Rank.** A model orders the survivors by how much they matter to *this* brief
-- the reader question, the promise, and `fails_if`. Not by general interest: a
fact can be true, well sourced and irrelevant here.

**A person picks.** The operator sees the ranked list with a line drawn where
the keep-set ends, moves the line, and rescues or drops individual claims. That
step is the point and not a fallback. A model dropping a fact the article
needed is a silent loss the operator discovers by reading a worse article; a
person dropping it is a decision they made and can undo.

Nothing here deletes. Selection is a flag on the claim, so groundedness and the
readiness follow-up keep reading the whole dossier, a deselected claim leaves
the writer's desk and never the record, and a question it supports stays
supported. Deselecting is an editorial choice and must never become a coverage
failure.

Both model calls degrade rather than fail. When either comes back unusable the
run keeps every claim, exactly as it behaved before this existed, and the
record says which pass fell over -- an article written from all the evidence is
worse than one written from the right quarter of it, and both are better than
no article.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from .contracts_v4 import ArticleBrief, EvidencePackage, Prompt2BlogWorkOrder
from .schema_guards import require_non_empty
from .support import _safe_dict, _safe_int, _safe_str

logger = logging.getLogger(__name__)

SELECTION_STAGE = "stage_v4_selection"

# How many facts a hundred words of prose can carry and still be prose.
#
# Run 9e66bf84 ran at nine per hundred words across the article and 28 per
# hundred in its worst section. Two is the density of writing that explains,
# compares and decides rather than lists: a fact gets a clause of its own and
# room for what it means. A 900-word article keeps around eighteen.
#
# Not a hard cap. It sets where the line starts; the operator moves it.
CLAIMS_PER_HUNDRED_WORDS = 2.0

# Below this the cut is not an editorial judgement, it is an empty article.
# A short piece with a big dossier should still keep enough to write from.
MIN_KEPT_CLAIMS = 8

# One call each, and they read the same claim texts the writer would have. The
# ceiling is generous because the input scales with the dossier.
DEDUPE_MAX_TOKENS = 8_000
RANK_MAX_TOKENS = 8_000


def target_claim_count(target_word_count: int, available: int) -> int:
    """Where the cut line starts, from the length the article is aiming at.

    Derived rather than fixed, so it scales: a 2,500-word piece is allowed more
    facts than a 400-word one, and the same constant explains both.
    """
    if available <= MIN_KEPT_CLAIMS:
        return available
    wanted = int(round(max(0, target_word_count) * CLAIMS_PER_HUNDRED_WORDS / 100))
    return max(MIN_KEPT_CLAIMS, min(available, wanted))


DEDUPE_SCHEMA = require_non_empty({
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "keep": {"type": "string"},
                    "same_as": {"type": "array", "items": {"type": "string"}},
                    "why": {"type": "string"},
                },
                "required": ["keep", "same_as"],
            },
        },
    },
    "required": ["groups"],
})

RANK_SCHEMA = require_non_empty({
    "type": "object",
    "properties": {
        "ranked": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "claim_id": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["claim_id"],
            },
        },
    },
    "required": ["ranked"],
})


def build_dedupe_prompt(evidence: EvidencePackage) -> str:
    """Group the claims that are the same fact. Nothing else."""
    claims = "\n".join(
        f"- {claim.claim_id} | {claim.text}" for claim in evidence.claims
    )
    return f"""\
You are grouping research findings that say the same thing.

The dossier below was gathered by several separate searches, so the same fact
often arrives more than once in different words. Your only job is to say which
claims are the same fact.

CLAIMS
{claims}

Return strict JSON only:
{{"groups": [{{"keep": "claim_id", "same_as": ["claim_id"], "why": "string"}}]}}

Rules:
- Only group claims asserting THE SAME FACT. Different wording, different
  ordering, or a different level of politeness is the same fact.
- `keep` is the claim that states it best: the most specific, the most precise
  figure, the clearest sentence. You are choosing a survivor, not writing one.
  Never invent or rewrite claim text.
- A SUMMARY AND ITS DETAILS ARE NOT DUPLICATES. "Seven dishes define the
  cuisine" and a claim describing one of those seven dishes are two different
  facts at two levels of zoom. Both may be worth keeping and that is not your
  decision. Leave them alone.
- A general statement and a specific one are not duplicates. "Prices are low"
  and "a plate costs 15 soles" are different facts.
- Two claims about different places, dates, prices or people are never the same
  fact, however similar the sentence.
- Return only groups that actually contain a duplicate. A claim with no
  duplicate does not need a group of its own.
- Every id you return must be one of the ids above, and no id may appear twice
  anywhere in your answer.
"""


def build_rank_prompt(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    claims: list[Any],
) -> str:
    """Order what survived by how much this particular article needs it."""
    listed = "\n".join(f"- {claim.claim_id} | {claim.text}" for claim in claims)
    return f"""\
You are deciding which facts an article actually needs.

Below is the brief the article was commissioned against, and the facts research
found. Order the facts by how much THIS article needs them.

THE ARTICLE
Primary subject: {work_order.primary_subject}
Core reader question: {brief.reader_question}
The promise to keep: {brief.outcome}
Spine: {brief.spine}
Primary reader: {brief.reader.primary_reader}
This piece fails if: {brief.fails_if}
The seed it grew from: {brief.seed}

THE FACTS
{listed}

Return strict JSON only:
{{"ranked": [{{"claim_id": "string", "why": "string"}}]}}

Rules:
- Most needed first. The fact the article cannot be written without goes at the
  top; the one it loses nothing by omitting goes at the bottom.
- Rank against THIS brief, not against general interest. A fact can be true,
  well sourced, and irrelevant here. Relevance is decided by the reader
  question, the promise, and what the piece fails if it does not do.
- A fact that answers the reader's actual decision outranks a fact that is
  merely interesting background.
- A claim that restates the seed, or confirms something the brief already
  asserts, ranks low. The reader learns nothing from being told again what the
  article's own premise already said.
- A concrete figure, price, time, name or address a reader can act on
  generally outranks a general characterisation.
- `why` is one short sentence saying what the article uses this for. It is read
  by a person choosing where to draw the line.
- EVERY claim id above must appear exactly once. Ranking is ordering, not
  selecting -- the cut is made by somebody else, after you.
"""


@dataclass
class SelectionDependencies:
    """The one model this needs, and which jobs it runs as."""

    llm: Any
    dedupe_job_id: str = "p2b.evidence_dedupe"
    rank_job_id: str = "p2b.evidence_rank"
    # None means the gateway answers for the jobs above, which is what makes
    # both changeable from the dashboard.
    model_name: str | None = None


@dataclass
class Selection:
    """The ranked shortlist, the line, and the operator's changes to it.

    Held apart from the dossier so the evidence stays what research returned
    and the editorial decision stays a separate, reversible record.
    """

    # Survivors, most needed first. Deduplication's losers are not in here.
    order: list[str] = field(default_factory=list)
    # A merged claim, and the claim kept in its place.
    merged: dict[str, str] = field(default_factory=dict)
    # Where the line sits: how many from the top of `order` are kept.
    keep_count: int = 0
    # The operator's overrides. A claim below the line they want anyway, and
    # one above it they do not. Both survive the line being moved, because they
    # are decisions about that claim rather than about where the line is.
    rescued: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    # One line per claim on why the ranker put it there, for the person picking.
    reasons: dict[str, str] = field(default_factory=dict)
    target_word_count: int = 0
    # Which passes actually ran. A selection whose ranking fell over keeps
    # every claim, and this is how the receipt says so rather than implying a
    # judgement nobody made.
    deduped: bool = False
    ranked: bool = False
    note: str = ""

    def selected_claim_ids(self) -> set[str]:
        """The claims that reach the writer."""
        kept = set(self.order[: max(0, self.keep_count)])
        kept |= {item for item in self.rescued if item in self.order}
        kept -= set(self.dropped)
        return kept

    def as_record(self) -> dict[str, Any]:
        return {
            "order": list(self.order),
            "merged": dict(self.merged),
            "keep_count": self.keep_count,
            "rescued": list(self.rescued),
            "dropped": list(self.dropped),
            "reasons": dict(self.reasons),
            "target_word_count": self.target_word_count,
            "deduped": self.deduped,
            "ranked": self.ranked,
            "note": self.note,
            "selected_claim_ids": sorted(self.selected_claim_ids()),
        }

    @classmethod
    def from_record(cls, record: dict[str, Any]) -> "Selection":
        record = _safe_dict(record)
        return cls(
            order=[_safe_str(item) for item in record.get("order") or [] if _safe_str(item)],
            merged={
                _safe_str(key): _safe_str(value)
                for key, value in _safe_dict(record.get("merged")).items()
            },
            keep_count=_safe_int(record.get("keep_count"), default=0),
            rescued=[_safe_str(item) for item in record.get("rescued") or [] if _safe_str(item)],
            dropped=[_safe_str(item) for item in record.get("dropped") or [] if _safe_str(item)],
            reasons={
                _safe_str(key): _safe_str(value)
                for key, value in _safe_dict(record.get("reasons")).items()
            },
            target_word_count=_safe_int(record.get("target_word_count"), default=0),
            deduped=bool(record.get("deduped")),
            ranked=bool(record.get("ranked")),
            note=_safe_str(record.get("note")),
        )


def _rows(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = _safe_dict(payload).get(key)
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _deduplicate(
    evidence: EvidencePackage, dependencies: SelectionDependencies
) -> tuple[dict[str, str], bool]:
    """Loser claim id -> the claim kept in its place.

    Never raises. A dedupe that fails leaves every claim standing, which is
    exactly how the pipeline behaved before this existed.
    """
    known = {claim.claim_id for claim in evidence.claims}
    try:
        parsed, _raw = dependencies.llm.invoke_json(
            job_id=dependencies.dedupe_job_id,
            prompt=build_dedupe_prompt(evidence),
            model_name=dependencies.model_name,
            schema=DEDUPE_SCHEMA,
            max_tokens=DEDUPE_MAX_TOKENS,
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001 -- a lost dedupe costs nothing
        logger.warning("Prompt2Blog evidence dedupe failed: %s", exc)
        return {}, False

    merged: dict[str, str] = {}
    for group in _rows(parsed, "groups"):
        survivor = _safe_str(group.get("keep"))
        if survivor not in known or survivor in merged:
            continue
        for loser in group.get("same_as") or []:
            loser = _safe_str(loser)
            # Every guard here is the same guard: a claim is in exactly one
            # group, is never merged into itself, and is never merged into
            # something that was itself merged away. A cycle or a chain would
            # leave a claim pointing at a claim nobody can see.
            if loser in known and loser != survivor and loser not in merged:
                merged[loser] = survivor
    return {
        loser: survivor
        for loser, survivor in merged.items()
        if survivor not in merged
    }, True


def _rank(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    survivors: list[Any],
    dependencies: SelectionDependencies,
) -> tuple[list[str], dict[str, str], bool]:
    """Survivor ids most-needed-first, and one line each on why.

    Never raises, and never loses a claim. A claim the ranker forgot is
    appended in dossier order rather than dropped: an omission from a model is
    not an editorial decision, and treating it as one would cut a fact nobody
    chose to cut.
    """
    order = [claim.claim_id for claim in survivors]
    try:
        parsed, _raw = dependencies.llm.invoke_json(
            job_id=dependencies.rank_job_id,
            prompt=build_rank_prompt(brief, work_order, survivors),
            model_name=dependencies.model_name,
            schema=RANK_SCHEMA,
            max_tokens=RANK_MAX_TOKENS,
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001 -- an unranked list is still a list
        logger.warning("Prompt2Blog evidence ranking failed: %s", exc)
        return order, {}, False

    remaining = set(order)
    ranked: list[str] = []
    reasons: dict[str, str] = {}
    for row in _rows(parsed, "ranked"):
        claim_id = _safe_str(row.get("claim_id"))
        if claim_id in remaining:
            remaining.discard(claim_id)
            ranked.append(claim_id)
            if why := _safe_str(row.get("why")):
                reasons[claim_id] = why
    if remaining:
        logger.warning(
            "Prompt2Blog ranking omitted %d of %d claims; keeping them at the "
            "bottom rather than dropping them",
            len(remaining),
            len(order),
        )
    ranked.extend(item for item in order if item in remaining)
    return ranked, reasons, True


def select_evidence(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: EvidencePackage,
    dependencies: SelectionDependencies,
    *,
    target_word_count: int,
) -> Selection:
    """Deduplicate, rank, and draw the line the operator will move."""
    merged, deduped = _deduplicate(evidence, dependencies)
    survivors = [claim for claim in evidence.claims if claim.claim_id not in merged]
    order, reasons, ranked = _rank(brief, work_order, survivors, dependencies)

    keep_count = target_claim_count(target_word_count, len(order))
    notes = []
    if not deduped:
        notes.append("Deduplication did not run, so nothing was merged.")
    if not ranked:
        notes.append(
            "Ranking did not run, so this order is the dossier's own and says "
            "nothing about what the article needs."
        )
    if not deduped and not ranked:
        # Neither pass ran. Drawing a line through an unranked list would cut
        # facts by the order they were gathered in, which is not a decision.
        keep_count = len(order)
        notes.append("Every fact is kept, because nothing looked at them.")

    return Selection(
        order=order,
        merged=merged,
        keep_count=keep_count,
        reasons=reasons,
        target_word_count=target_word_count,
        deduped=deduped,
        ranked=ranked,
        note=" ".join(notes),
    )


def apply_selection(
    evidence: EvidencePackage, selection: Selection
) -> EvidencePackage:
    """Write the selection onto the dossier's claims.

    A merged claim hands the survivor its sources and its questions before it
    stands down, so deduplication cannot cost a claim its provenance and cannot
    take a question's only answer away from it.

    Requirement `claim_ids` are left exactly as research recorded them. They
    are what the coverage verdict reads, and rewriting them here would turn an
    editorial cut into a research failure -- the one thing selection must never
    be able to do.

    A claim the ranking never saw is kept. The gate can add one after selection
    has run -- an operator answering a question themselves mints a claim
    against a `firsthand` source -- and a fact somebody typed in to unblock the
    article being silently cut from it, because a model that ran before they
    typed it did not rank it, is the worst failure this could have.
    """
    survivor_of = dict(selection.merged)
    ranked = set(selection.order)
    chosen = selection.selected_claim_ids()

    extra_sources: dict[str, list[str]] = {}
    extra_requirements: dict[str, list[str]] = {}
    by_id = {claim.claim_id: claim for claim in evidence.claims}
    for loser, survivor in survivor_of.items():
        if loser not in by_id or survivor not in by_id:
            continue
        extra_sources.setdefault(survivor, []).extend(by_id[loser].source_ids)
        extra_requirements.setdefault(survivor, []).extend(by_id[loser].requirement_ids)

    claims = []
    for claim in evidence.claims:
        merged_into = survivor_of.get(claim.claim_id, "")
        selected = (
            False
            if merged_into
            else claim.claim_id in chosen or claim.claim_id not in ranked
        )
        claims.append(
            claim.model_copy(
                update={
                    "merged_into": merged_into,
                    "selected": selected,
                    "source_ids": _extended(
                        claim.source_ids, extra_sources.get(claim.claim_id)
                    ),
                    "requirement_ids": _extended(
                        claim.requirement_ids, extra_requirements.get(claim.claim_id)
                    ),
                }
            )
        )
    return evidence.model_copy(update={"claims": claims})


def _extended(existing: list[str], added: list[str] | None) -> list[str]:
    """Existing order kept, anything new appended once. The contract rejects
    a repeated reference, and a merged claim usually shares a question."""
    if not added:
        return list(existing)
    out = list(existing)
    for item in added:
        if item not in out:
            out.append(item)
    return out


def shortlist(
    evidence: EvidencePackage,
    work_order: Prompt2BlogWorkOrder,
    selection: Selection,
) -> list[dict[str, Any]]:
    """The ranked list a person picks from, in order, with the line's effect.

    One row per survivor. Deduplication's losers are not rows -- they are named
    on the survivor that absorbed them, because "these three said the same
    thing and this is the one we kept" is the useful shape, and three
    near-identical rows to tick past is the shape that made the operator stop
    reading.
    """
    by_id = {claim.claim_id: claim for claim in evidence.claims}
    question_of = {
        item.requirement_id: item.question for item in work_order.requirements
    }
    absorbed: dict[str, list[str]] = {}
    for loser, survivor in selection.merged.items():
        if loser in by_id:
            absorbed.setdefault(survivor, []).append(by_id[loser].text)

    chosen = selection.selected_claim_ids()
    rows: list[dict[str, Any]] = []
    for position, claim_id in enumerate(selection.order):
        claim = by_id.get(claim_id)
        if claim is None:
            continue
        rows.append(
            {
                "claim_id": claim_id,
                "text": claim.text,
                "rank": position + 1,
                "selected": claim_id in chosen,
                # So the operator can see when the line is not what decided it.
                "rescued": claim_id in selection.rescued,
                "dropped": claim_id in selection.dropped,
                "why": selection.reasons.get(claim_id, ""),
                "questions": [
                    question_of[item]
                    for item in claim.requirement_ids
                    if item in question_of
                ],
                "merged_in": absorbed.get(claim_id, []),
                "confidence": claim.confidence,
            }
        )
    return rows


class SelectionRefused(ValueError):
    """The picker asked for something the selection cannot mean."""


def revise(
    selection: Selection,
    *,
    keep_count: int | None = None,
    rescue: str | None = None,
    drop: str | None = None,
    clear: str | None = None,
) -> Selection:
    """One move from the picker. No model call; this is the operator's decision.

    Moving the line and marking one claim are separate on purpose. An override
    is about that claim, so it has to outlive the line moving past it -- an
    operator who rescues a fact and then widens the cut has not un-rescued it.
    """
    moves = [keep_count is not None, bool(rescue), bool(drop), bool(clear)]
    if sum(moves) != 1:
        raise SelectionRefused("Say one thing: move the line, or mark one fact.")

    known = set(selection.order)
    for claim_id in (rescue, drop, clear):
        if claim_id and claim_id not in known:
            raise SelectionRefused(f"No fact called {claim_id} in this selection.")

    rescued = [item for item in selection.rescued if item not in (rescue, drop, clear)]
    dropped = [item for item in selection.dropped if item not in (rescue, drop, clear)]
    if rescue:
        rescued.append(rescue)
    if drop:
        dropped.append(drop)

    line = selection.keep_count if keep_count is None else keep_count
    if not 0 <= line <= len(selection.order):
        raise SelectionRefused(
            f"The line goes between 0 and {len(selection.order)} facts."
        )

    revised = Selection(
        order=list(selection.order),
        merged=dict(selection.merged),
        keep_count=line,
        rescued=rescued,
        dropped=dropped,
        reasons=dict(selection.reasons),
        target_word_count=selection.target_word_count,
        deduped=selection.deduped,
        ranked=selection.ranked,
        note=selection.note,
    )
    if not revised.selected_claim_ids():
        raise SelectionRefused(
            "Keep at least one fact — there is nothing to write from otherwise."
        )
    return revised
