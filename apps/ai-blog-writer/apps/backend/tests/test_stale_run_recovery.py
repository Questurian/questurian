from contextlib import contextmanager
import sqlite3

import pytest

import app.core.storage as storage


RUNS_TABLE_SQL = """
CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    feature TEXT NOT NULL DEFAULT 'youtube2blog',
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


@pytest.fixture
def temp_runs_db(tmp_path, monkeypatch):
    db_path = tmp_path / 'pipeline.db'

    @contextmanager
    def get_test_db_connection():
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    monkeypatch.setattr(storage, 'get_db_connection', get_test_db_connection)

    with get_test_db_connection() as conn:
        conn.execute(RUNS_TABLE_SQL)

    return get_test_db_connection


def _insert_run(get_conn, run_id, status, error=None):
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO runs (run_id, feature, status, stage, error, created_at, updated_at)
            VALUES (?, 'prompt2blog', ?, 'stage_compose', ?, '2026-01-01', '2026-01-01')
            """,
            (run_id, status, error),
        )


def _read_run(get_conn, run_id):
    with get_conn() as conn:
        return dict(
            conn.execute(
                'SELECT * FROM runs WHERE run_id = ?', (run_id,)
            ).fetchone()
        )


def test_fail_stale_runs_marks_in_flight_runs_failed(temp_runs_db):
    _insert_run(temp_runs_db, 'run-running', 'running')
    _insert_run(temp_runs_db, 'run-pending', 'pending')

    assert storage.fail_stale_runs() == 2

    for run_id in ('run-running', 'run-pending'):
        run = _read_run(temp_runs_db, run_id)
        assert run['status'] == 'failed'
        assert 'restarted' in run['error']
        assert run['updated_at'] != '2026-01-01'


def test_fail_stale_runs_leaves_terminal_runs_untouched(temp_runs_db):
    _insert_run(temp_runs_db, 'run-completed', 'completed')
    _insert_run(temp_runs_db, 'run-failed', 'failed', error='original error')

    assert storage.fail_stale_runs() == 0

    completed = _read_run(temp_runs_db, 'run-completed')
    assert completed['status'] == 'completed'
    assert completed['error'] is None

    failed = _read_run(temp_runs_db, 'run-failed')
    assert failed['error'] == 'original error'


def test_fail_stale_runs_on_empty_table(temp_runs_db):
    assert storage.fail_stale_runs() == 0
