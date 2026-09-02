"""Research, in two passes.

The rigour here is the best thing in the pipeline and none of it changes:
first-party sources, dated, conflicts surfaced, confidence recorded. What
changes is what we send it looking for, and where it runs.

**Gather** gets the facts, on the one path in this app that reaches the web.
**Structure** turns them into the evidence records the writing stages read,
with the shape enforced at the transport rather than requested politely.

Two passes rather than one because they want different things. Gathering wants
a model that can search and will write freely about what it found. Structuring
wants a model that will return exactly the shape asked for and invent nothing —
and asking one model to do both is how a dossier ends up shaped like its own
retrieval log.

Search stays off Claude on purpose. Its WebSearch denial is a deliberate
security boundary, and research is the most token-hungry step there is:
spending Claude's budget reading web pages risks running out during the
writing, which is the part that actually needs it.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable, get_args

from pydantic import ValidationError

from .contracts_v4 import (
    ArticleBrief,
    EvidenceConfidence,
    EvidenceMaterialType,
    PremiseVerdict,
    EvidenceRequirementStatus,
    EvidenceSourceType,
    EvidencePackage,
    Prompt2BlogWorkOrder,
    WorkOrderRequirement,
)
from .config import P2B_V4_GATHER_CONCURRENCY
from .schema_guards import require_non_empty
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

RESEARCH_STAGE = "stage_v4_research"


class ResearchUnusable(RuntimeError):
    """The dossier came back in a shape that cannot be used.

    Research is the most expensive step in intake and the last one before
    writing, so a failure here has to leave the payload behind to read. It
    previously raised a bare Pydantic error from inside `model_validate` and
    wrote no stage row at all.
    """

    def __init__(self, reason: str, raw: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.raw = raw


# The contract forbids extra keys, so a leftover alias -- `questions` sitting
# beside the `requirements` it was read into -- is fatal on its own. The reader
# emits exactly what each record declares and nothing else.
EVIDENCE_SOURCE_FIELDS = frozenset(
    {"source_id", "title", "publisher", "url", "published_at", "retrieved_at",
     "source_type", "material_type", "notes"}
)
EVIDENCE_CLAIM_FIELDS = frozenset(
    {
        "claim_id",
        "text",
        "source_ids",
        "requirement_ids",
        "as_of",
        "confidence",
        "venue",
        "venue_note",
        # Operator-set, like `venue_note`. It survives a re-parse of stored
        # evidence, so a place already cleared off the list stays cleared.
        "venue_dismissed",
    }
)
EVIDENCE_REQUIREMENT_FIELDS = frozenset({"requirement_id", "status", "claim_ids", "gap"})
EVIDENCE_FINDING_FIELDS = frozenset({"assumption_id", "verdict", "basis", "claim_ids"})
EVIDENCE_CONFLICT_FIELDS = frozenset({"conflict_id", "claim_ids", "summary", "resolution"})
EVIDENCE_GAP_FIELDS = frozenset({"gap_id", "requirement_ids", "summary"})


def _only(record: dict[str, Any], fields: frozenset[str]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if key in fields}


def _as_date(value: Any) -> str:
    """A plain date, from whatever the model called a date.

    `published_at`, `retrieved_at` and `as_of` are dates, and a model that
    writes a full ISO timestamp is refused by the contract: "Datetimes
    provided to dates should have zero time". That took down a dossier that
    cost ten web searches, over the time of day on one source out of thirteen.

    The date part is the fact. Anything unparseable becomes empty and is
    handled by whatever the field's own rule is.
    """
    text = _safe_str(value)
    if not text:
        return ""
    head = text.replace("/", "-").split("T")[0].split(" ")[0].strip()
    try:
        return date.fromisoformat(head).isoformat()
    except ValueError:
        return ""


def _web_or_other(material_type: str, url: str, publisher: str) -> str:
    """Demote a web/report source that cannot meet the rule for being one."""
    if material_type in {"web", "report"} and not (url and publisher):
        return "other"
    return material_type


def _one_of(value: Any, vocabulary: Any, fallback: str) -> str:
    """Keep the value when it is one the contract knows, else fall back.

    A closed vocabulary the model is never shown is a vocabulary it will
    invent. Falling back is honest -- "other" says we could not classify it --
    and it is a great deal better than discarding a dossier that cost ten web
    searches over a label.
    """
    text = _safe_str(value)
    return text if text in set(get_args(vocabulary)) else fallback


def _first(record: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in record and record[name] not in (None, "", []):
            return record[name]
    return None


def _id_list(record: dict[str, Any], *names: str) -> list[str]:
    value = _first(record, *names)
    if not isinstance(value, list):
        return []
    return [_safe_str(item) for item in value if _safe_str(item)]


def _rows(payload: dict[str, Any], *names: str) -> list[dict[str, Any]]:
    value = _first(payload, *names)
    return [_safe_dict(item) for item in value] if isinstance(value, list) else []


def _normalised_evidence(payload: dict[str, Any]) -> dict[str, Any]:
    """Take the dossier the model sent, whatever it named things.

    Three jobs, all of them repairs the contract would otherwise refuse over.

    **Names.** The structure prompt says "question" throughout and the schema
    says `requirements`; the same model renamed exactly that list in the work
    order an hour earlier. Aliases are read rather than rejected.

    **Dangling references.** A claim citing a source that is not in the list is
    dropped from that claim, not fatal to the dossier.

    **The two-way mapping.** The contract requires the claim-to-question links
    and the question-to-claim links to agree exactly. That is a consistency
    property, not information: a model that says a claim answers q3, while q3
    forgets to list it, has told us the same fact once. Both directions are
    unioned and written back consistently, so the contract is satisfied by
    construction and keeps its guarantee.
    """
    sources: list[dict[str, Any]] = []
    seen_sources: set[str] = set()
    for row in _rows(payload, "sources"):
        source_id = _safe_str(_first(row, "source_id", "id"))
        if not source_id or source_id in seen_sources:
            continue
        seen_sources.add(source_id)
        sources.append(
            {
                **_only(row, EVIDENCE_SOURCE_FIELDS),
                "source_id": source_id,
                "title": _safe_str(_first(row, "title", "name")) or source_id,
                "retrieved_at": _as_date(
                    _first(row, "retrieved_at", "retrieved", "accessed_at")
                ),
                "published_at": _as_date(_first(row, "published_at", "published"))
                or None,
                # Both vocabularies carry an "other" member, which is what
                # makes an invented value survivable. Every source in run
                # 90b3f9bc came back as `research_notes` /
                # `synthesized_research_note` -- one invented vocabulary,
                # applied consistently, because the schema declared plain
                # strings and the prompt listed no values.
                "url": _safe_str(row.get("url")) or None,
                "source_type": _one_of(
                    _first(row, "source_type", "type"), EvidenceSourceType, "other"
                ),
                # A source calling itself a web page without a link is not one
                # the contract will accept, and the grounded search path cannot
                # supply per-source URLs -- it returns a dozen opaque redirect
                # blobs per question, which nothing can honestly map onto "How
                # to Peru". Forty-nine of fifty-four sources in run 90b3f9bc
                # came back with a publisher, a title and no URL, and the whole
                # dossier was refused.
                #
                # `other` carries no URL requirement, so a source without one
                # is admitted as what it actually is. The guarantee survives
                # intact: anything still labelled `web` really does have a link.
                "material_type": _web_or_other(
                    _one_of(
                        _first(row, "material_type", "material"),
                        EvidenceMaterialType,
                        "other",
                    ),
                    _safe_str(row.get("url")),
                    _safe_str(_first(row, "publisher", "site")),
                ),
                "notes": _id_list(row, "notes"),
            }
        )

    requirements: list[dict[str, Any]] = []
    seen_requirements: set[str] = set()
    for row in _rows(payload, "requirements", "questions"):
        requirement_id = _safe_str(_first(row, "requirement_id", "id", "question_id"))
        if not requirement_id or requirement_id in seen_requirements:
            continue
        seen_requirements.add(requirement_id)
        status = _one_of(row.get("status"), EvidenceRequirementStatus, "partial")
        gap = _safe_str(row.get("gap"))
        requirements.append(
            {
                **_only(row, EVIDENCE_REQUIREMENT_FIELDS),
                "requirement_id": requirement_id,
                "status": status,
                # The contract insists an unsettled question describes its gap,
                # and a status we had to guess at has one by definition.
                "gap": ""
                if status == "supported"
                else gap or "The dossier did not say what is missing here.",
            }
        )

    claims: list[dict[str, Any]] = []
    seen_claims: set[str] = set()
    for row in _rows(payload, "claims"):
        claim_id = _safe_str(_first(row, "claim_id", "id"))
        text = _safe_str(_first(row, "text", "statement", "claim"))
        if not claim_id or not text or claim_id in seen_claims:
            continue
        seen_claims.add(claim_id)
        claims.append(
            {
                **_only(row, EVIDENCE_CLAIM_FIELDS),
                "claim_id": claim_id,
                "text": text,
                "source_ids": [
                    item
                    for item in _id_list(row, "source_ids", "sources")
                    if item in seen_sources
                ],
                "requirement_ids": [
                    item
                    for item in _id_list(
                        row, "requirement_ids", "question_ids", "questions"
                    )
                    if item in seen_requirements
                ],
                "confidence": _one_of(row.get("confidence"), EvidenceConfidence, "low"),
                "as_of": _as_date(row.get("as_of")) or None,
            }
        )

    # Union both directions, then write both sides from the union.
    links: dict[str, set[str]] = {rid: set() for rid in seen_requirements}
    for claim in claims:
        for requirement_id in claim["requirement_ids"]:
            links[requirement_id].add(claim["claim_id"])
    for row in requirements:
        for claim_id in _id_list(row, "claim_ids", "claims"):
            if claim_id in seen_claims:
                links[row["requirement_id"]].add(claim_id)
    for claim in claims:
        claim["requirement_ids"] = sorted(
            rid for rid, ids in links.items() if claim["claim_id"] in ids
        )

    # Filtering a dangling reference can empty a list the contract requires to
    # hold at least one entry, so the repair would itself become the failure.
    # A claim citing no surviving source, or answering no surviving question,
    # is unusable to every stage downstream: drop the claim, not the dossier.
    kept = [
        claim
        for claim in claims
        if claim["source_ids"] and claim["requirement_ids"]
    ]
    if len(kept) != len(claims):
        logger.warning(
            "Dropped %s claim(s) with no usable source or question",
            len(claims) - len(kept),
        )
        claims = kept
        # Everything downstream filters against this set, so it has to shrink
        # with the claims -- a premise finding still pointing at a dropped
        # claim fails the contract exactly as a dangling reference would.
        seen_claims = {claim["claim_id"] for claim in claims}
        for requirement_id in links:
            links[requirement_id] &= seen_claims

    for row in requirements:
        row["claim_ids"] = sorted(links[row["requirement_id"]])
        # A question whose every claim was dropped is no longer supported by
        # anything, and the contract refuses that pairing outright.
        if row["status"] == "supported" and not row["claim_ids"]:
            row["status"] = "partial"
            row["gap"] = row.get("gap") or "Its supporting claims could not be used."

    findings = []
    seen_findings: set[str] = set()
    for row in _rows(payload, "premise_findings", "premises", "premise"):
        assumption_id = _safe_str(_first(row, "assumption_id", "id"))
        if not assumption_id or assumption_id in seen_findings:
            continue
        seen_findings.add(assumption_id)
        findings.append(
            {
                **_only(row, EVIDENCE_FINDING_FIELDS),
                "assumption_id": assumption_id,
                "verdict": _one_of(row.get("verdict"), PremiseVerdict, "unverified"),
                "claim_ids": [
                    item for item in _id_list(row, "claim_ids", "claims")
                    if item in seen_claims
                ],
            }
        )

    conflicts = []
    seen_conflicts: set[str] = set()
    for row in _rows(payload, "conflicts"):
        conflict_id = _safe_str(_first(row, "conflict_id", "id"))
        ids = [c for c in dict.fromkeys(_id_list(row, "claim_ids", "claims")) if c in seen_claims]
        # Two claims are what makes a conflict a conflict, and eleven of them
        # arrived with none that matched a real claim. A conflict nothing can
        # point at is unusable to every stage downstream; dropping it costs a
        # note, where refusing it costs ten web searches.
        if not conflict_id or conflict_id in seen_conflicts or len(ids) < 2:
            continue
        seen_conflicts.add(conflict_id)
        conflicts.append(
            {
                **_only(row, EVIDENCE_CONFLICT_FIELDS),
                "conflict_id": conflict_id,
                "claim_ids": ids,
            }
        )

    gaps = []
    seen_gaps: set[str] = set()
    for row in _rows(payload, "gaps"):
        gap_id = _safe_str(_first(row, "gap_id", "id"))
        ids = [
            r for r in dict.fromkeys(_id_list(row, "requirement_ids", "requirements"))
            if r in seen_requirements
        ]
        if not gap_id or gap_id in seen_gaps or not ids:
            continue
        seen_gaps.add(gap_id)
        gaps.append(
            {
                **_only(row, EVIDENCE_GAP_FIELDS),
                "gap_id": gap_id,
                "requirement_ids": ids,
            }
        )

    return {
        "sources": sources,
        "claims": claims,
        "requirements": requirements,
        "premise_findings": findings,
        "conflicts": conflicts,
        "gaps": gaps,
    }


# The Lima dossier was 12,000 characters. The helper's own default is 1024,
# which truncates without saying so.
GATHER_MAX_TOKENS = 8_192
STRUCTURE_MAX_TOKENS = 16_384

# What the live grounding path runs on. Not a 3.x model: `editor_assist` has
# grounded on this in production since ADR 0003, and the REST grounding
# endpoint is not the place to discover a version does not work.
GATHER_MODEL = "gemini-2.5-flash"


EVIDENCE_SCHEMA = require_non_empty({
    "type": "object",
    "properties": {
        "sources": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    "title": {"type": "string"},
                    "publisher": {"type": "string"},
                    "url": {"type": "string"},
                    "published_at": {"type": "string"},
                    "retrieved_at": {"type": "string"},
                    "source_type": {
                        "type": "string",
                        "enum": list(get_args(EvidenceSourceType)),
                    },
                    "material_type": {
                        "type": "string",
                        "enum": list(get_args(EvidenceMaterialType)),
                    },
                    "notes": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["source_id", "title", "retrieved_at", "source_type", "material_type", "notes"],
            },
        },
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "claim_id": {"type": "string"},
                    "text": {"type": "string"},
                    "source_ids": {"type": "array", "items": {"type": "string"}},
                    "requirement_ids": {"type": "array", "items": {"type": "string"}},
                    "as_of": {"type": "string"},
                    "confidence": {
                        "type": "string",
                        "enum": list(get_args(EvidenceConfidence)),
                    },
                    "venue": {"type": "string"},
                },
                "required": ["claim_id", "text", "source_ids", "requirement_ids", "confidence"],
            },
        },
        "requirements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "requirement_id": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": list(get_args(EvidenceRequirementStatus)),
                    },
                    "claim_ids": {"type": "array", "items": {"type": "string"}},
                    "gap": {"type": "string"},
                },
                "required": ["requirement_id", "status"],
            },
        },
        "premise_findings": {"type": "array", "items": {"type": "object"}},
        "conflicts": {"type": "array", "items": {"type": "object"}},
        "gaps": {"type": "array", "items": {"type": "object"}},
    },
    "required": ["sources", "claims", "requirements"],
})


@dataclass
class ResearchDependencies:
    """The two models research uses, and the one that reaches the web."""

    # Returns (text, source_urls, total_tokens).
    gather: Callable[[str, str], tuple[str, list[str], int | None]]
    # Structures what gather found. Claude, with the shape forced.
    structure_llm: Any
    structure_model: str | None = None


@dataclass
class GatheredNotes:
    """What one grounded pass came back with, before it is structured."""

    text: str
    source_urls: list[str] = field(default_factory=list)
    tokens: int | None = None


NOTES_STAGE = "stage_v4_research_notes"


def notes_stage_record(
    work_order: Prompt2BlogWorkOrder,
    notes: dict[str, GatheredNotes],
) -> dict[str, Any]:
    """The raw gather, kept so a failure downstream is not re-bought.

    Gathering is ten sequential web searches and structuring is one call, so
    every structuring failure used to cost the searches again. The notes are
    bound to the work order they answer, because a re-cut plan asks different
    questions and old notes are not answers to them.
    """
    return {
        "work_order_fingerprint": work_order.work_order_fingerprint,
        "notes": {
            requirement_id: {
                "text": item.text,
                "source_urls": list(item.source_urls),
                "tokens": item.tokens,
            }
            for requirement_id, item in notes.items()
        },
    }


def notes_from_record(
    record: dict[str, Any],
    work_order: Prompt2BlogWorkOrder,
) -> dict[str, GatheredNotes] | None:
    """The kept notes, when they answer this exact plan. Otherwise nothing."""
    if record.get("work_order_fingerprint") != work_order.work_order_fingerprint:
        return None
    stored = record.get("notes")
    if not isinstance(stored, dict) or not stored:
        return None
    notes: dict[str, GatheredNotes] = {}
    for requirement_id, raw in stored.items():
        item = _safe_dict(raw)
        notes[_safe_str(requirement_id)] = GatheredNotes(
            text=_safe_str(item.get("text")),
            source_urls=[_safe_str(url) for url in (item.get("source_urls") or [])],
            tokens=item.get("tokens") if isinstance(item.get("tokens"), int) else None,
        )
    return notes


def build_gather_prompt(
    brief: ArticleBrief,
    requirement: WorkOrderRequirement,
) -> str:
    """Ask for one question's answer, and everything around it.

    Deliberately asks for more than the question. "Guided circuits six days a
    week" and "a pre-Inca pyramid you can stand on at night" came from the same
    source, and only the first survived -- a research pass that answers the
    question and nothing else produces a dossier that is correct and unusable.
    """
    return f"""Research one question for a travel article about {brief.location}.

EVERYTHING BELOW IS IN {brief.location}. If a place named in the question also
exists somewhere else in the world, it is the one in {brief.location} that is
meant. Answering about the other one is worse than not answering: it comes back
looking like a found fact and nothing downstream can tell.

THE QUESTION
{requirement.question}

Answer it as fully as you can, with sources. Then keep going:

- Give the specifics. Prices with their currency and the date they were true.
  Opening hours with the days. Names of places, dishes, streets, people.
- Say who published each thing you found, and when. Prefer official and
  first-party sources for anything that changes.
- Where sources disagree, say so and say which you would believe. Never average
  them into a number nobody published.
- If nobody has published an answer, say that plainly and say where you looked.
  That is a finding, not a failure.
- Include what you noticed while looking that a reader would find interesting
  even though nobody asked: what a place is actually like, what surprises
  people, what the thing next door is. Do not discard it because it was not the
  question.
"""


# Namespace and asset URLs scraped out of page markup, which grounded search
# returns alongside the real ones. `http://www.w3.org/2000/svg` is not a source.
NON_SOURCE_URL_MARKERS = ("w3.org", "schema.org", "/favicon", ".svg", ".css", ".js")


def _citable(urls: list[str]) -> list[str]:
    return [
        url
        for url in urls
        if url and not any(marker in url for marker in NON_SOURCE_URL_MARKERS)
    ]


def build_structure_prompt(
    work_order: Prompt2BlogWorkOrder,
    notes: dict[str, GatheredNotes],
) -> str:
    """Turn free notes into evidence records. Records nothing new."""
    questions = "\n".join(
        f"- {item.requirement_id} [{item.kind}] {item.question}"
        for item in work_order.requirements
    )
    gathered = "\n\n".join(
        f"=== {requirement_id} ===\n{note.text}\n"
        f"Sources seen: {', '.join(_citable(note.source_urls)) or 'none recorded'}"
        for requirement_id, note in notes.items()
    )
    premise = (
        "\n".join(f"- {item.assumption_id}: {item.statement}" for item in work_order.premise)
        or "- None declared."
    )
    return f"""Turn research notes into evidence records. Add nothing that is not in the notes.

THE QUESTIONS
{questions}

WHAT WAS ASSUMED WITHOUT BEING CHECKED
{premise}

THE NOTES
{gathered}

Rules:
- Every claim cites at least one source and at least one question it answers.
  Every question lists the claims that answer it. The two must agree.
- A source needs a publisher and a URL when it is a web page or a report.
- Every source carries a `source_type` and a `material_type`, and both come
  from fixed lists. `source_type` is one of: official, reporting, specialist,
  firsthand, other. `material_type` is one of: web, report, transcript,
  interview-responses, first-person-notes, evaluation-notes, other. A page you
  read on the web is `reporting` and `web`. Use `other` when nothing fits --
  do not invent a label.
- `confidence` on a claim is one of: high, medium, low. An answer that is
  genuinely a range is still `supported` at `medium` or `low`; it does not
  become `partial` for being approximate.
- Set `venue` only on a claim that sends a reader to a place whose survival is
  genuinely in doubt: an independent tour operator, a small guesthouse, one
  restaurant, a bar, a family business, a tour run by a few people. Put the
  name of the place there and nothing else. A person looks these up before the
  article recommends them, and they are looking for one thing -- whether it is
  still going.
  Leave it empty in all three of these cases:
  - The claim is only a fact: an elevation, a visitor count, a date.
  - Nobody doubts the place is still there: a chain, a plaza, a park, a metro
    station, a cathedral, a museum that has been open for decades. Asking about
    one of these is a question the person can never learn anything from, and it
    buries the two or three worth their time.
  - The claim names the place as evidence rather than as a destination.
    "Parque Kennedy is surrounded by McDonald's, Starbucks and KFC" names three
    venues and sends a reader to none of them -- it describes what an area has
    become, and that is a good sentence to write. Tag the place the article
    points at, never the place it merely mentions.
  Most claims should have no venue. On a run with nineteen claims, three or
  four is a normal count, and a list with every fact in it is a list nobody
  reads.
- A `conflict` records two or more claims that disagree, and must list their
  claim ids. If you cannot name at least two claims in conflict, it is not a
  conflict -- leave it out.
- `status` per question: `supported`, `partial`, `missing`, or `unpublished`.
  Use `unpublished` when the notes establish that nobody publishes the answer,
  and say where was checked in `gap`. That is different from not having looked.
- Anything with a status other than `supported` must describe the gap.
- Record a `premise_findings` verdict for every assumption above: `confirmed`,
  `refuted`, or `unverified`, with the basis.
- Where the notes say sources disagree, record a conflict rather than picking
  silently.
- Keep the interesting detail. A note that puts a reader somewhere belongs in a
  claim as much as a price does; do not drop it for not being a number.
"""


PROGRESS_STAGE = "stage_v4_research_progress"


def gather_one_requirement(
    brief: ArticleBrief,
    requirement: WorkOrderRequirement,
    dependencies: ResearchDependencies,
) -> GatheredNotes:
    """One question, one grounded pass. Never raises.

    A hole is survivable and a dead run is not, so a failed search comes back
    empty rather than taking the other searches down with it.

    Module level rather than a closure inside `gather_research`, because the
    gate re-asks exactly one rewritten question (#446) and re-running the whole
    pass to do it would re-buy every search that was already right.
    """
    prompt = build_gather_prompt(brief, requirement)
    try:
        text, urls, tokens = dependencies.gather(prompt, GATHER_MODEL)
    except Exception as exc:  # pragma: no cover -- network dependent
        logger.warning("Gather failed for %s: %s", requirement.requirement_id, exc)
        text, urls, tokens = "", [], None
    return GatheredNotes(
        text=_safe_str(text), source_urls=list(urls or []), tokens=tokens
    )


def gather_research(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    dependencies: ResearchDependencies,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, GatheredNotes]:
    """One grounded pass per question, texture included, all at once.

    Texture is researched to the identical standard: a scene we cannot source
    is still cut, so it has to be sourced like anything else.

    The searches run concurrently because they are independent -- nothing in
    question four depends on question three -- and sequentially they were about
    six minutes of run 76b36468's twenty-and-a-half minute research pass. Same
    prompts, same model, same results; only the waiting changes.

    Bounded at `P2B_V4_GATHER_CONCURRENCY`, because grounded-search rate limits
    are unknown and the number of questions is set by the work order rather
    than by us.

    `on_progress` reports **completions**, not position: it fires once when the
    searches start and once each time one comes back. It cannot say what is
    being searched now, because several are, so it names the last question to
    come back instead.
    """
    requirements = list(work_order.requirements)
    total = len(requirements)

    def _emit(phase: str, done: int, last_question_back: str) -> None:
        if on_progress is None:
            return
        try:
            on_progress(
                {
                    "phase": phase,
                    "done": done,
                    "total": total,
                    "last_question_back": last_question_back,
                }
            )
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Research progress write failed: %s", exc)

    gathered: dict[str, GatheredNotes] = {}
    if requirements:
        # Only once there is something to wait for. A work order with no
        # questions cannot reach here through the contract, and an empty
        # "0 of 0" on the screen would be worse than silence if it did.
        _emit("gathering", 0, "")
        workers = max(1, min(P2B_V4_GATHER_CONCURRENCY, total))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            pending = {
                pool.submit(
                    gather_one_requirement, brief, requirement, dependencies
                ): requirement
                for requirement in requirements
            }
            # Consumed on this thread, so `on_progress` -- which writes a stage
            # row -- is never called from a worker and needs no lock.
            for done, future in enumerate(as_completed(pending), start=1):
                requirement = pending[future]
                gathered[requirement.requirement_id] = future.result()
                _emit("gathering", done, requirement.question)

    # Rebuilt in work-order order rather than completion order, so the notes,
    # the structure prompt built from them and anything diffing two runs do not
    # change shape with the weather.
    notes = {
        requirement.requirement_id: gathered[requirement.requirement_id]
        for requirement in requirements
        if requirement.requirement_id in gathered
    }

    # Structuring is one call and the longest single wait in the run, so it gets
    # its own phase rather than looking like a stall after the last search.
    _emit("structuring", total, "")
    return notes


def structure_research(
    work_order: Prompt2BlogWorkOrder,
    notes: dict[str, GatheredNotes],
    dependencies: ResearchDependencies,
) -> EvidencePackage:
    """Turn the notes into the evidence package the writing stages read.

    The shape is forced at the transport rather than asked for, so a malformed
    dossier is a transport error here instead of a confusing failure four
    stages later.
    """
    parsed, _raw = dependencies.structure_llm.invoke_json(
        prompt=build_structure_prompt(work_order, notes),
        model_name=dependencies.structure_model,
        schema=EVIDENCE_SCHEMA,
        max_tokens=STRUCTURE_MAX_TOKENS,
        temperature=0.0,
    )
    payload = _normalised_evidence(_safe_dict(parsed))
    payload["schema_version"] = 4
    payload["work_order_fingerprint"] = work_order.work_order_fingerprint
    try:
        return EvidencePackage.model_validate(payload)
    except ValidationError as error:
        raise ResearchUnusable(
            "; ".join(
                f"{'.'.join(str(part) for part in item['loc']) or 'dossier'}: {item['msg']}"
                for item in error.errors()
            )
            or "the dossier did not fit its contract",
            json.dumps(payload, ensure_ascii=False)[:40000],
        ) from error


def run_research(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    dependencies: ResearchDependencies,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
    notes: dict[str, GatheredNotes] | None = None,
) -> tuple[EvidencePackage, dict[str, GatheredNotes]]:
    """Both passes. Returns the evidence and the notes it came from.

    `notes` skips the gathering when a previous attempt already paid for it.
    """
    if notes is None:
        notes = gather_research(brief, work_order, dependencies, on_progress)
    return structure_research(work_order, notes, dependencies), notes


def research_stage_record(
    evidence: EvidencePackage,
    notes: dict[str, GatheredNotes],
) -> dict[str, Any]:
    """What the run keeps about the research it paid for."""
    return {
        "work_order_fingerprint": evidence.work_order_fingerprint,
        "source_count": len(evidence.sources),
        "claim_count": len(evidence.claims),
        "requirement_status": {
            item.requirement_id: item.status for item in evidence.requirements
        },
        # What research actually found, per question. The screen used to show
        # "q3 — partly answered" and nothing else, which tells the operator
        # neither what was asked nor what came back, and leaves the one
        # decision they have to make unmakeable.
        "findings": {
            item.requirement_id: {
                "status": item.status,
                "gap": item.gap,
                "claims": [
                    {
                        "claim_id": claim.claim_id,
                        "text": claim.text,
                        "confidence": claim.confidence,
                        "venue": claim.venue,
                        "venue_note": claim.venue_note,
                        "sources": [
                            {
                                "title": source.title,
                                "url": str(source.url) if source.url else "",
                                "source_type": source.source_type,
                            }
                            for source in evidence.sources
                            if source.source_id in claim.source_ids
                        ],
                    }
                    for claim in evidence.claims
                    if item.requirement_id in claim.requirement_ids
                ],
            }
            for item in evidence.requirements
        },
        "conflicts": [item.summary for item in evidence.conflicts],
        "gathered": {
            requirement_id: {
                "characters": len(note.text),
                "source_urls": note.source_urls,
                "tokens": note.tokens,
            }
            for requirement_id, note in notes.items()
        },
    }
