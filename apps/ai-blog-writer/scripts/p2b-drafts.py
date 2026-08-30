#!/usr/bin/env python3
"""Read every draft a Prompt2Blog run produced, in one page.

The same page the UI's "Read all drafts" button opens, written to a file
instead. Useful when the backend is not running, or for keeping a copy of a
run to compare against a later one.

The renderer itself lives in the backend
(`app/features/prompt2blog/drafts_view.py`) and is loaded straight from that
file, so this script and the API can never drift into two different pages.
That module imports nothing but the standard library, which is what makes
loading it here safe -- no FastAPI, no app config, no .env.

Read-only against the database. Writes one HTML file.

    python3 scripts/p2b-drafts.py                # newest prompt2blog run
    python3 scripts/p2b-drafts.py <run_id>       # a full id or any prefix
    python3 scripts/p2b-drafts.py --list         # recent runs
    python3 scripts/p2b-drafts.py <run_id> --open
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sqlite3
import subprocess
import sys
import webbrowser
from pathlib import Path
from types import ModuleType

APP_ROOT = Path(__file__).resolve().parents[1]
REPO_DB = APP_ROOT / "data" / "pipeline.db"
RENDERER = (
    APP_ROOT
    / "apps"
    / "backend"
    / "app"
    / "features"
    / "prompt2blog"
    / "drafts_view.py"
)
# `data/runs/` is already gitignored, so a generated page never reaches a diff.
OUT_DIR = APP_ROOT / "data" / "runs"


def load_renderer() -> ModuleType:
    spec = importlib.util.spec_from_file_location("p2b_drafts_view", RENDERER)
    if spec is None or spec.loader is None:
        sys.exit(f"Could not load the renderer at {RENDERER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        sys.exit(f"No database at {db_path}")
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def list_runs(connection: sqlite3.Connection, limit: int) -> None:
    rows = connection.execute(
        "SELECT run_id, status, stage, created_at FROM runs"
        " WHERE feature = 'prompt2blog' ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    for row in rows:
        print(
            f"{row['run_id']}  {row['created_at'][:19]}  "
            f"{row['status']:<10} {row['stage']}"
        )


def resolve_run_id(connection: sqlite3.Connection, value: str | None) -> str:
    if not value:
        row = connection.execute(
            "SELECT run_id FROM runs WHERE feature = 'prompt2blog'"
            " ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if row is None:
            sys.exit("No prompt2blog runs yet.")
        return str(row["run_id"])

    row = connection.execute(
        "SELECT run_id FROM runs WHERE run_id LIKE ? ORDER BY created_at DESC",
        (value + "%",),
    ).fetchone()
    if row is None:
        sys.exit(f"No run matching {value}")
    return str(row["run_id"])


def read_run(connection: sqlite3.Connection, run_id: str) -> tuple[dict, dict, str]:
    """The three things the renderer needs: status row, stages, final markdown."""
    run = connection.execute(
        "SELECT * FROM runs WHERE run_id = ?", (run_id,)
    ).fetchone()
    if run is None:
        sys.exit(f"No run {run_id}")

    stages: dict[str, object] = {}
    for row in connection.execute(
        "SELECT stage, data FROM stages WHERE run_id = ? ORDER BY created_at",
        (run_id,),
    ):
        try:
            stages[row["stage"]] = json.loads(row["data"])
        except json.JSONDecodeError:
            continue

    output = connection.execute(
        "SELECT markdown FROM outputs WHERE run_id = ?", (run_id,)
    ).fetchone()
    return dict(run), stages, (output["markdown"] if output else "")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_id", nargs="?", help="run id or prefix (default: newest)")
    parser.add_argument("--list", action="store_true", help="list recent runs")
    parser.add_argument("--limit", type=int, default=15)
    parser.add_argument("--db", type=Path, default=REPO_DB)
    parser.add_argument("--out", type=Path, help="where to write the html")
    parser.add_argument("--open", action="store_true", help="open in a browser")
    args = parser.parse_args()

    connection = connect(args.db)
    if args.list:
        list_runs(connection, args.limit)
        return

    view = load_renderer()
    run_id = resolve_run_id(connection, args.run_id)
    status, stages, markdown = read_run(connection, run_id)

    report = view.build_drafts_report(
        run_id=run_id,
        status=status,
        stages=stages,
        markdown=markdown,
    )
    if not report["drafts"]:
        sys.exit(f"Run {run_id} holds no drafts (it may have failed early).")

    out = args.out or OUT_DIR / f"drafts-{run_id[:8]}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(view.render_drafts_page(report), encoding="utf-8")
    print(out)

    if args.open:
        try:
            subprocess.run(["open", str(out)], check=False)
        except OSError:
            webbrowser.open(out.as_uri())


if __name__ == "__main__":
    main()
