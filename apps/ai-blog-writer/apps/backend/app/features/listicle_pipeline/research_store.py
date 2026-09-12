"""Where a press of "Research this place" is recorded.

Execution, kept apart from evidence. `profile_store` holds what is known about
a place; this holds what happened when somebody asked. The two are separated
because they fail differently and are read for different reasons: a finding is
read to write from, an attempt is read to answer "did that call run, did it
cost anything, and can I press the button again".

One attempt at a time across the whole feature. Not because two would break
anything technically, but because the first version of this is a person looking
at one to three places carefully, and a second concurrent call is money spent by
a mis-click rather than by a decision. Reading and hand-editing every other
profile stays available while one runs.

The slot is a lease, not a lock. A process that dies holds nothing for longer
than the lease: the attempt it abandoned becomes `interrupted` -- which is
honest, because an interrupted call may well have been billed -- and a late
write from the dead owner is refused by the ownership check rather than landing
on top of whatever happened since.
"""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from app.core.database import get_db_connection, transaction

from .profiles import CoverageNote, ResearchAttempt

# How long an attempt may hold the slot without being heard from. Comfortably
# longer than the research timeout, so a slow but living call is never declared
# dead, and short enough that a crashed process does not block the feature for
# an afternoon.
LEASE_SECONDS = 900

_ATTEMPTS = """
CREATE TABLE IF NOT EXISTS listicle_research_attempts (
    attempt_id      TEXT PRIMARY KEY,
    -- What makes a repeated POST the same action. A browser that loses its
    -- answer and asks again meets this row instead of buying a second call.
    idempotency_key TEXT NOT NULL UNIQUE,
    profile_id      TEXT NOT NULL DEFAULT '',
    run_id          TEXT NOT NULL DEFAULT '',
    candidate_id    TEXT NOT NULL DEFAULT '',
    topic           TEXT NOT NULL DEFAULT '',
    mode            TEXT NOT NULL DEFAULT 'initial',
    gap_text        TEXT NOT NULL DEFAULT '',
    state           TEXT NOT NULL DEFAULT 'running',
    reason_code     TEXT NOT NULL DEFAULT '',
    reason          TEXT NOT NULL DEFAULT '',
    -- Everything the prompt was built from, and its hash. A second initial
    -- request over an unchanged snapshot is answered from storage rather than
    -- bought again.
    input_hash      TEXT NOT NULL DEFAULT '',
    input_snapshot  TEXT NOT NULL DEFAULT '{}',
    prompt          TEXT NOT NULL DEFAULT '',
    prompt_version  TEXT NOT NULL DEFAULT '',
    requested_queries TEXT NOT NULL DEFAULT '[]',
    actual_queries  TEXT NOT NULL DEFAULT '[]',
    raw_response    TEXT NOT NULL DEFAULT '',
    validation_issues TEXT NOT NULL DEFAULT '[]',
    coverage        TEXT NOT NULL DEFAULT '[]',
    open_questions  TEXT NOT NULL DEFAULT '[]',
    findings_added  INTEGER NOT NULL DEFAULT 0,
    findings_seen   INTEGER NOT NULL DEFAULT 0,
    sources_added   INTEGER NOT NULL DEFAULT 0,
    model           TEXT NOT NULL DEFAULT '',
    usage           TEXT NOT NULL DEFAULT '{}',
    duration_seconds REAL,
    owner_token     TEXT NOT NULL DEFAULT '',
    lease_until     TEXT NOT NULL DEFAULT '',
    started_by      TEXT NOT NULL DEFAULT '',
    started_at      TEXT NOT NULL,
    finished_at     TEXT
)
"""

# The one-at-a-time slot. A single row, taken and given back.
_SLOT = """
CREATE TABLE IF NOT EXISTS listicle_research_slot (
    slot        TEXT PRIMARY KEY,
    attempt_id  TEXT NOT NULL,
    owner_token TEXT NOT NULL,
    lease_until TEXT NOT NULL,
    taken_at    TEXT NOT NULL
)
"""

_INDEXES = (
    "CREATE INDEX IF NOT EXISTS listicle_research_attempts_profile "
    "ON listicle_research_attempts (profile_id)",
    "CREATE INDEX IF NOT EXISTS listicle_research_attempts_run "
    "ON listicle_research_attempts (run_id, candidate_id)",
    "CREATE INDEX IF NOT EXISTS listicle_research_attempts_hash "
    "ON listicle_research_attempts (input_hash)",
)

SLOT = "one-at-a-time"

# States an attempt can end in. `completed_empty` is deliberately not `failed`:
# a request that ran and found nothing published is a fact about the place, and
# a request that never ran is a fact about the network.
TERMINAL_STATES = frozenset(
    {"completed", "completed_empty", "failed", "response_invalid", "interrupted"}
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def ensure_tables() -> None:
    with get_db_connection() as conn:
        conn.execute(_ATTEMPTS)
        conn.execute(_SLOT)
        for statement in _INDEXES:
            conn.execute(statement)


def new_token() -> str:
    return secrets.token_hex(8)


def new_attempt_id() -> str:
    return uuid.uuid4().hex[:12]


def _row_to_attempt(row) -> ResearchAttempt:
    return ResearchAttempt(
        attempt_id=row["attempt_id"],
        idempotency_key=row["idempotency_key"],
        profile_id=row["profile_id"],
        run_id=row["run_id"],
        candidate_id=row["candidate_id"],
        topic=row["topic"],
        mode=row["mode"],
        gap_text=row["gap_text"],
        state=row["state"],
        reason_code=row["reason_code"],
        reason=row["reason"],
        input_hash=row["input_hash"],
        input_snapshot=json.loads(row["input_snapshot"] or "{}"),
        prompt=row["prompt"],
        prompt_version=row["prompt_version"],
        requested_queries=json.loads(row["requested_queries"] or "[]"),
        actual_queries=json.loads(row["actual_queries"] or "[]"),
        raw_response=row["raw_response"],
        validation_issues=json.loads(row["validation_issues"] or "[]"),
        coverage=[
            CoverageNote(**note) for note in json.loads(row["coverage"] or "[]")
        ],
        open_questions=json.loads(row["open_questions"] or "[]"),
        findings_added=row["findings_added"],
        findings_seen=row["findings_seen"],
        sources_added=row["sources_added"],
        model=row["model"],
        usage=json.loads(row["usage"] or "{}"),
        duration_seconds=row["duration_seconds"],
        owner_token=row["owner_token"],
        lease_until=row["lease_until"] or "",
        started_by=row["started_by"],
        started_at=_parse(row["started_at"]) or _now(),
        finished_at=_parse(row["finished_at"]),
    )


def _values(attempt: ResearchAttempt) -> tuple:
    return (
        attempt.attempt_id,
        attempt.idempotency_key,
        attempt.profile_id,
        attempt.run_id,
        attempt.candidate_id,
        attempt.topic,
        attempt.mode,
        attempt.gap_text,
        attempt.state,
        attempt.reason_code,
        attempt.reason,
        attempt.input_hash,
        json.dumps(attempt.input_snapshot, ensure_ascii=False, sort_keys=True),
        attempt.prompt,
        attempt.prompt_version,
        json.dumps(attempt.requested_queries, ensure_ascii=False),
        json.dumps(attempt.actual_queries, ensure_ascii=False),
        attempt.raw_response,
        json.dumps(attempt.validation_issues, ensure_ascii=False),
        json.dumps(
            [note.model_dump() for note in attempt.coverage], ensure_ascii=False
        ),
        json.dumps(attempt.open_questions, ensure_ascii=False),
        attempt.findings_added,
        attempt.findings_seen,
        attempt.sources_added,
        attempt.model,
        json.dumps(attempt.usage, ensure_ascii=False),
        attempt.duration_seconds,
        attempt.owner_token,
        attempt.lease_until,
        attempt.started_by,
        _iso(attempt.started_at),
        _iso(attempt.finished_at) if attempt.finished_at else None,
    )


_COLUMNS = (
    "attempt_id, idempotency_key, profile_id, run_id, candidate_id, topic, "
    "mode, gap_text, state, reason_code, reason, input_hash, input_snapshot, "
    "prompt, prompt_version, requested_queries, actual_queries, raw_response, "
    "validation_issues, coverage, open_questions, findings_added, "
    "findings_seen, sources_added, model, usage, duration_seconds, "
    "owner_token, lease_until, started_by, started_at, finished_at"
)


class SlotTaken(RuntimeError):
    """Another research request is already running.

    Carries the attempt that holds the slot, so a screen can offer to look at
    what is going on rather than tell somebody to try again into a race.
    """

    def __init__(self, holder: ResearchAttempt) -> None:
        super().__init__(
            "Another place is being researched right now. Wait for it to "
            "finish, or open it to see where it got to."
        )
        self.holder = holder


class NotTheOwner(RuntimeError):
    """A write from an attempt that no longer holds its own lease.

    The process it belonged to was declared dead and the attempt was marked
    interrupted. Its late answer is refused rather than written over whatever
    has happened since.
    """


def sweep() -> list[str]:
    """Declare dead whatever has not been heard from, and free the slot.

    Called before anything reads or takes the slot, so an abandoned attempt
    never blocks the feature and never quietly reads as still running. Returns
    the attempts it marked interrupted.
    """
    ensure_tables()
    now = _iso(_now())
    with transaction() as conn:
        stale = conn.execute(
            "SELECT attempt_id FROM listicle_research_attempts "
            "WHERE state = 'running' AND (lease_until = '' OR lease_until < ?)",
            (now,),
        ).fetchall()
        for row in stale:
            conn.execute(
                "UPDATE listicle_research_attempts SET state = 'interrupted', "
                "reason_code = 'interrupted', reason = ?, finished_at = ? "
                "WHERE attempt_id = ?",
                (
                    "This request never came back. It may still have been "
                    "charged for.",
                    now,
                    row["attempt_id"],
                ),
            )
        conn.execute(
            "DELETE FROM listicle_research_slot WHERE lease_until < ?", (now,)
        )
    return [row["attempt_id"] for row in stale]


def active() -> ResearchAttempt | None:
    """The attempt holding the slot, if one still is."""
    sweep()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_research_attempts WHERE attempt_id = "
            "(SELECT attempt_id FROM listicle_research_slot WHERE slot = ?)",
            (SLOT,),
        ).fetchone()
    return None if row is None else _row_to_attempt(row)


def reserve(attempt: ResearchAttempt) -> ResearchAttempt:
    """Take the slot and write the attempt down as running, or refuse.

    One transaction, and it commits BEFORE any network work starts. An attempt
    that exists only in memory while a paid call is in flight is an attempt
    nobody can find after a crash -- and the money was still spent.
    """
    sweep()
    lease_until = _iso(_now() + timedelta(seconds=LEASE_SECONDS))
    owner = attempt.owner_token or new_token()
    prepared = attempt.model_copy(
        update={"owner_token": owner, "lease_until": lease_until, "state": "running"}
    )
    with transaction() as conn:
        holder = conn.execute(
            "SELECT * FROM listicle_research_attempts WHERE attempt_id = "
            "(SELECT attempt_id FROM listicle_research_slot WHERE slot = ?)",
            (SLOT,),
        ).fetchone()
        if holder is not None:
            raise SlotTaken(_row_to_attempt(holder))
        conn.execute(
            f"INSERT INTO listicle_research_attempts ({_COLUMNS}) VALUES "
            f"({', '.join(['?'] * 32)})",
            _values(prepared),
        )
        conn.execute(
            "INSERT INTO listicle_research_slot (slot, attempt_id, owner_token, "
            "lease_until, taken_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(slot) DO UPDATE SET attempt_id=excluded.attempt_id, "
            "owner_token=excluded.owner_token, lease_until=excluded.lease_until, "
            "taken_at=excluded.taken_at",
            (SLOT, prepared.attempt_id, owner, lease_until, _iso(_now())),
        )
    return prepared


def finish(attempt: ResearchAttempt) -> ResearchAttempt:
    """Write a terminal attempt and give the slot back.

    Refuses a write from an owner that no longer holds the attempt: a process
    presumed dead may come back with an answer, and by then the attempt has
    been marked interrupted and may already have been retried.
    """
    ensure_tables()
    finished = attempt.model_copy(
        update={"finished_at": attempt.finished_at or _now(), "lease_until": ""}
    )
    with transaction() as conn:
        row = conn.execute(
            "SELECT owner_token, state FROM listicle_research_attempts "
            "WHERE attempt_id = ?",
            (attempt.attempt_id,),
        ).fetchone()
        if row is None:
            raise NotTheOwner(f"No research attempt {attempt.attempt_id}.")
        if row["owner_token"] != attempt.owner_token:
            raise NotTheOwner(
                "This request lost its place while it was running; its answer "
                "was not saved over what happened since."
            )
        if row["state"] != "running":
            raise NotTheOwner(
                f"This request was already recorded as {row['state']}."
            )
        values = _values(finished)
        conn.execute(
            "UPDATE listicle_research_attempts SET state = ?, reason_code = ?, "
            "reason = ?, raw_response = ?, validation_issues = ?, coverage = ?, "
            "open_questions = ?, findings_added = ?, findings_seen = ?, "
            "sources_added = ?, model = ?, usage = ?, duration_seconds = ?, "
            "actual_queries = ?, requested_queries = ?, prompt = ?, "
            "lease_until = '', finished_at = ? WHERE attempt_id = ?",
            (
                finished.state,
                finished.reason_code,
                finished.reason,
                finished.raw_response,
                values[18],
                values[19],
                values[20],
                finished.findings_added,
                finished.findings_seen,
                finished.sources_added,
                finished.model,
                values[25],
                finished.duration_seconds,
                values[16],
                values[15],
                finished.prompt,
                _iso(finished.finished_at),
                finished.attempt_id,
            ),
        )
        conn.execute(
            "DELETE FROM listicle_research_slot WHERE slot = ? AND owner_token = ?",
            (SLOT, attempt.owner_token),
        )
    return finished


def load(attempt_id: str) -> ResearchAttempt | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_research_attempts WHERE attempt_id = ?",
            (attempt_id,),
        ).fetchone()
    return None if row is None else _row_to_attempt(row)


def by_key(idempotency_key: str) -> ResearchAttempt | None:
    """The attempt this key already bought, if it bought one."""
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_research_attempts WHERE idempotency_key = ?",
            (idempotency_key,),
        ).fetchone()
    return None if row is None else _row_to_attempt(row)


def for_profile(profile_id: str, limit: int = 50) -> list[ResearchAttempt]:
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_research_attempts WHERE profile_id = ? "
            "ORDER BY started_at DESC LIMIT ?",
            (profile_id, limit),
        ).fetchall()
    return [_row_to_attempt(row) for row in rows]


def for_run(run_id: str) -> dict[str, ResearchAttempt]:
    """The most recent attempt per candidate on one run.

    What the board summary reads. One query rather than one per card: a run has
    thirty-five candidates and a screen that asks thirty-five times is a screen
    that takes a second to open.
    """
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_research_attempts WHERE run_id = ? "
            "ORDER BY started_at",
            (run_id,),
        ).fetchall()
    latest: dict[str, ResearchAttempt] = {}
    for row in rows:
        attempt = _row_to_attempt(row)
        latest[attempt.candidate_id] = attempt
    return latest


def completed_for_input(
    profile_id: str, input_hash: str, mode: str
) -> ResearchAttempt | None:
    """A successful attempt over exactly this input, if there is one.

    What makes a second `initial` press free. A refresh is a different mode and
    is never answered from here: asking for it again IS the request.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_research_attempts WHERE profile_id = ? "
            "AND input_hash = ? AND mode = ? AND state IN "
            "('completed', 'completed_empty') ORDER BY started_at DESC LIMIT 1",
            (profile_id, input_hash, mode),
        ).fetchone()
    return None if row is None else _row_to_attempt(row)
