import pytest
import sqlite3
import subprocess


def test_save_credential_keeps_token_out_of_command_and_database(tmp_path, monkeypatch):
    import app.core.database as database
    from app.features.claude_connection import prompt2blog_credential

    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "pipeline.db")
    database.ensure_core_tables()

    secret = "sk-ant-oat01-PROMPT2BLOG-ONLY"
    # Saving makes two calls now: the add, then a lookup confirming the item is
    # really there. Every call is kept so the assertions below can name the one
    # they mean rather than whichever happened to run last.
    calls: list[dict] = []

    def fake_run(args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(prompt2blog_credential.subprocess, "run", fake_run)

    status = prompt2blog_credential.save_credential(
        label="Article account",
        token=secret,
    )

    observed = calls[0]

    # The token travels on stdin as part of a `security -i` command line, so it
    # never reaches argv. It must not be handed to the interactive `-w` prompt:
    # that prompt reads the terminal, not stdin, and the call hangs there.
    assert observed["args"] == ["/usr/bin/security", "-i"]
    # And it must not reach argv on any of the other calls either.
    assert not any(secret in " ".join(call["args"]) for call in calls)
    assert observed["kwargs"]["input"] == (
        "add-generic-password"
        " -a prompt2blog"
        " -s com.questurian.prompt2blog.claude"
        " -U"
        f" -w {secret}\n"
    )
    assert secret not in " ".join(observed["args"])
    assert status["configured"] is True
    assert status["label"] == "Article account"
    assert secret not in repr(status)

    with sqlite3.connect(database.DB_PATH) as connection:
        rows = connection.execute(
            "SELECT slot_id, label FROM claude_credentials"
        ).fetchall()
        dump = "\n".join(connection.iterdump())

    assert rows == [("prompt2blog", "Article account")]
    assert secret not in dump


def test_load_credential_reads_keychain_and_redacts_its_representation(
    tmp_path,
    monkeypatch,
):
    import app.core.database as database
    from app.features.claude_connection import prompt2blog_credential

    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "pipeline.db")
    database.ensure_core_tables()
    with database.get_db_connection() as connection:
        connection.execute(
            "INSERT INTO claude_credentials (slot_id, label, updated_at) "
            "VALUES (?, ?, ?)",
            ("prompt2blog", "Article account", "2026-08-28T12:00:00+00:00"),
        )

    secret = "sk-ant-oat01-PROMPT2BLOG-ONLY"

    def fake_run(args, **kwargs):
        assert args == [
            "/usr/bin/security",
            "find-generic-password",
            "-a",
            "prompt2blog",
            "-s",
            "com.questurian.prompt2blog.claude",
            "-w",
        ]
        return subprocess.CompletedProcess(
            args=args,
            returncode=0,
            stdout=secret + "\n",
            stderr="",
        )

    monkeypatch.setattr(prompt2blog_credential.subprocess, "run", fake_run)

    credential = prompt2blog_credential.load_credential()

    assert credential.label == "Article account"
    assert credential.token == secret
    assert secret not in repr(credential)


def test_save_credential_rejects_a_token_with_whitespace(tmp_path, monkeypatch):
    """A pasted token that wrapped would silently truncate the stdin command."""
    import app.core.database as database
    from app.features.claude_connection import prompt2blog_credential

    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "pipeline.db")
    database.ensure_core_tables()

    def fail_run(args, **kwargs):
        raise AssertionError("security must not be called for a malformed token")

    monkeypatch.setattr(prompt2blog_credential.subprocess, "run", fail_run)

    with pytest.raises(prompt2blog_credential.Prompt2BlogCredentialError):
        prompt2blog_credential.save_credential(
            label="Article account",
            token="sk-ant-oat01-AAA BBB",
        )
