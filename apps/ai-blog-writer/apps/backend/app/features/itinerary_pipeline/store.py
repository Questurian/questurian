"""Where an itinerary workspace lives between turns.

The browser keeps the setup until the first Start Grill. From that moment the
backend is canonical for that workspace, and the browser holds a pointer to it
plus whatever it is currently typing. Two authoritative copies of one trip is
the failure this ordering exists to prevent -- not because it is untidy, but
because the second copy always wins somewhere and nobody can say where.

Everything is versioned and every write is a compare-and-swap against the
revision the caller last read. A stale write is refused with the revision that
actually won, so a second tab can re-read rather than guess what it is now
arguing with. That is the same rule the listicle order follows and for the
same reason: two screens on one run is normal, and last-write-wins loses work
silently.

Tables are owned by this feature and created on demand. No Payload schema
changes; nothing here reaches outside `data/pipeline.db`.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.database import get_db_connection, transaction

from ..prompt2blog.contracts_v4 import GrillState
from .contracts import (
    DayPromptExport,
    DirectionRevision,
    SetupSnapshot,
    StoredResult,
)

_WORKSPACES = """
CREATE TABLE IF NOT EXISTS itinerary_workspaces (
    workspace_id TEXT PRIMARY KEY,
    draft_id     TEXT NOT NULL DEFAULT '',
    owner_id     TEXT NOT NULL DEFAULT '',
    revision     INTEGER NOT NULL DEFAULT 1,
    setup        TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
)
"""

# One row per day of one workspace. The interview lives here as a whole
# `GrillState` for the same reason the listicle keeps one: it is a contract
# that will grow, and a column per marker would need a migration every time
# the checklist changes.
_DAY_WORK = """
CREATE TABLE IF NOT EXISTS itinerary_day_work (
    workspace_id  TEXT NOT NULL,
    day_id        TEXT NOT NULL,
    grill_state   TEXT NOT NULL DEFAULT '',
    context_key   TEXT NOT NULL DEFAULT '',
    revision      INTEGER NOT NULL DEFAULT 1,
    review_notes  TEXT NOT NULL DEFAULT '',
    evidence_reviewed INTEGER NOT NULL DEFAULT 0,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (workspace_id, day_id)
)
"""

_DIRECTIONS = """
CREATE TABLE IF NOT EXISTS itinerary_directions (
    workspace_id TEXT NOT NULL,
    day_id       TEXT NOT NULL,
    revision     INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'candidate',
    payload      TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (workspace_id, day_id, revision)
)
"""

_EXPORTS = """
CREATE TABLE IF NOT EXISTS itinerary_exports (
    export_id    TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    day_id       TEXT NOT NULL,
    input_hash   TEXT NOT NULL,
    payload      TEXT NOT NULL,
    created_at   TEXT NOT NULL
)
"""

_RESULTS = """
CREATE TABLE IF NOT EXISTS itinerary_results (
    workspace_id    TEXT NOT NULL,
    day_id          TEXT NOT NULL,
    result_revision INTEGER NOT NULL,
    export_id       TEXT NOT NULL DEFAULT '',
    content_hash    TEXT NOT NULL DEFAULT '',
    import_key      TEXT NOT NULL DEFAULT '',
    payload         TEXT NOT NULL,
    raw_paste       TEXT NOT NULL DEFAULT '',
    saved_at        TEXT NOT NULL,
    PRIMARY KEY (workspace_id, day_id, result_revision)
)
"""

# Every model call this feature dispatches, reserved before it is made.
#
# The reservation is the point. A provider call can be answered, billed and
# then lost to a timeout, and a system that only writes on success cannot tell
# that from a call that never happened. A row here says a call was dispatched;
# `state` says what became of it.
_ATTEMPTS = """
CREATE TABLE IF NOT EXISTS itinerary_attempts (
    attempt_key  TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    day_id       TEXT NOT NULL,
    kind         TEXT NOT NULL,
    state        TEXT NOT NULL DEFAULT 'pending',
    job_id       TEXT NOT NULL DEFAULT '',
    detail       TEXT NOT NULL DEFAULT '',
    started_at   TEXT NOT NULL,
    finished_at  TEXT NOT NULL DEFAULT ''
)
"""

# One in-app research run: what it returned, what it cost, and whether tools
# actually ran.
#
# Its own table rather than a column on the day, because a research run is a
# paid thing that happened and the next one does not erase it. `turns` is kept
# because it is the only honest evidence about whether the model searched at
# all -- a single turn means it never did, whatever the packet says about
# itself.
_RESEARCH_RUNS = """
CREATE TABLE IF NOT EXISTS itinerary_research_runs (
    attempt_key  TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    day_id       TEXT NOT NULL,
    export_id    TEXT NOT NULL DEFAULT '',
    state        TEXT NOT NULL DEFAULT 'running',
    raw          TEXT NOT NULL DEFAULT '',
    detail       TEXT NOT NULL DEFAULT '',
    fault        TEXT NOT NULL DEFAULT '',
    model        TEXT NOT NULL DEFAULT '',
    cost_usd     REAL,
    turns        INTEGER,
    started_at   TEXT NOT NULL,
    finished_at  TEXT NOT NULL DEFAULT ''
)
"""

# Everything the app observed about one research run, beside the run row
# rather than in it. Additive: the run table is unchanged, and a run from
# before this table existed simply has no details, which reads as "unknown".
#
# `returned` is the model's own object before the app stamped an identity on
# it. `sent` is what was handed to the transport, in characters and as a hash,
# so a run can be compared against the export it answered. Tool counts are
# read off the run's own transcript and are null when that could not be found.
_RESEARCH_DETAILS = """
CREATE TABLE IF NOT EXISTS itinerary_research_run_details (
    attempt_key      TEXT PRIMARY KEY,
    wire_version     TEXT NOT NULL DEFAULT '',
    prompt_policy    TEXT NOT NULL DEFAULT '',
    sent             TEXT NOT NULL DEFAULT '{}',
    sent_hash        TEXT NOT NULL DEFAULT '',
    budget           TEXT NOT NULL DEFAULT '{}',
    returned         TEXT NOT NULL DEFAULT '',
    session_id       TEXT NOT NULL DEFAULT '',
    usage            TEXT NOT NULL DEFAULT '{}',
    duration_ms      INTEGER,
    searches         INTEGER,
    fetches          INTEGER,
    tool_counts      TEXT NOT NULL DEFAULT '',
    transcript_path  TEXT NOT NULL DEFAULT '',
    result_revision  INTEGER,
    completion       TEXT NOT NULL DEFAULT 'dispatched',
    updated_at       TEXT NOT NULL
)
"""

# What the server itself computed, at the moment the browser handed a day over
# as approved. Staleness is then a comparison the server makes against its own
# rules -- see `approval.py` for why it is not the browser's string.
_APPROVALS = """
CREATE TABLE IF NOT EXISTS itinerary_approvals (
    workspace_id TEXT NOT NULL,
    day_id       TEXT NOT NULL,
    signature    TEXT NOT NULL,
    -- The browser's own pair, kept so a re-approval can be told apart from a
    -- setup that merely arrived again. Without it, an edited layout would
    -- re-record its approval at the new shape on the very write that changed
    -- it, and staleness could never be detected at all.
    claim        TEXT NOT NULL DEFAULT '',
    approved_at  TEXT NOT NULL,
    PRIMARY KEY (workspace_id, day_id)
)
"""

_INDEXES = (
    "CREATE INDEX IF NOT EXISTS itinerary_exports_day "
    "ON itinerary_exports (workspace_id, day_id)",
    "CREATE INDEX IF NOT EXISTS itinerary_attempts_day "
    "ON itinerary_attempts (workspace_id, day_id, state)",
    "CREATE INDEX IF NOT EXISTS itinerary_workspaces_draft "
    "ON itinerary_workspaces (draft_id, owner_id)",
    "CREATE INDEX IF NOT EXISTS itinerary_research_day "
    "ON itinerary_research_runs (workspace_id, day_id, started_at)",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_tables() -> None:
    with get_db_connection() as conn:
        for statement in (
            _WORKSPACES,
            _DAY_WORK,
            _DIRECTIONS,
            _EXPORTS,
            _RESULTS,
            _ATTEMPTS,
            _APPROVALS,
            _RESEARCH_RUNS,
            _RESEARCH_DETAILS,
        ):
            conn.execute(statement)
        for statement in _INDEXES:
            conn.execute(statement)


class RevisionConflict(RuntimeError):
    """Someone else moved this workspace while you were deciding."""

    def __init__(self, message: str, current_revision: int) -> None:
        super().__init__(message)
        self.current_revision = current_revision


class NotOwned(PermissionError):
    """A workspace that exists and is not this operator's."""


# ------------------------------------------------------------- workspaces --


def create_workspace(
    *, draft_id: str, owner_id: str, setup: SetupSnapshot
) -> tuple[str, int]:
    """Create the workspace for this draft, or return the one that exists.

    Idempotent on `(draft_id, owner_id)` rather than on a request-supplied
    key, because the thing being made unique is the trip, not the click. A
    double-tapped Start Grill and a reload two minutes later are the same
    intent and must not produce two workspaces holding two halves of one trip.

    The setup of an existing workspace is deliberately NOT overwritten here.
    Once the backend is canonical, a setup change is an explicit, versioned
    `update_setup` -- silently accepting whatever the browser happened to send
    on a retry is how one tab's stale copy overwrites another tab's edit.
    """
    ensure_tables()
    now = _now()
    with transaction() as conn:
        if draft_id:
            row = conn.execute(
                "SELECT workspace_id, revision FROM itinerary_workspaces "
                "WHERE draft_id = ? AND owner_id = ?",
                (draft_id, owner_id),
            ).fetchone()
            if row is not None:
                return str(row["workspace_id"]), int(row["revision"])
        workspace_id = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO itinerary_workspaces "
            "(workspace_id, draft_id, owner_id, revision, setup, created_at, updated_at) "
            "VALUES (?, ?, ?, 1, ?, ?, ?)",
            (
                workspace_id,
                draft_id,
                owner_id,
                setup.model_dump_json(by_alias=True),
                now,
                now,
            ),
        )
    return workspace_id, 1


def load_workspace(workspace_id: str) -> tuple[SetupSnapshot, int, str] | None:
    """The setup, its revision and its owner. None when there is no such id."""
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT setup, revision, owner_id FROM itinerary_workspaces "
            "WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
    if row is None:
        return None
    setup = SetupSnapshot.model_validate(json.loads(row["setup"]))
    return setup, int(row["revision"]), str(row["owner_id"])


def update_setup(
    workspace_id: str, setup: SetupSnapshot, *, expected_revision: int | None
) -> int:
    """A versioned setup change. Returns the new revision.

    A setup identical to the stored one is a no-op and keeps its revision.
    Saving an unchanged value must not invalidate a single outstanding export,
    and making that true by construction is cheaper than making it true by
    everybody remembering to check.
    """
    ensure_tables()
    payload = setup.model_dump_json(by_alias=True)
    with transaction() as conn:
        row = conn.execute(
            "SELECT setup, revision FROM itinerary_workspaces WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
        if row is None:
            raise LookupError(f"No itinerary workspace {workspace_id}")
        current = int(row["revision"])
        if expected_revision is not None and expected_revision != current:
            raise RevisionConflict(
                "This workspace changed somewhere else while you were editing. "
                "Reload it and try again.",
                current,
            )
        if str(row["setup"]) == payload:
            return current
        nxt = current + 1
        conn.execute(
            "UPDATE itinerary_workspaces SET setup = ?, revision = ?, updated_at = ? "
            "WHERE workspace_id = ?",
            (payload, nxt, _now(), workspace_id),
        )
    return nxt


def find_workspace_for_draft(draft_id: str, owner_id: str) -> str | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT workspace_id FROM itinerary_workspaces "
            "WHERE draft_id = ? AND owner_id = ?",
            (draft_id, owner_id),
        ).fetchone()
    return None if row is None else str(row["workspace_id"])


# --------------------------------------------------------------- day work --


def load_day_work(workspace_id: str, day_id: str) -> dict[str, Any]:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT grill_state, context_key, revision, review_notes, evidence_reviewed "
            "FROM itinerary_day_work WHERE workspace_id = ? AND day_id = ?",
            (workspace_id, day_id),
        ).fetchone()
    if row is None:
        return {
            "grill": None,
            "context_key": "",
            "revision": 0,
            "review_notes": "",
            "evidence_reviewed": False,
        }
    raw = str(row["grill_state"] or "")
    return {
        "grill": GrillState.model_validate(json.loads(raw)) if raw else None,
        "context_key": str(row["context_key"] or ""),
        "revision": int(row["revision"]),
        "review_notes": str(row["review_notes"] or ""),
        "evidence_reviewed": bool(row["evidence_reviewed"]),
    }


def save_grill(
    workspace_id: str, day_id: str, state: GrillState, context_key: str
) -> None:
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "INSERT INTO itinerary_day_work "
            "(workspace_id, day_id, grill_state, context_key, revision, updated_at) "
            "VALUES (?, ?, ?, ?, 1, ?) "
            "ON CONFLICT(workspace_id, day_id) DO UPDATE SET "
            "grill_state = excluded.grill_state, context_key = excluded.context_key, "
            "revision = itinerary_day_work.revision + 1, updated_at = excluded.updated_at",
            (workspace_id, day_id, state.model_dump_json(), context_key, _now()),
        )


def save_review(
    workspace_id: str, day_id: str, *, notes: str, evidence_reviewed: bool
) -> None:
    """The operator's own reading of the evidence, stored as theirs.

    Deliberately never touches the result: a review is a person saying they
    looked, and rewriting a claim to match would destroy the thing they
    reviewed.
    """
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "INSERT INTO itinerary_day_work "
            "(workspace_id, day_id, review_notes, evidence_reviewed, revision, updated_at) "
            "VALUES (?, ?, ?, ?, 1, ?) "
            "ON CONFLICT(workspace_id, day_id) DO UPDATE SET "
            "review_notes = excluded.review_notes, "
            "evidence_reviewed = excluded.evidence_reviewed, "
            "revision = itinerary_day_work.revision + 1, updated_at = excluded.updated_at",
            (workspace_id, day_id, notes, 1 if evidence_reviewed else 0, _now()),
        )


# -------------------------------------------------------------- direction --


def save_direction(workspace_id: str, day_id: str, revision: DirectionRevision) -> None:
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "INSERT INTO itinerary_directions "
            "(workspace_id, day_id, revision, status, payload, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(workspace_id, day_id, revision) DO UPDATE SET "
            "status = excluded.status, payload = excluded.payload, "
            "updated_at = excluded.updated_at",
            (
                workspace_id,
                day_id,
                revision.revision,
                revision.status,
                revision.model_dump_json(),
                _now(),
            ),
        )


def list_directions(workspace_id: str, day_id: str) -> list[DirectionRevision]:
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT payload FROM itinerary_directions "
            "WHERE workspace_id = ? AND day_id = ? ORDER BY revision",
            (workspace_id, day_id),
        ).fetchall()
    return [DirectionRevision.model_validate(json.loads(row["payload"])) for row in rows]


def next_direction_revision(workspace_id: str, day_id: str) -> int:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT MAX(revision) AS top FROM itinerary_directions "
            "WHERE workspace_id = ? AND day_id = ?",
            (workspace_id, day_id),
        ).fetchone()
    top = row["top"] if row is not None else None
    return (int(top) if top is not None else 0) + 1


def accept_direction(workspace_id: str, day_id: str, revision: int) -> DirectionRevision:
    """Accept the candidate the operator was looking at, and only that one.

    The revision number is required rather than "accept the newest", because
    approval has to attach to the object that was on screen. A second
    extraction landing between the render and the click would otherwise be
    accepted without ever having been read.
    """
    ensure_tables()
    now = _now()
    with transaction() as conn:
        row = conn.execute(
            "SELECT payload FROM itinerary_directions "
            "WHERE workspace_id = ? AND day_id = ? AND revision = ?",
            (workspace_id, day_id, revision),
        ).fetchone()
        if row is None:
            raise LookupError("That direction revision does not exist.")
        stored = DirectionRevision.model_validate(json.loads(row["payload"]))
        accepted = stored.model_copy(update={"status": "accepted", "accepted_at": now})
        conn.execute(
            "UPDATE itinerary_directions SET status = 'accepted', payload = ?, "
            "updated_at = ? WHERE workspace_id = ? AND day_id = ? AND revision = ?",
            (accepted.model_dump_json(), now, workspace_id, day_id, revision),
        )
    return accepted


# ---------------------------------------------------------------- exports --


def save_export(export: DayPromptExport) -> None:
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO itinerary_exports "
            "(export_id, workspace_id, day_id, input_hash, payload, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                export.export_id,
                export.workspace_id,
                export.day_id,
                export.input_hash,
                export.model_dump_json(),
                export.created_at or _now(),
            ),
        )


def load_export(export_id: str) -> DayPromptExport | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM itinerary_exports WHERE export_id = ?", (export_id,)
        ).fetchone()
    if row is None:
        return None
    return DayPromptExport.model_validate(json.loads(row["payload"]))


def find_export_by_hash(
    workspace_id: str, day_id: str, input_hash: str
) -> DayPromptExport | None:
    """The export for exactly this context, if one was already written.

    Copying the prompt twice for an unchanged day must not mint a second
    export id: the operator would then be holding one prompt while the app
    expected a packet answering another.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM itinerary_exports "
            "WHERE workspace_id = ? AND day_id = ? AND input_hash = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (workspace_id, day_id, input_hash),
        ).fetchone()
    if row is None:
        return None
    return DayPromptExport.model_validate(json.loads(row["payload"]))


def list_exports(workspace_id: str, day_id: str) -> list[DayPromptExport]:
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT payload FROM itinerary_exports "
            "WHERE workspace_id = ? AND day_id = ? ORDER BY created_at",
            (workspace_id, day_id),
        ).fetchall()
    return [DayPromptExport.model_validate(json.loads(row["payload"])) for row in rows]


# ---------------------------------------------------------------- results --


def load_results(workspace_id: str, day_id: str) -> list[StoredResult]:
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT payload FROM itinerary_results "
            "WHERE workspace_id = ? AND day_id = ? ORDER BY result_revision",
            (workspace_id, day_id),
        ).fetchall()
    return [StoredResult.model_validate(json.loads(row["payload"])) for row in rows]


def result_raw(workspace_id: str, day_id: str, result_revision: int) -> str:
    """The text a saved result was read from, exactly as it arrived."""
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT raw_paste FROM itinerary_results "
            "WHERE workspace_id = ? AND day_id = ? AND result_revision = ?",
            (workspace_id, day_id, result_revision),
        ).fetchone()
    return "" if row is None else str(row["raw_paste"] or "")


def latest_result(workspace_id: str, day_id: str) -> StoredResult | None:
    results = load_results(workspace_id, day_id)
    return results[-1] if results else None


def apply_result(
    *,
    workspace_id: str,
    day_id: str,
    import_key: str,
    content_hash: str,
    export_id: str,
    raw_paste: str,
    build: Any,
) -> tuple[StoredResult, bool]:
    """Save a previewed result, once, inside one transaction.

    `build(revision)` is called with the revision this save would take and
    returns the `StoredResult` to write. It is a callback rather than a
    finished object because the revision is only known once the write lock is
    held, and a revision decided before that is a revision two callers can
    both believe they have.

    Returns `(stored, created)`. `created` false means this exact import was
    already applied and the existing result is being returned unchanged --
    which is what a double-clicked Save must do. A reused key carrying
    different content is not a duplicate and raises instead.
    """
    ensure_tables()
    with transaction() as conn:
        if import_key:
            row = conn.execute(
                "SELECT payload, content_hash FROM itinerary_results "
                "WHERE workspace_id = ? AND day_id = ? AND import_key = ?",
                (workspace_id, day_id, import_key),
            ).fetchone()
            if row is not None:
                if str(row["content_hash"]) != content_hash:
                    raise ValueError(
                        "That save was already used for a different result. "
                        "Preview the new paste and save it again."
                    )
                return StoredResult.model_validate(json.loads(row["payload"])), False
        top = conn.execute(
            "SELECT MAX(result_revision) AS top FROM itinerary_results "
            "WHERE workspace_id = ? AND day_id = ?",
            (workspace_id, day_id),
        ).fetchone()["top"]
        revision = (int(top) if top is not None else 0) + 1
        stored: StoredResult = build(revision)
        conn.execute(
            "INSERT INTO itinerary_results "
            "(workspace_id, day_id, result_revision, export_id, content_hash, "
            " import_key, payload, raw_paste, saved_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                workspace_id,
                day_id,
                revision,
                export_id,
                content_hash,
                import_key,
                stored.model_dump_json(),
                raw_paste[:200_000],
                stored.saved_at or _now(),
            ),
        )
    return stored, True


# --------------------------------------------------------------- attempts --


def reserve_attempt(
    *, attempt_key: str, workspace_id: str, day_id: str, kind: str, job_id: str
) -> tuple[bool, dict[str, Any]]:
    """Claim the right to make one model call.

    Returns `(reserved, existing)`. `reserved` false means this key has been
    used: the caller returns whatever that attempt became instead of buying a
    second call. A double-tapped Start is the ordinary case.
    """
    ensure_tables()
    with transaction() as conn:
        row = conn.execute(
            "SELECT state, detail, kind FROM itinerary_attempts WHERE attempt_key = ?",
            (attempt_key,),
        ).fetchone()
        if row is not None:
            return False, {
                "state": str(row["state"]),
                "detail": str(row["detail"] or ""),
                "kind": str(row["kind"]),
            }
        conn.execute(
            "INSERT INTO itinerary_attempts "
            "(attempt_key, workspace_id, day_id, kind, state, job_id, started_at) "
            "VALUES (?, ?, ?, ?, 'pending', ?, ?)",
            (attempt_key, workspace_id, day_id, kind, job_id, _now()),
        )
    return True, {}


def finish_attempt(attempt_key: str, *, state: str, detail: str = "") -> None:
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "UPDATE itinerary_attempts SET state = ?, detail = ?, finished_at = ? "
            "WHERE attempt_key = ?",
            (state, detail[:2000], _now(), attempt_key),
        )


def pending_attempt(workspace_id: str, day_id: str) -> dict[str, Any] | None:
    """A call this day dispatched and never heard the end of.

    Shown rather than hidden: a process that died mid-call leaves a provider
    that may well have answered and billed, and a screen that quietly offers
    Start again is a screen that buys it twice.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT attempt_key, kind, started_at FROM itinerary_attempts "
            "WHERE workspace_id = ? AND day_id = ? AND state = 'pending' "
            "ORDER BY started_at DESC LIMIT 1",
            (workspace_id, day_id),
        ).fetchone()
    if row is None:
        return None
    return {
        "attempt_key": str(row["attempt_key"]),
        "kind": str(row["kind"]),
        "started_at": str(row["started_at"]),
    }


# -------------------------------------------------------------- approvals --


def record_approvals(
    workspace_id: str, approvals: dict[str, tuple[str, str]]
) -> None:
    """Write down which days arrived approved, and at what shape.

    `approvals` maps a day id to `(claim, signature)`: the browser's own record
    of what it approved, and the server's signature of what actually arrived.

    A row is rewritten only when the CLAIM changes -- that is, when the
    operator went back through the review screen. A setup that arrives with an
    edited layout and the same old claim keeps the signature it was approved
    at, which is what makes the edit detectable. Re-recording on every write
    would approve every change at the moment it was made.

    A day missing from `approvals` arrived unapproved and its row is removed:
    an approval that survives an unapproval is the thing this table exists to
    prevent.
    """
    ensure_tables()
    now = _now()
    with transaction() as conn:
        existing = {
            str(row["day_id"]): str(row["claim"])
            for row in conn.execute(
                "SELECT day_id, claim FROM itinerary_approvals WHERE workspace_id = ?",
                (workspace_id,),
            )
        }
        if approvals:
            placeholders = ", ".join("?" for _ in approvals)
            conn.execute(
                "DELETE FROM itinerary_approvals WHERE workspace_id = ? "
                f"AND day_id NOT IN ({placeholders})",
                (workspace_id, *approvals.keys()),
            )
        else:
            conn.execute(
                "DELETE FROM itinerary_approvals WHERE workspace_id = ?",
                (workspace_id,),
            )
        for day_id, (claim, signature) in approvals.items():
            if existing.get(day_id) == claim:
                continue
            conn.execute(
                "INSERT INTO itinerary_approvals "
                "(workspace_id, day_id, signature, claim, approved_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(workspace_id, day_id) DO UPDATE SET "
                "signature = excluded.signature, claim = excluded.claim, "
                "approved_at = excluded.approved_at",
                (workspace_id, day_id, signature, claim, now),
            )


def approved_signatures(workspace_id: str) -> dict[str, str]:
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT day_id, signature FROM itinerary_approvals WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchall()
    return {str(row["day_id"]): str(row["signature"]) for row in rows}


# --------------------------------------------------------- research runs --


def start_research_run(
    *, attempt_key: str, workspace_id: str, day_id: str, export_id: str
) -> None:
    """Write the run down before the call is made.

    Before, deliberately. A run recorded only on success cannot tell a call
    that was never made from one that was made, billed, and lost to a crash --
    and the screen has to be able to say which.
    """
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO itinerary_research_runs "
            "(attempt_key, workspace_id, day_id, export_id, state, started_at) "
            "VALUES (?, ?, ?, ?, 'running', ?)",
            (attempt_key, workspace_id, day_id, export_id, _now()),
        )


def finish_research_run(
    attempt_key: str,
    *,
    state: str,
    raw: str = "",
    detail: str = "",
    fault: str = "",
    model: str = "",
    cost_usd: float | None = None,
    turns: int | None = None,
) -> None:
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "UPDATE itinerary_research_runs SET state = ?, raw = ?, detail = ?, "
            "fault = ?, model = ?, cost_usd = ?, turns = ?, finished_at = ? "
            "WHERE attempt_key = ?",
            (
                state,
                raw[:400_000],
                detail[:4000],
                fault,
                model,
                cost_usd,
                turns,
                _now(),
                attempt_key,
            ),
        )


def latest_research_run(workspace_id: str, day_id: str) -> dict[str, Any] | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT attempt_key, export_id, state, raw, detail, fault, model, "
            "cost_usd, turns, started_at, finished_at "
            "FROM itinerary_research_runs WHERE workspace_id = ? AND day_id = ? "
            "ORDER BY started_at DESC LIMIT 1",
            (workspace_id, day_id),
        ).fetchone()
    if row is None:
        return None
    return {
        "attempt_key": str(row["attempt_key"]),
        "export_id": str(row["export_id"] or ""),
        "state": str(row["state"]),
        "raw": str(row["raw"] or ""),
        "detail": str(row["detail"] or ""),
        "fault": str(row["fault"] or ""),
        "model": str(row["model"] or ""),
        "cost_usd": row["cost_usd"],
        "turns": row["turns"],
        "started_at": str(row["started_at"]),
        "finished_at": str(row["finished_at"] or ""),
    }


# ------------------------------------------------------ research details --


def record_research_dispatch(
    *,
    attempt_key: str,
    wire_version: str,
    prompt_policy: str,
    sent: dict[str, Any],
    sent_hash: str,
    budget: dict[str, Any],
) -> None:
    """What was sent, written before the call like the run row itself."""
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO itinerary_research_run_details "
            "(attempt_key, wire_version, prompt_policy, sent, sent_hash, budget, "
            " completion, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'dispatched', ?)",
            (
                attempt_key,
                wire_version,
                prompt_policy,
                json.dumps(sent),
                sent_hash,
                json.dumps(budget),
                _now(),
            ),
        )


def record_research_outcome(
    attempt_key: str,
    *,
    completion: str,
    returned: str = "",
    session_id: str = "",
    usage: dict[str, Any] | None = None,
    duration_ms: int | None = None,
    tool_counts: dict[str, int] | None = None,
    transcript_path: str = "",
) -> None:
    """What came back and what the run did. Missing values stay null."""
    ensure_tables()
    searches = None if tool_counts is None else int(tool_counts.get("WebSearch", 0))
    fetches = None if tool_counts is None else int(tool_counts.get("WebFetch", 0))
    with transaction() as conn:
        conn.execute(
            "INSERT INTO itinerary_research_run_details (attempt_key, updated_at) "
            "VALUES (?, ?) ON CONFLICT(attempt_key) DO NOTHING",
            (attempt_key, _now()),
        )
        conn.execute(
            "UPDATE itinerary_research_run_details SET completion = ?, returned = ?, "
            "session_id = ?, usage = ?, duration_ms = ?, searches = ?, fetches = ?, "
            "tool_counts = ?, transcript_path = ?, updated_at = ? WHERE attempt_key = ?",
            (
                completion,
                returned[:400_000],
                session_id,
                json.dumps(usage or {}),
                duration_ms,
                searches,
                fetches,
                "" if tool_counts is None else json.dumps(tool_counts),
                transcript_path,
                _now(),
                attempt_key,
            ),
        )


def link_research_result(attempt_key: str, result_revision: int) -> None:
    """Which saved result a run's answer became, once somebody saved it."""
    ensure_tables()
    with transaction() as conn:
        conn.execute(
            "UPDATE itinerary_research_run_details SET result_revision = ?, "
            "updated_at = ? WHERE attempt_key = ?",
            (result_revision, _now(), attempt_key),
        )


def research_details(attempt_key: str) -> dict[str, Any] | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM itinerary_research_run_details WHERE attempt_key = ?",
            (attempt_key,),
        ).fetchone()
    if row is None:
        return None

    def loads(value: Any, empty: Any) -> Any:
        try:
            return json.loads(value) if value else empty
        except ValueError:
            return empty

    return {
        "wire_version": str(row["wire_version"] or ""),
        "prompt_policy": str(row["prompt_policy"] or ""),
        "sent": loads(row["sent"], {}),
        "sent_hash": str(row["sent_hash"] or ""),
        "budget": loads(row["budget"], {}),
        "returned": str(row["returned"] or ""),
        "session_id": str(row["session_id"] or ""),
        "usage": loads(row["usage"], {}),
        "duration_ms": row["duration_ms"],
        "searches": row["searches"],
        "fetches": row["fetches"],
        "tool_counts": loads(row["tool_counts"], None),
        "transcript_path": str(row["transcript_path"] or ""),
        "result_revision": row["result_revision"],
        "completion": str(row["completion"] or ""),
    }


def research_runs_for_export(workspace_id: str, day_id: str, export_id: str) -> list[dict[str, Any]]:
    """Every finished run that answered this export, newest first."""
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT attempt_key, raw, finished_at FROM itinerary_research_runs "
            "WHERE workspace_id = ? AND day_id = ? AND export_id = ? AND state = 'done' "
            "ORDER BY started_at DESC",
            (workspace_id, day_id, export_id),
        ).fetchall()
    return [
        {
            "attempt_key": str(row["attempt_key"]),
            "raw": str(row["raw"] or ""),
            "finished_at": str(row["finished_at"] or ""),
        }
        for row in rows
    ]



def research_run_finished_at(attempt_key: str) -> str:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT finished_at FROM itinerary_research_runs WHERE attempt_key = ?",
            (attempt_key,),
        ).fetchone()
    return "" if row is None else str(row["finished_at"] or "")
