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

from .config import P2B_V4_GRILL_MODEL, P2B_V4_GRILL_TEMPERATURE
from .contracts_v4 import (
    BRIEF_MARKERS,
    MARKER_KEYS,
    GrillQuestion,
    GrillState,
    GrillTurn,
)
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
# Flat on purpose.
#
# This was nested -- `question` as an object carrying `ask`, `recommendation`
# and `pushback` -- and models kept answering flat instead: `question` as the
# question string, with `recommendation` beside it at the top level. Twice in a
# row the reply was a good question with a good recommendation, and it was
# refused for its shape.
#
# There is nothing here worth nesting. A flat object has no structure to get
# wrong, and shape is not worth losing content over.
NEXT_TURN_SCHEMA = require_non_empty({
    "type": "object",
    "properties": {
        "done": {"type": "boolean"},
        "ask": {"type": "string"},
        "recommendation": {"type": "string"},
        "pushback": {"type": "string"},
        "topic": {"type": "string"},
        "consensus": {"type": "string"},
        "location": {"type": "string"},
        "markers_covered": {"type": "array", "items": {"type": "string"}},
        "asks_about": {"type": "string"},
    },
    "required": [
        "done",
        "ask",
        "recommendation",
        "consensus",
        "markers_covered",
        "asks_about",
    ],
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
    model_name: str = P2B_V4_GRILL_MODEL


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
    """The whole conversation, including the grill's own half.

    This used to render the question and the answer and drop the draft answer
    the grill wrote. The screen pre-fills the answer box with that draft, so
    the most common way to answer is to send it back untouched -- and with the
    draft missing from the replay, the grill read its own sentence returning as
    a confident, detailed answer from a writer. Run 1b441532 (2026-08-30
    15:40Z) agreed after two turns on that basis, having learned nothing.

    A grill that cannot tell "they said it" from "I said it" cannot judge
    agreement, so it gets told (ADR 0033).
    """
    if not state.turns:
        return "Nothing asked yet."

    blocks: list[str] = []
    for index, turn in enumerate(state.turns, start=1):
        lines = [f"Q{index}. You asked: {turn.question.ask}"]
        if turn.question.pushback:
            lines.append(f"You pushed back: {turn.question.pushback}")
        lines.append(f"You drafted this answer for them: {turn.question.recommendation}")
        if turn.accepted_as_drafted:
            lines.append(
                "They sent your draft back untouched. Those are YOUR words, not "
                "theirs: it means they did not object, and it tells you nothing "
                "you did not already believe."
            )
        else:
            lines.append(f"They wrote, in their own words: {turn.answer}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _marker_status(state: GrillState) -> str:
    """What the brief still needs, named in plain English."""
    covered = set(state.markers_covered)
    return "\n".join(
        f"- {marker}: {description} — {'COVERED' if marker in covered else 'still missing'}"
        for marker, _, description in BRIEF_MARKERS
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

WHAT THE BRIEF STILL NEEDS:
{_marker_status(state)}

Decide the single most useful next move.

Output shape (mechanical -- get it right and then forget about it): every
reply carries `ask`, `recommendation`, `consensus`, `markers_covered` and
`asks_about`. When you are asking, fill `ask`, `recommendation` and
`asks_about`, and leave `consensus` empty. When you are done, fill `consensus`
and leave the others empty. `markers_covered` is always the full list of
markers you can now fill.

Now the part that matters:
- Ask about ONE thing. If you are joining two questions with "and", you are
  asking two: keep the one you need first and save the other for next turn.
  Only ever ask about something you cannot look up -- what they want, who it
  is for, what they personally have, what would make it a failure. Never ask
  them to confirm a fact.
- `recommendation` is your best answer to your own question, and it goes
  straight into their answer box for them to accept or correct. Three rules,
  in order of how badly each one bites.

  STATE THE ANSWER, NOT A SENTENCE ABOUT WHO HOLDS IT. No "you", no "I", no
  "I'm guessing", no question mark. Just the answer, the way a good editor
  says it out loud.

  Write: "A first-timer's guide with a point of view, not a ranking."
  Write: "It fails if it reads like a luxury fine-dining checklist."
  Never: "I'm guessing you want to build the piece around your own trip."

  MAKE IT YOUR REAL JUDGMENT. This is the expertise they came for, and a
  recommendation is the one place you get to use it. Think about what would
  genuinely make the best article, given their line and what you looked up,
  and propose that -- specifically, and strongly enough to argue with. A
  hedge, a menu of options, or a restatement of their own words is a wasted
  turn. Being wrong is fine and easy for them to fix. Being vague hands back
  the blank you were meant to fill.

  NEVER INVENT A FACT ABOUT THEIR LIFE. You can judge what the article should
  be. You cannot know where they have been, who they know, or what they ate.
  For anything only they can answer, do not write them a trip they may never
  have taken -- an invented experience they accept becomes first-hand material
  that nothing downstream is allowed to check. Recommend the research-led
  case, which is both the common one and the safe one, and let them correct it
  upward.

  Write: "Nothing first-hand -- this is researched rather than reported."
  Never: "I spent a week there in April and ate at the places I write about."
- If an answer contradicts their opening line or an earlier answer, set
  `pushback` naming the contradiction, and make the question resolve it.
- Ask about what they HAVE, never about credentials. "Been there, know
  someone, have an interview?" is the shape. "Nothing" is a fine answer and
  means it is a research-led piece.
- Set `location` to the city AND its country: "Medellin, Colombia", never
  "Medellin". Everything downstream searches the web with this, and half the
  place names in Latin America exist in several countries. Medellin has a
  neighbourhood called Buenos Aires; a bare city name let a search answer about
  Argentina. Leave it empty only when their line is genuinely ambiguous about
  which place they mean.
- Set `asks_about` to the marker your question is meant to settle. Ask about a
  marker that is still missing. NEVER ask about a marker twice: once they have
  answered a question, that marker is settled and you move to the next one. If
  their answer was thin and you want more, that is a different question about
  something else -- rephrasing the same question is how an interview stops
  being one.
- `markers_covered` lists every marker you could now fill. Accepting your draft
  IS answering: they read it and put their name to it. It is weaker than an
  answer they wrote themselves, and that difference is worth noticing -- it
  tells you they are letting you drive, so put more into your next
  recommendation and be readier to push back. It does NOT mean the marker is
  unanswered. A marker you asked about and they responded to is settled.
- Set `done` true and write `consensus` only when every marker is covered. Then
  play the whole thing back in plain English, addressed to them, so they can
  say "yes" or "no, less about that". You are not counting questions -- you are
  filling the brief, and you stop when it is full. {asked} questions asked so
  far.
"""


def _question_from(payload: dict[str, Any], fallback_id: str) -> GrillQuestion | None:
    """Read the question, however the model chose to arrange it.

    Flat is what the schema asks for and what models actually produce. Nested
    under `question` is what an earlier schema asked for, and some will still
    do it. A bare `question` string with the recommendation beside it is the
    third arrangement seen in the wild.

    All three carry the same words. Refusing one of them throws away a
    perfectly good question over punctuation, which is exactly what happened
    twice on the first live runs.
    """
    nested = _safe_dict(payload.get("question"))
    question_text = payload.get("question")
    flat_ask = question_text if isinstance(question_text, str) else ""

    ask = (
        _safe_str(payload.get("ask"))
        or _safe_str(nested.get("ask"))
        or _safe_str(flat_ask)
    )
    recommendation = _safe_str(payload.get("recommendation")) or _safe_str(
        nested.get("recommendation")
    )
    if not ask or not recommendation:
        # A question with no recommendation is a blank box, which is the thing
        # this replaces. Reject it rather than showing it.
        return None
    asks_about = _safe_str(payload.get("asks_about")) or _safe_str(
        nested.get("asks_about")
    )
    return GrillQuestion(
        question_id=_safe_str(payload.get("question_id"))
        or _safe_str(nested.get("question_id"))
        or fallback_id,
        topic=_safe_str(payload.get("topic")) or _safe_str(nested.get("topic")) or "next",
        ask=ask,
        recommendation=recommendation,
        pushback=_safe_str(payload.get("pushback")) or _safe_str(nested.get("pushback")),
        asks_about=asks_about if asks_about in MARKER_KEYS else "",
    )


def _markers_from(payload: dict[str, Any], state: GrillState) -> list[str]:
    """Which brief markers are settled: what the grill claims, plus what the
    conversation shows.

    The claim alone is not enough. Run a9959013 (2026-08-30 19:29Z) asked what
    would make the article a failure four times, got four usable answers, and
    never once marked `fails_if` covered -- because every answer was an
    accepted draft and the grill had been told an accepted draft is weak
    evidence. It refused to credit its own question, so the checklist never
    shrank and it asked again. That is a livelock, not caution.

    So a marker a question was asked about, and answered, counts. Accepting a
    draft is answering: the operator read it and endorsed it. The written-vs-
    accepted distinction still reaches the grill, and it still shapes how hard
    it probes -- it just cannot stall progress any more.

    Unknown names in the claim are dropped rather than refused: a model
    inventing a seventh marker has still told us about the six real ones.
    """
    raw = payload.get("markers_covered")
    claimed = {_safe_str(item) for item in raw} if isinstance(raw, list) else set()
    answered = {turn.question.asks_about for turn in state.turns}
    settled = claimed | answered
    return [key for key in MARKER_KEYS if key in settled]


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
        temperature=P2B_V4_GRILL_TEMPERATURE,
    )
    payload = _safe_dict(parsed)
    location = _safe_str(payload.get("location")) or state.location
    covered = _markers_from(payload, state)

    if payload.get("done") is True:
        consensus = _safe_str(payload.get("consensus"))
        missing = [key for key in MARKER_KEYS if key not in covered]
        if consensus and not missing:
            return state.model_copy(
                update={
                    "status": "agreed",
                    "pending": None,
                    "consensus": consensus,
                    "markers_covered": list(covered),
                    "location": location,
                }
            )
        # Claiming to be done without saying what was agreed is not agreement,
        # and neither is being done with the brief still short of what it needs
        # (ADR 0033). Either way: keep asking rather than inventing the rest.
        logger.warning(
            "Grill reported done but is not finished; consensus=%s missing=%s",
            bool(consensus),
            ", ".join(missing) or "none",
        )

    question = _question_from(payload, fallback_id=f"q{len(state.turns) + 1}")
    if question is None:
        raise GrillUnusableResponse(raw or _json_or_repr(payload))
    return state.model_copy(
        update={
            "status": "asking",
            "pending": question,
            "markers_covered": list(covered),
            "location": location,
        }
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
                # Whether this was their answer or the grill's draft returned
                # untouched. Recorded because a transcript that cannot show the
                # difference is what let the grill agree with itself.
                "accepted_as_drafted": turn.accepted_as_drafted,
            }
            for turn in state.turns
        ],
        "pending": json.loads(state.pending.model_dump_json()) if state.pending else None,
        "consensus": state.consensus,
        "markers_covered": list(state.markers_covered),
        "markers_missing": [
            marker for marker in MARKER_KEYS if marker not in state.markers_covered
        ],
        "research": {
            "grounded": bool(state.research_digest),
            "source_urls": list(state.research_source_urls),
        },
    }
