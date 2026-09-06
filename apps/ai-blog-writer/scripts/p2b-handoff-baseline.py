#!/usr/bin/env python3
"""What the writer actually receives, measured on runs that already happened.

Step 0 of the research redesign. Before anything about selection or the
writing packet changes, this records what the current hand-off looks like, so
"the packet got smaller" can later be checked against a number somebody wrote
down rather than against a memory of one.

It measures three things per run:

- **Size, by component.** Every stage context is assembled from named parts and
  already reports its own `section_sizes`, so the compose prompt can be split
  into voice, brief, evidence and house style without guessing.
- **What is inside the evidence part.** The claims a writer may use, against
  the requirement bookkeeping that follows them. On run 4a56545b, 25 selected
  claims arrived as 7,114 characters of facts followed by 10,371 characters of
  research coverage naming all 28 questions -- 59% of the writer's evidence was
  a list of what was asked, not of what was found.
- **What the outline did with it.** Claims assigned per section against that
  section's word budget, which is where density stops being an abstraction.

Characters, not tokens: this runs against stored rows with no tokenizer in
reach, and the ratio is close enough to find the big one. Costs are read from
the run's own receipt where it has one and reported as missing where it does
not, rather than estimated into a number that reads like a measurement.

Read-only. It opens the database, replays stored rows through the real
assembly code, and buys nothing.

    python3 scripts/p2b-handoff-baseline.py                 # recent runs
    python3 scripts/p2b-handoff-baseline.py --limit 10
    python3 scripts/p2b-handoff-baseline.py <run_id> ...    # named runs
    python3 scripts/p2b-handoff-baseline.py --json out.json
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

APP_ROOT = Path(__file__).resolve().parents[1]
# The same three entries `pyproject.toml` gives pytest. Set before the app is
# imported, so this runs from a checkout with no installed package.
for path in ("apps/backend", "packages/shared/src", "packages/utils/src"):
    sys.path.insert(0, str(APP_ROOT / path))

from app.config import DB_PATH  # noqa: E402
from app.features.prompt2blog.evidence_v3 import normalize_evidence  # noqa: E402
from app.features.prompt2blog.instructions_v3 import (  # noqa: E402
    assemble_v3_instructions,
)
from app.features.prompt2blog.intake_v4 import writing_request  # noqa: E402

# Where the coverage bookkeeping starts inside the compose evidence rendering.
# Everything above it is facts the writer may use; everything below it is the
# state of the research.
COVERAGE_HEADING = "REQUIREMENT COVERAGE"


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        sys.exit(f"No database at {db_path}")
    return sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)


def stage(connection: sqlite3.Connection, run_id: str, name: str) -> dict[str, Any]:
    row = connection.execute(
        "SELECT data FROM stages WHERE run_id = ? AND stage = ?", (run_id, name)
    ).fetchone()
    if not row:
        return {}
    payload = json.loads(row[0])
    return payload.get("data") or {}


def recent_run_ids(connection: sqlite3.Connection, limit: int) -> list[str]:
    """Runs that got as far as writing something, newest first."""
    rows = connection.execute(
        "SELECT run_id FROM stages WHERE stage = 'stage_v3_compose'"
        " AND run_id IN (SELECT run_id FROM stages WHERE stage = 'stage_v4_research')"
        " ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [row[0] for row in rows]


def section_allocations(outline: dict[str, Any]) -> list[dict[str, Any]]:
    """Claims assigned to each section, and the budget they have to fit in."""
    plan = outline.get("outline") or {}
    sections = plan.get("sections") if isinstance(plan, dict) else None
    rows: list[dict[str, Any]] = []
    for section in sections or []:
        if not isinstance(section, dict):
            continue
        claim_ids = section.get("claim_ids") or section.get("evidence_ids") or []
        budget = (
            section.get("word_budget")
            or section.get("target_words")
            or section.get("words")
            or 0
        )
        rows.append(
            {
                "heading": section.get("heading") or section.get("title") or "",
                "claims": len(claim_ids),
                "word_budget": budget,
                "claims_per_hundred_words": (
                    round(len(claim_ids) * 100 / budget, 1) if budget else None
                ),
            }
        )
    return rows


def measure(connection: sqlite3.Connection, run_id: str) -> dict[str, Any]:
    article = stage(connection, run_id, "pipeline_v3")
    length_id = (article.get("input_profiles") or {}).get("length_id") or "medium"
    request = writing_request(run_id, length_id=length_id)
    instructions = assemble_v3_instructions(request)
    contexts = instructions.stage_contexts

    evidence = request.evidence_package
    normalized = normalize_evidence(request.work_order, evidence)
    packet = normalized.compose_records_text
    # The heading is written by the compose projection itself, so its absence
    # would be a real change in that projection rather than a parsing miss.
    split = packet.index(COVERAGE_HEADING) if COVERAGE_HEADING in packet else len(packet)

    selected = [claim for claim in evidence.claims if claim.selected]
    markdown = article.get("final_markdown") or ""
    cost = article.get("run_cost") or {}
    return {
        "run_id": run_id,
        "length_id": length_id,
        "article_words": len(markdown.split()) or None,
        "claims_in_dossier": len(evidence.claims),
        "claims_selected": len(selected),
        "sources": len(evidence.sources),
        "requirements": len(evidence.requirements),
        "context_chars": {
            "outline": contexts.outline.characters,
            "compose": contexts.compose.characters,
            "audit": contexts.audit.characters,
            "repair_lock": contexts.repair_lock.characters,
        },
        "compose_sections": dict(contexts.compose.section_sizes),
        "outline_sections": dict(contexts.outline.section_sizes),
        "evidence_part": {
            "total_chars": len(packet),
            "facts_chars": split,
            "research_bookkeeping_chars": len(packet) - split,
            "bookkeeping_share": (
                round((len(packet) - split) / len(packet), 3) if packet else None
            ),
        },
        "outline_allocations": section_allocations(
            stage(connection, run_id, "stage_v3_outline")
        ),
        # Runs recorded before the ledger fixes have no receipt. Reported as
        # missing rather than reconstructed: a partial total quoted as the
        # price of an article is how the last set of numbers went wrong.
        "run_cost": cost or None,
    }


def report(measurement: dict[str, Any]) -> None:
    run = measurement["run_id"][:8]
    print(
        f"\n=== {run}  {measurement['article_words']} words  "
        f"length={measurement['length_id']}"
    )
    print(
        f"  dossier {measurement['claims_in_dossier']:>4} claims  "
        f"selected {measurement['claims_selected']:>4}  "
        f"sources {measurement['sources']:>4}  "
        f"questions {measurement['requirements']:>3}"
    )
    sizes = measurement["context_chars"]
    print(
        f"  contexts: compose {sizes['compose']:>7,}  outline {sizes['outline']:>7,}  "
        f"audit {sizes['audit']:>6,}"
    )
    part = measurement["evidence_part"]
    share = part["bookkeeping_share"]
    print(
        f"  the writer's evidence: {part['facts_chars']:>7,} chars of facts, "
        f"{part['research_bookkeeping_chars']:>7,} of research bookkeeping"
        + (f"  ({share:.0%} bookkeeping)" if share is not None else "")
    )
    for name, size in measurement["compose_sections"].items():
        print(f"      compose/{name:<22} {size:>7,}")
    allocations = measurement["outline_allocations"]
    if allocations:
        worst = max(
            allocations, key=lambda row: row["claims_per_hundred_words"] or 0
        )
        print(
            "  sections: "
            + ", ".join(f"{row['claims']}/{row['word_budget']}w" for row in allocations)
            + f"   worst {worst['claims']} claims in {worst['word_budget']} words"
        )
    if not measurement["run_cost"]:
        print("  cost: not recorded for this run")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_ids", nargs="*", help="Full run ids to measure.")
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--json", type=Path, help="Write the measurements here.")
    args = parser.parse_args()

    connection = connect(args.db)
    run_ids = args.run_ids or recent_run_ids(connection, args.limit)

    measurements: list[dict[str, Any]] = []
    for run_id in run_ids:
        try:
            measurement = measure(connection, run_id)
        except Exception as exc:  # noqa: BLE001 -- an old run is not a failure
            print(f"\n=== {run_id[:8]}  skipped: {type(exc).__name__}: {exc}"[:200])
            continue
        measurements.append(measurement)
        report(measurement)

    if args.json:
        args.json.write_text(json.dumps(measurements, indent=2) + "\n")
        print(f"\nWrote {len(measurements)} measurements to {args.json}")


if __name__ == "__main__":
    main()
