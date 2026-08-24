"""Report and optionally prune the shared LangGraph checkpoint database.

Usage:
    python3 apps/backend/scripts/prune_langgraph_checkpoints.py
    python3 apps/backend/scripts/prune_langgraph_checkpoints.py --all --apply

Read-only unless --apply is passed.

There is no age filter, and deliberately so: the checkpoints table carries no
timestamp column. LangGraph's checkpoint ids are time-ordered UUIDs, so an
age cutoff could be reconstructed by decoding them -- but a delete tool that
silently mis-parses its own cutoff is worse than one that only offers "all",
and "all" is the correct answer while nothing resumes a run.

Runs finished before the retention change in the pipeline runner left their
checkpoints behind; this clears that backlog. New runs drop their own
snapshots when they end, so this is a one-off catch-up rather than a job that
needs scheduling.

Nothing in this codebase resumes a checkpointed run, so deleting them loses no
recoverable work. Run artifacts, stage records and articles live in
pipeline.db and are untouched.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

REPO_BACKEND = Path(__file__).resolve().parents[1]
if str(REPO_BACKEND) not in sys.path:
    sys.path.insert(0, str(REPO_BACKEND))

from app.ai_graph.runtime import LANGGRAPH_CHECKPOINT_PATH  # noqa: E402


def _human_bytes(value: int) -> str:
    size = float(value)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def _threads(connection: sqlite3.Connection) -> list[tuple[str, int]]:
    return connection.execute(
        "SELECT thread_id, COUNT(*) FROM checkpoints GROUP BY thread_id "
        "ORDER BY COUNT(*) DESC"
    ).fetchall()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all",
        action="store_true",
        help="Select every thread in the database.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete. Without this the script only reports.",
    )
    args = parser.parse_args()

    path = Path(LANGGRAPH_CHECKPOINT_PATH)
    if not path.exists():
        print(f"No checkpoint database at {path}.")
        return 0

    size_before = path.stat().st_size
    print(f"Checkpoint database: {path}")
    print(f"Size: {_human_bytes(size_before)}")

    with sqlite3.connect(path) as connection:
        rows = _threads(connection)
        total_checkpoints = sum(count for _thread, count in rows)
        print(f"Threads: {len(rows)}  Checkpoints: {total_checkpoints}")
        for thread_id, count in rows[:10]:
            print(f"  {thread_id}: {count}")
        if len(rows) > 10:
            print(f"  ... and {len(rows) - 10} more threads")

        if not args.all:
            print(
                "\nReport only. Pass --all to select every thread, and --apply "
                "to delete them."
            )
            return 0

        selected = [thread_id for thread_id, _count in rows]
        print(f"\nSelected {len(selected)} thread(s).")
        if not args.apply:
            print("Dry run. Re-run with --apply to delete.")
            return 0

        for thread_id in selected:
            connection.execute(
                "DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,)
            )
            connection.execute(
                "DELETE FROM writes WHERE thread_id = ?", (thread_id,)
            )
        connection.commit()
        connection.execute("VACUUM")

    size_after = Path(path).stat().st_size
    print(
        f"Deleted {len(selected)} thread(s). "
        f"{_human_bytes(size_before)} -> {_human_bytes(size_after)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
