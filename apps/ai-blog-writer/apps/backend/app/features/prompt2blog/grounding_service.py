"""The validated grounding check, separated from the stage that used to own it.

The check lived inside `check_v3_groundedness`: the call, the one retry, the
sanitiser that refuses an unreadable verdict, the degrade to `unchecked` -- all
of it wound together with graph state, a trace writer and a recorder. The post-
writing editor needed the same judgement and could not have it without running
a pipeline stage for its side effects, so it got a regex over figures instead,
and a probe that swapped two prices past it without a word.

What comes out here is the part that is actually the check: given evidence and
a piece of prose, a verdict or an honest `unchecked`. The attempts are returned
rather than traced, so the stage keeps writing exactly the trace rows it wrote
before and the editor writes none.

The properties that made the pipeline's version trustworthy are properties of
this function now, and both callers get them:

- a malformed response is retried once with the contract it missed, and then
  becomes `unchecked` -- never a pass;
- a provider failure degrades, except for a fatal one, which is re-raised so a
  dead account is not misreported as a checker outage;
- `checked`, `grounded` and `status` are always distinguishable, so "we looked
  and it holds up", "we looked and it does not" and "we did not manage to
  look" are three answers rather than two.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.shared.provider_faults import is_fatal_provider_fault

from .quality import (
    GroundednessMalformed,
    _sanitize_groundedness,
    unchecked_groundedness,
)
from .schemas import GROUNDEDNESS_SCHEMA

logger = logging.getLogger(__name__)

# One retry, not a loop. A malformed verdict is usually a formatting slip the
# same call gets right the second time; a checker that cannot answer the
# contract twice is not going to answer it on the fifth attempt, and every
# further attempt spends the repair budget on the stage that is not writing.
GROUNDEDNESS_MALFORMED_ATTEMPTS = 2

# Appended for the retry only. The first call is asked in the ordinary way; a
# response that failed validation gets told which contract it missed, because
# "return JSON" is what it already did.
MALFORMED_RETRY_NOTE = """
YOUR PREVIOUS RESPONSE WAS REJECTED:
{reason}

Return the object exactly as specified above. `grounded` must be a boolean,
`assessment` must be a non-empty sentence, and every entry in
`unsupported_claims` must carry `claim`, `reason`, and a `severity` of
exactly "high" or "low". If nothing is unsupported, return an empty list and
`grounded: true` -- never `grounded: false` with no claim explaining it."""


@dataclass(frozen=True)
class GroundingAttempt:
    """One call, and what it was worth. The stage turns these into trace rows."""

    attempt: int
    prompt: str
    raw_response: str = ""
    parsed: Any = None
    error: str = ""


@dataclass(frozen=True)
class GroundingOutcome:
    verdict: dict[str, Any]
    raw_response: str = ""
    rejected: list[str] = field(default_factory=list)
    attempts: list[GroundingAttempt] = field(default_factory=list)

    @property
    def checked(self) -> bool:
        return bool(self.verdict.get("checked"))

    @property
    def status(self) -> str:
        """`supported`, `unsupported`, or `unchecked`. Never a bare boolean."""
        return str(self.verdict.get("status") or "unchecked")


def check_grounding(
    *,
    llm: Any,
    prompt: str,
    job_id: str,
    model_name: str | None = None,
    max_tokens: int = 2048,
) -> GroundingOutcome:
    """Ask a checker to judge prose against evidence, and read the answer.

    `prompt` is built by the caller, because the two callers are asking about
    different things: the pipeline about a whole draft against the run's
    evidence records, the editor about one candidate section in its article
    against the frozen packet. What must not differ is what happens to the
    answer, and that is here.
    """
    base_prompt = prompt
    raw_response = ""
    rejected: list[str] = []
    attempts: list[GroundingAttempt] = []

    for attempt in range(1, GROUNDEDNESS_MALFORMED_ATTEMPTS + 1):
        try:
            parsed, raw_response = llm.invoke_json(
                job_id=job_id,
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=0.0,
                model_name=model_name,
                schema=GROUNDEDNESS_SCHEMA,
            )
        except Exception as exc:  # noqa: BLE001
            # A dead account is not a checker outage. Degrading here would
            # record "the check did not run" -- which reads as a checker
            # problem -- and then spend the next call on the same exhausted
            # credential.
            if is_fatal_provider_fault(exc):
                raise
            logger.warning("Prompt2Blog groundedness check failed: %s", exc)
            attempts.append(
                GroundingAttempt(attempt=attempt, prompt=prompt, error=str(exc))
            )
            return GroundingOutcome(
                verdict=unchecked_groundedness(f"provider call failed: {exc}"),
                raw_response=raw_response,
                rejected=rejected,
                attempts=attempts,
            )

        try:
            verdict = _sanitize_groundedness(parsed)
        except GroundednessMalformed as exc:
            # Recorded, not swallowed. A run whose checker never produced a
            # readable verdict should say so on its own receipt rather than
            # arrive downstream looking like one nobody checked for no reason.
            reason = str(exc)
            rejected.append(reason)
            logger.warning(
                "Prompt2Blog groundedness response rejected (attempt %d): %s",
                attempt,
                reason,
            )
            attempts.append(
                GroundingAttempt(
                    attempt=attempt,
                    prompt=prompt,
                    raw_response=raw_response,
                    parsed=parsed,
                    error=f"malformed groundedness response: {reason}",
                )
            )
            if attempt < GROUNDEDNESS_MALFORMED_ATTEMPTS:
                prompt = base_prompt + MALFORMED_RETRY_NOTE.format(reason=reason)
                continue
            return GroundingOutcome(
                verdict=unchecked_groundedness(
                    f"checker returned an unreadable verdict ({'; '.join(rejected)})"
                ),
                raw_response=raw_response,
                rejected=rejected,
                attempts=attempts,
            )

        attempts.append(
            GroundingAttempt(
                attempt=attempt,
                prompt=prompt,
                raw_response=raw_response,
                parsed=parsed,
            )
        )
        return GroundingOutcome(
            verdict=verdict,
            raw_response=raw_response,
            rejected=rejected,
            attempts=attempts,
        )

    # Unreachable: every path in the loop returns. Here so a future edit that
    # changes the loop cannot fall out of it holding nothing.
    return GroundingOutcome(
        verdict=unchecked_groundedness("the check did not run"),
        rejected=rejected,
        attempts=attempts,
    )
