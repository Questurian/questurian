"""Protect developer data before application modules are imported by tests."""

import os
import shutil
import tempfile


_TEST_DATA_DIR = tempfile.mkdtemp(prefix="questurian-backend-tests-")
os.environ["DATA_DIR"] = _TEST_DATA_DIR


def pytest_sessionfinish(session, exitstatus):
    del session, exitstatus
    shutil.rmtree(_TEST_DATA_DIR, ignore_errors=True)
