"""
Core database utilities for SQLite connection management.

Single file database: data/pipeline.db
All features share this database but have their own tables.
"""

import sqlite3
from contextlib import contextmanager
from typing import Generator

from app.config import DATA_DIR, DB_PATH


# Wait up to 5s for a competing writer instead of failing immediately
# with "database is locked". Pipelines write status from background
# threads while API requests read/write concurrently.
_BUSY_TIMEOUT_SECONDS = 5.0


@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """
    Get a database connection with auto-commit.

    Commits on clean exit, rolls back if the block raises. Connections
    use WAL journal mode so readers don't block the single writer.

    Usage:
        with get_db_connection() as conn:
            conn.execute("SELECT * FROM runs")
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=_BUSY_TIMEOUT_SECONDS)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_core_tables() -> None:
    """
    Create core database tables shared by all features.

    Core tables:
    - runs: Track pipeline run status
    - stages: Store stage results for any pipeline
    - outputs: Store final outputs (markdown, artifacts)
    """
    with get_db_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                feature TEXT NOT NULL DEFAULT 'youtube2blog',
                status TEXT NOT NULL,
                stage TEXT NOT NULL,
                error TEXT,
                owner_staff_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS stages (
                run_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (run_id, stage),
                FOREIGN KEY (run_id) REFERENCES runs(run_id)
            );

            CREATE TABLE IF NOT EXISTS outputs (
                run_id TEXT PRIMARY KEY,
                markdown TEXT NOT NULL,
                artifact TEXT NOT NULL,
                created_at TEXT NOT NULL,
                synced_to_payload INTEGER DEFAULT 0,
                payload_article_id INTEGER,
                synced_at TEXT,
                FOREIGN KEY (run_id) REFERENCES runs(run_id)
            );

            CREATE TABLE IF NOT EXISTS staged_drafts (
                storage_key TEXT NOT NULL,
                draft_id TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (storage_key, draft_id)
            );

            CREATE INDEX IF NOT EXISTS idx_staged_drafts_key
                ON staged_drafts(storage_key);

            CREATE TABLE IF NOT EXISTS claude_credentials (
                slot_id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )

        # Migration: Add sync columns to existing outputs table
        output_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(outputs)")
        }
        if "synced_to_payload" not in output_columns:
            conn.execute(
                "ALTER TABLE outputs ADD COLUMN synced_to_payload INTEGER DEFAULT 0"
            )
        if "payload_article_id" not in output_columns:
            conn.execute("ALTER TABLE outputs ADD COLUMN payload_article_id INTEGER")
        if "synced_at" not in output_columns:
            conn.execute("ALTER TABLE outputs ADD COLUMN synced_at TEXT")

        columns = {row["name"] for row in conn.execute("PRAGMA table_info(runs)")}
        if "feature" not in columns:
            conn.execute(
                "ALTER TABLE runs ADD COLUMN feature TEXT NOT NULL "
                "DEFAULT 'youtube2blog'"
            )
        if "owner_staff_id" not in columns:
            conn.execute("ALTER TABLE runs ADD COLUMN owner_staff_id TEXT")
        # Why a failed run needs a second column beside `error`.
        #
        # `error` is a sentence written for a person. Deciding what to show, or
        # whether a run is worth resuming, means matching on that sentence --
        # which breaks the moment the wording changes. This holds the machine
        # half: one of the FAULT_* kinds, or NULL for a run that has not failed.
        if "failure_kind" not in columns:
            conn.execute("ALTER TABLE runs ADD COLUMN failure_kind TEXT")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_feature ON runs(feature);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);")


# Initialize core tables on module load
ensure_core_tables()
