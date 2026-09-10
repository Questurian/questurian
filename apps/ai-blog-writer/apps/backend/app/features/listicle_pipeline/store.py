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
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from app.core.database import get_db_connection, transaction

from ..prompt2blog.contracts_v4 import GrillState
from .contracts import (
    TERMINAL_ATTEMPT_STATES,
    AngleSelection,
    CutReview,
    InterviewBaseline,
    PoolSnapshot,
    SearchAttempt,
    SearchOrder,
)

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

_CUT_REVIEWS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_cut_reviews (
    run_id     TEXT NOT NULL,
    revision   INTEGER NOT NULL,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (run_id, revision)
)
"""


_LOCKS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_search_locks (
    run_id      TEXT PRIMARY KEY,
    revision    INTEGER NOT NULL,
    started_at  TEXT NOT NULL,
    -- Who holds it. Checked before dispatch, before results are committed and
    -- before release, so a process that lost the lease cannot publish over the
    -- work of the one that took it.
    owner_token TEXT NOT NULL DEFAULT '',
    -- Renewed while the batch runs, including during a blocking provider call.
    -- Staleness is measured from here rather than from `started_at`, so a real
    -- forty-minute batch is not declared dead half way through it.
    beating_at  TEXT NOT NULL DEFAULT ''
)
"""

# Attempts, keyed by the invocation rather than by the angle.
#
# The table this replaces was keyed `(run_id, revision, angle_id)`, which made
# a second search of one angle an UPDATE of the first. A refresh that timed out
# therefore wrote its failure over the successful result it was meant to
# replace: two candidates before, zero after, and one row left in the database
# where two searches had happened.
_ATTEMPTS_V2_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_attempts (
    attempt_id  TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL,
    revision    INTEGER NOT NULL,
    angle_id    TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT '',
    fingerprint TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL DEFAULT '',
    finished_at TEXT NOT NULL DEFAULT '',
    payload     TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
"""

# Which attempt speaks for one angle at one revision. A reference, never a
# copy: reusing research across a revision writes a row here and does not
# duplicate the execution, which is what turned one paid search into three
# entries of search history.
_SELECTED_ATTEMPTS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_selected_attempts (
    run_id              TEXT NOT NULL,
    revision            INTEGER NOT NULL,
    angle_id            TEXT NOT NULL,
    selected_attempt_id TEXT NOT NULL DEFAULT '',
    latest_attempt_id   TEXT NOT NULL DEFAULT '',
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (run_id, revision, angle_id)
)
"""

# One pooling of one run's evidence, and what each search contributed to it.
# Stored per revision because contribution is a measurement against peers and
# not a property of an execution.
_POOL_SNAPSHOTS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_pool_snapshots (
    run_id     TEXT NOT NULL,
    revision   INTEGER NOT NULL,
    subject    TEXT NOT NULL DEFAULT '',
    payload    TEXT NOT NULL,
    taken_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (run_id, revision)
)
"""

# What has already been migrated. A one-shot data move needs somewhere to
# record that it ran, or it either runs every boot or is guarded by "is the new
# table empty", which is wrong the moment a run legitimately has no attempts.
# What the interview had settled when an order was last written from it.
# A judgement of one pool against one cut, keyed by the fingerprint of the
# material actually sent. Keyed by revision, which is what it was, a review of
# a pool that had since changed came back as an answer about the new one.
_CUT_REVIEWS_V2_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_cut_reviews_by_pool (
    run_id      TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT '',
    revision    INTEGER NOT NULL DEFAULT 0,
    payload     TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (run_id, fingerprint)
)
"""

_BASELINES_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_interview_baselines (
    run_id     TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""

_MIGRATIONS_TABLE = """
CREATE TABLE IF NOT EXISTS listicle_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
)
"""

_ATTEMPT_INDEXES = (
    "CREATE INDEX IF NOT EXISTS listicle_attempts_run "
    "ON listicle_attempts (run_id)",
    "CREATE INDEX IF NOT EXISTS listicle_attempts_subject "
    "ON listicle_attempts (subject)",
)

# A lease whose holder has not been heard from for longer than this is
# presumed dead. Kept at the original thirty minutes deliberately: the fix for
# a batch outliving its lock is the heartbeat below, not a longer guess.
_LOCK_STALE_AFTER = timedelta(minutes=30)

# How often a running batch says it is still there. Well inside the stale
# window, and it beats through a blocking provider call rather than between
# them -- a single search can take three minutes, and a heartbeat that only
# fires between searches would let a slow batch expire mid-call.
LEASE_HEARTBEAT_SECONDS = 30


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
        conn.execute(_CUT_REVIEWS_TABLE)
        conn.execute(_ATTEMPTS_V2_TABLE)
        conn.execute(_SELECTED_ATTEMPTS_TABLE)
        conn.execute(_POOL_SNAPSHOTS_TABLE)
        conn.execute(_BASELINES_TABLE)
        conn.execute(_CUT_REVIEWS_V2_TABLE)
        conn.execute(_MIGRATIONS_TABLE)
        for statement in _ATTEMPT_INDEXES:
            conn.execute(statement)
        _add_lock_columns(conn)
    _migrate_attempts()


def _add_lock_columns(conn) -> None:
    """The lease columns, on a lock table that predates them."""
    columns = {row["name"] for row in conn.execute(
        "PRAGMA table_info(listicle_search_locks)"
    )}
    if "owner_token" not in columns:
        conn.execute(
            "ALTER TABLE listicle_search_locks ADD COLUMN owner_token "
            "TEXT NOT NULL DEFAULT ''"
        )
    if "beating_at" not in columns:
        conn.execute(
            "ALTER TABLE listicle_search_locks ADD COLUMN beating_at "
            "TEXT NOT NULL DEFAULT ''"
        )


_ATTEMPT_MIGRATION = "attempts-have-identities"


def _execution_key(row: dict) -> str:
    """What two stored rows have to share to be one execution.

    Deliberately strict. The old table filed the same paid search under every
    revision that reused it, so the rows exist -- but nothing in them says
    which were copies and which were separate searches. Same angle, same
    request, same finishing timestamp and byte-identical evidence is the only
    combination where "one execution" is defensible; anything else stays
    separate and the count is reported as uncertain rather than guessed.
    """
    material = json.dumps(
        [
            row.get("run_id", ""),
            row.get("angle_id", ""),
            row.get("request_fingerprint", ""),
            row.get("finished_at", ""),
            row.get("state", ""),
            row.get("sightings", []),
        ],
        sort_keys=True,
        ensure_ascii=False,
    )
    return uuid.uuid5(uuid.NAMESPACE_URL, material).hex[:12]


def _migrate_attempts() -> None:
    """Move rows stored per angle into attempts that have identities.

    The old rows are left exactly where they are. They are the evidence that
    this migration was faithful, and once new attempts exist a restore of the
    old database would lose paid work -- so the way back is forward, and the
    old table is what a forward fix would be checked against.

    Every migrated attempt is marked `reconstructed`. It carries real evidence
    and an unreliable execution count, and history says so rather than
    presenting a rebuilt row as something this pipeline watched happen.
    """
    with get_db_connection() as conn:
        done = conn.execute(
            "SELECT 1 FROM listicle_migrations WHERE name = ?",
            (_ATTEMPT_MIGRATION,),
        ).fetchone()
        if done is not None:
            return
        legacy = conn.execute(
            "SELECT run_id, revision, angle_id, payload "
            "FROM listicle_search_attempts"
        ).fetchall()
        by_execution: dict[str, dict] = {}
        selections: list[tuple] = []
        for row in legacy:
            stored = json.loads(row["payload"])
            key = _execution_key(stored)
            attempt = by_execution.get(key)
            if attempt is None:
                stored["attempt_id"] = key
                stored["origin"] = "reconstructed"
                # The earliest revision that holds this evidence is the one it
                # was originated under; the later ones referenced it.
                stored["revision"] = int(row["revision"])
                by_execution[key] = stored
            elif int(row["revision"]) < int(attempt.get("revision", 1)):
                attempt["revision"] = int(row["revision"])
            selections.append(
                (row["run_id"], int(row["revision"]), row["angle_id"], key)
            )
        for key, stored in by_execution.items():
            conn.execute(
                "INSERT OR REPLACE INTO listicle_attempts (attempt_id, run_id, "
                "revision, angle_id, state, fingerprint, subject, finished_at, "
                "payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    key,
                    stored.get("run_id", ""),
                    int(stored.get("revision", 1)),
                    stored.get("angle_id", ""),
                    stored.get("state", ""),
                    stored.get("request_fingerprint", ""),
                    stored.get("subject", ""),
                    stored.get("finished_at", ""),
                    json.dumps(stored, ensure_ascii=False),
                ),
            )
        for run_id, revision, angle_id, key in selections:
            completed = by_execution[key].get("state") == "completed"
            conn.execute(
                "INSERT OR REPLACE INTO listicle_selected_attempts (run_id, "
                "revision, angle_id, selected_attempt_id, latest_attempt_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (run_id, revision, angle_id, key if completed else "", key),
            )
        conn.execute(
            "INSERT OR REPLACE INTO listicle_migrations (name, applied_at) "
            "VALUES (?, ?)",
            (_ATTEMPT_MIGRATION, _now()),
        )


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


class RevisionConflict(RuntimeError):
    """Two corrections tried to become the same revision, or one was stale.

    Carries the revision that actually won, so the screen can re-read rather
    than guess. This is not an error in the ordinary sense: the operator's
    browser was showing a version of the order that has since moved, and the
    honest answer is to show them the one that exists.
    """

    def __init__(self, message: str, current_revision: int) -> None:
        super().__init__(message)
        self.current_revision = current_revision


def insert_next_revision(order: SearchOrder) -> SearchOrder:
    """Write this order as the run's next revision, atomically.

    Reading the current revision and then writing one higher is a
    check-against-a-value-that-has-already-moved. Two corrections arriving
    together both read revision 2, both write revision 3, and one of them is
    gone -- with no error and nothing on the screen to notice.

    The read and the write happen inside one immediate transaction, and there
    is deliberately no model call anywhere near it: this holds the database's
    write lock, and a lock held across a network round trip is how a pipeline
    stops being usable by two tabs.
    """
    ensure_tables()
    with transaction() as conn:
        row = conn.execute(
            "SELECT MAX(revision) AS revision FROM listicle_search_orders "
            "WHERE run_id = ?",
            (order.run_id,),
        ).fetchone()
        current = int(row["revision"] or 0)
        placed = order.model_copy(update={"revision": current + 1})
        conn.execute(
            "INSERT INTO listicle_search_orders (run_id, revision, payload) "
            "VALUES (?, ?, ?)",
            (placed.run_id, placed.revision, placed.model_dump_json()),
        )
    return placed


# --- what the interview had settled -----------------------------------------


def save_baseline(baseline: InterviewBaseline) -> None:
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_interview_baselines (run_id, payload) "
            "VALUES (?, ?) ON CONFLICT(run_id) DO UPDATE SET "
            "payload=excluded.payload, updated_at=datetime('now')",
            (baseline.run_id, baseline.model_dump_json()),
        )


def load_baseline(run_id: str) -> InterviewBaseline | None:
    """What the interview had settled when the order was last written.

    None for every order stored before baselines existed. That is a real state
    and not a missing one: nobody wrote down what the transcript then said, so
    a re-agreement has to fall back to the order itself and say so when it
    overrides a direct correction.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM listicle_interview_baselines WHERE run_id = ?",
            (run_id,),
        ).fetchone()
    return (
        None if row is None else InterviewBaseline.model_validate(json.loads(row[0]))
    )


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


def new_attempt_id() -> str:
    """A fresh identity for one invocation."""
    return uuid.uuid4().hex[:12]


def save_attempt(attempt: SearchAttempt) -> None:
    """Write one attempt, refusing to move a terminal one.

    An attempt that has completed, failed or been interrupted is finished
    evidence. A later search of the same angle is a new attempt with a new id,
    and a process that lost its lease cannot rewrite an old one -- which is the
    whole of R2 stated as a storage rule rather than as caller discipline.
    """
    ensure_tables()
    if not attempt.attempt_id:  # pragma: no cover -- the field generates one
        raise ValueError("An attempt has to carry an attempt_id.")
    with transaction() as conn:
        row = conn.execute(
            "SELECT state FROM listicle_attempts WHERE attempt_id = ?",
            (attempt.attempt_id,),
        ).fetchone()
        if row is not None and row["state"] in TERMINAL_ATTEMPT_STATES:
            if row["state"] != attempt.state:
                raise ValueError(
                    f"Attempt {attempt.attempt_id} already finished as "
                    f"{row['state']}; a new search is a new attempt."
                )
            return
        conn.execute(
            "INSERT INTO listicle_attempts (attempt_id, run_id, revision, "
            "angle_id, state, fingerprint, subject, finished_at, payload) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(attempt_id) DO UPDATE SET state=excluded.state, "
            "fingerprint=excluded.fingerprint, subject=excluded.subject, "
            "finished_at=excluded.finished_at, payload=excluded.payload, "
            "updated_at=datetime('now')",
            (
                attempt.attempt_id,
                attempt.run_id,
                attempt.revision,
                attempt.angle_id,
                attempt.state,
                attempt.request_fingerprint,
                attempt.subject,
                attempt.finished_at,
                attempt.model_dump_json(),
            ),
        )


def record_attempt_contribution(
    attempt_id: str,
    *,
    found: int,
    shared: int,
    exclusive: int,
    shape_key: str = "",
    subject: str = "",
) -> None:
    """Mirror the latest snapshot's measurement onto one attempt.

    Separate from `save_attempt` because it is not a change to what happened.
    A terminal attempt's result is frozen; what it CONTRIBUTED is a measurement
    against peers that moves every time the pool does, and the snapshot is
    where that lives. This copy exists so the scripts that read attempts
    directly keep working, and it is a mirror, never a second answer.
    """
    ensure_tables()
    with transaction() as conn:
        row = conn.execute(
            "SELECT payload FROM listicle_attempts WHERE attempt_id = ?",
            (attempt_id,),
        ).fetchone()
        if row is None:
            return
        stored = json.loads(row[0])
        stored.update(
            {
                "found": found,
                "shared": shared,
                "exclusive": exclusive,
                "contribution_recorded": True,
                "shape_key": stored.get("shape_key") or shape_key,
                "subject": stored.get("subject") or subject,
            }
        )
        conn.execute(
            "UPDATE listicle_attempts SET payload = ?, subject = ?, "
            "updated_at = datetime('now') WHERE attempt_id = ?",
            (
                json.dumps(stored, ensure_ascii=False),
                stored.get("subject", ""),
                attempt_id,
            ),
        )


def load_attempt(attempt_id: str) -> SearchAttempt | None:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM listicle_attempts WHERE attempt_id = ?",
            (attempt_id,),
        ).fetchone()
    return None if row is None else SearchAttempt.model_validate(json.loads(row[0]))


def load_attempts(run_id: str, revision: int | None = None) -> list[SearchAttempt]:
    """Every attempt this run has, in no particular order.

    Across every revision when none is named, which is what a reuse check
    wants: a result gathered two revisions ago still answers this revision's
    request if the request did not change, and the fingerprint is what says so.

    Naming a revision means "attempts ORIGINATED under it". What is displayed
    at a revision is a different question, answered by the selections.
    """
    ensure_tables()
    with get_db_connection() as conn:
        if revision is None:
            rows = conn.execute(
                "SELECT payload FROM listicle_attempts WHERE run_id = ?",
                (run_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT payload FROM listicle_attempts "
                "WHERE run_id = ? AND revision = ?",
                (run_id, revision),
            ).fetchall()
    return [SearchAttempt.model_validate(json.loads(row[0])) for row in rows]


# --- which attempt is being shown ------------------------------------------


def save_selection(selection: AngleSelection) -> None:
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_selected_attempts (run_id, revision, "
            "angle_id, selected_attempt_id, latest_attempt_id) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(run_id, revision, angle_id) DO UPDATE SET "
            "selected_attempt_id=excluded.selected_attempt_id, "
            "latest_attempt_id=excluded.latest_attempt_id, "
            "updated_at=datetime('now')",
            (
                selection.run_id,
                selection.revision,
                selection.angle_id,
                selection.selected_attempt_id,
                selection.latest_attempt_id,
            ),
        )


def load_selections_for(run_id: str, revision: int) -> dict[str, AngleSelection]:
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT run_id, revision, angle_id, selected_attempt_id, "
            "latest_attempt_id FROM listicle_selected_attempts "
            "WHERE run_id = ? AND revision = ?",
            (run_id, revision),
        ).fetchall()
    return {
        row["angle_id"]: AngleSelection(
            run_id=row["run_id"],
            revision=row["revision"],
            angle_id=row["angle_id"],
            selected_attempt_id=row["selected_attempt_id"] or "",
            latest_attempt_id=row["latest_attempt_id"] or "",
        )
        for row in rows
    }


# --- what one pooling of the evidence measured ------------------------------


def save_pool_snapshot(snapshot: PoolSnapshot) -> None:
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_pool_snapshots (run_id, revision, subject, "
            "payload) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(run_id, revision) DO UPDATE SET "
            "subject=excluded.subject, payload=excluded.payload, "
            "taken_at=datetime('now')",
            (
                snapshot.run_id,
                snapshot.revision,
                snapshot.subject,
                snapshot.model_dump_json(),
            ),
        )


def latest_pool_snapshots(subject: str, *, exclude_run: str = "") -> list[PoolSnapshot]:
    """The most recent pooling of each prior run about one subject.

    One per run, deliberately. A run that was revised four times measured its
    searches four times against four slightly different pools, and adding those
    up counts the same evidence repeatedly -- which is exactly how one paid
    search came to be reported as three.
    """
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT run_id, MAX(revision) AS revision FROM listicle_pool_snapshots "
            "WHERE subject = ? AND run_id != ? GROUP BY run_id",
            (subject, exclude_run),
        ).fetchall()
        wanted = [(row["run_id"], row["revision"]) for row in rows]
        found: list[PoolSnapshot] = []
        for run_id, revision in wanted:
            payload = conn.execute(
                "SELECT payload FROM listicle_pool_snapshots "
                "WHERE run_id = ? AND revision = ?",
                (run_id, revision),
            ).fetchone()
            if payload is not None:
                found.append(PoolSnapshot.model_validate(json.loads(payload[0])))
    return found


def save_pool_review(review: CutReview) -> None:
    """Store one review under the pool it actually judged.

    Never under a revision. A pool whose candidates changed is a different
    question, and the version this replaces answered it with the old verdict:
    a refresh that replaced every venue, followed by a review that failed, left
    the new pool reading `checked` with nothing barred.
    """
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_cut_reviews_by_pool (run_id, fingerprint, "
            "status, revision, payload) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(run_id, fingerprint) DO UPDATE SET "
            "status=excluded.status, revision=excluded.revision, "
            "payload=excluded.payload, updated_at=datetime('now')",
            (
                review.run_id,
                review.fingerprint,
                review.status,
                review.revision,
                review.model_dump_json(),
            ),
        )


def load_pool_review(run_id: str, fingerprint: str) -> CutReview | None:
    """The review of exactly this pool, or None because nobody judged it.

    None and an empty verdict list are different findings: nobody checked,
    versus checked and nothing was barred. The screen says which.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM listicle_cut_reviews_by_pool "
            "WHERE run_id = ? AND fingerprint = ?",
            (run_id, fingerprint),
        ).fetchone()
    return None if row is None else CutReview.model_validate(json.loads(row[0]))


def save_cut_review(run_id: str, revision: int, flags: dict) -> None:
    """What the cut check said about one revision's candidates.

    Per revision, because a revised cut is a different question and the old
    answer is not an answer to it. Stored rather than recomputed on read, for
    the same reason every other result here is: opening a screen must not spend.
    """
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_cut_reviews (run_id, revision, payload) "
            "VALUES (?, ?, ?) ON CONFLICT(run_id, revision) DO UPDATE SET "
            "payload=excluded.payload, updated_at=datetime('now')",
            (run_id, revision, json.dumps(flags)),
        )


def load_cut_review(run_id: str, revision: int) -> dict | None:
    """The stored verdicts, or None when nothing has looked at this revision.

    None and `{}` are different findings: nobody checked, versus checked and
    nothing was barred. The screen says which.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM listicle_cut_reviews "
            "WHERE run_id = ? AND revision = ?",
            (run_id, revision),
        ).fetchone()
    return None if row is None else json.loads(row[0])


def completed_attempts_for(subject: str, *, exclude_run: str = "") -> list[SearchAttempt]:
    """Every finished search recorded for one subject, from any run.

    Kept for the scripts that read attempts directly. It is NOT what search
    history is built from any more: an attempt says what one execution
    returned, and what an angle CONTRIBUTED is a measurement against the pool
    it was in. `latest_pool_snapshots` is where that lives.

    Scanned in Python rather than queried, because the fields live inside the
    stored payload. That is fine at this size and would not be at a hundred
    times it -- the fix then is a column, not a different answer.
    """
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT payload FROM listicle_attempts WHERE subject = ? "
            "AND state = 'completed' AND run_id != ?",
            (subject, exclude_run),
        ).fetchall()
    return [SearchAttempt.model_validate(json.loads(row[0])) for row in rows]


# --- not starting the same batch twice -------------------------------------


def claim_batch(run_id: str, revision: int) -> str:
    """Take the run's search lease, or return "" because someone else holds it.

    The read, the staleness check and the write happen inside one
    `BEGIN IMMEDIATE` transaction. The version this replaced read the row on a
    deferred connection, decided nobody held the lock, and then upserted -- so
    two callers interleaved on the read both decided they had won and both
    wrote, and the second silently took the lock from the first. Forcing that
    interleaving reproduced it: two real connections, `[True, True]`.

    What this can promise: two clicks do not start two batches, and a batch
    whose process died does not hold the run forever.

    What it cannot promise: that a provider did not already receive and charge
    for a request whose answer never came back. Retrying an interrupted attempt
    may spend a second time, and the screen says so rather than implying a
    guarantee nothing can make.
    """
    ensure_tables()
    token = secrets.token_urlsafe(16)
    now = _now()
    with transaction() as conn:
        row = conn.execute(
            "SELECT owner_token, beating_at, started_at "
            "FROM listicle_search_locks WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is not None and _lease_is_live(row):
            return ""
        conn.execute(
            "INSERT INTO listicle_search_locks (run_id, revision, started_at, "
            "owner_token, beating_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(run_id) DO UPDATE SET revision=excluded.revision, "
            "started_at=excluded.started_at, owner_token=excluded.owner_token, "
            "beating_at=excluded.beating_at",
            (run_id, revision, now, token, now),
        )
    return token


def _lease_is_live(row) -> bool:
    """Whether the holder of this lease has been heard from recently enough."""
    stamp = (row["beating_at"] if "beating_at" in row.keys() else "") or row["started_at"]
    try:
        beat = datetime.fromisoformat(stamp)
    except (TypeError, ValueError):  # pragma: no cover -- corrupt row
        return False
    if beat.tzinfo is None:
        beat = beat.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - beat < _LOCK_STALE_AFTER


def renew_batch(run_id: str, owner_token: str) -> bool:
    """Say the holder is still working. False means the lease was taken away.

    Called on a timer while the batch runs, including through a blocking
    provider call. A batch that legitimately outlives the stale window keeps
    its lease; a batch whose process died stops beating and loses it.
    """
    if not owner_token:
        return False
    ensure_tables()
    with transaction() as conn:
        changed = conn.execute(
            "UPDATE listicle_search_locks SET beating_at = ? "
            "WHERE run_id = ? AND owner_token = ?",
            (_now(), run_id, owner_token),
        ).rowcount
    return bool(changed)


def holds_batch(run_id: str, owner_token: str) -> bool:
    """Whether this token is still the run's lease holder.

    Checked before dispatching a search, before committing its result and
    before publishing a review. A process that lost the lease has to stop
    rather than finish over the top of whoever took it.
    """
    if not owner_token:
        return False
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT owner_token FROM listicle_search_locks WHERE run_id = ?",
            (run_id,),
        ).fetchone()
    return row is not None and row["owner_token"] == owner_token


def release_batch(run_id: str, owner_token: str = "") -> None:
    """Give up the lease, and only ever your own.

    A token-less release exists for the recovery path -- a lease whose holder
    is gone and whose window has passed -- and it refuses to touch a live one.
    """
    ensure_tables()
    with transaction() as conn:
        if owner_token:
            conn.execute(
                "DELETE FROM listicle_search_locks WHERE run_id = ? "
                "AND owner_token = ?",
                (run_id, owner_token),
            )
            return
        row = conn.execute(
            "SELECT owner_token, beating_at, started_at "
            "FROM listicle_search_locks WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is None or _lease_is_live(row):
            return
        conn.execute("DELETE FROM listicle_search_locks WHERE run_id = ?", (run_id,))


def batch_is_running(run_id: str) -> bool:
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT owner_token, beating_at, started_at "
            "FROM listicle_search_locks WHERE run_id = ?",
            (run_id,),
        ).fetchone()
    return row is not None and _lease_is_live(row)
