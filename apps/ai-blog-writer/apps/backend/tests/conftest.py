"""Protect developer data before application modules are imported by tests."""

import os
import shutil
import tempfile

import pytest


_TEST_DATA_DIR = tempfile.mkdtemp(prefix="questurian-backend-tests-")
os.environ["DATA_DIR"] = _TEST_DATA_DIR

# Tests must not write to the real usage history.
#
# `.env` sets USAGE_MONITOR_URL and `app.main` now defaults it, so a test that
# exercises a real call path -- and several deliberately do, to prove the
# reporting works -- posted fake events to the running collector. Three such
# rows reached it before this was noticed, carrying a priced cost derived from
# invented token counts. A dashboard is only worth reading if everything on it
# actually happened.
#
# Unset rather than pointed somewhere harmless: with no URL the emitter does
# nothing at all, which is also what it must do on a machine with no dashboard.
os.environ.pop("USAGE_MONITOR_URL", None)
os.environ.pop("MODEL_GATEWAY_SETTINGS_URL", None)


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


@pytest.fixture(autouse=True)
def never_report_usage(monkeypatch):
    """Keep test runs out of the real usage history, whatever a test sets.

    The module-level unset above covers import time; this covers a test that
    sets the variable itself, and makes the guarantee explicit rather than
    incidental.
    """
    monkeypatch.delenv("USAGE_MONITOR_URL", raising=False)
    monkeypatch.delenv("MODEL_GATEWAY_SETTINGS_URL", raising=False)
