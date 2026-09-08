"""Starting one read of one draft, and keeping what it found.

The same three obligations `generation_v5` has, for the same reasons and at a
sixth of the price: two clicks must not buy two reads, a reload must not start
a third, and a new read must never destroy the last one. Reviews accumulate on
one stage row, oldest first.

They accumulate for a reason this module does not share with the writer. A
review is *about* a particular draft, so a review of the article you are
looking at and a review of the article you replaced are different objects, and
the second must not quietly stand in for the first. Every row carries the
draft version it read, and a review whose version no longer matches the draft
on screen stops counting as current without being deleted -- it is still the
honest record of a read somebody paid for.

The findings themselves carry a verdict the operator sets. Nothing in the app
acts on it. It exists so the cross-run read can skip what has already been
thrown out, which is the whole point of the detection phase: the faults that
survive that filter and still keep recurring are the real to-do list.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core import read_status, write_status

from .contracts_v4 import ArticleBrief
from .editor_v5 import (
    REVIEW_STAGE,
    ReviewRefused,
    review_draft,
    review_record,
)
from .support import _safe_dict, _safe_str

logger = logging.getLogger(__name__)

FEATURE_NAME = "prompt2blog"

STATE_RUNNING = "running"
STATE_SUCCEEDED = "succeeded"
STATE_FAILED = "failed"

# What the operator can say about one finding. `undecided` is the absence of a
# verdict rather than a third opinion, so it is not stored.
VERDICT_AGREED = "agreed"
VERDICT_NOT_A_FAULT = "not_a_fault"
VERDICTS = (VERDICT_AGREED, VERDICT_NOT_A_FAULT)


class ReviewAlreadyRunning(RuntimeError):
    """A read is in flight, so this one is refused."""


class NothingToReview(RuntimeError):
    """No draft on this run, so there is nothing to read."""


class UnknownVerdict(ValueError):
    """A verdict this does not recognise. Nothing is written."""


class UnknownFinding(LookupError):
    """No such finding on that review. Nothing is written."""


FAILURE_MESSAGES = {
    "quota_exhausted": (
        "The Claude account has no allowance left, so this draft could not be "
        "read. Trying again now will fail the same way."
    ),
    "not_connected": (
        "No Claude account is signed in on this machine, so nothing was sent "
        "and nothing was spent."
    ),
    "provider_unavailable": (
        "Claude did not finish reading. This one is usually worth retrying."
    ),
    "unusable_response": (
        "Claude answered, but the answer was not a review. What came back is "
        "kept below."
    ),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _reviews(run_id: str) -> list[dict[str, Any]]:
    from app.core import read_stage_result

    row = _safe_dict(_safe_dict(read_stage_result(run_id, REVIEW_STAGE)).get("data"))
    reviews = row.get("reviews")
    return (
        [item for item in reviews if isinstance(item, dict)]
        if isinstance(reviews, list)
        else []
    )


def _write_reviews(recorder: Any, run_id: str, reviews: list[dict[str, Any]]) -> None:
    recorder.record_stage(run_id, REVIEW_STAGE, {"reviews": reviews})


def _replace(
    reviews: list[dict[str, Any]], review: dict[str, Any]
) -> list[dict[str, Any]]:
    return [
        review if item.get("review_id") == review["review_id"] else item
        for item in reviews
    ]


def is_running(run_id: str) -> bool:
    reviews = _reviews(run_id)
    return bool(reviews) and reviews[-1].get("state") == STATE_RUNNING


def latest_review(run_id: str) -> dict[str, Any] | None:
    """The newest read that produced findings, whichever draft it read.

    Newest *succeeded*, so a failed retry after a good read leaves the good one
    readable -- the same rule the writer's drafts follow.
    """
    for review in reversed(_reviews(run_id)):
        if review.get("state") == STATE_SUCCEEDED:
            return review
    return None


def find_review(run_id: str, review_id: str) -> dict[str, Any] | None:
    return next(
        (item for item in _reviews(run_id) if item.get("review_id") == review_id),
        None,
    )


def begin_review(
    run_id: str,
    draft_version: str,
    attempt_id: str,
    recorder: Any,
) -> str:
    """Claim the run for one read, before anything is spent.

    Written to storage before the editor is called, for the reason the writer's
    claim is: the second request arrives while the first is still in the model,
    and a claim that exists only in the background task's memory cannot refuse
    anything.
    """
    if is_running(run_id):
        raise ReviewAlreadyRunning(
            "This draft is already being read. Nothing was started twice."
        )
    review_id = str(uuid4())
    reviews = _reviews(run_id)
    reviews.append(
        {
            "review_id": review_id,
            "state": STATE_RUNNING,
            "draft_version": draft_version,
            "attempt_id": attempt_id,
            "started_at": _now(),
            "finished_at": None,
        }
    )
    # The status the run was in before this read, so it can be put back. A
    # review is not the run: an article that is finished stays finished while
    # somebody reads it, and one whose last write failed must not come out of
    # this looking completed. `start_stage` writes "running" because that is
    # right for the writer, and it is what files this call's tokens under the
    # review stage instead of `unattributed`.
    previous = _safe_dict(read_status(run_id))
    reviews[-1]["previous_status"] = {
        "state": _safe_str(previous.get("state")),
        "stage": _safe_str(previous.get("stage")),
        "error": previous.get("error"),
        "failure_kind": previous.get("failure_kind"),
    }
    recorder.start_stage(run_id, REVIEW_STAGE)
    _write_reviews(recorder, run_id, reviews)
    return review_id


def _restore_status(review: dict[str, Any], run_id: str) -> None:
    """Put the run back in the state the read found it in."""
    previous = _safe_dict(review.get("previous_status"))
    if not previous.get("state"):
        return
    try:
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": previous.get("state"),
                "stage": previous.get("stage"),
                "error": previous.get("error"),
                "failure_kind": previous.get("failure_kind"),
                "updated_at": _now(),
            },
            feature=FEATURE_NAME,
        )
    except Exception as exc:  # pragma: no cover - bookkeeping only
        logger.warning("Could not restore run status after a review: %s", exc)


def run_review(
    run_id: str,
    review_id: str,
    brief: ArticleBrief,
    article: str,
    research_note: str,
    draft_version: str,
    writer: Any,
    recorder: Any,
    *,
    model_name: str = "claude-opus-5-high",
) -> None:
    """Read the draft, and record what happened either way.

    Every exit writes a row. A background task that dies silently leaves the
    page saying "reading" forever with no way to tell a crash from a long
    fact-check, and the only recourse is to buy another read.

    A failed read never fails the run. The article is untouched and still
    staged; what failed is somebody's attempt to look at it.
    """
    reviews = _reviews(run_id)
    current = next(
        (item for item in reviews if item.get("review_id") == review_id), None
    )
    if current is None:  # pragma: no cover - the row is written before this runs
        logger.error("Review vanished", extra={"run_id": run_id})
        return

    try:
        review, reply = review_draft(
            brief,
            article,
            research_note,
            draft_version,
            writer,
            model_name=model_name,
        )
    except ReviewRefused as error:
        current.update(
            state=STATE_FAILED,
            finished_at=_now(),
            failure="unusable_response",
            error=error.reason,
            raw=error.raw[:100_000],
        )
        _write_reviews(recorder, run_id, _replace(reviews, current))
        _restore_status(current, run_id)
        return
    except Exception as error:  # noqa: BLE001
        current.update(
            state=STATE_FAILED,
            finished_at=_now(),
            failure=_failure_category(error),
            error=str(error),
        )
        _write_reviews(recorder, run_id, _replace(reviews, current))
        _restore_status(current, run_id)
        return

    current.update(state=STATE_SUCCEEDED, finished_at=_now(), **review_record(review, reply))
    _write_reviews(recorder, run_id, _replace(reviews, current))
    _restore_status(current, run_id)


def _failure_category(error: Exception) -> str:
    """The distinction a person can act on, from the transport's own word."""
    kind = getattr(error, "kind", None)
    if isinstance(kind, str) and kind:
        return kind
    cause_kind = getattr(getattr(error, "__cause__", None), "kind", None)
    if isinstance(cause_kind, str) and cause_kind:
        return cause_kind
    return "unknown"


def mark_finding(
    run_id: str,
    review_id: str,
    finding_id: str,
    verdict: str | None,
    recorder: Any,
) -> dict[str, Any]:
    """Record what the operator makes of one finding.

    Changes nothing about the article and nothing about the review. The verdict
    is the operator's, kept beside the model's, and either can be read without
    the other.
    """
    if verdict is not None and verdict not in VERDICTS:
        raise UnknownVerdict(
            f"{verdict!r} is not a verdict. Use one of {', '.join(VERDICTS)}."
        )
    reviews = _reviews(run_id)
    current = next(
        (item for item in reviews if item.get("review_id") == review_id), None
    )
    if current is None:
        raise UnknownFinding(f"No review {review_id} on run {run_id}.")
    findings = [
        item for item in (current.get("findings") or []) if isinstance(item, dict)
    ]
    target = next(
        (item for item in findings if item.get("finding_id") == finding_id), None
    )
    if target is None:
        raise UnknownFinding(f"No finding {finding_id} on review {review_id}.")
    if verdict is None:
        target.pop("verdict", None)
        target.pop("verdict_at", None)
    else:
        target["verdict"] = verdict
        target["verdict_at"] = _now()
    current["findings"] = findings
    _write_reviews(recorder, run_id, _replace(reviews, current))
    return current


def review_state(run_id: str, draft_version: str | None) -> dict[str, Any] | None:
    """Where the read stands, for a page that may have been reloaded.

    Reading this starts nothing. The page asks for it every few seconds while a
    draft is being read, and a status read that could trigger a call would be
    the most expensive bug in the system.

    `stale` is the whole reason `draft_version` is a parameter here. A review of
    a draft that has since been rewritten is not wrong, it is simply not about
    what is on screen, and showing it as current would put findings against
    paragraphs that no longer exist.
    """
    reviews = _reviews(run_id)
    if not reviews:
        return None
    newest = reviews[-1]
    done = latest_review(run_id)
    state = _safe_str(newest.get("state"))
    failure = _safe_str(newest.get("failure"))
    stale = bool(
        done and draft_version and _safe_str(done.get("draft_version")) != draft_version
    )
    findings = [
        item for item in ((done or {}).get("findings") or []) if isinstance(item, dict)
    ]
    return {
        "state": state,
        "review_id": _safe_str(newest.get("review_id")),
        "reviews": len(reviews),
        "started_at": _safe_str(newest.get("started_at")),
        "finished_at": _safe_str(newest.get("finished_at")) or None,
        "failure": failure or None,
        "message": FAILURE_MESSAGES.get(failure)
        or _safe_str(newest.get("error"))
        or None,
        "raw": _safe_str(newest.get("raw")) or None,
        # A previous good read survives a later failure, so this is not
        # conditional on the newest one succeeding.
        "has_review": done is not None,
        # True when the read that exists is about an article that has since
        # been rewritten.
        "stale": stale,
        "reviewed_draft_version": _safe_str((done or {}).get("draft_version")) or None,
        "finding_count": len(findings),
        "served_model": _safe_str((done or {}).get("served_model")) or None,
        "turns": (done or {}).get("turns"),
        "elapsed_seconds": (done or {}).get("elapsed_seconds"),
        "cost_usd": (done or {}).get("cost_usd"),
        "parse_issue": _safe_str((done or {}).get("parse_issue")) or None,
    }


def finished_review(run_id: str) -> dict[str, Any]:
    """The findings themselves, for reading.

    Its own call rather than part of the polled state, for the reason the draft
    is: this is every finding with its quote and its problem, plus the reply it
    was parsed out of.
    """
    review = latest_review(run_id)
    if review is None:
        raise LookupError(f"No review of run {run_id}.")
    return {"run_id": run_id, **review}
