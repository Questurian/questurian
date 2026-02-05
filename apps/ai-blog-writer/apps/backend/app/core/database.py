"""
Core database utilities for SQLite connection management.

Single file database: data/pipeline.db
All features share this database but have their own tables.
"""
import sqlite3
from contextlib import contextmanager
from typing import Generator

from app.config import DATA_DIR, DB_PATH


@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """
    Get a database connection with auto-commit.

    Usage:
        with get_db_connection() as conn:
            conn.execute("SELECT * FROM runs")
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
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
                FOREIGN KEY (run_id) REFERENCES runs(run_id)
            );
            """
        )

        columns = {row["name"] for row in conn.execute("PRAGMA table_info(runs)")}
        if "feature" not in columns:
            conn.execute(
                "ALTER TABLE runs ADD COLUMN feature TEXT NOT NULL "
                "DEFAULT 'youtube2blog'"
            )

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runs_feature ON runs(feature);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);"
        )


# Initialize core tables on module load
ensure_core_tables()
