import sqlite3
import subprocess


def test_save_credential_keeps_token_out_of_command_and_database(tmp_path, monkeypatch):
    import app.core.database as database
    from app.features.claude_connection import prompt2blog_credential

    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "pipeline.db")
    database.ensure_core_tables()

    secret = "sk-ant-oat01-PROMPT2BLOG-ONLY"
    observed = {}

    def fake_run(args, **kwargs):
        observed.update(args=args, kwargs=kwargs)
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(prompt2blog_credential.subprocess, "run", fake_run)

    status = prompt2blog_credential.save_credential(
        label="Article account",
        token=secret,
    )

    assert observed["args"] == [
        "/usr/bin/security",
        "add-generic-password",
        "-a",
        "prompt2blog",
        "-s",
        "com.questurian.prompt2blog.claude",
        "-U",
        "-w",
    ]
    assert observed["kwargs"]["input"] == secret + "\n"
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
