from __future__ import annotations

from typing import Any

import pytest

from app.ai_graph import runtime


class _FakeSaver:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete_thread(self, thread_id: str) -> None:
        self.deleted.append(thread_id)


class _RaisingSaver(_FakeSaver):
    def delete_thread(self, thread_id: str) -> None:
        raise RuntimeError("database is locked")


class _OldSaver:
    """A saver from a langgraph version without delete_thread."""


def _patch_saver(monkeypatch, saver: Any) -> None:
    class _Ctx:
        def __enter__(self):  # noqa: ANN204
            return saver

        def __exit__(self, *exc: object) -> bool:
            return False

    class _FakeSqliteSaver:
        @staticmethod
        def from_conn_string(_path: str):  # noqa: ANN205
            return _Ctx()

    import sys
    import types

    module = types.ModuleType("langgraph.checkpoint.sqlite")
    module.SqliteSaver = _FakeSqliteSaver
    monkeypatch.setitem(sys.modules, "langgraph.checkpoint.sqlite", module)
    monkeypatch.setattr(runtime, "langgraph_is_available", lambda: True)


def test_a_finished_run_discards_its_checkpoints(monkeypatch):
    saver = _FakeSaver()
    _patch_saver(monkeypatch, saver)

    with runtime.langgraph_checkpoint(discard_thread="run-123") as checkpointer:
        assert checkpointer is saver

    assert saver.deleted == ["run-123"]


def test_a_failed_run_still_discards_its_checkpoints(monkeypatch):
    saver = _FakeSaver()
    _patch_saver(monkeypatch, saver)

    with pytest.raises(RuntimeError, match="stage exploded"):
        with runtime.langgraph_checkpoint(discard_thread="run-456"):
            raise RuntimeError("stage exploded")

    assert saver.deleted == ["run-456"]


def test_without_a_thread_nothing_is_discarded(monkeypatch):
    saver = _FakeSaver()
    _patch_saver(monkeypatch, saver)

    with runtime.langgraph_checkpoint():
        pass

    assert saver.deleted == []


def test_a_failed_delete_does_not_fail_the_run(monkeypatch):
    # Retention is housekeeping. A run that has already produced its article
    # must not fail because a cleanup delete did.
    _patch_saver(monkeypatch, _RaisingSaver())

    with runtime.langgraph_checkpoint(discard_thread="run-789"):
        pass


def test_a_saver_without_delete_thread_is_tolerated(monkeypatch):
    _patch_saver(monkeypatch, _OldSaver())

    with runtime.langgraph_checkpoint(discard_thread="run-000"):
        pass
