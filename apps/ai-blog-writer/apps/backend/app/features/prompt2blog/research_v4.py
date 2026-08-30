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

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from .contracts_v4 import (
    ArticleBrief,
    EvidencePackage,
    Prompt2BlogWorkOrder,
    WorkOrderRequirement,
)
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

RESEARCH_STAGE = "stage_v4_research"

# The Lima dossier was 12,000 characters. The helper's own default is 1024,
# which truncates without saying so.
GATHER_MAX_TOKENS = 8_192
STRUCTURE_MAX_TOKENS = 16_384

# What the live grounding path runs on. Not a 3.x model: `editor_assist` has
# grounded on this in production since ADR 0003, and the REST grounding
# endpoint is not the place to discover a version does not work.
GATHER_MODEL = "gemini-2.5-flash"


EVIDENCE_SCHEMA = {
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
                    "source_type": {"type": "string"},
                    "material_type": {"type": "string"},
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
                    "confidence": {"type": "string"},
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
                    "status": {"type": "string"},
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
}


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
        f"Sources seen: {', '.join(note.source_urls) or 'none recorded'}"
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


def gather_research(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    dependencies: ResearchDependencies,
) -> dict[str, GatheredNotes]:
    """One grounded pass per question, texture included.

    Texture is researched to the identical standard: a scene we cannot source
    is still cut, so it has to be sourced like anything else.
    """
    notes: dict[str, GatheredNotes] = {}
    for requirement in work_order.requirements:
        prompt = build_gather_prompt(brief, requirement)
        try:
            text, urls, tokens = dependencies.gather(prompt, GATHER_MODEL)
        except Exception as exc:  # pragma: no cover -- network dependent
            logger.warning(
                "Gather failed for %s: %s", requirement.requirement_id, exc
            )
            text, urls, tokens = "", [], None
        notes[requirement.requirement_id] = GatheredNotes(
            text=_safe_str(text), source_urls=list(urls or []), tokens=tokens
        )
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
    payload = _safe_dict(parsed)
    payload["schema_version"] = 4
    payload["work_order_fingerprint"] = work_order.work_order_fingerprint
    return EvidencePackage.model_validate(payload)


def run_research(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    dependencies: ResearchDependencies,
) -> tuple[EvidencePackage, dict[str, GatheredNotes]]:
    """Both passes. Returns the evidence and the notes it came from."""
    notes = gather_research(brief, work_order, dependencies)
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
