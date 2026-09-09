#!/usr/bin/env python
"""Run one evaluation case's searches for real, under a stated spend cap.

This is the paid half of the plan's phase 5, and it is a separate script rather
than a route because nothing should be able to start it by accident. It buys
one grounded search per angle per commission, against the same execution layer
the pipeline uses.

It refuses to run without `--i-know-this-costs-money`. That is not ceremony:
the only path in this app that reaches the web is a live Gemini grounding call,
this repository runs live Stripe on the same machine, and a script that quietly
spends is the kind of thing that gets run at three in the morning by someone
who wanted to see what it printed.

Read before running:

- The plan's own sequencing. Do not buy a quality comparison until identity
  handling and result recording are trustworthy, because otherwise the
  measurement measures the bug.
- The adoption rule. Agree the numerical thresholds BEFORE the run. Thresholds
  chosen afterwards are chosen to flatter whatever came back.
- What this cannot establish: whether a returned place is real, currently open,
  or worth writing about. Receiving a search result is not verification, and
  this script reports discovery only.

    PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \
        .venv/bin/python apps/backend/scripts/listicle_angle_comparison.py --list

    PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \
        .venv/bin/python apps/backend/scripts/listicle_angle_comparison.py \
        --case narrow-hotels --label after \
        --angles "aparthotels in Lima with monthly rates and kitchens" \
        --angles "hotels in Lima in converted republican-era casonas" \
        --roles broad,distinctive \
        --i-know-this-costs-money
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
# The same three entries `pyproject.toml` puts on pytest's path. `utils` is a
# workspace package, not an installed one, and every import below dies without
# it.
for entry in (ROOT, REPO / "packages" / "shared" / "src", REPO / "packages" / "utils" / "src"):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

from app.features.listicle_pipeline.evaluation import (  # noqa: E402
    CASES,
    CASES_BY_KEY,
    REPORTED_OUTCOMES,
)
from app.features.listicle_pipeline.search import (  # noqa: E402
    AngleRequest,
    contribution_of,
    role_allowances,
    run_search_order,
)


def _live_search(prompt: str) -> tuple[str, list[str], int | None]:
    """The one path in this app that reaches the web, and the only spend here."""
    from app.shared.model_calls import grounded_text
    from app.features.listicle_pipeline.search import (
        SEARCH_MAX_TOKENS,
        SEARCH_TIMEOUT_SECONDS,
    )

    result = grounded_text(
        "listicle.search",
        prompt,
        max_tokens=SEARCH_MAX_TOKENS,
        timeout_seconds=SEARCH_TIMEOUT_SECONDS,
        endpoint="generateContent:googleSearch",
    )
    if result is None:
        raise RuntimeError("The grounded search returned nothing.")
    return result.text, list(result.source_urls), result.total_tokens


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="Show the cases and stop.")
    parser.add_argument("--case", help="Which evaluation case to run.")
    parser.add_argument(
        "--angles",
        action="append",
        default=[],
        help="One angle, as it would be searched. Repeat per angle.",
    )
    parser.add_argument(
        "--roles",
        default="",
        help="Comma-separated roles, one per angle. Defaults to all broad.",
    )
    parser.add_argument(
        "--max-searches",
        type=int,
        default=8,
        help="Hard cap on searches bought in one invocation.",
    )
    parser.add_argument(
        "--label", default="", help="A word for this arm, e.g. 'before' or 'after'."
    )
    parser.add_argument(
        "--i-know-this-costs-money",
        action="store_true",
        dest="confirmed",
        help="Required. Every angle is one live grounded search.",
    )
    args = parser.parse_args()

    if args.list or not args.case:
        for case in CASES:
            print(f"{case.key:22} {case.seed}")
            for line in case.judged_by:
                print(f"{'':22} - {line}")
        return 0

    case = CASES_BY_KEY.get(args.case)
    if case is None:
        print(f"No case called {args.case!r}.", file=sys.stderr)
        return 2
    if not args.angles:
        print("Give at least one --angles.", file=sys.stderr)
        return 2
    if len(args.angles) > args.max_searches:
        print(
            f"{len(args.angles)} angles is above the cap of {args.max_searches}.",
            file=sys.stderr,
        )
        return 2
    if not args.confirmed:
        print(
            f"This would buy {len(args.angles)} live grounded searches. "
            "Re-run with --i-know-this-costs-money.",
            file=sys.stderr,
        )
        return 1

    roles = (
        [r.strip() for r in args.roles.split(",") if r.strip()]
        if args.roles
        else ["broad"] * len(args.angles)
    )
    if len(roles) != len(args.angles):
        print("One role per angle, or none at all.", file=sys.stderr)
        return 2

    allowances = role_allowances(case.target_count, roles)
    requests = [
        AngleRequest(
            angle_id=f"a{index + 1}",
            text=text,
            role=roles[index],
            wanted=allowances[index],
        )
        for index, text in enumerate(args.angles)
    ]

    candidates, results = run_search_order(
        requests,
        kind=case.kind,
        place=case.seed.split(" in ")[-1] if " in " in case.seed else case.seed,
        target_items=case.target_count,
        exclusions=case.exclusions,
        standard=case.standard,
        research=_live_search,
    )

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    payload = {
        "case": case.key,
        "label": args.label,
        "ran_at": stamp,
        "target": case.target_count,
        "found": len(candidates),
        "shortfall": max(0, case.target_count - len(candidates)),
        "uncertain_identity": sum(1 for c in candidates if c.possible_duplicates),
        "angles": [
            {
                "angle": result.angle,
                "role": result.role,
                "wanted": result.wanted,
                "rows": result.rows,
                "sources": result.sources,
                "failed": result.failed,
                "reason": result.reason,
                "found": contribution_of(candidates, result.angle)[0],
                "shared": contribution_of(candidates, result.angle)[1],
                "exclusive": contribution_of(candidates, result.angle)[2],
            }
            for result in results
        ],
        "candidates": [
            {
                "name": c.name,
                "district": c.district,
                "found_by": list(c.found_by),
                "possible_duplicates": list(c.possible_duplicates),
                "sightings": [
                    {"angle": s.angle, "name": s.name, "evidence": s.evidence}
                    for s in c.sightings
                ],
            }
            for c in candidates
        ],
        # Recorded as unanswered rather than omitted. Every one of these has to
        # be filled in by a person reading the run; a report that silently
        # leaves out the unflattering half is not a report.
        "outcomes_still_to_be_judged": {
            name: reason
            for name, reason in REPORTED_OUTCOMES
            if name not in {"contribution", "spend"}
        },
        "judged_by": list(case.judged_by),
    }

    out = REPO / "docs" / "audits"
    out.mkdir(parents=True, exist_ok=True)
    name = f"listicle-angle-comparison-{case.key}-{args.label or 'run'}-{stamp}.json"
    (out / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"{len(candidates)} places from {len(results)} searches -> docs/audits/{name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
