"""Prompt2Blog-only Claude credential stored in macOS Keychain."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.core.database import get_db_connection


SECURITY_CLI = "/usr/bin/security"
KEYCHAIN_SERVICE = "com.questurian.prompt2blog.claude"
SLOT_ID = "prompt2blog"
KEYCHAIN_TIMEOUT_SECONDS = 20.0
KEYCHAIN_ITEM_NOT_FOUND = 44


class Prompt2BlogCredentialError(RuntimeError):
    """Keychain credential could not be saved, read, or removed."""


@dataclass(frozen=True)
class Prompt2BlogCredential:
    label: str
    token: str = field(repr=False)
    updated_at: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def credential_status() -> dict[str, Any]:
    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT label, updated_at FROM claude_credentials WHERE slot_id = ?",
            (SLOT_ID,),
        ).fetchone()
    if row is None:
        return {"configured": False, "label": None, "updatedAt": None}
    return {
        "configured": True,
        "label": str(row["label"]),
        "updatedAt": str(row["updated_at"]),
    }


def save_credential(*, label: str, token: str) -> dict[str, Any]:
    cleaned_label = label.strip()
    cleaned_token = token.strip()
    if not cleaned_label or not cleaned_token:
        raise Prompt2BlogCredentialError("Account label and token are required.")
    if any(character.isspace() for character in cleaned_token):
        raise Prompt2BlogCredentialError(
            "That does not look like a Claude setup token: it contains a space "
            "or a line break."
        )

    # `add-generic-password -w` with no value does not read the password from
    # stdin -- it PROMPTS for it, twice, on the controlling terminal. A piped
    # token is therefore either ignored (the item is written with an empty
    # secret) or never consumed at all, and the call sits until it times out.
    # Under uvicorn, started from a terminal, it is the second one.
    #
    # `security -i` reads the whole command from stdin instead: no prompt, a
    # real exit code, and the token still never appears in argv, so it cannot
    # be read out of `ps` -- which is why the prompt was being used at all.
    args = [SECURITY_CLI, "-i"]
    command = (
        "add-generic-password"
        f" -a {SLOT_ID}"
        f" -s {KEYCHAIN_SERVICE}"
        " -U"
        f" -w {cleaned_token}\n"
    )
    try:
        completed = subprocess.run(
            args,
            input=command,
            capture_output=True,
            text=True,
            timeout=KEYCHAIN_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise Prompt2BlogCredentialError(
            "Could not store Prompt2Blog's Claude account in macOS Keychain."
        ) from error
    if completed.returncode != 0:
        raise Prompt2BlogCredentialError(
            "Could not store Prompt2Blog's Claude account in macOS Keychain."
        )

    updated_at = _now_iso()
    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO claude_credentials (slot_id, label, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(slot_id) DO UPDATE SET
                label = excluded.label,
                updated_at = excluded.updated_at
            """,
            (SLOT_ID, cleaned_label, updated_at),
        )
    return {
        "configured": True,
        "label": cleaned_label,
        "updatedAt": updated_at,
    }


def load_credential() -> Prompt2BlogCredential:
    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT label, updated_at FROM claude_credentials WHERE slot_id = ?",
            (SLOT_ID,),
        ).fetchone()
    if row is None:
        raise Prompt2BlogCredentialError(
            "Connect Prompt2Blog's Claude article account before starting a run."
        )

    args = [
        SECURITY_CLI,
        "find-generic-password",
        "-a",
        SLOT_ID,
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
    ]
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=KEYCHAIN_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise Prompt2BlogCredentialError(
            "Could not read Prompt2Blog's Claude account from macOS Keychain."
        ) from error
    token = (completed.stdout or "").strip()
    if completed.returncode != 0 or not token:
        raise Prompt2BlogCredentialError(
            "Could not read Prompt2Blog's Claude account from macOS Keychain."
        )
    return Prompt2BlogCredential(
        label=str(row["label"]),
        token=token,
        updated_at=str(row["updated_at"]),
    )


def delete_credential() -> dict[str, Any]:
    args = [
        SECURITY_CLI,
        "delete-generic-password",
        "-a",
        SLOT_ID,
        "-s",
        KEYCHAIN_SERVICE,
    ]
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=KEYCHAIN_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise Prompt2BlogCredentialError(
            "Could not remove Prompt2Blog's Claude account from macOS Keychain."
        ) from error
    if completed.returncode not in (0, KEYCHAIN_ITEM_NOT_FOUND):
        raise Prompt2BlogCredentialError(
            "Could not remove Prompt2Blog's Claude account from macOS Keychain."
        )

    with get_db_connection() as connection:
        connection.execute(
            "DELETE FROM claude_credentials WHERE slot_id = ?",
            (SLOT_ID,),
        )
    return {"configured": False, "label": None, "updatedAt": None}
