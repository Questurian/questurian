import sqlite3
import threading

import pytest

import app.core.database as database


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'pipeline.db')
    with database.get_db_connection() as conn:
        conn.execute(
            'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)'
        )
    return tmp_path / 'pipeline.db'


def test_connection_uses_wal_mode(temp_db):
    with database.get_db_connection() as conn:
        mode = conn.execute('PRAGMA journal_mode').fetchone()[0]
    assert mode == 'wal'


def test_rolls_back_on_exception(temp_db):
    with pytest.raises(RuntimeError):
        with database.get_db_connection() as conn:
            conn.execute("INSERT INTO kv (k, v) VALUES ('a', '1')")
            raise RuntimeError('boom')

    with database.get_db_connection() as conn:
        rows = conn.execute('SELECT * FROM kv').fetchall()
    assert rows == []


def test_concurrent_writers_do_not_raise_locked(temp_db):
    errors: list[Exception] = []

    def write_many(worker: int) -> None:
        try:
            for i in range(50):
                with database.get_db_connection() as conn:
                    conn.execute(
                        'INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)',
                        (f'{worker}-{i}', 'x'),
                    )
        except sqlite3.OperationalError as exc:
            errors.append(exc)

    threads = [
        threading.Thread(target=write_many, args=(worker,))
        for worker in range(4)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []

    with database.get_db_connection() as conn:
        count = conn.execute('SELECT COUNT(*) FROM kv').fetchone()[0]
    assert count == 200
