"""Prevent overlapping intake mutations from buying work or overwriting receipts."""
from contextlib import contextmanager
from functools import wraps
from typing import get_type_hints
import fcntl
import hashlib
import inspect

from fastapi import HTTPException


def _resolved_signature(action):
    """`action`'s signature with its annotations already turned into types.

    The route module is written under `from __future__ import annotations`, so
    every annotation on the endpoint is a *string* at runtime, and FastAPI
    resolves those strings against `call.__globals__`. For a wrapped endpoint
    that attribute belongs to this module, where names like `AnswerRequest` do
    not exist, so the annotation stays an unresolved `ForwardRef` and FastAPI
    falls back to treating the parameter as a query string.

    The symptom is a 422 that reads `Field required` at `["query", "request"]`
    on a request whose body was perfectly well formed. Every POST behind this
    decorator was affected -- the grill's answer, both gate moves, the work
    order cut, the selection, the venue mark -- and the three that take
    `BackgroundTasks` could not start their work either. Resolving here, in the
    module the endpoint was actually written in, is what makes those names
    mean something.

    `include_extras` keeps `Annotated[...]` metadata intact, because that is
    where a dependency can live.
    """
    hints = get_type_hints(action, include_extras=True)
    signature = inspect.signature(action)
    return signature.replace(
        parameters=[
            parameter.replace(annotation=hints.get(parameter.name, parameter.annotation))
            for parameter in signature.parameters.values()
        ],
        return_annotation=hints.get("return", signature.return_annotation),
    )


def exclusive_run(action):
    @wraps(action)
    def guarded(run_id: str, *args, **kwargs):
        with intake_lock(run_id):
            return action(run_id, *args, **kwargs)

    # Set explicitly rather than left to `@wraps`. `inspect.signature` prefers
    # `__signature__` over following `__wrapped__`, so this is what FastAPI
    # reads -- and unlike the wrapped function's own annotations, these are
    # already types rather than strings needing a namespace this module has
    # not got.
    guarded.__signature__ = _resolved_signature(action)
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
