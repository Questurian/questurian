"""Applying an edit and recording it are one write, or they are neither.

Every test here runs against a real SQLite file in a temporary directory, and
the concurrency ones use two separate connections through two threads with a
barrier between them -- because the bug being fixed is invisible to a single
in-process caller. An in-process lock would pass a test written that way and
still lose an edit between two workers.
"""

from __future__ import annotations

import json
import sqlite3
import threading

import pytest

from app.core.database import get_db_connection
from app.core.storage import read_output, write_artifact
from app.features.prompt2blog.article_edits import (
    ArticleMissing,
    EditRefused,
    RevisionConflict,
    commit_article_edit,
    read_article,
)
from app.features.prompt2blog.section_edit_v4 import (
    SECTION_EDIT_STAGE,
    AppliedEdit,
    EditHistory,
)

ARTICLE = (
    "The direct answer.\n\n"
    "## Prices\n\nA costs $20.\n\n"
    "## Getting there\n\nThe bus runs hourly.\n"
)


@pytest.fixture
def run(isolated_db):
    """A finished run with an article, on a temporary database."""
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO runs (run_id, feature, status, stage, created_at, "
            "updated_at) VALUES (?, 'prompt2blog', 'completed', 'complete', "
            "'now', 'now')",
            ("run-1",),
        )
    write_artifact("run-1", {"pipeline_v3": {}, "markdown": ARTICLE})
    return "run-1"


def _replace(section: str, text: str):
    """An edit that rewrites one section and files it, as the route's does."""

    def edit(markdown: str, history: EditHistory) -> tuple[str, EditHistory]:
        if section not in markdown:
            raise EditRefused(f"{section} is not in this draft")
        return (
            markdown.replace(section, text),
            EditHistory(
                original_markdown=history.original_markdown or markdown,
                edits=[
                    *history.edits,
                    AppliedEdit(section_id="s1", action_id="shorten", previous_markdown=markdown),
                ],
            ),
        )

    return edit


def _stored_history(run_id: str) -> dict:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT data FROM stages WHERE run_id = ? AND stage = ?",
            (run_id, SECTION_EDIT_STAGE),
        ).fetchone()
    return json.loads(row["data"])["data"] if row else {}


def test_a_first_edit_advances_the_revision(run):
    state = read_article(run)
    assert state.revision == 0

    result = commit_article_edit(
        run_id=run,
        expected_revision=0,
        edit=_replace("A costs $20.", "A is $20."),
    )

    assert result.revision == 1
    assert "A is $20." in result.markdown
    assert read_article(run).revision == 1
    assert len(_stored_history(run)["edits"]) == 1


def test_an_edit_against_an_old_revision_is_refused(run):
    commit_article_edit(
        run_id=run,
        expected_revision=0,
        edit=_replace("A costs $20.", "A is $20."),
    )

    with pytest.raises(RevisionConflict) as raised:
        commit_article_edit(
            run_id=run,
            expected_revision=0,
            edit=_replace("The bus runs hourly.", "Buses run hourly."),
        )

    assert raised.value.expected == 0
    assert raised.value.actual == 1
    # And the refusal wrote nothing.
    assert "Buses run hourly." not in read_article(run).markdown


def test_two_writers_on_the_same_revision_do_not_lose_an_edit(run):
    """The lost update, reproduced with two connections and a barrier.

    Both threads read revision 0 and edit different sections, so each one's
    section hash would pass against the draft it read. Without the write lock
    held across the read, the second write is built from stale markdown and
    discards the first edit.
    """
    started = threading.Barrier(2)
    outcomes: dict[str, object] = {}

    def attempt(name: str, edit) -> None:
        started.wait(timeout=5)
        try:
            outcomes[name] = commit_article_edit(
                run_id=run, expected_revision=0, edit=edit
            )
        except BaseException as exc:  # noqa: BLE001 -- recorded, then asserted
            outcomes[name] = exc

    threads = [
        threading.Thread(
            target=attempt, args=("a", _replace("A costs $20.", "A is $20."))
        ),
        threading.Thread(
            target=attempt,
            args=("b", _replace("The bus runs hourly.", "Buses run hourly.")),
        ),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)

    kinds = sorted(type(value).__name__ for value in outcomes.values())
    assert kinds == ["CommitResult", "RevisionConflict"]

    final = read_article(run)
    assert final.revision == 1
    # Whichever one won is entirely there, and the loser wrote nothing at all.
    won_a = "A is $20." in final.markdown
    assert won_a != ("Buses run hourly." in final.markdown)
    if won_a:
        assert "The bus runs hourly." in final.markdown
    else:
        assert "A costs $20." in final.markdown
    assert len(_stored_history(run)["edits"]) == 1


def test_a_refused_edit_leaves_neither_half_written(run):
    """The article and the history roll back together."""

    def edit(markdown: str, history: EditHistory):
        raise EditRefused("nope")

    with pytest.raises(EditRefused):
        commit_article_edit(run_id=run, expected_revision=0, edit=edit)

    state = read_article(run)
    assert state.markdown == ARTICLE
    assert state.revision == 0
    assert _stored_history(run) == {}


def test_a_failure_after_the_article_write_rolls_the_article_back(run):
    """Simulated between the two writes, which is where they used to split.

    The history write is the second statement in the transaction. A failure
    there used to leave an article carrying an edit its history has no record
    of; now it leaves the article as it was.
    """

    def edit(markdown: str, history: EditHistory):
        return markdown.replace("A costs $20.", "A is $20."), _Unserialisable()

    with pytest.raises(TypeError):
        commit_article_edit(run_id=run, expected_revision=0, edit=edit)

    state = read_article(run)
    assert state.markdown == ARTICLE
    assert state.revision == 0
    assert _stored_history(run) == {}


class _Unserialisable:
    """Stands in for the history write failing, whatever the reason."""

    edits: list = []

    def model_dump(self, **_kwargs):
        raise TypeError("history could not be written")


def test_the_same_edit_applied_twice_lands_once(run):
    """A double-click and a retried request are not two edits.

    Without this the second arrives against the revision the first advanced
    past and is reported as a conflict, which sends an editor to re-read prose
    that already says what they wanted.
    """

    def edit(markdown: str, history: EditHistory) -> tuple[str, EditHistory]:
        return (
            markdown.replace("A costs $20.", "A is $20."),
            EditHistory(
                original_markdown=markdown,
                edits=[
                    *history.edits,
                    AppliedEdit(edit_id="edit-9", section_id="s1", action_id="shorten"),
                ],
            ),
        )

    first = commit_article_edit(
        run_id=run, expected_revision=0, edit=edit, edit_id="edit-9"
    )
    second = commit_article_edit(
        run_id=run, expected_revision=0, edit=edit, edit_id="edit-9"
    )

    assert first.already_applied is False
    assert second.already_applied is True
    assert second.revision == first.revision == 1
    assert len(_stored_history(run)["edits"]) == 1


def test_a_run_with_no_article_is_a_missing_article_not_a_crash(isolated_db):
    with pytest.raises(ArticleMissing):
        read_article("never-ran")


def test_a_pipeline_write_also_advances_the_revision(run):
    """Every path that writes markdown, not only a hand edit.

    A resume that re-finalises a run is exactly as much a reason to re-read a
    section as a colleague's edit in another tab, and an edit proposed before
    it must not land on the article it produced.
    """
    write_artifact(run, {"pipeline_v3": {}, "markdown": "A wholly new draft.\n"})

    assert read_output(run)["article_revision"] == 1
    with pytest.raises(RevisionConflict):
        commit_article_edit(
            run_id=run,
            expected_revision=0,
            edit=_replace("A costs $20.", "A is $20."),
        )


def test_the_write_lock_is_held_across_the_read(isolated_db, run):
    """The property the whole module rests on, asserted directly.

    A second connection trying to write while `commit_article_edit` is between
    its read and its write must not get in. With a deferred transaction it
    would; with `BEGIN IMMEDIATE` it waits, and a one-millisecond busy timeout
    turns waiting into a visible error this test can assert on.
    """
    blocked: list[str] = []
    inside = threading.Event()
    release = threading.Event()

    def edit(markdown: str, history: EditHistory):
        inside.set()
        release.wait(timeout=5)
        return markdown, EditHistory()

    def intrude() -> None:
        inside.wait(timeout=5)
        other = sqlite3.connect(str(isolated_db), timeout=0.001)
        try:
            other.execute("BEGIN IMMEDIATE")
            other.execute("UPDATE outputs SET markdown = 'stolen'")
            other.execute("COMMIT")
            blocked.append("got in")
        except sqlite3.OperationalError as exc:
            blocked.append(str(exc))
        finally:
            other.close()
            release.set()

    thread = threading.Thread(target=intrude)
    thread.start()
    commit_article_edit(run_id=run, expected_revision=0, edit=edit)
    thread.join(timeout=10)

    assert blocked and "locked" in blocked[0]
    assert "stolen" not in read_article(run).markdown
