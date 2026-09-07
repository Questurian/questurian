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
import re
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

# How much of the keep-set is held for colour rather than proof.
#
# Ranking against the brief means ranking against the reader question, the
# outcome and `fails_if`. Every one of those is a question about usefulness, so
# a fact whose only job is to make a place feel like a place loses to a price
# band every time. It is not that the ranker is wrong; it is that it was asked
# one question and answered it.
#
# Measured on the ceviche run 8a7e9aa4: 23 texture claims in the dossier, two
# selected. The best line in the whole run -- Canta Rana's dining room is
# bare-bones and covered in football flags because the owner is Argentine --
# ranked 59th of 151 and was cut. The article that came out was accurate,
# useful and had nothing in it anybody would repeat to a friend.
#
# A fifth, because texture is seasoning. A piece that is one-fifth colour reads
# as written by a person; one that is half colour has stopped answering the
# question it was commissioned to answer.
TEXTURE_SHARE = 0.2

# One call each, and they read the same claim texts the writer would have. The
# ceiling is generous because the input scales with the dossier.
DEDUPE_MAX_TOKENS = 8_000
RANK_MAX_TOKENS = 8_000


def texture_claim_ids(
    work_order: Prompt2BlogWorkOrder, evidence: EvidencePackage
) -> set[str]:
    """Claims whose only job is colour.

    A claim that also answers a load-bearing question is doing load-bearing
    work, whatever else it does, so only claims serving texture questions
    exclusively are counted here. The work order already draws this line and
    coverage already refuses a run with no texture answered; selection was the
    one stage that could not see it.
    """
    kinds = {item.requirement_id: item.kind for item in work_order.requirements}
    return {
        claim.claim_id
        for claim in evidence.claims
        if claim.requirement_ids
        and all(kinds.get(item) == "texture" for item in claim.requirement_ids)
    }


def article_fact_budget(target_word_count: int) -> int:
    """How many facts an article this long has room for, before any dossier.

    Split out of `target_claim_count` because the number is needed twice, at
    opposite ends of the run. Selection needs it against a dossier it can
    count. The research planner needs it before a single question has been
    asked, and there is nothing to count yet -- which is exactly the gap that
    let run e23257c0 buy 57 questions, find 431 facts, and hand the writer the
    same eighteen a 15-question run handed it.

    Two definitions of "how many facts fit" would drift, and the one the
    planner reads would be the one nobody checked.
    """
    return max(
        MIN_KEPT_CLAIMS,
        int(round(max(0, target_word_count) * CLAIMS_PER_HUNDRED_WORDS / 100)),
    )


def target_claim_count(target_word_count: int, available: int) -> int:
    """Where the cut line starts, from the length the article is aiming at.

    Derived rather than fixed, so it scales: a 2,500-word piece is allowed more
    facts than a 400-word one, and the same constant explains both.
    """
    if available <= MIN_KEPT_CLAIMS:
        return available
    return min(available, article_fact_budget(target_word_count))


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

FOLD_SCHEMA = require_non_empty({
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "general": {"type": "string"},
                    "restatements": {"type": "array", "items": {"type": "string"}},
                    "attribute": {"type": "string"},
                },
                "required": ["general", "restatements"],
            },
        },
    },
    "required": ["groups"],
})

FOLD_MAX_TOKENS = 8_000

# What a fact is for in the finished piece. Editorial roles, and deliberately
# not the work order's question kinds: a load-bearing question can produce a
# fact whose job in the article is colour, and a texture question can produce
# the one price the reader needs.
#
# They travel to the outline, which groups its sections on them, and to the
# picker, which shows the operator what each fact is doing. Nothing gates on
# them: a role is a description, and a wrong one costs a fact its heading, not
# its place in the article.
PACKET_ROLES = ("backbone", "practical", "texture")

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
                    # Not required, and deliberately not an enum. The shape
                    # check runs over the whole response after generation and
                    # raises on the first value outside an enum, so one row
                    # labelled `vibes` would throw away the entire ranking --
                    # and an unranked list keeps every fact, which is the
                    # failure this module exists to prevent. The allowed values
                    # are in the prompt, and `_rank` discards anything else.
                    # A description for a person and a heading for the outline
                    # is not worth an article's worth of facts.
                    "role": {"type": "string"},
                },
                "required": ["claim_id"],
            },
        },
    },
    "required": ["ranked"],
})


def handles(claims: list[Any]) -> tuple[dict[str, str], dict[str, str]]:
    """Short names for the prompt, and the map back to real claim ids.

    Claim ids are namespaced by the question that produced them, so they run to
    76 characters -- `req_neighbourhood_chifa_characteristics:ncc_18`. Asked to
    copy a hundred of those, a model shortens them: the first real ranking came
    back correctly ordered, with good reasoning, and every id rewritten to
    `ncc_18` or invented outright as `clm_titi_name`. Not one of 102 matched,
    and the ranking was thrown away.

    This is #499 again -- a model copies a short handle and the application
    restores the real value -- and the same answer works. The handle carries no
    meaning, so there is nothing in it to abbreviate.
    """
    to_handle = {claim.claim_id: f"f{index}" for index, claim in enumerate(claims, 1)}
    return to_handle, {handle: real for real, handle in to_handle.items()}


def build_dedupe_prompt(evidence: EvidencePackage) -> str:
    """Group the claims that are the same fact. Nothing else."""
    to_handle, _ = handles(list(evidence.claims))
    claims = "\n".join(
        f"- {to_handle[claim.claim_id]} | {claim.text}" for claim in evidence.claims
    )
    return f"""\
You are grouping research findings that say the same thing.

The dossier below was gathered by several separate searches, so the same fact
often arrives more than once in different words. Your only job is to say which
claims are the same fact.

CLAIMS
{claims}

Return strict JSON only:
{{"groups": [{{"keep": "f1", "same_as": ["f7"], "why": "string"}}]}}

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
- Two claims about different places, dates, times, prices, hours or people are
  never the same fact, however similar the sentence. Two opening times that
  differ by fifteen minutes are a disagreement, not a repetition.
- Return only groups that actually contain a duplicate. A claim with no
  duplicate does not need a group of its own.
- Use the labels above exactly as written (f1, f2, ...). Never invent a
  label, never shorten one, and never use any other name for a claim.
- Every label you return must be one of the labels above, and no label may
  appear twice anywhere in your answer.
"""


def build_fold_prompt(claims: list[Any]) -> str:
    """Group one fact restated item by item, and name the claim that covers all of it."""
    to_handle, _ = handles(claims)
    listed = "\n".join(f"- {to_handle[claim.claim_id]} | {claim.text}" for claim in claims)
    return f"""\
You are finding one fact that the dossier states over and over, once per item.

Research asks about each place separately, so a fare that is the same
everywhere arrives as one claim per place. To a reader that is a single
sentence. To the writer it looks like fifteen separate things to say, and the
article ends up saying the fare fifteen times.

CLAIMS
{listed}

Return strict JSON only:
{{"groups": [{{"general": "f1", "restatements": ["f7"], "attribute": "fare"}}]}}

Rules:
- A group is ONE attribute, at ONE value, stated for several different items.
  "The fare is 200 across the network" with "Barón is 200", "Cordillera is
  200", "El Peral is 200" is a group. The general claim goes in `general` and
  the item-by-item ones go in `restatements`.
- `general` MUST be a claim that already covers every item in the group. It is
  the claim a reader would accept on its own. If no claim in the dossier states
  the general case, DO NOT make a group: picking one item to stand for the rest
  would delete the others from the article.
- A DIFFERENT VALUE IS NEVER A RESTATEMENT. If one item costs 300 where the
  rest cost 200, that item is the exception the reader needs most. Leave it
  out of the group and leave it alone.
- Group only what is genuinely the same attribute. A fare and an opening time
  are two attributes, however alike the sentences look.
- Never invent or rewrite claim text. You are naming which claim covers the
  others, not writing one.
- Use the labels above exactly as written (f1, f2, ...). Never invent a label
  and never use a label twice anywhere in your answer.
"""


def build_rank_prompt(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    claims: list[Any],
) -> str:
    """Order what survived by how much this particular article needs it."""
    to_handle, _ = handles(claims)
    listed = "\n".join(f"- {to_handle[claim.claim_id]} | {claim.text}" for claim in claims)
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
{{"ranked": [{{"claim_id": "f1", "why": "string", "role": "backbone"}}]}}

Rules:
- Most needed first. The fact the article cannot be written without goes at the
  top; the one it loses nothing by omitting goes at the bottom.
- `role` says what this fact is FOR in the finished piece. Exactly one of:
    backbone  — the piece argues from it. Take it away and the spine does not
                stand up: the thing that makes the case, establishes the
                claim, or explains why any of this is so.
    practical — the reader acts on it. A price, an opening hour, an address, a
                journey time, a booking rule; anything that changes what they
                do next.
    texture   — it makes the place real. A named thing, an odd detail,
                something a person did. It proves nothing and the piece is
                worse without it.
  A fact can look like two of these. Ask what the article would lose by cutting
  it: the argument, the reader's next step, or the sense of the place.
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
- Use the labels above exactly as written (f1, f2, ...). Never invent a
  label, never shorten one, and never use any other name for a claim.
- EVERY label above must appear exactly once. Ranking is ordering, not
  selecting -- the cut is made by somebody else, after you.
"""


def build_texture_prompt(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    claims: list[Any],
) -> str:
    """Order the colour by how much of the place it carries.

    A separate question from the main ranking, deliberately. Asked which facts
    the article needs, a model correctly answers with prices and opening hours.
    Colour has to be judged on what it is for, or it is judged on what it is
    not.
    """
    to_handle, _ = handles(claims)
    listed = "\n".join(f"- {to_handle[claim.claim_id]} | {claim.text}" for claim in claims)
    return f"""\
You are choosing the details that make a piece of writing worth reading.

Below are facts about {work_order.primary_subject} that carry no practical
information -- no prices, no addresses, no opening hours. They are the colour.
Order them by how much each one makes a place feel like a real place a person
could walk into.

THE ARTICLE
Primary subject: {work_order.primary_subject}
Core reader question: {brief.reader_question}
Primary reader: {brief.reader.primary_reader}

THE DETAILS
{listed}

Return strict JSON only:
{{"ranked": [{{"claim_id": "f1", "why": "string"}}]}}

Rules:
- Most vivid and most specific first. A detail somebody would repeat to a
  friend goes at the top.
- SPECIFIC BEATS EVALUATIVE, ALWAYS. "The walls are covered in football flags
  because the owner is Argentine" is worth ten of "the atmosphere is lively and
  authentic". A sentence that could describe a hundred places describes none.
- A named thing, an odd fact, a number nobody expected, something a person did:
  these are what a reader remembers. Adjectives are not.
- Rank low anything that is a definition, a category, or a general truth about
  the cuisine or the city. That is reference material wearing colour's clothes.
- Rank low anything that reads as marketing: "beloved", "hidden gem",
  "must-visit", "world-renowned".
- Use the labels above exactly as written (f1, f2, ...). Never invent a label,
  never shorten one, and never use any other name for a claim.
- EVERY label above must appear exactly once. This is ordering, not selecting.
"""


@dataclass
class SelectionDependencies:
    """The one model this needs, and which jobs it runs as."""

    llm: Any
    dedupe_job_id: str = "p2b.evidence_dedupe"
    fold_job_id: str = "p2b.evidence_fold"
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
    # Claims whose only job is colour, best first, judged on how much of the
    # place they carry rather than on what they prove.
    texture_order: list[str] = field(default_factory=list)
    # How many of `keep_count` are held for them. Held, not added: the operator
    # asked for this many facts and gets this many.
    texture_reserve: int = 0
    target_word_count: int = 0
    # What each chosen fact is here to do: backbone, practical or texture.
    # Editorial roles, deliberately not the work order's question kinds -- a
    # load-bearing question can produce a fact whose job in the finished piece
    # is colour. Set by the ranking pass, which is asked for one per fact, and
    # missing for a fact it did not label or a selection made before roles
    # existed. The packet reads `texture_order` as the older, narrower version
    # of the same idea, so a colour row is never unlabelled.
    roles: dict[str, str] = field(default_factory=dict)
    # What this choice was made against. Nothing recorded which dossier
    # revision was on screen when the operator picked, so an answer supplied at
    # the gate, a re-asked question or a corrected claim could move the
    # evidence underneath a selection and the writer would still be handed it
    # as if it had chosen what it now contains.
    brief_fingerprint: str = ""
    work_order_fingerprint: str = ""
    evidence_fingerprint: str = ""
    # Which passes actually ran. A selection whose ranking fell over keeps
    # every claim, and this is how the receipt says so rather than implying a
    # judgement nobody made.
    deduped: bool = False
    ranked: bool = False
    note: str = ""

    def selected_claim_ids(self) -> set[str]:
        """The claims that reach the writer, colour included.

        Filling straight down the ranked list is what starved the article: the
        ranking answers "what does this piece need", so the top of it is prices
        and hours all the way down. The reserve takes the best colour first and
        fills the rest from the top of the list, which keeps the total at the
        number the operator asked for and stops the cut being decided by one
        criterion answering for two.
        """
        keep = max(0, self.keep_count)
        reserve = min(self.texture_reserve, keep, len(self.texture_order))
        colour = self.texture_order[:reserve]
        rest = [item for item in self.order if item not in set(colour)]
        kept = set(colour) | set(rest[: max(0, keep - len(colour))])
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
            "texture_order": list(self.texture_order),
            "texture_reserve": self.texture_reserve,
            "target_word_count": self.target_word_count,
            "roles": dict(self.roles),
            "brief_fingerprint": self.brief_fingerprint,
            "work_order_fingerprint": self.work_order_fingerprint,
            "evidence_fingerprint": self.evidence_fingerprint,
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
            texture_order=[
                _safe_str(item) for item in record.get("texture_order") or [] if _safe_str(item)
            ],
            texture_reserve=_safe_int(record.get("texture_reserve"), default=0),
            target_word_count=_safe_int(record.get("target_word_count"), default=0),
            roles={
                _safe_str(key): _safe_str(value)
                for key, value in _safe_dict(record.get("roles")).items()
            },
            # Empty on every selection stored before bindings existed. Read as
            # "this one cannot be checked", not as "this one matches".
            brief_fingerprint=_safe_str(record.get("brief_fingerprint")),
            work_order_fingerprint=_safe_str(record.get("work_order_fingerprint")),
            evidence_fingerprint=_safe_str(record.get("evidence_fingerprint")),
            deduped=bool(record.get("deduped")),
            ranked=bool(record.get("ranked")),
            note=_safe_str(record.get("note")),
        )


def _rows(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = _safe_dict(payload).get(key)
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _disputed_pairs(evidence: EvidencePackage) -> set[frozenset[str]]:
    """Every pair of claims the dossier itself says disagree.

    `record_detected_conflicts` already finds these and nothing downstream used
    them. A conflict is the strongest possible evidence that two claims are not
    the same fact -- it is the dossier saying so in as many words.
    """
    pairs: set[frozenset[str]] = set()
    for conflict in evidence.conflicts:
        ids = [
            _safe_str(item)
            for item in (getattr(conflict, "claim_ids", None) or [])
            if _safe_str(item)
        ]
        for index, first in enumerate(ids):
            for second in ids[index + 1 :]:
                pairs.add(frozenset((first, second)))
    return pairs


def _deduplicate(
    evidence: EvidencePackage, dependencies: SelectionDependencies
) -> tuple[dict[str, str], bool]:
    """Loser claim id -> the claim kept in its place.

    Never raises. A dedupe that fails leaves every claim standing, which is
    exactly how the pipeline behaved before this existed.
    """
    _, from_handle = handles(list(evidence.claims))
    known = {claim.claim_id for claim in evidence.claims}
    # Claims the dossier has already recorded as disagreeing with each other.
    # Merging across one of these picks a winner in a factual dispute and
    # deletes the loser from the writer's desk, silently.
    disputed = _disputed_pairs(evidence)
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
        survivor = from_handle.get(_safe_str(group.get("keep")), "")
        if survivor not in known or survivor in merged:
            continue
        for loser in group.get("same_as") or []:
            loser = from_handle.get(_safe_str(loser), "")
            # Every guard here is the same guard: a claim is in exactly one
            # group, is never merged into itself, and is never merged into
            # something that was itself merged away. A cycle or a chain would
            # leave a claim pointing at a claim nobody can see.
            if loser in known and loser != survivor and loser not in merged:
                if frozenset((loser, survivor)) in disputed:
                    # Run 3750891f: the dossier held Titi's Sunday opening as
                    # both 12:30 and 12:45 and recorded the conflict. Dedupe
                    # merged the correct claim into the wrong one, so the
                    # writer only ever saw 12:45 while groundedness read the
                    # whole dossier and failed the draft for it.
                    logger.warning(
                        "Prompt2Blog dedupe refused to merge %s into %s: the "
                        "dossier records them as conflicting",
                        loser,
                        survivor,
                    )
                    continue
                merged[loser] = survivor
    return {
        loser: survivor
        for loser, survivor in merged.items()
        if survivor not in merged
    }, True


_CLOCK = re.compile(r"\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?", re.IGNORECASE)
_NUMBER = re.compile(r"\d[\d,.]*")


def _figures(text: str) -> set[str]:
    """Every number a claim states, in one spelling.

    Times are normalised to a 24-hour clock and thousands separators dropped,
    so "9:30 PM" and "21:30" are one figure and "$1,000" and "1000" are one
    figure. Without that the guard below refuses folds it should allow, which
    is the safe direction but a wasteful one.
    """
    found: set[str] = set()
    remainder = text
    for hour, minute, meridiem in _CLOCK.findall(text):
        value = int(hour) % 12
        if meridiem and meridiem.lower().startswith("p"):
            value += 12
        elif not meridiem:
            value = int(hour)
        found.add(f"{value:02d}:{minute}")
    remainder = _CLOCK.sub(" ", remainder)
    for number in _NUMBER.findall(remainder):
        cleaned = number.replace(",", "").rstrip(".")
        if cleaned:
            found.add(str(int(float(cleaned))) if cleaned.replace(".", "", 1).isdigit() else cleaned)
    return found


def _fold_restatements(
    survivors: list[Any],
    evidence: EvidencePackage,
    dependencies: SelectionDependencies,
) -> tuple[dict[str, str], bool]:
    """Restated claim id -> the general claim that already covers it.

    Deduplication is forbidden to merge these, and rightly: "Baron costs 200"
    and "Cordillera costs 200" are two true statements about two different
    places, and a pass that treated them as one fact would also merge two
    genuinely different prices. So they all survive, and the writer receives
    one fact fifteen times.

    Measured on run e001d48c: of 164 claims reaching the ranker, 30 were the
    fare and 18 were the opening hours -- the same two numbers restated once
    per ascensor. Deduplication merged three claims in the whole dossier. The
    article printed the fare in six of its seven sections.

    This pass folds the restatements into the claim that already states the
    general case, so the writer receives "the fare is 200, except at
    Concepcion" once. Nothing is authored: the survivor is a claim research
    returned, and `apply_selection` hands it the sources and questions of
    everything folded into it.

    Never raises. A fold that fails leaves every claim standing.
    """
    _, from_handle = handles(survivors)
    known = {claim.claim_id for claim in survivors}
    texts = {claim.claim_id: claim.text for claim in survivors}
    disputed = _disputed_pairs(evidence)
    try:
        parsed, _raw = dependencies.llm.invoke_json(
            job_id=dependencies.fold_job_id,
            prompt=build_fold_prompt(survivors),
            model_name=dependencies.model_name,
            schema=FOLD_SCHEMA,
            max_tokens=FOLD_MAX_TOKENS,
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001 -- a lost fold costs nothing
        logger.warning("Prompt2Blog evidence fold failed: %s", exc)
        return {}, False

    folded: dict[str, str] = {}
    for group in _rows(parsed, "groups"):
        general = from_handle.get(_safe_str(group.get("general")), "")
        if general not in known or general in folded:
            continue
        for item in group.get("restatements") or []:
            restatement = from_handle.get(_safe_str(item), "")
            if restatement not in known or restatement == general:
                continue
            if restatement in folded:
                continue
            if frozenset((restatement, general)) in disputed:
                logger.warning(
                    "Prompt2Blog fold refused %s into %s: the dossier records "
                    "them as conflicting",
                    restatement,
                    general,
                )
                continue
            # The exception is the fact the reader needs most, and it is the
            # one this pass would quietly delete. A restatement may not state a
            # figure the general claim does not: 300 folded into 200 is the
            # price of one ascensor disappearing from the article.
            extra = _figures(texts[restatement]) - _figures(texts[general])
            if extra:
                logger.info(
                    "Prompt2Blog fold refused %s into %s: it states %s, which "
                    "the general claim does not",
                    restatement,
                    general,
                    ", ".join(sorted(extra)),
                )
                continue
            folded[restatement] = general
    return {
        item: general
        for item, general in folded.items()
        if general not in folded
    }, True


def _rank(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    survivors: list[Any],
    dependencies: SelectionDependencies,
) -> tuple[list[str], dict[str, str], dict[str, str], bool]:
    """Survivor ids most-needed-first, one line each on why, and what each is for.

    Never raises, and never loses a claim. A claim the ranker forgot is
    appended in dossier order rather than dropped: an omission from a model is
    not an editorial decision, and treating it as one would cut a fact nobody
    chose to cut.
    """
    order = [claim.claim_id for claim in survivors]
    _, from_handle = handles(survivors)
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
        return order, {}, {}, False

    remaining = set(order)
    ranked: list[str] = []
    reasons: dict[str, str] = {}
    roles: dict[str, str] = {}
    for row in _rows(parsed, "ranked"):
        claim_id = from_handle.get(_safe_str(row.get("claim_id")), "")
        if claim_id in remaining:
            remaining.discard(claim_id)
            ranked.append(claim_id)
            if why := _safe_str(row.get("why")):
                reasons[claim_id] = why
            # A role the schema does not know is no role. Unlabelled is an
            # honest state and the outline handles it; a made-up heading is not.
            if (role := _safe_str(row.get("role"))) in PACKET_ROLES:
                roles[claim_id] = role
    if remaining:
        logger.warning(
            "Prompt2Blog ranking omitted %d of %d claims; keeping them at the "
            "bottom rather than dropping them",
            len(remaining),
            len(order),
        )
    ranked.extend(item for item in order if item in remaining)
    # A call that returned is not a ranking that happened. The first real run
    # came back with 102 rows and matched none of them, and this reported
    # itself as ranked -- so a line was drawn at 18 through a list in the order
    # research happened to return, which is not a decision anyone made.
    return ranked, reasons, roles, bool(ranked and not remaining == set(order))


def _rank_texture(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    claims: list[Any],
    dependencies: SelectionDependencies,
) -> tuple[list[str], dict[str, str]]:
    """Colour, best first. Never raises; an empty order simply reserves nothing.

    Runs as `p2b.evidence_rank` rather than a job of its own. It is the same
    work -- ordering evidence against a brief -- over a subset with a different
    question, and two jobs that would always route to the same model are noise
    in a registry whose point is that each entry is a decision.
    """
    if not claims:
        return [], {}
    order = [claim.claim_id for claim in claims]
    _, from_handle = handles(claims)
    try:
        parsed, _raw = dependencies.llm.invoke_json(
            job_id=dependencies.rank_job_id,
            prompt=build_texture_prompt(brief, work_order, claims),
            model_name=dependencies.model_name,
            schema=RANK_SCHEMA,
            max_tokens=RANK_MAX_TOKENS,
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001 -- colour is the cheapest thing to lose
        logger.warning("Prompt2Blog texture ranking failed: %s", exc)
        return order, {}

    remaining = set(order)
    ranked: list[str] = []
    reasons: dict[str, str] = {}
    for row in _rows(parsed, "ranked"):
        claim_id = from_handle.get(_safe_str(row.get("claim_id")), "")
        if claim_id in remaining:
            remaining.discard(claim_id)
            ranked.append(claim_id)
            if why := _safe_str(row.get("why")):
                reasons[claim_id] = why
    ranked.extend(item for item in order if item in remaining)
    return ranked, reasons


# Sources whose claims a person wrote themselves. A gate answer is minted
# against one of these: the operator typed the fact to unblock the article, so
# a rebind keeps it rather than filing it behind a line drawn before it existed.
OPERATOR_SOURCE_TYPES = {"firsthand"}


def rebind(
    selection: Selection,
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: EvidencePackage,
) -> tuple[Selection, str]:
    """Carry an operator's choices onto a dossier that moved under them.

    The gate is not the end of research. Answering a question mints a claim,
    re-asking one replaces a batch of them, dropping a venue removes one, and
    noting a venue changes what a fact means. Every one of those happens after
    selection has run, on the same screen, and every one of them used to leave
    the choice describing a dossier that no longer existed -- which the packet
    then refused to write from. A venue note and a refusal to write are not the
    same size of event.

    Reconciliation by stable id, and nothing else. No model call, no re-rank: a
    note on a venue says nothing about which facts this article needs, and
    buying a ranking to answer a question nobody asked is how a cheap edit
    turns expensive. A fact whose id survived keeps every decision made about
    it; one whose id is gone takes its decisions with it.

    New facts are not all the same. One the operator typed themselves is kept,
    because a person supplying an answer to unblock the article and then
    finding it silently cut is the worst failure this could have. Ones that
    arrived from research go in behind the line, visible in the picker as
    reserve: a re-ask can return twenty claims, and quietly passing all of them
    to the writer is the density this exists to prevent.

    Returns the rebound selection and one sentence on what moved, empty when
    nothing did.
    """
    # Deduplication's losers are not new facts and never were. The merge lives
    # on the selection, not on the stored dossier -- `apply_selection` writes
    # `merged_into` into the request it builds and never back into storage --
    # so a rebind reading only the claim's own flag sees every loser as a fact
    # that has just arrived. On run 3750891f that was 24 of them, reported to
    # the operator as new findings, and two were sourced first-hand: kept as
    # answers the operator typed, then refused by the packet for being merged
    # into something else.
    stood_down = set(selection.merged)
    live = [
        claim
        for claim in evidence.claims
        if not claim.merged_into and claim.claim_id not in stood_down
    ]
    known = {claim.claim_id for claim in live}
    seen = set(selection.order)
    operator_sources = {
        source.source_id
        for source in evidence.sources
        if source.source_type in OPERATOR_SOURCE_TYPES
    }

    order = [claim_id for claim_id in selection.order if claim_id in known]
    lost = len(selection.order) - len(order)

    typed_in = [
        claim.claim_id
        for claim in live
        if claim.claim_id not in seen
        and set(claim.source_ids) & operator_sources
    ]
    researched = [
        claim.claim_id
        for claim in live
        if claim.claim_id not in seen and claim.claim_id not in set(typed_in)
    ]
    # The operator's own answers go above the line, the rest behind it. Both
    # join `order`, because a fact the selection cannot name is a fact the
    # picker cannot show and the packet would refuse.
    order = [*order, *typed_in, *researched]

    rebound = Selection(
        order=order,
        merged={
            loser: survivor
            for loser, survivor in selection.merged.items()
            if survivor in known
        },
        # The line is a position in `order`, so it moves when the list shrinks.
        keep_count=min(selection.keep_count, len(order)),
        rescued=[
            *(item for item in selection.rescued if item in known),
            *typed_in,
        ],
        dropped=[item for item in selection.dropped if item in known],
        reasons={
            claim_id: why
            for claim_id, why in selection.reasons.items()
            if claim_id in known
        },
        texture_order=[item for item in selection.texture_order if item in known],
        texture_reserve=selection.texture_reserve,
        target_word_count=selection.target_word_count,
        roles={
            claim_id: role
            for claim_id, role in selection.roles.items()
            if claim_id in known
        },
        brief_fingerprint=brief.brief_fingerprint,
        work_order_fingerprint=work_order.work_order_fingerprint,
        evidence_fingerprint=evidence.content_fingerprint(),
        deduped=selection.deduped,
        ranked=selection.ranked,
        note=selection.note,
    )

    moved = []
    if typed_in:
        moved.append(
            f"{len(typed_in)} answer{'s' if len(typed_in) > 1 else ''} you "
            "supplied joined the article."
        )
    if researched:
        moved.append(
            f"{len(researched)} new finding{'s' if len(researched) > 1 else ''} "
            "arrived and " + ("are" if len(researched) > 1 else "is")
            + " in reserve; nothing ranked "
            + ("them" if len(researched) > 1 else "it")
            + " against this brief."
        )
    if lost:
        moved.append(
            f"{lost} finding{'s' if lost > 1 else ''} the choice named "
            + ("are" if lost > 1 else "is")
            + " no longer in the research."
        )
    # A note or a status change moves no claim and still changes what a fact
    # means. Worth one line, because the packet's notes changed too.
    #
    # Only when there is something to compare. A selection stored before
    # bindings existed carries no fingerprint, and reporting that as a change
    # would tell the operator the research moved on every run made before this
    # existed -- which is not a fact about their research, it is a fact about
    # when the code shipped.
    quietly_changed = bool(
        selection.evidence_fingerprint
        and selection.evidence_fingerprint != rebound.evidence_fingerprint
    )
    changed = " ".join(moved) or (
        "The research changed under this choice; the same facts are kept."
        if quietly_changed
        else ""
    )
    return rebound, changed


def selection_from_flags(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: EvidencePackage,
    *,
    target_word_count: int,
    note: str,
) -> Selection:
    """The choice a dossier already carries, written down as a decision.

    Every claim has a `selected` flag, and until now a run with no selection
    record simply used them -- which meant the case where the ranking model
    fell over and the case where somebody decided to keep everything produced
    the same hundred-fact article, and nothing could tell them apart. This is
    the difference: a real record, bound to this dossier, carrying the reason
    a person gave, that the packet can be built from and refuse against.

    Flagged claims come first and the line is drawn under them, so the same
    set survives an operator moving it. `ranked` stays false: nothing ordered
    these, and a receipt claiming a judgement nobody made is worse than one
    admitting there was none.
    """
    kept = [
        claim.claim_id
        for claim in evidence.claims
        if claim.selected and not claim.merged_into
    ]
    rest = [
        claim.claim_id
        for claim in evidence.claims
        if not claim.selected and not claim.merged_into
    ]
    return Selection(
        order=[*kept, *rest],
        merged={
            claim.claim_id: claim.merged_into
            for claim in evidence.claims
            if claim.merged_into
        },
        keep_count=len(kept),
        texture_order=[],
        texture_reserve=0,
        target_word_count=target_word_count,
        brief_fingerprint=brief.brief_fingerprint,
        work_order_fingerprint=work_order.work_order_fingerprint,
        evidence_fingerprint=evidence.content_fingerprint(),
        deduped=False,
        ranked=False,
        note=note,
    )


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
    standing = [claim for claim in evidence.claims if claim.claim_id not in merged]
    # Then the same fact restated once per item, which deduplication is right
    # to leave alone and which reaches the writer as fifteen obligations.
    folded, folded_ran = _fold_restatements(standing, evidence, dependencies)
    merged = {**merged, **folded}
    survivors = [claim for claim in standing if claim.claim_id not in folded]
    order, reasons, roles, ranked = _rank(brief, work_order, survivors, dependencies)

    keep_count = target_claim_count(target_word_count, len(order))

    # Colour is ranked separately because it is judged on a different question.
    # Only survivors: a merged claim is off the desk however vivid it was.
    colour_ids = texture_claim_ids(work_order, evidence)
    colour = [claim for claim in survivors if claim.claim_id in colour_ids]
    texture_order, texture_reasons = _rank_texture(brief, work_order, colour, dependencies)
    # Colour's own reason wins for a colour claim. Both passes rank it, and the
    # utility pass says what it is not -- run 4a56545b showed the operator "the
    # hold-your-breath wish legend, folklore the piece can live without" beside
    # a row kept precisely because it was the most vivid thing in the dossier.
    reasons = {**reasons, **texture_reasons}
    texture_reserve = min(
        len(texture_order), int(round(keep_count * TEXTURE_SHARE))
    )
    # Colour the work order already knows about is colour, whatever the ranking
    # pass called it. The two agree almost always; where they do not, the work
    # order asked a texture question and got a texture answer, and the reserve
    # is already spending a slot on that basis. A row shown to the operator as
    # backbone while it is held as colour would be the screen and the machinery
    # saying different things about the same fact.
    roles = {**roles, **{claim_id: "texture" for claim_id in colour_ids}}

    notes = []
    if not deduped:
        notes.append("Deduplication did not run, so nothing was merged.")
    if not folded_ran:
        notes.append(
            "The restatement fold did not run, so a fact stated once per item "
            "reaches the writer once per item."
        )
    if not ranked:
        notes.append(
            "Ranking did not run, so this order is the dossier's own and says "
            "nothing about what the article needs."
        )
    if not ranked:
        # Drawing a line through an unranked list cuts facts by the order they
        # were gathered in, which is not a decision anybody made. Deduplication
        # succeeding does not rescue that: merging repeats says nothing about
        # which of the survivors this article needs.
        keep_count = len(order)
        notes.append("Every fact is kept, because nothing ordered them.")

    return Selection(
        order=order,
        merged=merged,
        keep_count=keep_count,
        reasons=reasons,
        roles={
            claim_id: role
            for claim_id, role in roles.items()
            if claim_id not in merged
        },
        texture_order=texture_order,
        texture_reserve=texture_reserve,
        target_word_count=target_word_count,
        brief_fingerprint=brief.brief_fingerprint,
        work_order_fingerprint=work_order.work_order_fingerprint,
        evidence_fingerprint=evidence.content_fingerprint(),
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

    The requirement side of that link is mirrored, and only ever added to. The
    contract requires the two directions to agree, so handing a survivor the
    questions its merged claims answered without also naming it on those
    questions produces a dossier that will not validate -- which is how the
    first real run died at the hand-off. Nothing is ever removed from a
    requirement here: a question can only gain a claim it is genuinely
    supported by, so coverage after selection is never weaker than before it.
    An editorial cut must not be able to become a research failure.

    A claim the selection does not name is not selected. That promise used to
    be kept here, by treating anything the ranking never saw as kept -- the
    gate can add a claim after selection has run, and a fact somebody typed in
    to unblock the article being silently cut from it is the worst failure this
    could have.

    `rebind` keeps it now, and keeps it better: the claim joins the selection's
    own list, so the picker can show it, the operator can drop it, and the
    packet can name it. Doing it here instead left the two disagreeing -- the
    dossier flagged a claim selected while the packet, which reads the
    selection and not the flag, left it out. The punch list reads these flags
    to tell a fact the writer missed from one a person cut, and a claim that
    was neither would have been reported as the first.
    """
    survivor_of = dict(selection.merged)
    chosen = selection.selected_claim_ids()

    extra_sources: dict[str, list[str]] = {}
    extra_requirements: dict[str, list[str]] = {}
    by_id = {claim.claim_id: claim for claim in evidence.claims}
    for loser, survivor in survivor_of.items():
        if loser not in by_id or survivor not in by_id:
            continue
        extra_sources.setdefault(survivor, []).extend(by_id[loser].source_ids)
        extra_requirements.setdefault(survivor, []).extend(by_id[loser].requirement_ids)

    gained: dict[str, set[str]] = {}
    for survivor, requirement_ids in extra_requirements.items():
        for requirement_id in requirement_ids:
            gained.setdefault(requirement_id, set()).add(survivor)

    claims = []
    for claim in evidence.claims:
        merged_into = survivor_of.get(claim.claim_id, "")
        selected = False if merged_into else claim.claim_id in chosen
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
    requirements = [
        requirement.model_copy(
            update={
                "claim_ids": _extended(
                    requirement.claim_ids,
                    sorted(gained.get(requirement.requirement_id, ())),
                )
            }
        )
        if requirement.requirement_id in gained
        else requirement
        for requirement in evidence.requirements
    ]
    return evidence.model_copy(update={"claims": claims, "requirements": requirements})


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
    colour = set(selection.texture_order)
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
                # So the operator can see which rows are here as colour, and
                # that cutting one costs the piece something other than a fact.
                "texture": claim_id in colour,
                # What this fact is for in the finished piece. Empty when the
                # ranking pass did not label it; `texture_order` is the older,
                # narrower version of the same idea, so a colour row already
                # knows what it is.
                "role": selection.roles.get(
                    claim_id, "texture" if claim_id in colour else ""
                ),
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
        # Carried, or the operator's first click would quietly delete the
        # reserve and starve the article of colour again.
        texture_order=list(selection.texture_order),
        texture_reserve=selection.texture_reserve,
        target_word_count=selection.target_word_count,
        roles=dict(selection.roles),
        # An operator's move is a decision about this dossier, not a new
        # binding to today's one. Carrying the fingerprints unchanged is what
        # makes a revision of a stale selection still stale.
        brief_fingerprint=selection.brief_fingerprint,
        work_order_fingerprint=selection.work_order_fingerprint,
        evidence_fingerprint=selection.evidence_fingerprint,
        deduped=selection.deduped,
        ranked=selection.ranked,
        note=selection.note,
    )
    if not revised.selected_claim_ids():
        raise SelectionRefused(
            "Keep at least one fact — there is nothing to write from otherwise."
        )
    return revised
