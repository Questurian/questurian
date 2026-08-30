"""Turning an agreed grill into the Article Brief.

The brief is the vision, and the only object in the run that is never consumed:
it rides the whole way and the finished article is judged against it, including
against its `fails_if` line -- the measure the system has never had. Every score
v3 owned said the Lima article passed.

The model reads the transcript and proposes the structure. It does not get to
invent the operator's own words: a first-hand statement has to be an answer the
operator actually typed, checked here rather than trusted, because first-hand
material is excused from fact-checking by design and a paraphrase of it is an
unverifiable claim nothing downstream can catch.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from .contracts_v4 import ArticleBrief, BriefMaterial, BriefReader, GrillState
from .grill_v4 import GrillDependencies
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

BRIEF_STAGE = "stage_v4_brief"

BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "form_id": {"type": "string"},
        "topic_module_ids": {"type": "array", "items": {"type": "string"}},
        "primary_reader": {"type": "string"},
        "reader_tags": {"type": "array", "items": {"type": "string"}},
        "reader_question": {"type": "string"},
        "outcome": {"type": "string"},
        "spine": {"type": "string"},
        "must_name": {"type": "array", "items": {"type": "string"}},
        "fails_if": {"type": "string"},
        "material": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string"},
                    "quoted_answer": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["kind", "quoted_answer"],
            },
        },
    },
    "required": [
        "form_id",
        "primary_reader",
        "reader_question",
        "outcome",
        "spine",
        "fails_if",
    ],
}


def build_brief_prompt(state: GrillState) -> str:
    transcript = "\n\n".join(
        f"Q. {turn.question.ask}\nThey said: {turn.answer}" for turn in state.turns
    )
    return f"""Turn this interview into a commissioning brief.

THEIR OPENING LINE (provenance only -- it is not a promise to keep):
{state.seed}

THE INTERVIEW:
{transcript}

WHAT YOU BOTH AGREED:
{state.consensus}

Fill the brief from what was actually said. Rules:

- `spine` is the argument the piece is built on, in their words where possible.
- `outcome` is what the reader should do or decide afterwards.
- `fails_if` is what would make this a failure, taken from what they said, not
  invented. This is the line the finished article gets judged against.
- `must_name` is only what the piece genuinely has to mention.
- `material` is what they personally have. For each entry, `quoted_answer` must
  be an EXACT copy of one of their answers above -- do not summarise, tidy or
  merge. `kind` is firsthand, interview, or research.
- If they said they have nothing, return no material. That is a research-led
  piece and is completely fine.
- Do not choose `analysis` as the form unless they said they want to make a
  case rather than write a guide.
"""


def _material_from(payload: dict[str, Any], state: GrillState) -> list[BriefMaterial]:
    """Keep only material the operator actually typed.

    The model nominates which answers are material and what kind they are. The
    words themselves come from the transcript, matched exactly. Anything that
    does not match a real answer is dropped and logged: a "first-hand" claim
    the operator never made is worse than no material at all, because nothing
    downstream will ever check it.
    """
    answers = {turn.answer for turn in state.turns}
    material: list[BriefMaterial] = []
    for raw in payload.get("material") or []:
        record = _safe_dict(raw)
        quoted = _safe_str(record.get("quoted_answer"))
        kind = _safe_str(record.get("kind"))
        if kind not in {"firsthand", "interview", "research"}:
            continue
        if quoted not in answers:
            logger.warning(
                "Dropping brief material that does not quote a real answer: %r",
                quoted[:80],
            )
            continue
        material.append(
            BriefMaterial(kind=kind, statement=quoted, note=_safe_str(record.get("note")))
        )
    return material


def brief_fingerprint(payload: dict[str, Any]) -> str:
    """A stable id for one brief's contents.

    Content-addressed so the work order and the evidence can each be checked
    against the brief they were derived from rather than trusted.
    """
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return "bf-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def build_brief(
    state: GrillState,
    dependencies: GrillDependencies,
    *,
    location: str | None = None,
) -> ArticleBrief:
    """Assemble the brief an agreed grill earned."""
    if state.status != "agreed":
        raise ValueError("A brief can only be built from a grill that reached agreement.")

    parsed, _raw = dependencies.llm.invoke_json(
        prompt=build_brief_prompt(state),
        model_name=dependencies.model_name,
        schema=BRIEF_SCHEMA,
        max_tokens=2_048,
        temperature=0.2,
    )
    payload = _safe_dict(parsed)

    resolved_location = _safe_str(location or state.location)
    if not resolved_location:
        # The brief cannot be built without one, and guessing a place is how an
        # article about somewhere else gets written.
        raise ValueError("The grill did not settle a location; ask before briefing.")

    fields: dict[str, Any] = {
        "seed": state.seed,
        "location": resolved_location,
        "form_id": _safe_str(payload.get("form_id")),
        "topic_module_ids": [
            _safe_str(item) for item in (payload.get("topic_module_ids") or [])
        ][:4],
        "reader": BriefReader(
            primary_reader=_safe_str(payload.get("primary_reader")),
            tags=[_safe_str(tag) for tag in (payload.get("reader_tags") or [])],
        ),
        "reader_question": _safe_str(payload.get("reader_question")),
        "outcome": _safe_str(payload.get("outcome")),
        "spine": _safe_str(payload.get("spine")),
        "must_name": [_safe_str(item) for item in (payload.get("must_name") or []) if _safe_str(item)],
        "material": _material_from(payload, state),
        "fails_if": _safe_str(payload.get("fails_if")),
    }
    # Fingerprinted over the contents, before the fingerprint is one of them.
    fingerprint_source = {
        key: (
            [item.model_dump(mode="json") for item in value]
            if key == "material"
            else value.model_dump(mode="json")
            if key == "reader"
            else value
        )
        for key, value in fields.items()
    }
    return ArticleBrief(
        brief_fingerprint=brief_fingerprint(fingerprint_source), **fields
    )


def brief_stage_record(brief: ArticleBrief) -> dict[str, Any]:
    """What the run keeps about the brief the operator approved."""
    return {
        "brief_fingerprint": brief.brief_fingerprint,
        "seed": brief.seed,
        "location": brief.location,
        "form_id": brief.form_id,
        "spine": brief.spine,
        "outcome": brief.outcome,
        "fails_if": brief.fails_if,
        "must_name": list(brief.must_name),
        # Shown back in full so the operator can see exactly what the system
        # thinks they said about their own material before approving it.
        "material": [
            {"kind": item.kind, "statement": item.statement} for item in brief.material
        ],
    }
