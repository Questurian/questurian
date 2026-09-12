"""How many reviews are left to buy, and the switch that stops buying them.

The reviews API is on a free plan whose quota is counted **per review object
returned, not per request**. Asking for twenty reviews spends twenty. The plan
allows five hundred, and the owner's instruction is that it must never go past
that and become a charge.

So there are two counters, and the stricter one wins:

**Ours**, kept here. Every call writes what it spent to a ledger, and the sum
is the floor under which nothing is allowed to run. It survives the API being
unreachable, being wrong, or being replaced, and it is the counter a person can
read without logging in anywhere.

**Theirs**, read off the response headers. RapidAPI returns
`x-ratelimit-businesses-remaining` on every answer, which is the truth about
the account rather than our guess about it. It catches the spend this app
cannot see: a call made from Location Manager, a retry we never recorded, a
month that reset.

Ours cannot see their other apps and theirs cannot see a call that never
returned, so neither alone is safe and the minimum of the two is what gates a
call.

**The quota resets and this counter does not.** Their header says the free plan
rolls over on a timer. Nothing here reads that timer and spends again on the
strength of it, because a machine deciding on its own that it is safe to start
buying is exactly the failure this module exists to prevent. When a new month
arrives and the owner wants to keep going, they clear the ledger deliberately:

    from app.features.listicle_pipeline import reviews_budget
    reviews_budget.reset("september quota rolled over")

which writes a row saying who cleared it and why.
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.database import get_db_connection, transaction

# The free plan's allowance, in review objects. Not read from the API: a
# ceiling that the thing being limited is allowed to raise is not a ceiling.
DEFAULT_OBJECT_BUDGET = 500

# What one press of "Research this place" is expected to spend, used only to
# say the remaining budget in the unit the owner actually thinks in -- places
# left, not objects left.
REVIEWS_PER_PLACE = 20


def object_budget() -> int:
    """The ceiling. Overridable, because a paid plan would move it."""
    raw = os.getenv("LISTICLE_REVIEWS_OBJECT_BUDGET", "").strip()
    if raw.isdigit() and int(raw) > 0:
        return int(raw)
    return DEFAULT_OBJECT_BUDGET


_LEDGER = """
CREATE TABLE IF NOT EXISTS listicle_reviews_spend (
    entry_id        TEXT PRIMARY KEY,
    at              TEXT NOT NULL,
    -- 'call' spends objects. 'reset' is a person clearing the counter, and
    -- carries the reason they gave.
    kind            TEXT NOT NULL DEFAULT 'call',
    business_id     TEXT NOT NULL DEFAULT '',
    requested       INTEGER NOT NULL DEFAULT 0,
    -- What was actually billed: the number of review objects that came back.
    objects         INTEGER NOT NULL DEFAULT 0,
    http_status     INTEGER,
    -- Their counter, as of this answer. NULL when the header was absent, which
    -- is not the same as zero and must not be read as it.
    reported_remaining INTEGER,
    reported_limit  INTEGER,
    note            TEXT NOT NULL DEFAULT '',
    params          TEXT NOT NULL DEFAULT '{}'
)
"""

_INDEX = (
    "CREATE INDEX IF NOT EXISTS idx_reviews_spend_at "
    "ON listicle_reviews_spend (at)"
)


def ensure_tables() -> None:
    with get_db_connection() as conn:
        conn.execute(_LEDGER)
        conn.execute(_INDEX)


@dataclass(frozen=True)
class Budget:
    """What is left, by both counts, and what that allows.

    `remaining` is the one that gates a call. `spent` and `reported_remaining`
    are kept apart so a disagreement between them stays visible: they measure
    different things and folding them into one number hides the case where
    another app has been spending this quota.
    """

    ceiling: int
    spent: int
    reported_remaining: int | None
    reported_limit: int | None
    last_call_at: str
    calls: int

    @property
    def ours_remaining(self) -> int:
        return max(0, self.ceiling - self.spent)

    @property
    def remaining(self) -> int:
        """The stricter of the two counters. This is the spendable number."""
        if self.reported_remaining is None:
            return self.ours_remaining
        return max(0, min(self.ours_remaining, self.reported_remaining))

    @property
    def places_left(self) -> int:
        """Remaining budget said in places, which is the unit decisions use."""
        return self.remaining // REVIEWS_PER_PLACE

    @property
    def exhausted(self) -> bool:
        return self.remaining <= 0

    @property
    def disagrees(self) -> bool:
        """True when their count and ours have drifted apart.

        Worth showing rather than resolving: the usual cause is another app on
        the same key, and silently taking the lower number would hide that the
        quota is being shared.
        """
        if self.reported_remaining is None:
            return False
        return abs(self.reported_remaining - self.ours_remaining) > REVIEWS_PER_PLACE

    def as_dict(self) -> dict:
        return {
            "ceiling": self.ceiling,
            "spent": self.spent,
            "remaining": self.remaining,
            "ours_remaining": self.ours_remaining,
            "reported_remaining": self.reported_remaining,
            "reported_limit": self.reported_limit,
            "places_left": self.places_left,
            "exhausted": self.exhausted,
            "disagrees": self.disagrees,
            "calls": self.calls,
            "last_call_at": self.last_call_at,
        }


def status() -> Budget:
    """Read the counter. Never raises, never spends."""
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN kind = 'call' THEN objects ELSE 0 END), 0)
                    AS spent,
                COUNT(CASE WHEN kind = 'call' THEN 1 END) AS calls,
                COALESCE(MAX(CASE WHEN kind = 'call' THEN at END), '') AS last_at
            FROM listicle_reviews_spend
            WHERE at > COALESCE(
                (SELECT MAX(at) FROM listicle_reviews_spend WHERE kind = 'reset'),
                ''
            )
            """
        ).fetchone()
        latest = conn.execute(
            """
            SELECT reported_remaining, reported_limit
            FROM listicle_reviews_spend
            WHERE kind = 'call' AND reported_remaining IS NOT NULL
            ORDER BY at DESC LIMIT 1
            """
        ).fetchone()
    return Budget(
        ceiling=object_budget(),
        spent=int(row["spent"] or 0),
        reported_remaining=(
            int(latest["reported_remaining"]) if latest is not None else None
        ),
        reported_limit=(
            int(latest["reported_limit"])
            if latest is not None and latest["reported_limit"] is not None
            else None
        ),
        last_call_at=str(row["last_at"] or ""),
        calls=int(row["calls"] or 0),
    )


@dataclass(frozen=True)
class Refusal:
    """Why a call was not made. A real answer about the budget, not an error."""

    reason_code: str
    reason: str
    budget: Budget


def check(requested: int) -> Refusal | None:
    """The switch. `None` means the call may go ahead.

    Refuses on the **whole** of what the call could cost, not on what it is
    likely to cost. A request for twenty reviews may return twenty, so twenty
    has to be there before it is allowed to run; charging the difference to
    optimism is how a ceiling gets crossed by one call.
    """
    budget = status()
    if budget.exhausted:
        return Refusal(
            reason_code="reviews_budget_exhausted",
            reason=(
                f"The {budget.ceiling}-review free allowance is spent "
                f"({budget.spent} used). Nothing further will be bought."
            ),
            budget=budget,
        )
    if requested > budget.remaining:
        return Refusal(
            reason_code="reviews_budget_insufficient",
            reason=(
                f"Asking for {requested} reviews would cross the "
                f"{budget.ceiling}-review free allowance: {budget.remaining} "
                "left."
            ),
            budget=budget,
        )
    return None


# The headers RapidAPI counts this plan with. The businesses counter is the
# binding one -- the request counter on the free plan sits at half a million
# and will never be what stops us.
_REMAINING_HEADER = "x-ratelimit-businesses-remaining"
_LIMIT_HEADER = "x-ratelimit-businesses-limit"


def _header_int(headers, name: str) -> int | None:
    try:
        raw = headers.get(name)
    except Exception:  # pragma: no cover -- defensive
        return None
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


def record(
    *,
    business_id: str,
    requested: int,
    objects: int,
    http_status: int | None = None,
    headers=None,
    note: str = "",
    params: dict | None = None,
) -> Budget:
    """Write what a call spent, and return the counter as it now stands.

    Called for **every** answer including failures. A call that came back
    unusable may still have been billed, and a ledger that only records
    successes undercounts in the one direction that costs money.
    """
    ensure_tables()
    reported_remaining = _header_int(headers, _REMAINING_HEADER) if headers else None
    reported_limit = _header_int(headers, _LIMIT_HEADER) if headers else None
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO listicle_reviews_spend (
                entry_id, at, kind, business_id, requested, objects,
                http_status, reported_remaining, reported_limit, note, params
            ) VALUES (?, ?, 'call', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uuid.uuid4().hex[:12],
                datetime.now(timezone.utc).isoformat(),
                business_id,
                int(requested),
                int(objects),
                http_status,
                reported_remaining,
                reported_limit,
                note,
                json.dumps(params or {}, ensure_ascii=False),
            ),
        )
    return status()


def reset(reason: str, *, by: str = "") -> Budget:
    """Clear the counter, on purpose, with a reason on the record.

    Only ever called by a person. Everything before the reset row stops
    counting toward the ceiling; the rows stay, so the history of what was
    bought is not lost when the allowance rolls over.
    """
    ensure_tables()
    if not reason.strip():
        raise ValueError("a reset needs a reason")
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO listicle_reviews_spend (
                entry_id, at, kind, note
            ) VALUES (?, ?, 'reset', ?)
            """,
            (
                uuid.uuid4().hex[:12],
                datetime.now(timezone.utc).isoformat(),
                f"{reason.strip()}" + (f" (by {by.strip()})" if by.strip() else ""),
            ),
        )
    return status()
