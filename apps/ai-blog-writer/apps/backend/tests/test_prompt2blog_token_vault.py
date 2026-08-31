"""The operator's own copy of the article token, on this machine only.

The Keychain item vanished twice on 2026-08-30 with no cause anyone could find,
each time stranding a run at the hand-off to the writer -- after the grill, the
brief, the plan and twenty minutes of web searches had all been paid for. This
is the vault the Keychain is restored from, so the loss costs a silent write
instead of a new token.
"""

from __future__ import annotations

import subprocess

import pytest

from app.features.claude_connection import prompt2blog_credential as module

TOKEN = "sk-ant-oat01-EXAMPLE-NOT-A-REAL-TOKEN"


@pytest.fixture
def vault(tmp_path, monkeypatch):
    path = tmp_path / "prompt2blog-claude-token"
    monkeypatch.setenv(module.TOKEN_FILE_ENV, str(path))
    return path


def _store(path, token: str = TOKEN, mode: int = 0o600):
    path.write_text(token, encoding="utf-8")
    path.chmod(mode)
    return path


def test_the_stored_token_is_read(vault):
    _store(vault)

    assert module.token_from_file() == TOKEN


def test_no_file_is_not_an_error(vault):
    assert module.token_from_file() is None


def test_a_file_anyone_can_read_is_refused_rather_than_used(vault, caplog):
    """A secret at mode 644 is a secret every process on the machine already
    has, and using it quietly would hide that."""
    _store(vault, mode=0o644)

    assert module.token_from_file() is None
    assert "chmod 600" in caplog.text


def test_a_group_readable_file_is_refused_too(vault):
    _store(vault, mode=0o640)

    assert module.token_from_file() is None


def test_a_token_that_picked_up_a_line_break_is_refused(vault):
    """Handing a broken token to the CLI produces an auth failure that reads
    like a revoked account."""
    _store(vault, token="sk-ant-oat01-BROKEN TOKEN")

    assert module.token_from_file() is None


def test_trailing_whitespace_from_a_paste_is_trimmed(vault):
    _store(vault, token=f"  {TOKEN}\n")

    assert module.token_from_file() == TOKEN


def test_the_default_path_is_outside_the_repository():
    """A token inside the repo is one `git add .` from a remote, and the
    reflog keeps it after the file is deleted."""
    from pathlib import Path

    repo = Path(__file__).resolve().parents[4]

    assert repo not in module.DEFAULT_TOKEN_FILE.parents


def test_nothing_in_this_module_writes_the_token_file():
    """The operator creates it. Code that wrote secrets to disk on its own
    would be a second place for them to leak from."""
    import inspect

    source = inspect.getsource(module)

    assert "token_file_path().write_text" not in source
    assert ".write_text(" not in source.split("def token_from_file")[0]


# --- what happens when the Keychain has lost it again ----------------------


def _keychain(monkeypatch, *, present: bool, writes: list | None = None):
    def fake_run(args, **kwargs):
        if args[:2] == [module.SECURITY_CLI, "-i"]:
            if writes is not None:
                writes.append(kwargs.get("input", ""))
            return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")
        if "find-generic-password" in args:
            return subprocess.CompletedProcess(
                args=args,
                returncode=0 if present else 44,
                stdout=TOKEN if present else "",
                stderr="",
            )
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(module.subprocess, "run", fake_run)


def _row(monkeypatch, row):
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


def test_a_lost_keychain_item_is_restored_from_the_stored_copy(vault, monkeypatch):
    _store(vault)
    _row(monkeypatch, {"label": "Article account", "updated_at": "2026-08-31T04:09:48+00:00"})
    writes: list = []
    _keychain(monkeypatch, present=False, writes=writes)

    credential = module.load_credential()

    assert credential.token == TOKEN
    assert writes, "the Keychain should have been repaired, not just worked around"
    assert TOKEN in writes[0]


def test_without_a_stored_copy_it_says_where_it_looked(vault, monkeypatch):
    _row(monkeypatch, {"label": "Article account", "updated_at": "2026-08-31T04:09:48+00:00"})
    _keychain(monkeypatch, present=False)

    with pytest.raises(module.Prompt2BlogCredentialError, match="no stored copy"):
        module.load_credential()


def test_the_status_says_it_will_repair_itself(vault, monkeypatch):
    _store(vault)
    _row(monkeypatch, {"label": "Article account", "updated_at": "2026-08-31T04:09:48+00:00"})
    _keychain(monkeypatch, present=False)

    status = module.credential_status()

    assert status["configured"] is True
    assert status["secretPresent"] is False
    assert status["restorableFromFile"] is True
    assert "restored automatically" in status["message"]


def test_the_builder_account_is_never_swapped_for_the_machine_login(monkeypatch):
    """Two accounts exist on this machine and the pipeline must always bill the
    same one.

    Falling back to whatever `claude` happens to be signed into would bill the
    wrong account while everything looked fine, which is the exact failure this
    credential exists to prevent. Missing means refuse.
    """
    import app.features.prompt2blog.api.runs as runs_api
    from fastapi import HTTPException

    monkeypatch.setattr(
        runs_api, "claude_provider", lambda: runs_api.CLAUDE_PROVIDER_SUBSCRIPTION_CLI
    )

    def missing():
        raise module.Prompt2BlogCredentialError("nothing stored anywhere")

    monkeypatch.setattr(runs_api, "load_credential", missing)

    with pytest.raises(HTTPException) as raised:
        runs_api._prompt2blog_credential_for_run()

    assert raised.value.status_code == 409
