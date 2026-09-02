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
from typing import Any, get_args

from pydantic import ValidationError

from .contracts_v4 import (
    BRIEF_MARKERS,
    ArticleBrief,
    ArticleFormId,
    AudienceTagId,
    BriefMaterial,
    BriefReader,
    GrillState,
)
from .grill_v4 import GrillDependencies
from .schema_guards import require_non_empty
from .support import _safe_dict, _safe_str, _safe_str_list

logger = logging.getLogger(__name__)

BRIEF_STAGE = "stage_v4_brief"

# `form_id` carries its vocabulary in the schema rather than in prose. Gemini's
# translator keeps `enum` and drops `minLength`, so an enum is one of the few
# constraints that actually survives the trip -- and a bare string field named
# `form_id`, with fifteen legal values stated nowhere, is what run 90b3f9bc
# (2026-08-30 20:01Z) returned empty.
BRIEF_SCHEMA = require_non_empty({
    "type": "object",
    "properties": {
        "form_id": {"type": "string", "enum": list(get_args(ArticleFormId))},
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
})


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

Fill the brief from what was actually said. Every field below is required and
must carry a real value -- an empty string is not an answer. Where the
interview did not settle something outright, decide it from what they did say
rather than leaving it blank.

- `form_id` is the kind of article, chosen from the list the schema allows.
  A walk through what a place offers is `destination-guide`; a ranked or
  grouped set of picks is `curated-list-best-of`; a day-by-day plan is
  `itinerary`; a how-much-does-it-cost piece is `cost-budget-breakdown`.
- `primary_reader` is who this is for, in a phrase -- who they are and what
  situation they are in, not a demographic bracket.
- `reader_question` is the question in that reader's head, written the way
  they would ask it.
- `spine` is the argument the piece is built on, in their words where possible.
- `outcome` is what the reader should do or decide afterwards.
- `fails_if` is what would make this a failure, taken from what they said, not
  invented. This is the line the finished article gets judged against.
- `must_name` is only what the piece genuinely has to mention, and it is a
  list: one name per entry, never several in one string separated by commas.
  A single entry reading "Surquillo market, Miraflores, the municipal ranking"
  is three obligations the system can then only measure as one.
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


def _deduped(values: list[str], *, casefold: bool = False) -> list[str]:
    """Keep the first of each value, in the order the model gave them.

    Three of the brief's lists carry a uniqueness rule -- `must_name`,
    `topic_module_ids` and `reader_tags` -- and the model is told about none of
    them. A repeated entry used to take the whole brief down with a Pydantic
    error about `must_name` uniqueness, which is a good brief refused over a
    duplicated string.

    The contract stays strict, because a brief that names the same thing twice
    is genuinely malformed. What changes is that it is handed clean input,
    the same way material is filtered before it gets there.
    """
    seen: set[str] = set()
    kept: list[str] = []
    for value in values:
        key = value.casefold() if casefold else value
        if key in seen:
            continue
        seen.add(key)
        kept.append(value)
    return kept


def _reader_from(payload: dict[str, Any]) -> BriefReader:
    """Who this is for, with tags the contract will actually accept.

    `reader_tags` is a closed vocabulary the model is not shown, so an invented
    tag is normal and is dropped rather than allowed to take the brief down.
    The reader themself is required and is not guessed at here -- an empty one
    is caught by the missing-field check with a sentence about it.
    """
    allowed = set(get_args(AudienceTagId))
    tags = _deduped(
        [tag for tag in _safe_str_list(payload.get("reader_tags")) if tag in allowed]
    )
    return BriefReader(
        primary_reader=_safe_str(payload.get("primary_reader")), tags=tags
    )


def brief_fingerprint(payload: dict[str, Any]) -> str:
    """A stable id for one brief's contents.

    Content-addressed so the work order and the evidence can each be checked
    against the brief they were derived from rather than trusted.
    """
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return "bf-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


class BriefIncomplete(RuntimeError):
    """The brief writer left something out that the brief cannot do without.

    Carries what it did return. A run that fails here has already paid for the
    grill, so the operator should get a sentence about what is missing rather
    than a Pydantic traceback about string length.
    """

    def __init__(self, missing: list[str], raw: str) -> None:
        super().__init__(
            "The brief came back missing: " + ", ".join(missing) + "."
        )
        self.missing = missing
        self.raw = raw


class BriefUnusable(RuntimeError):
    """The brief came back complete and still would not assemble.

    A duplicated `must_name` entry reached the operator as a raw Pydantic
    error about value uniqueness, mid-flow, after the grill had been paid for.
    The contract is right to refuse a malformed brief; what was wrong is that
    its complaint was addressed to a developer.

    Carries the reason and the payload, and is retried once -- a duplicate is
    the kind of fluke a second attempt usually clears.
    """

    def __init__(self, reason: str, raw: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.raw = raw


# What a brief cannot be assembled without. Empty is the failure mode that
# actually happens -- the key is present and the value is "" -- so this checks
# the value, not the key.
#
# Derived from `BRIEF_MARKERS` rather than typed out again: the same six things
# are the grill's stop condition (ADR 0033), and a grill that stops one marker
# short of what the brief demands is a run that dies here having already paid
# for the whole interview.
REQUIRED_BRIEF_FIELDS = tuple(
    (field, description) for _, field, description in BRIEF_MARKERS
)


def _missing_fields(payload: dict[str, Any]) -> list[str]:
    return [
        label
        for key, label in REQUIRED_BRIEF_FIELDS
        if not _safe_str(payload.get(key))
    ]


def build_brief(
    state: GrillState,
    dependencies: GrillDependencies,
    *,
    location: str | None = None,
) -> ArticleBrief:
    """Assemble the brief an agreed grill earned.

    Retried once. The grill has already been paid for by this point, and a
    single thin reply should not cost the operator the whole conversation.
    """
    if state.status != "agreed":
        raise ValueError("A brief can only be built from a grill that reached agreement.")

    attempts: list[str] = []
    last: BriefIncomplete | None = None
    last_unusable: BriefUnusable | None = None
    for attempt in range(2):
        try:
            return _build_brief_once(state, dependencies, location=location)
        except BriefIncomplete as error:
            attempts.append(error.raw)
            logger.warning(
                "Brief came back incomplete (attempt %s), missing %s",
                attempt + 1,
                ", ".join(error.missing),
            )
            last = error
        except BriefUnusable as error:
            attempts.append(error.raw)
            logger.warning(
                "Brief did not fit its contract (attempt %s): %s",
                attempt + 1,
                error.reason,
            )
            last_unusable = error
    if last is not None:
        raise BriefIncomplete(last.missing, "\n---\n".join(attempts))
    assert last_unusable is not None
    raise BriefUnusable(last_unusable.reason, "\n---\n".join(attempts))


def _build_brief_once(
    state: GrillState,
    dependencies: GrillDependencies,
    *,
    location: str | None = None,
) -> ArticleBrief:
    parsed, raw = dependencies.llm.invoke_json(
        prompt=build_brief_prompt(state),
        model_name=dependencies.model_name,
        schema=BRIEF_SCHEMA,
        max_tokens=2_048,
        temperature=0.2,
    )
    payload = _safe_dict(parsed)

    missing = _missing_fields(payload)
    if missing:
        # Checked here rather than left to Pydantic, so the operator is told
        # what is missing in words instead of being shown a string-length
        # validation error for a field they have never heard of.
        raise BriefIncomplete(missing, raw or json.dumps(payload))

    resolved_location = _safe_str(location or state.location)
    if not resolved_location:
        # The brief cannot be built without one, and guessing a place is how an
        # article about somewhere else gets written.
        raise ValueError("The grill did not settle a location; ask before briefing.")

    fields: dict[str, Any] = {
        "seed": state.seed,
        "location": resolved_location,
        "form_id": _safe_str(payload.get("form_id")),
        "topic_module_ids": _deduped(
            _safe_str_list(payload.get("topic_module_ids"))
        )[:4],
        "reader": _reader_from(payload),
        "reader_question": _safe_str(payload.get("reader_question")),
        "outcome": _safe_str(payload.get("outcome")),
        "spine": _safe_str(payload.get("spine")),
        # Casefolded, because that is what the contract compares on.
        "must_name": _deduped(
            _safe_str_list(payload.get("must_name")),
            casefold=True,
        ),
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
    try:
        return ArticleBrief(
            brief_fingerprint=brief_fingerprint(fingerprint_source), **fields
        )
    except ValidationError as error:
        raise BriefUnusable(
            "; ".join(
                f"{'.'.join(str(part) for part in item['loc']) or 'brief'}: {item['msg']}"
                for item in error.errors()
            )
            or "the brief did not fit its contract",
            json.dumps(payload, ensure_ascii=False)[:4000],
        ) from error


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
