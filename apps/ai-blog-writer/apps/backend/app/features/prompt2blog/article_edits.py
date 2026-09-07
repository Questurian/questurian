"""Applying an edit and recording it are one write, or they are neither.

The route read the article, checked the proposal's section hash against it,
wrote the new markdown, and then wrote the edit history. Four steps, no lock,
two separate writes.

Two tabs read revision 10. Each changes a different section. Each section hash
passes, because each is checking a section the other did not touch. The second
whole-document write is built from the markdown *it* read, so it discards the
first edit -- and both edits are in the history, so nothing afterwards says an
accepted change is missing from the article it was accepted into.

The fix is a compare-and-swap on a revision number, inside one transaction that
holds the write lock from the moment it reads. The model call happens outside
it: a transaction held open across a network round trip is a lock held for as
long as a provider feels like taking, and every other writer waits behind it.

What this module does not do is decide whether an edit is any good. It is
handed a function that turns the current markdown and history into the next
ones, and that function is run *inside* the transaction against what is
actually stored -- so the validation a caller does is validation of the
document the write will land on, not of a copy read some seconds ago.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.core.database import transaction

from .observability import _now_iso
from .section_edit_v4 import SECTION_EDIT_STAGE, EditHistory
from .support import _safe_dict


class ArticleMissing(LookupError):
    """This run has no stored article, so there is nothing to edit."""


class RevisionConflict(RuntimeError):
    """The article moved after this edit was proposed.

    Carries both revisions so a caller can say what happened rather than
    guessing at it: an edit refused because a colleague saved is a different
    sentence from an edit refused because the run was resumed.
    """

    def __init__(self, expected: int, actual: int) -> None:
        super().__init__(
            f"This edit was written against revision {expected}; the article "
            f"is now at revision {actual}."
        )
        self.expected = expected
        self.actual = actual


class EditRefused(RuntimeError):
    """The edit was checked against the stored article and does not apply."""


@dataclass(frozen=True)
class ArticleState:
    """The article, its history, and which version of it this is."""

    run_id: str
    markdown: str
    revision: int
    history: EditHistory


@dataclass(frozen=True)
class CommitResult:
    markdown: str
    revision: int
    history: EditHistory
    # True when this exact edit had already been applied and the transaction
    # wrote nothing. The caller's answer is the same either way, which is the
    # point: a double-click and a retried request are not two edits.
    already_applied: bool = False


def _read_history(conn: Any, run_id: str) -> EditHistory:
    row = conn.execute(
        "SELECT data FROM stages WHERE run_id = ? AND stage = ?",
        (run_id, SECTION_EDIT_STAGE),
    ).fetchone()
    if not row:
        return EditHistory()
    stored = _safe_dict(_safe_dict(json.loads(row["data"])).get("data"))
    return EditHistory.model_validate(stored) if stored else EditHistory()


def read_article(run_id: str) -> ArticleState:
    """The current article and history, read together.

    Together rather than in two calls, so the revision a caller is told about
    is the revision the history it is holding belongs to.
    """
    with transaction() as conn:
        row = conn.execute(
            "SELECT markdown, article_revision FROM outputs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if not row:
            raise ArticleMissing(f"Run {run_id} has no stored article.")
        return ArticleState(
            run_id=run_id,
            markdown=row["markdown"],
            revision=row["article_revision"],
            history=_read_history(conn, run_id),
        )


def commit_article_edit(
    *,
    run_id: str,
    expected_revision: int | None,
    edit: Callable[[str, EditHistory], tuple[str, EditHistory]],
    edit_id: str = "",
) -> CommitResult:
    """Run `edit` against the stored article and write both halves at once.

    `edit` is called inside the transaction, on the markdown and history as
    they actually are. It returns the next pair or raises `EditRefused`; a
    refusal rolls the transaction back, so a rejected edit leaves the article
    exactly as it was rather than half-written.

    `expected_revision` is the compare-and-swap. `None` skips the check, which
    is for callers that genuinely do not care which version they land on --
    there are none in the editor, and passing `None` from a route is a bug
    rather than a shortcut.

    `edit_id` makes a repeat harmless. A network retry or a second click sends
    the same proposal twice, and the second one arrives against a revision the
    first one advanced past -- which would be reported as a conflict and send
    an editor to re-read prose that already says what they wanted. An id
    already in the history returns the current state and writes nothing.
    """
    with transaction() as conn:
        row = conn.execute(
            "SELECT markdown, article_revision FROM outputs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if not row:
            raise ArticleMissing(f"Run {run_id} has no stored article.")
        markdown = row["markdown"]
        revision = row["article_revision"]
        history = _read_history(conn, run_id)

        if edit_id and any(applied.edit_id == edit_id for applied in history.edits):
            return CommitResult(
                markdown=markdown,
                revision=revision,
                history=history,
                already_applied=True,
            )

        if expected_revision is not None and expected_revision != revision:
            raise RevisionConflict(expected_revision, revision)

        next_markdown, next_history = edit(markdown, history)

        # `WHERE article_revision = ?` as well as the read above. The read is
        # already under the write lock, so this cannot fail -- and if the lock
        # ever stops being held for the whole block, this is what turns that
        # into a lost update refused instead of a lost update written.
        updated = conn.execute(
            "UPDATE outputs SET markdown = ?, article_revision = ? "
            "WHERE run_id = ? AND article_revision = ?",
            (next_markdown, revision + 1, run_id, revision),
        )
        if updated.rowcount != 1:
            raise RevisionConflict(revision, revision)

        conn.execute(
            """
            INSERT INTO stages (run_id, stage, data, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(run_id, stage) DO UPDATE SET
                data = excluded.data,
                created_at = excluded.created_at
            """,
            (
                run_id,
                SECTION_EDIT_STAGE,
                json.dumps(
                    {
                        "created_at": _now_iso(),
                        "data": next_history.model_dump(mode="json"),
                    },
                    default=str,
                ),
                _now_iso(),
            ),
        )
        return CommitResult(
            markdown=next_markdown,
            revision=revision + 1,
            history=next_history,
        )
