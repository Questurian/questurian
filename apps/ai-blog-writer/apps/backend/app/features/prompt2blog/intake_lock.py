"""Prevent overlapping intake mutations from buying work or overwriting receipts."""
from contextlib import contextmanager
from functools import wraps
import fcntl
import hashlib

from fastapi import HTTPException


def exclusive_run(action):
    @wraps(action)
    def guarded(run_id: str, *args, **kwargs):
        with intake_lock(run_id):
            return action(run_id, *args, **kwargs)
    return guarded


@contextmanager
def intake_lock(run_id: str):
    # File locks cover both threadpool requests and multiple local workers.
    # The OS releases them on process exit; no stale 'running' flag to clear.
    from app.config import DATA_DIR

    directory = DATA_DIR / "intake-locks"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (hashlib.sha256(run_id.encode()).hexdigest() + ".lock")
    with path.open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise HTTPException(status_code=409, detail={
                "error": "intake_busy",
                "message": "This run is already working. Wait for it to finish before changing or retrying it.",
            }) from error
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
