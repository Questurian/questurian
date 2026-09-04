"""Where a listicle interview is kept between turns.

Persisted per turn rather than held in the browser, for the same reason the
article grill is (ADR 0031): an abandoned interview is resumable, and a closed
tab is not a lost run. The whole state goes in as JSON because it is a
pydantic contract that will grow, and a column per field would have to be
migrated every time a marker changes.
"""

from __future__ import annotations

import json

from app.core.database import get_db_connection

from ..prompt2blog.contracts_v4 import GrillState

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


def ensure_tables() -> None:
    with get_db_connection() as conn:
        conn.execute(_TABLE)
        conn.execute(_RESULTS_TABLE)


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
