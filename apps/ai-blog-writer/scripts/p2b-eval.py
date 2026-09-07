#!/usr/bin/env python3
"""The writing-quality comparison set: capture inputs, run candidates, read blind.

Improvement 06 from the writer-improvements report. Before this, "did that
prompt change make the articles better" was answered by remembering one run.
This makes it answerable: freeze the inputs of articles that already happened,
run two versions of the writer against the same frozen inputs, and read the
drafts without knowing which is which.

The logic lives in the backend
(`app/features/prompt2blog/evaluation.py`) so it is unit-tested; this file is
the way to drive it by hand.

    # 1. Freeze what a finished run handed its writer.
    python3 scripts/p2b-eval.py capture <run_id> --id lima-airport --label "Lima airport transfer"
    python3 scripts/p2b-eval.py fixtures            # what the set covers, and what it is missing

    # 2. Describe the versions being compared.
    python3 scripts/p2b-eval.py variant baseline --label "main"
    python3 scripts/p2b-eval.py variant candidate --label "opus writer" --writing-model claude-opus-5

    # 3. Buy the drafts. THIS SPENDS MONEY -- one full article per pair.
    python3 scripts/p2b-eval.py run --variant baseline --variant candidate --spend

    # 4. Read them blind, then record what you thought.
    python3 scripts/p2b-eval.py sheet --open
    python3 scripts/p2b-eval.py score <comparison_id> --reviewer alan --from scores.json

    # 5. What the set is entitled to conclude.
    python3 scripts/p2b-eval.py report

`capture`, `fixtures`, `sheet` and `report` are read-only and free. Only `run`
calls a model, and it refuses to without `--spend`.
"""

from __future__ import annotations

import argparse
import html
import json
import sys
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APP_ROOT = Path(__file__).resolve().parents[1]
# The same three entries `pyproject.toml` gives pytest, set before the app is
# imported so this runs from a checkout with no installed package.
for path in ("apps/backend", "packages/shared/src", "packages/utils/src"):
    sys.path.insert(0, str(APP_ROOT / path))

from app.features.prompt2blog.contracts_v4 import (  # noqa: E402
    Prompt2BlogModelRouting,
)
from app.features.prompt2blog.evaluation import (  # noqa: E402
    CRITERION_QUESTIONS,
    SCORE_CRITERIA,
    SCORE_MAX,
    SCORE_MIN,
    BlindComparison,
    EvalStore,
    EvalVariant,
    ScoreSheet,
    blind_comparison,
    capture_fixture,
    coverage_report,
    run_sample,
)
from app.features.prompt2blog.intake_v4 import writing_request  # noqa: E402

# Committed alongside the code. A fixture is an input to a decision about the
# writer, so it belongs in review the same way a test does.
STORE_ROOT = APP_ROOT / "data" / "evaluation" / "prompt2blog"
# Generated pages, which are not. `data/runs/` is already gitignored.
OUT_DIR = APP_ROOT / "data" / "runs"


def store() -> EvalStore:
    return EvalStore(STORE_ROOT)


# ---------------------------------------------------------------------------
# capture
# ---------------------------------------------------------------------------


def cmd_capture(args: argparse.Namespace) -> None:
    handoff = writing_request(args.run_id, length_id=args.length)
    fixture = capture_fixture(
        args.run_id,
        fixture_id=args.id,
        label=args.label,
        request=handoff.request,
        selection=handoff.selection,
        notes=args.notes or "",
    )
    path = store().save_fixture(fixture)
    print(f"Captured {fixture.fixture_id} from {args.run_id[:8]} -> {path}")
    print(f"  form {fixture.form_id}  length {fixture.length_id}")
    print(f"  traits: {', '.join(fixture.traits) or 'none'}")


def cmd_fixtures(args: argparse.Namespace) -> None:
    fixtures = store().fixtures()
    if not fixtures:
        print("No fixtures yet. Capture one:")
        print("  p2b-eval.py capture <run_id> --id X --label Y")
        return
    for fixture in fixtures:
        print(f"{fixture.fixture_id:<24} {fixture.form_id:<22} {fixture.label}")
        print(
            f"    from {fixture.captured_from_run[:8]}  "
            f"{len(fixture.request.evidence_package.claims)} claims  "
            f"traits: {', '.join(fixture.traits) or 'none'}"
        )
    report = coverage_report(fixtures)
    print(f"\n{report['fixtures']} fixtures across {len(report['forms'])} forms.")
    if report["traits_missing"]:
        # Said plainly because it is the thing that makes a result narrower
        # than it looks. Nothing here blocks on it.
        print(
            "  Not covered yet: " + ", ".join(report["traits_missing"]) + "."
            "  A comparison over this set says nothing about those cases."
        )
    else:
        print("  Every hard case is represented at least once.")


# ---------------------------------------------------------------------------
# variant
# ---------------------------------------------------------------------------


def cmd_variant(args: argparse.Namespace) -> None:
    routing = Prompt2BlogModelRouting(
        model_name=args.model_name,
        writing_model=args.writing_model,
        repair_model=args.repair_model,
        audit_model=args.audit_model,
        outline_model=args.outline_model,
        groundedness_model=args.groundedness_model,
        model_stack_id=args.model_stack_id,
    )
    variant = EvalVariant(
        variant_id=args.id,
        label=args.label or args.id,
        notes=args.notes or "",
        model_routing=routing,
        creativity_level=args.creativity,
    )
    path = store().save_variant(variant)
    print(f"Saved variant {variant.variant_id} -> {path}")


def cmd_variants(args: argparse.Namespace) -> None:
    for variant in store().variants():
        routed = {
            key: value
            for key, value in variant.model_routing.model_dump().items()
            if value
        }
        print(f"{variant.variant_id:<20} {variant.label}")
        print(f"    routing: {routed or 'gateway defaults'}")


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------


def cmd_run(args: argparse.Namespace) -> None:
    holder = store()
    fixtures = (
        [holder.fixture(name) for name in args.fixture]
        if args.fixture
        else holder.fixtures()
    )
    variants = [holder.variant(name) for name in args.variant]
    if not fixtures:
        sys.exit("No fixtures to run against.")
    if len(variants) < 2:
        sys.exit("Give at least two --variant ids; a comparison needs two drafts.")

    planned = len(fixtures) * len(variants)
    if not args.spend:
        # The refusal is the point. Every draft is a full article's worth of
        # model calls, and the last measured run cost $0.65 for the writing
        # graph alone -- so an accidental `run` over six fixtures and two
        # variants is real money.
        print(
            f"Would write {planned} articles "
            f"({len(fixtures)} fixtures x {len(variants)} variants).\n"
            "Nothing was bought. Re-run with --spend to actually write them."
        )
        for fixture in fixtures:
            print(f"  {fixture.fixture_id:<24} {fixture.label}")
        return

    print(f"Writing {planned} articles. This spends money.")
    for fixture in fixtures:
        for variant in variants:
            print(f"  {fixture.fixture_id} / {variant.variant_id} ...", flush=True)
            sample = run_sample(fixture, variant)
            holder.save_sample(sample)
            if sample.status == "failed":
                print(f"    failed: {sample.error}")
                continue
            measured = sample.measurements
            print(
                f"    {measured.word_count} words  "
                f"${measured.billed_cost_usd or 0:.4f}  "
                f"{measured.duration_seconds}s  run {sample.run_id}"
            )
            if measured.readiness_blockers:
                print(f"    unready: {'; '.join(measured.readiness_blockers)}")


# ---------------------------------------------------------------------------
# compare and sheet
# ---------------------------------------------------------------------------


def cmd_compare(args: argparse.Namespace) -> None:
    holder = store()
    samples = holder.samples()
    made = 0
    for fixture in holder.fixtures():
        if args.fixture and fixture.fixture_id not in args.fixture:
            continue
        # The newest sample per variant. Re-running a variant should compare
        # the run you just bought, not the first one you ever bought.
        newest: dict[str, Any] = {}
        for sample in samples:
            if sample.fixture_id != fixture.fixture_id:
                continue
            current = newest.get(sample.variant_id)
            if current is None or sample.started_at > current.started_at:
                newest[sample.variant_id] = sample
        if len(newest) < 2:
            continue
        sheet, key = blind_comparison(fixture, list(newest.values()))
        holder.save_comparison(sheet, key)
        made += 1
        print(
            f"{sheet.comparison_id}  {fixture.fixture_id}  "
            f"{len(sheet.entries)} drafts as {', '.join(e.display_label for e in sheet.entries)}"
        )
    if not made:
        print("Nothing to compare: every fixture has fewer than two drafts.")


def render_sheets(sheets: list[BlindComparison]) -> str:
    """One page holding every blind comparison, with the scoring form.

    Self-contained, because it is opened off the filesystem. The variant behind
    each letter is not in this file at all -- not in a comment, not in a data
    attribute -- so it cannot leak to a reader who opens the source.
    """
    criteria_rows = "".join(
        f"<tr><th>{html.escape(name.replace('_', ' '))}</th>"
        f"<td>{html.escape(CRITERION_QUESTIONS[name])}</td></tr>"
        for name in SCORE_CRITERIA
    )
    blocks = []
    for sheet in sheets:
        drafts = "".join(
            f"""<article class="draft">
              <h3>Draft {html.escape(entry.display_label)}</h3>
              {'<p class="failed">This version produced no draft: '
               + html.escape(entry.error) + '</p>'
               if entry.status == 'failed'
               else '<h4>' + html.escape(entry.title) + '</h4><pre>'
                    + html.escape(entry.markdown) + '</pre>'}
            </article>"""
            for entry in sheet.entries
        )
        labels = json.dumps([entry.display_label for entry in sheet.entries])
        blocks.append(
            f"""<section class="comparison" data-comparison="{html.escape(sheet.comparison_id)}"
                      data-labels='{labels}'>
              <p class="eyebrow">{html.escape(sheet.comparison_id)}</p>
              <h2>{html.escape(sheet.fixture_label or sheet.fixture_id)}</h2>
              <dl class="brief">
                <dt>Headline</dt><dd>{html.escape(sheet.seed)}</dd>
                <dt>Reader's question</dt><dd>{html.escape(sheet.reader_question)}</dd>
                <dt>Fails if</dt><dd>{html.escape(sheet.fails_if)}</dd>
                <dt>Form</dt><dd>{html.escape(sheet.form_id)}</dd>
              </dl>
              <div class="drafts">{drafts}</div>
              <div class="scoring"></div>
            </section>"""
        )

    return f"""<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prompt2Blog blind comparison</title>
<style>
:root{{--background:#F5F0E8;--paper:#EFE9DE;--ink:#1A1A1A;--accent:#3B5BDB;--rule:#c9c2b7}}
body{{margin:0;background:var(--background);color:var(--ink);
  font:16px/1.6 system-ui,sans-serif}}
main{{max-width:1200px;margin:auto;padding:40px 24px 80px}}
h1,h2,h3{{font-family:Georgia,serif;letter-spacing:-.02em}}
h1{{font-size:40px;margin:0 0 8px}}
.eyebrow{{font:700 11px/1.5 system-ui;letter-spacing:.14em;text-transform:uppercase;
  color:var(--accent);margin:0}}
.comparison{{border-top:3px double var(--ink);margin-top:44px;padding-top:20px}}
.brief{{display:grid;grid-template-columns:150px 1fr;gap:4px 16px;background:var(--paper);
  padding:16px 20px;font-size:14px;margin:0 0 20px}}
.brief dt{{font-weight:700}} .brief dd{{margin:0}}
.drafts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px}}
.draft{{border-top:1px solid var(--rule);padding-top:12px;min-width:0}}
.draft pre{{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.65 Georgia,serif;
  background:var(--paper);padding:16px}}
.failed{{background:var(--paper);padding:12px;font-style:italic}}
table{{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px}}
th,td{{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid var(--rule)}}
.scoring{{margin-top:24px;background:var(--paper);padding:16px 20px}}
.scoring label{{display:block;font-size:13px;margin:6px 0}}
.scoring input[type=range]{{width:180px;vertical-align:middle}}
.scoring textarea{{width:100%;min-height:60px;font:13px system-ui}}
button{{font:600 14px system-ui;padding:8px 16px;background:var(--accent);color:#fff;
  border:0;cursor:pointer}}
#out{{width:100%;min-height:200px;font:12px ui-monospace,monospace;margin-top:12px}}
</style>
<main>
<h1>Read these blind.</h1>
<p>Which version wrote which draft is not in this file. Score each draft on its
own, one question at a time; do not add the numbers up.
{SCORE_MIN} is worst, {SCORE_MAX} is best, on every row.</p>
<table><tbody>{criteria_rows}</tbody></table>
{''.join(blocks)}
<h2>Your answers</h2>
<p>Fill the sliders above, press the button, and save this JSON. Then:
<code>p2b-eval.py score &lt;comparison_id&gt; --reviewer you --from answers.json</code></p>
<button id="collect">Collect answers</button>
<textarea id="out" readonly></textarea>
</main>
<script>
const CRITERIA = {json.dumps(list(SCORE_CRITERIA))};
for (const section of document.querySelectorAll('.comparison')) {{
  const labels = JSON.parse(section.dataset.labels);
  section.querySelector('.scoring').innerHTML = labels.map(label => `
    <fieldset><legend><strong>Draft ${{label}}</strong></legend>` +
    CRITERIA.map(c => `<label>${{c.replace(/_/g,' ')}}
      <input type="range" min="{SCORE_MIN}" max="{SCORE_MAX}" value="3"
             data-label="${{label}}" data-criterion="${{c}}"
             oninput="this.nextElementSibling.textContent=this.value">
      <span>3</span></label>`).join('') +
    `<label>note <textarea data-label="${{label}}" data-note="1"></textarea></label>
    </fieldset>`).join('');
}}
document.getElementById('collect').onclick = () => {{
  const sheets = [...document.querySelectorAll('.comparison')].map(section => ({{
    comparison_id: section.dataset.comparison,
    entries: JSON.parse(section.dataset.labels).map(label => ({{
      display_label: label,
      note: (section.querySelector(`textarea[data-label="${{label}}"]`) || {{}}).value || '',
      scores: CRITERIA.map(c => ({{
        criterion: c,
        value: Number(section.querySelector(
          `input[data-label="${{label}}"][data-criterion="${{c}}"]`).value)
      }}))
    }}))
  }}));
  document.getElementById('out').value = JSON.stringify(sheets, null, 2);
}};
</script>
"""


def cmd_sheet(args: argparse.Namespace) -> None:
    holder = store()
    sheets = holder.comparisons()
    if args.comparison_id:
        sheets = [s for s in sheets if s.comparison_id in args.comparison_id]
    if not sheets:
        sys.exit("No comparisons yet. Run `compare` after you have drafts.")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "p2b-blind-comparison.html"
    path.write_text(render_sheets(sheets), encoding="utf-8")
    print(f"Wrote {path} ({len(sheets)} comparison(s))")
    if args.open:
        webbrowser.open(path.as_uri())


# ---------------------------------------------------------------------------
# score and report
# ---------------------------------------------------------------------------


def cmd_score(args: argparse.Namespace) -> None:
    payload = json.loads(Path(args.source).read_text(encoding="utf-8"))
    entries = payload if isinstance(payload, list) else [payload]
    holder = store()
    saved = 0
    for item in entries:
        comparison_id = item.get("comparison_id") or args.comparison_id
        if not comparison_id:
            sys.exit("Each answer block needs a comparison_id.")
        if args.comparison_id and comparison_id != args.comparison_id:
            continue
        sheet = ScoreSheet(
            comparison_id=comparison_id,
            reviewer=args.reviewer,
            created_at=datetime.now(timezone.utc).isoformat(),
            entries=item.get("entries") or [],
            note=item.get("note") or "",
        )
        path = holder.save_score_sheet(sheet)
        saved += 1
        print(f"Saved {path}")
    if not saved:
        print("Nothing matched; no scores were saved.")


def cmd_report(args: argparse.Namespace) -> None:
    result = store().report()
    verdict = result["verdict"]
    print(f"\nVerdict: {verdict['decision']}")
    print(f"  {verdict['reason']}")
    if verdict.get("leaders"):
        print(f"  ahead: {', '.join(verdict['leaders'])}")

    print(f"\nFixtures scored: {', '.join(result['fixtures_scored']) or 'none'}")
    if result["unresolved"]:
        print(f"  UNRESOLVED (rescore these): {', '.join(result['unresolved'])}")

    print("\nPer criterion, never added together:")
    for row in result["criteria"]:
        means = "  ".join(f"{k}={v}" for k, v in sorted(row["means"].items()))
        direction = (
            f"-> {row['leader']}"
            if row["reportable_direction"]
            else "-> no direction yet"
        )
        print(f"  {row['criterion']:<24} {means:<40} {direction}")

    print("\nMeasured, not judged:")
    for variant_id, measured in result["measurements"].items():
        print(
            f"  {variant_id:<20} {measured['completed']}/{measured['samples']} wrote  "
            f"${measured['mean_billed_cost_usd'] or 0:.4f} avg  "
            f"{measured['mean_word_count'] or 0:.0f} words  "
            f"{measured['mean_duration_seconds'] or 0:.0f}s"
        )
        if measured["failed"]:
            print(f"      {measured['failed']} failed to produce a draft")
        if measured["samples_with_readiness_blockers"]:
            print(
                f"      {measured['samples_with_readiness_blockers']} draft(s) the "
                "pipeline itself called unready"
            )
    print()


# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    capture = subparsers.add_parser("capture", help="freeze a finished run's inputs")
    capture.add_argument("run_id")
    capture.add_argument("--id", required=True, help="fixture id")
    capture.add_argument("--label", required=True)
    capture.add_argument("--notes", default="")
    capture.add_argument("--length", default="medium")
    capture.set_defaults(func=cmd_capture)

    fixtures = subparsers.add_parser("fixtures", help="what the set covers")
    fixtures.set_defaults(func=cmd_fixtures)

    variant = subparsers.add_parser("variant", help="describe a version to test")
    variant.add_argument("id")
    variant.add_argument("--label", default="")
    variant.add_argument("--notes", default="")
    variant.add_argument("--creativity", default=None)
    for role in (
        "model-name",
        "writing-model",
        "repair-model",
        "audit-model",
        "outline-model",
        "groundedness-model",
        "model-stack-id",
    ):
        variant.add_argument(f"--{role}", default=None)
    variant.set_defaults(func=cmd_variant)

    variants = subparsers.add_parser("variants", help="list versions")
    variants.set_defaults(func=cmd_variants)

    run = subparsers.add_parser("run", help="write drafts (spends money)")
    run.add_argument("--fixture", action="append", default=[])
    run.add_argument("--variant", action="append", default=[])
    run.add_argument(
        "--spend",
        action="store_true",
        help="actually call models; without it, this only prints the plan",
    )
    run.set_defaults(func=cmd_run)

    compare = subparsers.add_parser("compare", help="blind the drafts you have")
    compare.add_argument("--fixture", action="append", default=[])
    compare.set_defaults(func=cmd_compare)

    sheet = subparsers.add_parser("sheet", help="render the blind reading page")
    sheet.add_argument("comparison_id", nargs="*")
    sheet.add_argument("--open", action="store_true")
    sheet.set_defaults(func=cmd_sheet)

    score = subparsers.add_parser("score", help="record a reviewer's answers")
    score.add_argument("comparison_id", nargs="?", default=None)
    score.add_argument("--reviewer", required=True)
    score.add_argument("--from", dest="source", required=True)
    score.set_defaults(func=cmd_score)

    report = subparsers.add_parser("report", help="what the set is entitled to say")
    report.set_defaults(func=cmd_report)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
