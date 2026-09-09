"""Where a listicle run is kept between turns, and between searches.

Persisted per turn rather than held in the browser, for the same reason the
article grill is (ADR 0031): an abandoned interview is resumable, and a closed
tab is not a lost run. The whole state goes in as JSON because it is a
pydantic contract that will grow, and a column per field would have to be
migrated every time a marker changes.

Three tables were added on 2026-09-08, from the improvement plan:

**The order.** What the interview settled, written down once and versioned. A
revision exists so a corrected order cannot be answered by results gathered
under the old one -- which is not a hypothetical: the only real run displayed
one count and searched for another.

**The attempts.** One row per angle per revision, so a batch that fails on its
sixth search keeps the five that worked. Every one records the request it was
made under, because reuse is decided by whether that request still matches.

**The batch lock.** Two clicks on the same button should not run twelve
searches. This prevents a duplicate start; it cannot promise that a provider
did not process a request whose answer never arrived, and nothing here pretends
otherwise.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.core.database import get_db_connection

from ..prompt2blog.contracts_v4 import GrillState
from .contracts import SearchAttempt, SearchOrder

_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_grills (
    run_id     TEXT PRIMARY KEY,
    state      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""


_RESULTS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_search_results (
    run_id     TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""

_ORDERS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_search_orders (
    run_id     TEXT NOT NULL,
    revision   INTEGER NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (run_id, revision)
)
"""

_ATTEMPTS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_search_attempts (
    run_id     TEXT NOT NULL,
    revision   INTEGER NOT NULL,
    angle_id   TEXT NOT NULL,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (run_id, revision, angle_id)
)
"""

_SELECTIONS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_angle_selections (
    run_id     TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""

_LOCKS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_search_locks (
    run_id     TEXT PRIMARY KEY,
    revision   INTEGER NOT NULL,
    started_at TEXT NOT NULL
)
"""

# A batch that has been holding the lock for longer than this is presumed dead.
# Long enough that a real six-search batch never trips it, short enough that a
# crashed process does not wedge the run until someone edits the database.
_LOCK_STALE_AFTER = timedelta(minutes=30)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_tables() -> None:
    with get_db_connection() as conn:
        conn.execute(_TABLE)
        conn.execute(_RESULTS_TABLE)
        conn.execute(_ORDERS_TABLE)
        conn.execute(_ATTEMPTS_TABLE)
        conn.execute(_SELECTIONS_TABLE)
        conn.execute(_LOCKS_TABLE)


def save(state: GrillState) -> None:
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_grills (run_id, state) VALUES (?, ?) "
            "ON CONFLICT(run_id) DO UPDATE SET state=excluded.state, "
            "updated_at=datetime('now')",
            (state.run_id, state.model_dump_json()),
        )


def load(run_id: str) -> GrillState | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT state FROM listicle_grills WHERE run_id = ?", (run_id,)
        ).fetchone()
    if row is None:
        return None
    return GrillState.model_validate(json.loads(row[0]))


def save_results(run_id: str, payload: dict) -> None:
    """What the searches found, kept whole.

    Stored so the search is run once and looked at many times. Seven grounded
    searches take minutes and cost real tokens; a screen that re-ran them on
    every reload would be unusable and expensive, and re-running is a decision
    the operator makes, not a side effect of looking.

    Kept alongside the per-angle attempts rather than replaced by them. This is
    the assembled view the screen reads, and it is also what every run stored
    before attempts existed -- an old run still opens.
    """
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_search_results (run_id, payload) VALUES (?, ?) "
            "ON CONFLICT(run_id) DO UPDATE SET payload=excluded.payload, "
            "updated_at=datetime('now')",
            (run_id, json.dumps(payload, ensure_ascii=False)),
        )


def load_results(run_id: str) -> dict | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM listicle_search_results WHERE run_id = ?", (run_id,)
        ).fetchone()
    return None if row is None else json.loads(row[0])


# --- the order ------------------------------------------------------------


def save_order(order: SearchOrder) -> None:
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_search_orders (run_id, revision, payload) "
            "VALUES (?, ?, ?) ON CONFLICT(run_id, revision) DO UPDATE SET "
            "payload=excluded.payload",
            (order.run_id, order.revision, order.model_dump_json()),
        )


def load_order(run_id: str, revision: int | None = None) -> SearchOrder | None:
    """The current order, or one named revision of it.

    Older revisions are kept rather than overwritten. A result gathered under
    revision one has to be readable as what it is -- an answer to a question
    that is no longer being asked -- and that is not sayable if the question is
    gone.
    """
    ensure_tables()
    with get_db_connection() as conn:
        if revision is None:
            row = conn.execute(
                "SELECT payload FROM listicle_search_orders WHERE run_id = ? "
                "ORDER BY revision DESC LIMIT 1",
                (run_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT payload FROM listicle_search_orders "
                "WHERE run_id = ? AND revision = ?",
                (run_id, revision),
            ).fetchone()
    return None if row is None else SearchOrder.model_validate(json.loads(row[0]))


def next_revision(run_id: str) -> int:
    current = load_order(run_id)
    return 1 if current is None else current.revision + 1


# --- what the picker chose -------------------------------------------------


def save_selections(run_id: str, selections: list[dict]) -> None:
    """The angle records the screen sent, exactly as it sent them.

    The screen knows what the operator did -- which menu entry a line came
    from, whether they changed it, whether they wrote it themselves. Inferring
    that back from the finished text is guesswork, and guessing is what this
    whole record exists to stop.
    """
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_angle_selections (run_id, payload) VALUES (?, ?) "
            "ON CONFLICT(run_id) DO UPDATE SET payload=excluded.payload, "
            "updated_at=datetime('now')",
            (run_id, json.dumps(selections, ensure_ascii=False)),
        )


def load_selections(run_id: str) -> list[dict]:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM listicle_angle_selections WHERE run_id = ?",
            (run_id,),
        ).fetchone()
    if row is None:
        return []
    found = json.loads(row[0])
    return found if isinstance(found, list) else []


# --- one angle's search ----------------------------------------------------


def save_attempt(attempt: SearchAttempt) -> None:
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_search_attempts "
            "(run_id, revision, angle_id, payload) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(run_id, revision, angle_id) DO UPDATE SET "
            "payload=excluded.payload, updated_at=datetime('now')",
            (
                attempt.run_id,
                attempt.revision,
                attempt.angle_id,
                attempt.model_dump_json(),
            ),
        )


def load_attempts(run_id: str, revision: int | None = None) -> list[SearchAttempt]:
    """Every angle's search for one revision, in no particular order.

    Across every revision when none is named, which is what a reuse check
    wants: a result gathered two revisions ago still answers this revision's
    request if the request did not change, and the fingerprint is what says so.
    """
    ensure_tables()
    with get_db_connection() as conn:
        if revision is None:
            rows = conn.execute(
                "SELECT payload FROM listicle_search_attempts WHERE run_id = ?",
                (run_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT payload FROM listicle_search_attempts "
                "WHERE run_id = ? AND revision = ?",
                (run_id, revision),
            ).fetchall()
    return [SearchAttempt.model_validate(json.loads(row[0])) for row in rows]


def completed_attempts_for(subject: str, *, exclude_run: str = "") -> list[SearchAttempt]:
    """Every finished search recorded for one subject, from any run.

    The point of the whole record: what an angle bought last time is the only
    thing anyone can know about what it will buy this time, and it has to be
    readable before the search is paid for rather than after.

    Scanned in Python rather than queried, because the fields live inside the
    stored payload. That is fine at this size and would not be at a hundred
    times it -- the fix then is a column, not a different answer.
    """
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT payload FROM listicle_search_attempts"
        ).fetchall()
    attempts = [SearchAttempt.model_validate(json.loads(row[0])) for row in rows]
    return [
        attempt
        for attempt in attempts
        if attempt.subject == subject
        and attempt.state == "completed"
        and attempt.contribution_recorded
        and attempt.run_id != exclude_run
    ]


# --- not starting the same batch twice -------------------------------------


def claim_batch(run_id: str, revision: int) -> bool:
    """Take the run's search lock, or say it is already held.

    What this can promise: two clicks do not start two batches, and a batch
    whose process died does not hold the run forever.

    What it cannot promise: that a provider did not already receive and charge
    for a request whose answer never came back. Retrying an interrupted attempt
    may spend a second time, and the screen says so rather than implying a
    guarantee nothing can make.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT started_at FROM listicle_search_locks WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is not None:
            try:
                started = datetime.fromisoformat(row[0])
            except ValueError:  # pragma: no cover -- corrupt row
                started = datetime.now(timezone.utc) - _LOCK_STALE_AFTER
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - started < _LOCK_STALE_AFTER:
                return False
        conn.execute(
            "INSERT INTO listicle_search_locks (run_id, revision, started_at) "
            "VALUES (?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET "
            "revision=excluded.revision, started_at=excluded.started_at",
            (run_id, revision, _now()),
        )
    return True


def release_batch(run_id: str) -> None:
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute("DELETE FROM listicle_search_locks WHERE run_id = ?", (run_id,))


def batch_is_running(run_id: str) -> bool:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT started_at FROM listicle_search_locks WHERE run_id = ?",
            (run_id,),
        ).fetchone()
    if row is None:
        return False
    try:
        started = datetime.fromisoformat(row[0])
    except ValueError:  # pragma: no cover -- corrupt row
        return False
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - started < _LOCK_STALE_AFTER
