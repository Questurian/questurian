#!/usr/bin/env python
"""Read what stored runs say about angle wording, and about run-to-run noise.

Spends nothing. Reads the contribution already recorded on each attempt.

This exists because of a claim that could not be checked without it: that the
model over-tightens its own angle wording and it costs measurably. The evidence
offered was one pair -- the `informal` angle, 9 words returning 11 places in one
run and 12 words returning 6 in the next.

The same two runs contain the control that pair needs. `institution` ran with
IDENTICAL wording in both and moved 7 rows to 12, one exclusive place to six.
If unchanged wording swings that far, one changed pair cannot be read as an
effect of the change.

So this prints both: the pairs, and the pairs whose wording did not change.
The second group is the noise floor, and no comparison of the first group means
anything until it is known.

    cd apps/ai-blog-writer
    set -a && . ./apps/backend/.env && set +a
    export PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src
    .venv/bin/python apps/backend/scripts/listicle_angle_variance.py
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


def main() -> int:
    from app.core.database import get_db_connection
    from app.features.listicle_pipeline import runner, store

    with get_db_connection() as conn:
        run_ids = [
            row[0]
            for row in conn.execute(
                "SELECT DISTINCT run_id FROM listicle_search_orders ORDER BY run_id"
            ).fetchall()
        ]

    # Grouped by subject, because what a shape does for cevicherias in Lima
    # says nothing about what it does for bookshops in Buenos Aires.
    by_subject: dict[str, dict[str, list]] = {}
    for run_id in run_ids:
        order = store.load_order(run_id)
        if order is None:
            continue
        subject = runner.subject_of(order)
        for attempt in store.load_attempts(run_id):
            if not (attempt.contribution_recorded and attempt.shape_key):
                continue
            by_subject.setdefault(subject, {}).setdefault(
                attempt.shape_key, []
            ).append(attempt)

    for subject, shapes in sorted(by_subject.items()):
        repeated = {k: v for k, v in shapes.items() if len(v) > 1}
        if not repeated:
            continue
        print(f"\n{subject}")
        print(f"  {'shape':16}{'words':>7}{'rows':>6}{'excl':>6}   runs")

        unchanged: list[tuple[str, int, int]] = []
        changed: list[tuple[str, int, int]] = []
        for shape, attempts in sorted(repeated.items()):
            lengths = {len(a.angle_text.split()) for a in attempts}
            spread_rows = max(a.rows for a in attempts) - min(a.rows for a in attempts)
            spread_excl = max(a.exclusive for a in attempts) - min(
                a.exclusive for a in attempts
            )
            (unchanged if len(lengths) == 1 else changed).append(
                (shape, spread_rows, spread_excl)
            )
            for a in sorted(attempts, key=lambda a: a.run_id):
                print(
                    f"  {shape:16}{len(a.angle_text.split()):7}{a.rows:6}"
                    f"{a.exclusive:6}   {a.run_id}"
                )

        print()
        if unchanged:
            worst = max(unchanged, key=lambda r: r[2])
            print(
                f"  NOISE FLOOR: {len(unchanged)} shape(s) ran with the same "
                f"wording twice. Widest swing: {worst[0]}, "
                f"{worst[1]} rows and {worst[2]} exclusive places."
            )
        else:
            print(
                "  NOISE FLOOR: UNKNOWN. No shape ran twice with unchanged "
                "wording, so nothing here separates wording from chance."
            )
        if changed:
            worst = max(changed, key=lambda r: r[2])
            print(
                f"  REWORDED:    {len(changed)} shape(s) changed wording. "
                f"Widest swing: {worst[0]}, "
                f"{worst[1]} rows and {worst[2]} exclusive places."
            )
        print(
            "\n  A reworded swing is only evidence about wording if it is "
            "clearly larger\n  than the unchanged swing. Read the two numbers "
            "above against each other."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
