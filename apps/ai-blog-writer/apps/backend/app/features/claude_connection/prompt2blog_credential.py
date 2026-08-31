"""Prompt2Blog-only Claude credential stored in macOS Keychain."""

from __future__ import annotations

import os
import stat
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import logging

from app.core.database import get_db_connection

logger = logging.getLogger(__name__)


# A copy of the token, on this machine, outside the repository.
#
# The Keychain item has vanished twice with no cause anyone could find, each
# time stranding a run at the hand-off to the writer after the grill, the
# brief, the plan and twenty minutes of web searches had all been paid for.
# This is the vault the Keychain is restored from when that happens, so the
# ceremony of minting a new token stops being a weekly event.
#
# Outside the repository on purpose. A token inside it is one `git add .` from
# a remote, and the reflog keeps it after the file is deleted. Nothing in this
# module ever writes the file: the operator creates it, and the mode check
# below refuses to read it if anyone else on the machine could.
TOKEN_FILE_ENV = "P2B_CLAUDE_TOKEN_FILE"
DEFAULT_TOKEN_FILE = Path.home() / ".questurian" / "prompt2blog-claude-token"
# Owner read/write and nothing else. Anything looser and the file is refused.
TOKEN_FILE_MAX_MODE = 0o600

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


def _write_keychain_item(token: str) -> None:
    """Put the secret in the Keychain.

    `add-generic-password -w` with no value does not read the password from
    stdin -- it PROMPTS for it, twice, on the controlling terminal. A piped
    token is therefore either ignored (the item is written with an empty
    secret) or never consumed at all, and the call sits until it times out.
    Under uvicorn, started from a terminal, it is the second one.

    `security -i` reads the whole command from stdin instead: no prompt, a real
    exit code, and the token still never appears in argv, so it cannot be read
    out of `ps` -- which is why the prompt was being used at all.
    """
    command = (
        "add-generic-password"
        f" -a {SLOT_ID}"
        f" -s {KEYCHAIN_SERVICE}"
        " -U"
        f" -w {token}\n"
    )
    try:
        completed = subprocess.run(
            [SECURITY_CLI, "-i"],
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


def token_file_path() -> Path:
    """Where the operator's copy of the token lives on this machine."""
    override = os.environ.get(TOKEN_FILE_ENV, "").strip()
    return Path(override).expanduser() if override else DEFAULT_TOKEN_FILE


def token_from_file() -> str | None:
    """The token the operator stored, or None.

    Refused rather than read when the file is readable by anyone but its owner.
    A secret sitting at mode 644 is a secret every process on the machine
    already has, and silently using it would hide that.
    """
    path = token_file_path()
    try:
        mode = stat.S_IMODE(path.stat().st_mode)
    except OSError:
        return None
    if mode & ~TOKEN_FILE_MAX_MODE:
        logger.error(
            "Refusing to read %s: mode %o lets somebody other than its owner "
            "read the token. Run: chmod 600 %s",
            path,
            mode,
            path,
        )
        return None
    try:
        token = path.read_text(encoding="utf-8").strip()
    except OSError as error:
        logger.warning("Could not read the stored Claude token: %s", error)
        return None
    # A pasted token that picked up a line break is not a token, and handing a
    # broken one to the CLI produces an auth failure that reads like a revoked
    # account.
    return token if token and not any(c.isspace() for c in token) else None


def _keychain_item_present() -> bool:
    """Is the secret still in the Keychain?

    Asked without `-w`, so this reads the item's metadata and never the token
    itself. The two halves of this credential can drift apart -- the row saying
    an account is connected, the Keychain holding nothing -- and only one of
    them was ever checked.
    """
    try:
        completed = subprocess.run(
            [
                SECURITY_CLI,
                "find-generic-password",
                "-a",
                SLOT_ID,
                "-s",
                KEYCHAIN_SERVICE,
            ],
            capture_output=True,
            text=True,
            timeout=KEYCHAIN_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        # Unreachable Keychain is not proof of a missing secret, and calling it
        # missing would send the operator to reconnect a credential that is
        # probably fine. Say what is true: this could not be checked.
        return True
    return completed.returncode == 0


def credential_status() -> dict[str, Any]:
    """Whether an account is connected, checking both halves.

    The row alone used to answer this. It said "connected, Article account" for
    two days while the Keychain held nothing, so the first anyone heard of it
    was a failed hand-off to the writer -- after the grill, the brief, the
    research plan and twenty minutes of web searches had all been paid for.
    """
    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT label, updated_at FROM claude_credentials WHERE slot_id = ?",
            (SLOT_ID,),
        ).fetchone()
    if row is None:
        return {
            "configured": False,
            "label": None,
            "updatedAt": None,
            "secretPresent": False,
        }
    present = _keychain_item_present()
    # The stored copy counts: a missing Keychain item is repaired from it at
    # the moment a run needs the token, so a run with a stored copy behind it
    # is not stranded and must not be reported as disconnected.
    stored = not present and token_from_file() is not None
    usable = present or stored
    return {
        # Not configured unless it would actually work. A connection that
        # cannot produce a token is not a connection.
        "configured": usable,
        "label": str(row["label"]),
        "updatedAt": str(row["updated_at"]),
        "secretPresent": present,
        "restorableFromFile": stored,
        **(
            {}
            if present
            else {
                "message": (
                    "The Keychain lost this account's secret again. There is a "
                    f"stored copy at {token_file_path()} and it will be "
                    "restored automatically on the next run."
                )
            }
            if stored
            else {
                "message": (
                    "This account was connected on "
                    + str(row["updated_at"])
                    + " but its secret is no longer in the Keychain. "
                    "Reconnect it before starting a run."
                )
            }
        ),
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
    _write_keychain_item(cleaned_token)
    # Trusting the exit code is not the same as the item being there. The row
    # and the secret have drifted apart twice, each time leaving a database
    # saying "connected" with nothing behind it, and the first anyone heard was
    # a failed hand-off to the writer after a whole intake had been paid for.
    # If the write did not take, say so now rather than recording a connection
    # that does not exist.
    if not _keychain_item_present():
        raise Prompt2BlogCredentialError(
            "The Keychain reported success but the account is not there. "
            "Nothing was saved; try connecting again."
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
        # The Keychain has lost this item twice with no cause anyone found, so
        # the operator's own copy is the vault behind it. Restoring the
        # Keychain from the file means the loss costs one silent write rather
        # than a new token and a stranded run.
        stored = token_from_file()
        if not stored:
            raise Prompt2BlogCredentialError(
                "Could not read Prompt2Blog's Claude account from macOS "
                "Keychain, and no stored copy was found at "
                f"{token_file_path()}."
            )
        logger.warning(
            "Keychain item missing; restoring it from %s", token_file_path()
        )
        try:
            _write_keychain_item(stored)
        except Prompt2BlogCredentialError as error:
            # The run can still go ahead on the stored token; only the repair
            # failed. Saying nothing here would hide a Keychain that has
            # stopped accepting writes at all.
            logger.error("Could not restore the Keychain item: %s", error)
        token = stored
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
