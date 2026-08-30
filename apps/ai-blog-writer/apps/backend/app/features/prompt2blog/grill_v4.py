"""The interview that replaces the commission form.

v3 asked an operator to choose between three directions a model wrote from one
typed line. Nothing in that flow ever asked what the article was *for*, and the
audited Lima run passed every measure the system owned while being unreadable.

A form is a literacy test: it only works if you already know what belongs in
each field. The people using this are travellers, creators and researchers
writing about places they may never have been, not features editors. So the
expertise goes in the system and the operator is asked only about what they
know.

Five rules, from ADR 0030:

- G1 Every question carries a recommended answer. Nobody faces a blank.
- G2 It researches before it asks. Anything it can look up, it never asks.
     This is what keeps the grill short -- not a question limit.
- G3 One question at a time, each shaped by the last.
- G4 It pushes back when an answer contradicts the seed or an earlier answer.
- G5 It stops at agreement, not at a count.

The loop lives here and the model calls sit behind `GrillDependencies`, so the
rules above are testable without a network.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from .config import DEFAULT_MODEL
from .contracts_v4 import GrillQuestion, GrillState, GrillTurn
from .schema_guards import require_non_empty
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

GRILL_STAGE = "stage_v4_grill"


def _json_or_repr(payload: Any) -> str:
    try:
        return json.dumps(payload)
    except Exception:  # pragma: no cover -- diagnostics only
        return repr(payload)

# Enough for a dense digest of a city. The helper's own default is 1024, which
# truncates silently -- the Lima dossier was 12,000 characters.
GRILL_RESEARCH_MAX_TOKENS = 4_096

# What the live grounding path actually runs on. `editor_assist` has grounded
# on this model in production since ADR 0003; the 3.x models are not known to
# work through the REST grounding endpoint, and this is not the place to find
# out.
GRILL_RESEARCH_MODEL = "gemini-2.5-flash"


# `question` and `consensus` are both required, and the prompt says to leave
# the unused one empty. Making only `done` required is what broke the first
# real run: `{"done": false}` with nothing else is schema-valid and useless,
# and the model took that gap. A schema that permits what the code refuses is
# a schema that has not been written down properly.
NEXT_TURN_SCHEMA = require_non_empty({
    "type": "object",
    "properties": {
        "done": {"type": "boolean"},
        "question": {
            "type": "object",
            "properties": {
                "question_id": {"type": "string"},
                "topic": {"type": "string"},
                "ask": {"type": "string"},
                "recommendation": {"type": "string"},
                "pushback": {"type": "string"},
            },
            "required": ["question_id", "topic", "ask", "recommendation"],
        },
        "consensus": {"type": "string"},
        "location": {"type": "string"},
    },
    "required": ["done", "question", "consensus"],
})


class GrillLLM(Protocol):
    def invoke_json(
        self, *, prompt: str, model_name: str, schema: dict[str, Any], **kwargs: Any
    ) -> tuple[dict[str, Any], str]: ...


@dataclass
class GrillDependencies:
    """The two outside things the grill needs, both replaceable in tests."""

    llm: GrillLLM
    # Returns (digest, source_urls, total_tokens). Separate from `llm` because
    # this one reaches the web and the other does not.
    research: Callable[[str], tuple[str, list[str], int | None]]
    model_name: str = DEFAULT_MODEL


def research_seed(dependencies: GrillDependencies, seed: str) -> tuple[str, list[str], int | None]:
    """Look the seed up before asking anything (G2).

    A grill that asks what it could have looked up is a form with extra steps.
    Failure is not fatal: an ungrounded grill asks more questions, which is
    worse than a grounded one and better than no article.
    """
    try:
        return dependencies.research(seed)
    except Exception as exc:  # pragma: no cover -- network dependent
        logger.warning("Grill pre-research failed, continuing ungrounded: %s", exc)
        return "", [], None


def _transcript(state: GrillState) -> str:
    if not state.turns:
        return "Nothing asked yet."
    return "\n\n".join(
        f"Q{index}. {turn.question.ask}\nThey said: {turn.answer}"
        for index, turn in enumerate(state.turns, start=1)
    )


def build_next_turn_prompt(state: GrillState) -> str:
    """What the grill is told before it decides its next move."""
    asked = len(state.turns)
    return f"""You are interviewing a writer about an article they want to commission.
They are a traveller or researcher, not an editor. Do not use editorial jargon.

THEIR OPENING LINE:
{state.seed}

WHAT YOU ALREADY LOOKED UP (never ask about anything in here):
{state.research_digest or "Nothing; you could not look anything up."}

THE INTERVIEW SO FAR:
{_transcript(state)}

Decide the single most useful next move.

Rules:
- Ask ONE question, and only about something you cannot look up. What they
  want, who it is for, what they personally have, what would make it a
  failure. Never ask them to confirm a fact.
- Every question must carry `recommendation`: the answer you actually expect,
  stated plainly so they can accept it or correct it. Never ask an open
  question with no proposal attached.
- If an answer contradicts their opening line or an earlier answer, set
  `pushback` naming the contradiction, and make the question resolve it.
- Ask about what they HAVE, never about credentials. "Been there, know
  someone, have an interview?" is the shape. "Nothing" is a fine answer and
  means it is a research-led piece.
- Set `location` when their line names a place clearly enough to act on. Leave
  it empty only when it is genuinely ambiguous.
- ALWAYS return both `question` and `consensus`. When you are asking, fill
  `question` and leave `consensus` an empty string. When you are done, fill
  `consensus` and leave the question's `ask` and `recommendation` empty. Never
  return neither.
- Set `done` true and write `consensus` when you could brief a writer from
  what you have: what the piece is, who reads it, what it should make them do,
  what it is built on, what it must name, and what would make it a failure.
  Write the consensus in plain English, addressed to them, so they can say
  "yes" or "no, less about that". Stop when you have agreement, not at a
  question count. {asked} questions asked so far.
"""


def _question_from(payload: dict[str, Any], fallback_id: str) -> GrillQuestion | None:
    raw = _safe_dict(payload.get("question"))
    ask = _safe_str(raw.get("ask"))
    recommendation = _safe_str(raw.get("recommendation"))
    if not ask or not recommendation:
        # A question with no recommendation is a blank box, which is the thing
        # this replaces. Reject it rather than showing it.
        return None
    return GrillQuestion(
        question_id=_safe_str(raw.get("question_id")) or fallback_id,
        topic=_safe_str(raw.get("topic")) or "next",
        ask=ask,
        recommendation=recommendation,
        pushback=_safe_str(raw.get("pushback")),
    )


class GrillUnusableResponse(RuntimeError):
    """The grill answered with something it cannot act on.

    Carries the raw response. The first real run died on exactly this and left
    nothing behind -- no stage row, no log line -- so the one moment that most
    needs explaining was the one moment with no evidence.
    """

    def __init__(self, raw: str) -> None:
        super().__init__(
            "The grill returned neither a usable question nor a consensus."
        )
        self.raw = raw


def advance_grill(
    state: GrillState,
    dependencies: GrillDependencies,
) -> GrillState:
    """Decide the grill's next move from everything it knows.

    Returns a state that is either asking one more question or agreed. The
    caller records it; nothing is written here.

    Retried once. The writing stages deliberately do not retry a schema call,
    because each attempt there is a full article rewrite -- but this is a flash
    model deciding one question, and one unusable reply should not end a run
    before it has started.
    """
    attempts: list[str] = []
    for attempt in range(2):
        try:
            return _advance_once(state, dependencies)
        except GrillUnusableResponse as error:
            attempts.append(error.raw)
            logger.warning(
                "Grill returned an unusable response (attempt %s): %s",
                attempt + 1,
                error.raw[:500],
            )
    raise GrillUnusableResponse("\n---\n".join(attempts))


def _advance_once(
    state: GrillState,
    dependencies: GrillDependencies,
) -> GrillState:
    parsed, raw = dependencies.llm.invoke_json(
        prompt=build_next_turn_prompt(state),
        model_name=dependencies.model_name,
        schema=NEXT_TURN_SCHEMA,
        max_tokens=2_048,
        temperature=0.3,
    )
    payload = _safe_dict(parsed)
    location = _safe_str(payload.get("location")) or state.location

    if payload.get("done") is True:
        consensus = _safe_str(payload.get("consensus"))
        if consensus:
            return state.model_copy(
                update={
                    "status": "agreed",
                    "pending": None,
                    "consensus": consensus,
                    "location": location,
                }
            )
        # Claiming to be done without saying what was agreed is not agreement.
        # Fall through and ask again rather than inventing a consensus.
        logger.warning("Grill reported done with no consensus; asking again")

    question = _question_from(payload, fallback_id=f"q{len(state.turns) + 1}")
    if question is None:
        raise GrillUnusableResponse(raw or _json_or_repr(payload))
    return state.model_copy(
        update={"status": "asking", "pending": question, "location": location}
    )


def start_grill(
    run_id: str,
    seed: str,
    dependencies: GrillDependencies,
) -> GrillState:
    """Open a grill on one typed line."""
    digest, source_urls, _tokens = research_seed(dependencies, seed)
    opening = GrillState(
        run_id=run_id,
        seed=seed,
        research_digest=digest,
        research_source_urls=source_urls,
        # `pending` is filled by advance_grill; the contract forbids an asking
        # state without one, so the opening question is not optional.
        status="asking",
        pending=GrillQuestion(
            question_id="q0",
            topic="opening",
            ask="placeholder",
            recommendation="placeholder",
        ),
    )
    return advance_grill(opening, dependencies)


def answer_grill(
    state: GrillState,
    answer: str,
    dependencies: GrillDependencies,
) -> GrillState:
    """Record what the operator typed and decide the next move."""
    if state.status != "asking" or state.pending is None:
        raise ValueError("This grill is not waiting for an answer.")
    cleaned = _safe_str(answer)
    if not cleaned:
        raise ValueError("An answer cannot be empty; the grill has nothing to act on.")

    answered = state.model_copy(
        update={
            "turns": [*state.turns, GrillTurn(question=state.pending, answer=cleaned)],
            "pending": None,
            "status": "asking",
        }
    )
    # model_copy skips validation, which is what lets this half-state exist for
    # one line. advance_grill returns a state that validates.
    return advance_grill(answered, dependencies)


def reopen_grill(state: GrillState, dependencies: GrillDependencies) -> GrillState:
    """Go back into the grill after agreement.

    The single exit from every dead end (ADR 0030): a refuted premise, a thin
    dossier, or a brief the operator no longer wants all come back here. What
    was learned stays in the transcript; the agreement does not.
    """
    reopened = state.model_copy(update={"status": "asking", "consensus": "", "pending": None})
    return advance_grill(reopened, dependencies)


def grill_stage_record(state: GrillState) -> dict[str, Any]:
    """What one grill turn writes to the run.

    The whole state each time, not a delta. Stage rows upsert on
    (run_id, stage) and the grill repeats by design, so the row has to be
    readable on its own; per-turn token usage is kept by the ledger under this
    stage's attempts.
    """
    return {
        "status": state.status,
        "seed": state.seed,
        "location": state.location,
        "turns_asked": len(state.turns),
        "transcript": [
            {
                "question_id": turn.question.question_id,
                "topic": turn.question.topic,
                "ask": turn.question.ask,
                "recommendation": turn.question.recommendation,
                "pushback": turn.question.pushback,
                "answer": turn.answer,
            }
            for turn in state.turns
        ],
        "pending": json.loads(state.pending.model_dump_json()) if state.pending else None,
        "consensus": state.consensus,
        "research": {
            "grounded": bool(state.research_digest),
            "source_urls": list(state.research_source_urls),
        },
    }
