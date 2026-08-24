"""LangGraph runtime helpers with optional SQLite checkpointing."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from contextlib import AsyncExitStack, asynccontextmanager, contextmanager
from importlib.util import find_spec
from pathlib import Path
from typing import Any, AsyncGenerator, Generator
from uuid import UUID

from app.config import DATA_DIR

LANGGRAPH_CHECKPOINT_PATH = DATA_DIR / "langgraph_checkpoints.db"
ASYNC_CHECKPOINT_OPEN_TIMEOUT_SECONDS = 2.0

logger = logging.getLogger(__name__)
_LANGSMITH_MISSING_KEY_WARNED = False


def langgraph_is_available() -> bool:
    return find_spec("langgraph") is not None


@dataclass
class LangSmithTraceMetadata:
    trace_run_id: str | None = None
    trace_url: str | None = None


def _read_bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def langsmith_tracing_enabled() -> bool:
    global _LANGSMITH_MISSING_KEY_WARNED
    tracing_enabled = _read_bool_env("LANGSMITH_TRACING") or _read_bool_env(
        "LANGCHAIN_TRACING_V2"
    )
    if not tracing_enabled:
        return False
    api_key = os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY")
    if api_key and api_key.strip():
        return True
    if not _LANGSMITH_MISSING_KEY_WARNED:
        logger.warning(
            "LangSmith tracing requested, but LANGSMITH_API_KEY/LANGCHAIN_API_KEY "
            "is missing. Tracing remains disabled until a key is set."
        )
        _LANGSMITH_MISSING_KEY_WARNED = True
    return False


@contextmanager
def langgraph_trace(
    *,
    trace_name: str,
    feature: str,
    thread_id: str,
    app_run_id: str | None = None,
    tags: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
    inputs: dict[str, Any] | None = None,
) -> Generator[tuple[Any | None, LangSmithTraceMetadata], None, None]:
    trace_metadata = LangSmithTraceMetadata()
    if not langsmith_tracing_enabled():
        yield None, trace_metadata
        return

    try:
        from langsmith.run_helpers import trace
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "LangSmith tracing requested but langsmith SDK is unavailable: %s: %s",
            type(exc).__name__,
            exc,
        )
        yield None, trace_metadata
        return

    trace_tags = sorted(set((tags or []) + ["langgraph", f"feature:{feature}"]))
    trace_metadata_payload: dict[str, Any] = {
        "feature": feature,
        "thread_id": thread_id,
    }
    if app_run_id:
        trace_metadata_payload["app_run_id"] = app_run_id
    if metadata:
        trace_metadata_payload.update(metadata)

    trace_run_id = _parse_uuid(app_run_id) or _parse_uuid(thread_id)
    trace_kwargs: dict[str, Any] = {}
    if trace_run_id is not None:
        trace_kwargs["run_id"] = trace_run_id
    project_name = os.getenv("LANGSMITH_PROJECT") or os.getenv("LANGCHAIN_PROJECT")
    if project_name:
        trace_kwargs["project_name"] = project_name

    with trace(
        trace_name,
        run_type="chain",
        inputs=inputs or {},
        tags=trace_tags,
        metadata=trace_metadata_payload,
        **trace_kwargs,
    ) as trace_run:
        trace_run_value = getattr(trace_run, "id", None)
        if trace_run_value is not None:
            trace_metadata.trace_run_id = str(trace_run_value)
        elif trace_run_id is not None:
            trace_metadata.trace_run_id = str(trace_run_id)
        yield trace_run, trace_metadata


def finalize_langsmith_trace(
    trace_run: Any | None,
    trace_metadata: LangSmithTraceMetadata,
) -> LangSmithTraceMetadata:
    if trace_run is None:
        return trace_metadata

    if not trace_metadata.trace_run_id:
        trace_run_value = getattr(trace_run, "id", None)
        if trace_run_value is not None:
            trace_metadata.trace_run_id = str(trace_run_value)

    if trace_metadata.trace_url:
        return trace_metadata

    get_url = getattr(trace_run, "get_url", None)
    if not callable(get_url):
        return trace_metadata

    try:
        trace_metadata.trace_url = str(get_url())
    except Exception as exc:  # noqa: BLE001
        logger.debug(
            "LangSmith trace URL unavailable: %s: %s",
            type(exc).__name__,
            exc,
        )

    return trace_metadata


def langsmith_trace_payload(
    trace_metadata: LangSmithTraceMetadata,
) -> dict[str, str]:
    payload: dict[str, str] = {}
    if trace_metadata.trace_run_id:
        payload["langsmith_trace_run_id"] = trace_metadata.trace_run_id
    if trace_metadata.trace_url:
        payload["langsmith_trace_url"] = trace_metadata.trace_url
    return payload


def _discard_thread_checkpoints(saver: Any, thread_id: str | None) -> None:
    """Drop one thread's checkpoints once its run is over.

    LangGraph writes the whole graph state after every node, and Prompt2Blog's
    state grows as it goes: sources, cleaned data, each draft, each audit. A
    run therefore leaves behind a stack of snapshots roughly as large as the
    run itself, and nothing ever removed them -- the shared checkpoint database
    had reached 305 MB.

    Checkpoints exist so an interrupted run can resume. Nothing in this
    codebase resumes one; there is no call to `get_state`, `update_state`, or a
    replay config anywhere. Keeping them past the end of a run buys storage and
    nothing else, so a finished run drops its own.

    Best effort by design: retention is housekeeping, and a run that has
    already produced its article must not fail because a cleanup delete did.
    """
    if saver is None or not thread_id:
        return
    delete_thread = getattr(saver, "delete_thread", None)
    if not callable(delete_thread):
        return
    try:
        delete_thread(thread_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not discard LangGraph checkpoints for thread %s (%s: %s)",
            thread_id,
            type(exc).__name__,
            exc,
        )


@contextmanager
def langgraph_checkpoint(
    *,
    discard_thread: str | None = None,
) -> Generator[Any | None, None, None]:
    """
    Yield a SQLite checkpoint saver when available.

    If langgraph or sqlite checkpoint extras are unavailable, yields None.

    ``discard_thread`` names a thread whose checkpoints are dropped on the way
    out, whether the run succeeded or raised. Pass it from any caller that has
    no resume path, which today is all of them.
    """
    if not langgraph_is_available():
        yield None
        return

    try:
        from langgraph.checkpoint.sqlite import SqliteSaver
    except Exception:
        yield None
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint_path = Path(LANGGRAPH_CHECKPOINT_PATH).resolve()
    with SqliteSaver.from_conn_string(str(checkpoint_path)) as saver:
        try:
            yield saver
        finally:
            _discard_thread_checkpoints(saver, discard_thread)


@asynccontextmanager
async def langgraph_checkpoint_async() -> AsyncGenerator[Any | None, None]:
    """
    Yield an async SQLite checkpoint saver when available.

    If async sqlite checkpoint extras are unavailable, yields None.
    """
    if not langgraph_is_available():
        yield None
        return

    try:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
    except Exception:
        yield None
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint_path = Path(LANGGRAPH_CHECKPOINT_PATH).resolve()
    async with AsyncExitStack() as stack:
        try:
            async with asyncio.timeout(ASYNC_CHECKPOINT_OPEN_TIMEOUT_SECONDS):
                saver = await stack.enter_async_context(
                    AsyncSqliteSaver.from_conn_string(str(checkpoint_path))
                )
        except Exception as exc:
            logger.warning(
                "Async LangGraph SQLite checkpoint unavailable; continuing without "
                "checkpointing (%s: %s)",
                type(exc).__name__,
                exc,
            )
            yield None
            return

        yield saver
