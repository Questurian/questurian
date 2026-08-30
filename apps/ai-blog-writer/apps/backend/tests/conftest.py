"""Protect developer data before application modules are imported by tests."""

import os
import shutil
import tempfile

import pytest


_TEST_DATA_DIR = tempfile.mkdtemp(prefix="questurian-backend-tests-")
os.environ["DATA_DIR"] = _TEST_DATA_DIR


def pytest_sessionfinish(session, exitstatus):
    del session, exitstatus
    shutil.rmtree(_TEST_DATA_DIR, ignore_errors=True)


@pytest.fixture
def isolated_db(tmp_path, monkeypatch):
    """Point a test at a temporary database instead of the developer's own.

    Routes exercised through the real app run their real handlers, and some of
    them write and delete rows. This has cost real data before. Any test that
    touches storage takes this fixture; it lives here rather than in one module
    so the next one does not have to rediscover that it needs it.
    """
    import app.core.database as database

    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "pipeline.db")
    database.ensure_core_tables()
    return tmp_path / "pipeline.db"
