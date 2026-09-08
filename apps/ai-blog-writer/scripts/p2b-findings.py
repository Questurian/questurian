#!/usr/bin/env python3
"""Every fault the detector found, across every article, in one place.

One review tells you what is wrong with one article, which is not the question.
The question is which faults keep coming back -- those are not article problems,
they are prompt problems, and they get fixed at the source: in the brief, in the
writer prompt, in the grill. One at a time, each with evidence behind it.

So this groups findings by label rather than by run. Labels are the model's own
words and no two runs will phrase one identically, which is the point: a fixed
vocabulary would decide in advance what kinds of fault exist, and that is the
thing being investigated. The grouping here is loose on purpose -- it puts
near-identical wordings together and leaves you to read the rest.

Findings marked "not a fault" are left out of the ranking by default, because a
category that only recurs because the same wrong finding keeps being made is not
a category. `--all` puts them back.

Read-only against the database. Writes nothing.

    python3 scripts/p2b-findings.py              # every reviewed run
    python3 scripts/p2b-findings.py --all        # include ones you rejected
    python3 scripts/p2b-findings.py --run <id>   # one run, in full
    python3 scripts/p2b-findings.py --min 2      # only labels seen twice or more
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

APP_ROOT = Path(__file__).resolve().parents[1]
REPO_DB = APP_ROOT / "data" / "pipeline.db"
REVIEW_STAGE = "stage_v5_review"

SEVERITY_ORDER = {"serious": 0, "notable": 1, "minor": 2}

# Words that carry no signal about what kind of fault this is. Dropped before
# two labels are compared, so "Asserts the fare it just hedged" and "Asserts a
# fare it hedged" land together.
NOISE = {
    "a", "an", "the", "it", "its", "is", "was", "of", "in", "on", "to", "and",
    "or", "that", "this", "with", "for", "by", "at", "as", "but", "just",
    "own", "again", "very", "too", "then", "there", "here",
}


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        sys.exit(f"No database at {db_path}")
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def words_in(label: str) -> set[str]:
    """The words in a label that say what kind of fault it is."""
    return {
        word
        for word in re.findall(r"[a-z]+", label.lower())
        if word not in NOISE and len(word) > 2
    }


# How many content words two labels must share before they are shown together.
# Two is the number that works on real labels: "Asserts the fare it just
# hedged" and "Asserts a price it hedged" share `asserts` and `hedged` and are
# plainly the same fault, while "Museum price wrong by threefold" shares only
# `price` with the second and is a different one.
SHARED_WORDS = 2


def cluster(findings: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Put findings that name the same fault next to each other.

    Grouped on words the labels share, not on a list of fault types -- there is
    no such list and inventing one here would answer the question this phase
    exists to ask. Two labels are shown together when they share two content
    words, which catches restatements of one fault and leaves genuinely
    different ones apart.

    This is a reading aid and nothing depends on it. A group it gets wrong
    costs a second of the reader's attention; the findings themselves are all
    printed either way.
    """
    groups: list[tuple[set[str], list[dict[str, Any]]]] = []
    for finding in findings:
        words = words_in(str(finding.get("label") or ""))
        joined = next(
            (
                group
                for group in groups
                if len(group[0] & words) >= min(SHARED_WORDS, len(words) or 1)
            ),
            None,
        )
        if joined is None:
            groups.append((set(words), [finding]))
        else:
            joined[0].update(words)
            joined[1].append(finding)
    return [members for _, members in groups]


def reviews_for(connection: sqlite3.Connection, run_id: str) -> list[dict[str, Any]]:
    row = connection.execute(
        "SELECT data FROM stages WHERE run_id = ? AND stage = ?",
        (run_id, REVIEW_STAGE),
    ).fetchone()
    if row is None:
        return []
    try:
        # The stage row is wrapped: {"created_at": ..., "data": {...}}.
        payload = json.loads(row["data"]).get("data") or {}
    except (json.JSONDecodeError, AttributeError):
        return []
    reviews = payload.get("reviews")
    return [item for item in reviews if isinstance(item, dict)] if isinstance(reviews, list) else []


def newest_succeeded(reviews: list[dict[str, Any]]) -> dict[str, Any] | None:
    for review in reversed(reviews):
        if review.get("state") == "succeeded":
            return review
    return None


def headline_for(connection: sqlite3.Connection, run_id: str) -> str:
    row = connection.execute(
        "SELECT data FROM stages WHERE run_id = ? AND stage = 'stage_v5_write'",
        (run_id,),
    ).fetchone()
    if row is None:
        return ""
    try:
        attempts = (json.loads(row["data"]).get("data") or {}).get("attempts") or []
    except (json.JSONDecodeError, AttributeError):
        return ""
    for attempt in reversed(attempts):
        draft = attempt.get("draft") or {}
        if attempt.get("state") == "succeeded" and draft.get("headline"):
            return str(draft["headline"])
    return ""


def collect(
    connection: sqlite3.Connection, only_run: str | None, keep_rejected: bool
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Every finding worth ranking, and one row per reviewed run."""
    query = "SELECT run_id FROM runs WHERE feature = 'prompt2blog' ORDER BY created_at"
    run_ids = [str(row["run_id"]) for row in connection.execute(query).fetchall()]
    if only_run:
        run_ids = [item for item in run_ids if item.startswith(only_run)]
        if not run_ids:
            sys.exit(f"No run matching {only_run!r}.")

    findings: list[dict[str, Any]] = []
    runs: list[dict[str, Any]] = []
    for run_id in run_ids:
        review = newest_succeeded(reviews_for(connection, run_id))
        if review is None:
            continue
        rows = [
            item for item in (review.get("findings") or []) if isinstance(item, dict)
        ]
        runs.append(
            {
                "run_id": run_id,
                "headline": headline_for(connection, run_id),
                "finding_count": len(rows),
                "cost_usd": review.get("cost_usd"),
                "verdict": str(review.get("verdict") or ""),
            }
        )
        for item in rows:
            if not keep_rejected and item.get("verdict") == "not_a_fault":
                continue
            findings.append({**item, "run_id": run_id})
    return findings, runs


def print_one_run(connection: sqlite3.Connection, run_id: str, keep_rejected: bool) -> None:
    findings, runs = collect(connection, run_id, keep_rejected)
    if not runs:
        sys.exit(f"Run {run_id} has not been reviewed.")
    run = runs[0]
    print(f"{run['run_id']}  {run['headline']}")
    print()
    for item in sorted(
        findings, key=lambda row: SEVERITY_ORDER.get(row.get("severity", ""), 3)
    ):
        mark = {"agreed": " [you agreed]", "not_a_fault": " [you rejected]"}.get(
            str(item.get("verdict") or ""), ""
        )
        print(f"  {str(item.get('severity', '')).upper():<8} {item.get('label', '')}{mark}")
        quote = str(item.get("quote") or "").strip()
        if quote and not item.get("whole_article"):
            print(f"           > {quote[:140]}")
        print(f"           {str(item.get('problem') or '').strip()[:400]}")
        print()
    if run["verdict"]:
        print("  The editor's overall read:")
        print(f"    {run['verdict'][:800]}")


def print_across_runs(
    findings: list[dict[str, Any]], runs: list[dict[str, Any]], minimum: int
) -> None:
    if not runs:
        print("No article has been reviewed yet. Read a draft first.")
        return

    grouped = cluster(findings)

    print(f"{len(runs)} reviewed article(s), {len(findings)} finding(s).")
    print()
    print("WHAT KEEPS COMING BACK")
    print("A fault in most of the articles is not an article problem. It is a")
    print("prompt problem, and it gets fixed in the brief, the writer prompt or")
    print("the grill.")
    print()
    print("Labels are the editor's own words, so the grouping below is a")
    print("reading aid rather than a verdict. Read the labels.")
    print()

    ranked = sorted(
        grouped,
        # Most articles affected first, then most findings, then worst
        # severity. How many *articles* rather than how many findings, because
        # one article with the same fault four times says less than four
        # articles with it once.
        key=lambda group: (
            -len({item["run_id"] for item in group}),
            -len(group),
            min(SEVERITY_ORDER.get(str(item.get("severity")), 3) for item in group),
        ),
    )

    shown = 0
    for group in ranked:
        articles = {item["run_id"] for item in group}
        if len(articles) < minimum:
            continue
        shown += 1
        worst = min(SEVERITY_ORDER.get(str(item.get("severity")), 3) for item in group)
        severity = next(
            name for name, rank in SEVERITY_ORDER.items() if rank == worst
        )
        print(f"  {len(articles)} of {len(runs)} articles  [{severity}]")
        for item in group:
            agreed = " *" if item.get("verdict") == "agreed" else ""
            print(f"      {item['run_id'][:8]}  {item.get('label', '')}{agreed}")
            print(f"                {str(item.get('problem') or '').strip()[:200]}")
        print()

    if not shown:
        print(f"  Nothing appeared in {minimum} or more articles yet.")
        print("  Read a few more drafts, or lower --min.")
    print()
    print("PER ARTICLE")
    for run in runs:
        cost = run["cost_usd"]
        money = f"${cost:.2f}" if isinstance(cost, (int, float)) else "-"
        print(
            f"  {run['run_id'][:8]}  {run['finding_count']:>2} finding(s)  "
            f"{money:>6}  {run['headline'][:60]}"
        )
    print()
    print("  * = you marked it a real problem.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", help="One run, in full. A full id or any prefix.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include findings you marked 'not a fault'.",
    )
    parser.add_argument(
        "--min",
        type=int,
        default=2,
        help="Only show labels that appeared in this many articles (default 2).",
    )
    parser.add_argument("--db", default=str(REPO_DB), help="Path to pipeline.db")
    args = parser.parse_args()

    connection = connect(Path(args.db))
    try:
        if args.run:
            print_one_run(connection, args.run, args.all)
            return
        findings, runs = collect(connection, None, args.all)
        print_across_runs(findings, runs, max(1, args.min))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
