"""The two halves of the Prompt2Blog Claude credential, and telling the truth
about both.

A row in the database says an account was connected. The secret itself lives in
the macOS Keychain. Only the row was ever checked, so the status read
"connected, Article account" for two days while the Keychain held nothing --
and the first anyone heard of it was a failed hand-off to the writer, after the
grill, the brief, the research plan and twenty minutes of web searches had all
been paid for.
"""

from __future__ import annotations

import subprocess

import pytest

from app.features.claude_connection import prompt2blog_credential as module


class _Row(dict):
    def __getitem__(self, key):  # sqlite3.Row access style
        return dict.__getitem__(self, key)


def _with_row(monkeypatch, row):
    class _Cursor:
        def fetchone(self):
            return row

    class _Connection:
        def execute(self, *_args):
            return _Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

    monkeypatch.setattr(module, "get_db_connection", lambda: _Connection())


def _keychain(monkeypatch, returncode: int):
    def fake_run(*_args, **_kwargs):
        return subprocess.CompletedProcess(args=[], returncode=returncode, stdout="", stderr="")

    monkeypatch.setattr(module.subprocess, "run", fake_run)


def test_a_connected_account_with_its_secret_reads_as_configured(monkeypatch):
    _with_row(monkeypatch, _Row(label="Article account", updated_at="2026-08-28T23:58:05+00:00"))
    _keychain(monkeypatch, 0)

    status = module.credential_status()

    assert status["configured"] is True
    assert status["secretPresent"] is True
    assert status["label"] == "Article account"


def test_a_row_whose_secret_has_vanished_is_not_configured(monkeypatch):
    """What actually happened on 2026-08-30."""
    _with_row(monkeypatch, _Row(label="Article account", updated_at="2026-08-28T23:58:05+00:00"))
    _keychain(monkeypatch, 44)  # SecKeychainSearchCopyNext: item not found

    status = module.credential_status()

    assert status["configured"] is False
    assert status["secretPresent"] is False
    assert "no longer in the Keychain" in status["message"]
    assert "2026-08-28" in status["message"], "say when it was connected"


def test_no_row_at_all_reads_as_never_connected(monkeypatch):
    _with_row(monkeypatch, None)

    status = module.credential_status()

    assert status["configured"] is False
    assert status["secretPresent"] is False
    assert status["label"] is None


def test_an_unreachable_keychain_is_not_reported_as_a_missing_secret(monkeypatch):
    """Not proof of absence.

    Calling it missing would send the operator off to reconnect a credential
    that is probably fine.
    """
    _with_row(monkeypatch, _Row(label="Article account", updated_at="2026-08-28T23:58:05+00:00"))

    def explode(*_args, **_kwargs):
        raise OSError("security is unavailable")

    monkeypatch.setattr(module.subprocess, "run", explode)

    assert module.credential_status()["configured"] is True


def test_the_check_never_asks_for_the_password(monkeypatch):
    """`-w` prints the secret. Existence does not need it."""
    seen: list[list[str]] = []

    def fake_run(args, **_kwargs):
        seen.append(list(args))
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(module.subprocess, "run", fake_run)

    module._keychain_item_present()

    assert seen, "it has to actually ask the Keychain"
    assert "-w" not in seen[0]


def test_a_save_that_did_not_take_is_not_recorded_as_connected(monkeypatch):
    """The exit code said yes and the item was not there.

    Recording the row anyway is what produces a database claiming an account is
    connected with no secret behind it.
    """
    monkeypatch.setattr(module, "_keychain_item_present", lambda: False)

    def fake_run(*_args, **_kwargs):
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")

    monkeypatch.setattr(module.subprocess, "run", fake_run)

    with pytest.raises(module.Prompt2BlogCredentialError, match="not there"):
        module.save_credential(label="Article account", token="sk-ant-oat01-EXAMPLE")
