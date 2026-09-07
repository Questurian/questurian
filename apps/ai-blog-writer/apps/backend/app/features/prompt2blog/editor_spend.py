"""What the post-writing editor cost, kept separately and kept durably.

`propose_edit` builds dependencies for the run, calls the model, and hands
back a proposal. Nothing wrote the resulting usage anywhere: five proposals an
editor read and threw away cost real money and left no trace on the article's
receipt. External usage monitoring may still hold the calls, but the run's own
account of what it cost did not.

Two things make this its own record rather than more rows in the run's ledger.

The ledger is written whole. Every rewrite replaces the stage row, and it is
safe for the pipeline because the pipeline is one worker walking one graph.
Two editors proposing at the same moment both restore a tracker from the same
stored ledger, both append their own call, and both write -- and one of the
two calls is gone. These are appended under their own ids inside a transaction
instead, so a repeat is a no-op and a race is a merge.

And they are a different kind of spending. The pipeline's ledger is what it
cost to produce the article; this is what has been spent on it since. A single
total that cannot say which is which is a number nobody can act on, so the
total is computed from the two when someone asks rather than stored as a third
thing that can disagree with both.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from app.core.database import transaction

from .observability import _now_iso
from .pricing import COST_BASIS_MEASURED, COST_BASIS_RATE_TABLE, TOKEN_KEYS
from .support import _safe_dict

EDITOR_SPEND_STAGE = "stage_v4_editor_spend"
EDITOR_SPEND_SCHEMA_VERSION = 1

# What a call reported about its own cost. The distinction the whole record
# exists to keep: a call whose usage nobody told us about is not a free call,
# and recording it as zero is how a receipt comes to understate what was spent.
MEASURED = "measured"
UNKNOWN = "unknown"


class EditorAttempt(BaseModel):
    """One model call made on a finished article, and what came of it.

    Every attempt is here, not only the ones whose proposal was kept. A
    proposal an editor read and discarded is exactly as paid for as one they
    applied, and a receipt that only counts the applied ones is a receipt that
    gets cheaper the more carefully somebody edits.
    """

    attempt_id: str
    kind: str = "propose"
    section_id: str = ""
    action_id: str = ""
    at: str = ""
    # "proposed" -- a change was offered.
    # "refused"  -- the model answered that it could not do it.
    # "failed"   -- the call did not come back.
    outcome: str = "proposed"
    model: str = ""
    measurement: str = UNKNOWN
    usage: dict[str, int] = Field(default_factory=dict)
    cost_usd: float | None = None
    cost_basis: str = ""
    error: str = ""


class EditorSpend(BaseModel):
    schema_version: int = EDITOR_SPEND_SCHEMA_VERSION
    attempts: list[EditorAttempt] = Field(default_factory=list)

    def totals(self) -> dict[str, Any]:
        """The sums, with the unmeasured calls counted rather than costed.

        Money that left an account and money that did not are separate lines.
        The section edit runs on Claude and the review on Gemini, so a single
        cost here would add a real per-token charge to the notional price of a
        call that drew a flat subscription -- the same mistake the run receipt
        was making, on a smaller number.
        """
        tokens = {key: 0 for key in TOKEN_KEYS}
        billed = 0.0
        subscription = 0.0
        priced = 0
        for attempt in self.attempts:
            for key in TOKEN_KEYS:
                tokens[key] += int(attempt.usage.get(key) or 0)
            if attempt.cost_usd is None:
                continue
            priced += 1
            if attempt.cost_basis == COST_BASIS_MEASURED:
                subscription += float(attempt.cost_usd)
            elif attempt.cost_basis == COST_BASIS_RATE_TABLE:
                billed += float(attempt.cost_usd)
        return {
            **tokens,
            "attempts": len(self.attempts),
            "priced_attempts": priced,
            # Named rather than implied. A total over four calls of which one
            # reported no usage is not the same number as a total over four
            # that all did, and the difference has to be readable.
            "unmeasured_attempts": len(self.attempts) - priced,
            "billed_cost_usd": round(billed, 6),
            "subscription_cost_usd": round(subscription, 6),
        }


def read_editor_spend(run_id: str) -> EditorSpend:
    with transaction() as conn:
        return _read(conn, run_id)


def _read(conn: Any, run_id: str) -> EditorSpend:
    row = conn.execute(
        "SELECT data FROM stages WHERE run_id = ? AND stage = ?",
        (run_id, EDITOR_SPEND_STAGE),
    ).fetchone()
    if not row:
        return EditorSpend()
    stored = _safe_dict(_safe_dict(json.loads(row["data"])).get("data"))
    return EditorSpend.model_validate(stored) if stored else EditorSpend()


def record_editor_attempt(run_id: str, attempt: EditorAttempt) -> EditorSpend:
    """Append one attempt, inside the transaction that reads what is there.

    Idempotent on `attempt_id`. A retried request that already got its call
    recorded must not be charged for it twice, and the caller cannot tell from
    the outside whether the first write landed.
    """
    with transaction() as conn:
        spend = _read(conn, run_id)
        if any(item.attempt_id == attempt.attempt_id for item in spend.attempts):
            return spend
        merged = EditorSpend(attempts=[*spend.attempts, attempt])
        conn.execute(
            """
            INSERT INTO stages (run_id, stage, data, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(run_id, stage) DO UPDATE SET
                data = excluded.data,
                created_at = excluded.created_at
            """,
            (
                run_id,
                EDITOR_SPEND_STAGE,
                json.dumps(
                    {
                        "created_at": _now_iso(),
                        "data": merged.model_dump(mode="json"),
                    },
                    default=str,
                ),
                _now_iso(),
            ),
        )
        return merged


def attempt_from_tracker(
    tracker: Any,
    *,
    attempt_id: str,
    kind: str,
    section_id: str,
    action_id: str,
    outcome: str,
    error: str = "",
) -> EditorAttempt:
    """Read one call's usage off the tracker that made it.

    The tracker is built fresh for this call, so whatever it holds is this
    call and nothing else -- no restore, and therefore no chance of writing an
    earlier leg's rows back out under a new id.

    A tracker holding nothing means the provider told us nothing, which is
    recorded as `unknown`. Recording it as zero would be inventing a cost, and
    inventing zero is the direction that makes a receipt wrong quietly.
    """
    calls = list(getattr(tracker, "calls", None) or [])
    if not calls:
        return EditorAttempt(
            attempt_id=attempt_id,
            kind=kind,
            section_id=section_id,
            action_id=action_id,
            at=_now_iso(),
            outcome=outcome,
            measurement=UNKNOWN,
            error=error,
        )
    call = calls[-1]
    metered = bool(call.get("metered"))
    return EditorAttempt(
        attempt_id=attempt_id,
        kind=kind,
        section_id=section_id,
        action_id=action_id,
        at=_now_iso(),
        outcome=outcome,
        model=str(call.get("model") or ""),
        measurement=MEASURED if metered else UNKNOWN,
        usage={key: int(call.get(key) or 0) for key in TOKEN_KEYS},
        cost_usd=call.get("cost_usd") if metered else None,
        cost_basis=str(call.get("cost_basis") or ""),
        error=error,
    )
