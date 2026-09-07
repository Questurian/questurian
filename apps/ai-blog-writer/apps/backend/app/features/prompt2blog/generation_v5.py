"""Starting one writing attempt, and keeping what it produced.

Two clicks must not buy two articles, a reload must not start a third, and a
new attempt must never destroy the draft the last one made. Those three are the
whole job of this module; the writing itself is one call in `writer_v5`.

Attempts accumulate on one stage row rather than overwriting it. A stage row is
last-write-wins, so a retry that replaced the row would delete an article
somebody had already paid for -- and the case where a retry is wanted is
exactly the case where the previous draft is worth comparing against.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core import read_stage_result

from .support import _safe_dict, _safe_str
from .writer_prompt import WriterPrompt
from .writer_v5 import ResearchWriter, WriterRefused, write_article

logger = logging.getLogger(__name__)

# One row, holding every attempt this run has made, oldest first.
WRITE_STAGE = "stage_v5_write"

STATE_RUNNING = "running"
STATE_SUCCEEDED = "succeeded"
STATE_FAILED = "failed"


class GenerationAlreadyRunning(RuntimeError):
    """An attempt is in flight, so this one is refused.

    The failure this prevents is mundane and expensive: a double click, or a
    reload that a page turned into a second POST, buying a second article on the
    same run.
    """


class NothingToWriteFrom(RuntimeError):
    """No current prompt on this run.

    Either none was generated, or the brief changed under the one that was. A
    prompt built from a replaced brief describes an article nobody agreed to,
    so it is not quietly reused.
    """


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _attempts(run_id: str) -> list[dict[str, Any]]:
    row = _safe_dict(_safe_dict(read_stage_result(run_id, WRITE_STAGE)).get("data"))
    attempts = row.get("attempts")
    return [item for item in attempts if isinstance(item, dict)] if isinstance(attempts, list) else []


def _write_attempts(recorder: Any, run_id: str, attempts: list[dict[str, Any]]) -> None:
    recorder.record_stage(run_id, WRITE_STAGE, {"attempts": attempts})


def _replace(attempts: list[dict[str, Any]], attempt: dict[str, Any]) -> list[dict[str, Any]]:
    """The list with this attempt's row updated in place, order preserved."""
    return [
        attempt if item.get("attempt_id") == attempt["attempt_id"] else item
        for item in attempts
    ]


def is_running(run_id: str) -> bool:
    attempts = _attempts(run_id)
    return bool(attempts) and attempts[-1].get("state") == STATE_RUNNING


def latest_attempt(run_id: str) -> dict[str, Any] | None:
    attempts = _attempts(run_id)
    return attempts[-1] if attempts else None


def latest_draft(run_id: str) -> dict[str, Any] | None:
    """The newest attempt that produced an article.

    Newest *successful*, not newest. A failed retry after a good draft leaves
    the good draft readable, which is the behaviour the accumulate-don't-replace
    storage exists to make possible.
    """
    for attempt in reversed(_attempts(run_id)):
        draft = _safe_dict(attempt.get("draft"))
        if attempt.get("state") == STATE_SUCCEEDED and draft:
            return {**draft, "attempt_id": attempt.get("attempt_id")}
    return None


def begin_attempt(
    run_id: str,
    prompt: WriterPrompt,
    recorder: Any,
) -> str:
    """Claim the run for one attempt, before anything is spent.

    Written to storage *before* the writer is called, not after, because the
    thing being defended against is a second request arriving while the first
    one is still in the model. An attempt that exists only in memory until it
    finishes cannot refuse anything.
    """
    if is_running(run_id):
        raise GenerationAlreadyRunning(
            "This article is already being written. Nothing was started twice."
        )
    attempt_id = str(uuid4())
    attempts = _attempts(run_id)
    attempts.append(
        {
            "attempt_id": attempt_id,
            "state": STATE_RUNNING,
            "prompt_fingerprint": prompt.prompt_fingerprint,
            "brief_fingerprint": prompt.brief_fingerprint,
            "started_at": _now(),
            "finished_at": None,
        }
    )
    recorder.start_stage(run_id, WRITE_STAGE)
    _write_attempts(recorder, run_id, attempts)
    return attempt_id


def run_attempt(
    run_id: str,
    attempt_id: str,
    prompt: WriterPrompt,
    writer: ResearchWriter,
    recorder: Any,
    *,
    model_name: str = "claude-opus-5-high",
) -> None:
    """Do the writing, and record what happened either way.

    Every exit from here writes a row. A background task that dies silently
    leaves a run stuck on "writing" forever with no way to tell a crash from a
    long research pass, and the operator's only recourse is to buy another one.
    """
    attempts = _attempts(run_id)
    current = next(
        (item for item in attempts if item.get("attempt_id") == attempt_id), None
    )
    if current is None:  # pragma: no cover - the row is written before this runs
        logger.error("Writing attempt vanished", extra={"run_id": run_id})
        return

    try:
        outcome = write_article(prompt, writer, model_name=model_name)
    except WriterRefused as error:
        # Claude answered and the answer is not an article. The words were paid
        # for, so they are kept where a person can read them.
        current.update(
            state=STATE_FAILED,
            finished_at=_now(),
            failure="unusable_response",
            error=error.reason,
            raw=error.raw[:100_000],
        )
        _write_attempts(recorder, run_id, _replace(attempts, current))
        recorder.fail(run_id, WRITE_STAGE, error)
        return
    except Exception as error:  # noqa: BLE001
        current.update(
            state=STATE_FAILED,
            finished_at=_now(),
            failure=_failure_category(error),
            error=str(error),
        )
        _write_attempts(recorder, run_id, _replace(attempts, current))
        recorder.fail(run_id, WRITE_STAGE, error)
        return

    draft = outcome.draft
    current.update(
        state=STATE_SUCCEEDED,
        finished_at=_now(),
        requested_model=outcome.requested_model,
        served_model=outcome.served_model,
        effort=outcome.effort,
        turns=outcome.turns,
        elapsed_seconds=outcome.elapsed_seconds,
        cost_usd=outcome.cost_usd,
        usage=outcome.usage,
        tool_denials=outcome.tool_denials,
        draft={
            "headline": draft.headline,
            "article_markdown": draft.article_markdown,
            "research_note": draft.research_note,
            "parse_issue": draft.parse_issue,
            "content_hash": _content_hash(draft.article_markdown),
            "word_count": len(draft.article_markdown.split()),
            # The reply exactly as it arrived. Everything above is derived from
            # it, and a parser that turns out to be wrong must not be the only
            # copy of what was bought.
            "raw": draft.raw[:400_000],
        },
    )
    _write_attempts(recorder, run_id, _replace(attempts, current))
    # The output row is what Saved Articles lists and what staging loads. Only
    # the article goes into `markdown`: a research note published as body text
    # is a list of URLs and admissions, and it reads as prose to anything that
    # only counts words.
    recorder.record_artifact(
        run_id,
        {
            "markdown": draft.article_markdown,
            "prompt2blog_v5": {
                "final_title": draft.headline,
                "form": {"label": prompt.form_label},
                "research_note": draft.research_note,
                "prompt_fingerprint": prompt.prompt_fingerprint,
                "brief_fingerprint": prompt.brief_fingerprint,
                "requested_model": outcome.requested_model,
                "served_model": outcome.served_model,
                "effort": outcome.effort,
                "turns": outcome.turns,
                "elapsed_seconds": outcome.elapsed_seconds,
                "cost_usd": outcome.cost_usd,
                "parse_issue": draft.parse_issue,
            },
        },
    )
    recorder.complete(run_id)


def _content_hash(article: str) -> str:
    """A version id for one draft's text.

    The later editor applies changes against a draft version, so a result
    returned for an older one has to be refusable rather than merged blind.
    """
    return "dv-" + hashlib.sha256(article.encode("utf-8")).hexdigest()[:32]


def _failure_category(error: Exception) -> str:
    """The distinction a person can act on, from the transport's own word.

    `quota_exhausted` means stop; `not_connected` means fix the setup;
    `provider_unavailable` means try again. Guessing from the message text is
    how "the account is out of allowance" became "the checker returned
    nonsense" and the run carried on spending.
    """
    kind = getattr(error, "kind", None)
    if isinstance(kind, str) and kind:
        return kind
    cause_kind = getattr(getattr(error, "__cause__", None), "kind", None)
    if isinstance(cause_kind, str) and cause_kind:
        return cause_kind
    return "unknown"


# What a person is told while it runs and once it stops. Deliberately without a
# percentage or a stage name: the transport reports turns after the fact and
# nothing exposes progress during, so any number here would be invented.
FAILURE_MESSAGES = {
    "quota_exhausted": (
        "The Claude account has no allowance left, so this could not be "
        "written. Trying again now will fail the same way."
    ),
    "not_connected": (
        "No Claude account is signed in on this machine, so nothing was sent "
        "and nothing was spent."
    ),
    "provider_unavailable": (
        "Claude did not finish. This one is usually worth retrying."
    ),
    "unusable_response": (
        "Claude answered, but the answer was not an article. What came back is "
        "kept below."
    ),
}


def generation_state(run_id: str) -> dict[str, Any] | None:
    """Where the writing stands, for a page that may have been reloaded.

    Reading this starts nothing. The page polls it every few seconds while an
    article is being written, and a status read that could trigger a call would
    be the most expensive bug in the system.
    """
    attempt = latest_attempt(run_id)
    if attempt is None:
        return None
    state = _safe_str(attempt.get("state"))
    failure = _safe_str(attempt.get("failure"))
    draft = latest_draft(run_id)
    return {
        "state": state,
        "attempt_id": _safe_str(attempt.get("attempt_id")),
        "attempts": len(_attempts(run_id)),
        "started_at": _safe_str(attempt.get("started_at")),
        "finished_at": _safe_str(attempt.get("finished_at")) or None,
        "failure": failure or None,
        "message": FAILURE_MESSAGES.get(failure) or _safe_str(attempt.get("error")) or None,
        # Kept so a refusal can be read rather than guessed at.
        "raw": _safe_str(attempt.get("raw")) or None,
        "requested_model": _safe_str(attempt.get("requested_model")) or None,
        "served_model": _safe_str(attempt.get("served_model")) or None,
        "effort": _safe_str(attempt.get("effort")) or None,
        "turns": attempt.get("turns"),
        "elapsed_seconds": attempt.get("elapsed_seconds"),
        "cost_usd": attempt.get("cost_usd"),
        "tool_denials": attempt.get("tool_denials") or [],
        # A previous good draft survives a later failure, so this is not
        # conditional on the newest attempt succeeding.
        "has_draft": draft is not None,
        "headline": (draft or {}).get("headline") or None,
        "word_count": (draft or {}).get("word_count"),
        "parse_issue": (draft or {}).get("parse_issue") or None,
    }


def finished_draft(run_id: str) -> dict[str, Any]:
    """The article, for reading.

    Its own call rather than part of the polled state, because the state is
    asked for every few seconds and this is the whole article plus its raw
    reply.
    """
    draft = latest_draft(run_id)
    if draft is None:
        raise LookupError(f"No article written for run {run_id}.")
    return {"run_id": run_id, **draft}
