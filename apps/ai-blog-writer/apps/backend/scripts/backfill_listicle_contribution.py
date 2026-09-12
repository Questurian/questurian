#!/usr/bin/env python
"""Write contribution onto listicle attempts that were stored before it existed.

Contribution -- how many places a search returned, and how many of them nothing
else found -- used to be computed when the results screen was drawn and thrown
away with it. It is now recorded on the attempt, because the number is only
worth anything if it can be read BEFORE the same search is paid for again.

Runs stored before that change have the rows and the sightings but no
contribution, so they cannot answer "what did this angle buy last time". This
recomputes it for them. Nothing is fetched and nothing is spent: the pool is
rebuilt from sightings that are already on disk.

Safe to run more than once. It rewrites a derived number and touches nothing
else.

    cd apps/ai-blog-writer
    set -a && . ./apps/backend/.env && set +a
    export PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src
    .venv/bin/python apps/backend/scripts/backfill_listicle_contribution.py --dry-run
    .venv/bin/python apps/backend/scripts/backfill_listicle_contribution.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
for entry in (
    ROOT,
    REPO / "packages" / "shared" / "src",
    REPO / "packages" / "utils" / "src",
):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))


def main(argv: list[str]) -> int:
    from app.config import DB_PATH
    from app.core.database import get_db_connection
    from app.features.listicle_pipeline import runner, store

    dry_run = "--dry-run" in argv
    print(f"database: {DB_PATH}")

    with get_db_connection() as conn:
        run_ids = [
            row[0]
            for row in conn.execute(
                "SELECT DISTINCT run_id FROM listicle_search_orders ORDER BY run_id"
            ).fetchall()
        ]

    for run_id in run_ids:
        order = store.load_order(run_id)
        if order is None:
            print(f"{run_id}: no order, skipped")
            continue
        before = store.load_attempts(run_id)
        pending = [a for a in before if a.state == "completed" and not a.contribution_recorded]
        if not pending:
            print(f"{run_id}: already recorded ({len(before)} attempts)")
            continue
        if dry_run:
            print(f"{run_id}: would record {len(pending)} of {len(before)} attempts")
            continue
        runner.record_contribution(order)
        after = sorted(store.load_attempts(run_id), key=lambda a: a.angle_id)
        recorded = [
            f"{a.angle_id} {a.rows}r/{a.exclusive}x"
            for a in after
            if a.contribution_recorded
        ]
        print(f"{run_id}: {', '.join(recorded)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
