"""Every draft a run produced, rendered as one readable page.

A run keeps each version of the article -- what compose wrote, what repair
rewrote, and the one that shipped -- but they sit inside three different stage
rows as JSON, so comparing them meant querying sqlite by hand. Run 25178bce
shipped the *longer* of two drafts and nothing in the UI said so.

Deliberately dependency-free: only the standard library, no imports from the
rest of this app. The API route feeds it rows it has already read, and
`scripts/p2b-drafts.py` loads this file directly to render the same page
offline, so there is one renderer rather than two that drift.
"""

from __future__ import annotations

import html
import re
from typing import Any

# The pipeline's own word counter, from `support.py::_tokenize_words`. It
# counts runs of letters and digits, so "day-by-day" is 3 words and "US$1,090"
# is 3. Reproduced rather than imported to keep this module standalone; it is
# shown beside a plain word count because the gap between the two is what
# failed run 25178bce, whose repaired draft was 991 words and was rejected at
# a counted 1004 against a 1000 ceiling.
PIPELINE_TOKEN = re.compile(r"[a-z0-9']+")

STAGE_LABELS = {
    "stage_compose": "First draft",
    "stage_v3_compose": "First draft",
    "stage_repair": "Repaired draft",
    "stage_v3_repair": "Repaired draft",
    "stage_supplement": "Supplemented draft",
    "stage_editorial_augmentation": "Augmented draft",
    "stage_final_verify": "Verified draft",
}

# Short enough to be a paragraph of boilerplate rather than an article.
MIN_DRAFT_CHARS = 400


def pipeline_words(text: str) -> int:
    return len(PIPELINE_TOKEN.findall(text.lower()))


def plain_words(text: str) -> int:
    return len(text.split())


def band_side(count: int, low: Any, high: Any) -> str:
    """``over`` / ``under`` / ``""`` for a count against the accepted band."""
    if isinstance(high, int) and high and count > high:
        return "over"
    if isinstance(low, int) and low and count < low:
        return "under"
    return ""


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def _safe_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _draft_text(data: Any) -> tuple[str, str]:
    """The (title, content) a stage payload carries, if it carries an article."""
    data = _safe_dict(data)
    rewrite = data.get("rewrite")
    if isinstance(rewrite, dict):
        content = rewrite.get("improved_content")
        if isinstance(content, str) and len(content) > MIN_DRAFT_CHARS:
            title = rewrite.get("improved_title")
            return (title if isinstance(title, str) else ""), content
    for key in ("content", "markdown", "article"):
        value = data.get(key)
        if isinstance(value, str) and len(value) > MIN_DRAFT_CHARS:
            return "", value
    return "", ""


def _inline(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", escaped)
    return escaped


def markdown_to_html(text: str) -> str:
    """Enough markdown to read a draft: headings, lists, bold, italics.

    Not a markdown implementation. The drafts this renders are pipeline output,
    which is headings and paragraphs, and a real parser would be a dependency
    this module exists to avoid.
    """
    out: list[str] = []
    in_list = False
    for raw_line in text.split("\n"):
        line = raw_line.rstrip()
        if not line.strip():
            if in_list:
                out.append("</ul>")
                in_list = False
            continue
        bullet = re.match(r"^\s*[-*]\s+(.*)$", line)
        if bullet:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_inline(bullet.group(1))}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading:
            level = min(len(heading.group(1)) + 1, 6)
            out.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
        else:
            out.append(f"<p>{_inline(line)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def build_drafts_report(
    *,
    run_id: str,
    status: dict[str, Any] | None,
    stages: dict[str, Any],
    markdown: str,
) -> dict[str, Any]:
    """Collect every draft in a run, newest last, with the shipped one marked.

    ``stages`` is what ``read_all_stage_results`` returns: stage name to the
    stored envelope, in the order the stages were written.
    """
    drafts: list[dict[str, Any]] = []
    payloads: dict[str, Any] = {}
    for stage_name, envelope in stages.items():
        envelope = _safe_dict(envelope)
        data = _safe_dict(envelope.get("data") or envelope)
        payloads[stage_name] = data
        title, content = _draft_text(data)
        if not content:
            continue
        created = str(envelope.get("created_at") or "")
        drafts.append(
            {
                "stage": stage_name,
                "label": STAGE_LABELS.get(stage_name, stage_name),
                "at": created[11:19],
                "title": title,
                "content": content,
                "is_shipped": False,
            }
        )

    if markdown:
        body = re.sub(r"^#\s+.*\n+", "", markdown, count=1)
        shipped = _normalize(body)
        for draft in drafts:
            draft["is_shipped"] = _normalize(draft["content"]) == shipped
        drafts.append(
            {
                "stage": "final",
                "label": "Shipped article",
                "at": "",
                "title": markdown.split("\n", 1)[0].lstrip("# ").strip(),
                "content": body,
                "is_shipped": False,
            }
        )

    for draft in drafts:
        draft["words"] = plain_words(draft["content"])
        draft["pipeline_words"] = pipeline_words(draft["content"])

    audit = payloads.get("stage_v3_quality_audit") or payloads.get(
        "stage_quality_audit"
    )
    settle = payloads.get("stage_v3_quality_settle") or payloads.get(
        "stage_quality_settle"
    )
    finalize = payloads.get("stage_v3_finalize") or payloads.get("stage_finalize")
    audit = _safe_dict(audit)
    settle = _safe_dict(settle)

    return {
        "run_id": run_id,
        "status": _safe_dict(status),
        "drafts": drafts,
        "finalize": _safe_dict(finalize),
        "quality": _safe_dict(audit.get("quality")),
        "repair_decision": _safe_dict(
            audit.get("repair_decision") or settle.get("repair_decision")
        ),
        "settle": settle,
        "routing": _safe_dict(
            _safe_dict(payloads.get("pipeline_input_v3")).get("model_routing")
        ),
        "ledger": _safe_dict(payloads.get("usage_ledger")),
    }


def _chip(label: str, value: str, tone: str = "") -> str:
    return (
        f'<div class="chip {tone}"><span class="chip-label">{html.escape(label)}'
        f'</span><span class="chip-value">{html.escape(value)}</span></div>'
    )


def _table(rows: list[tuple[str, str]]) -> str:
    return "".join(
        f"<tr><td>{html.escape(str(key))}</td><td>{html.escape(str(value))}</td></tr>"
        for key, value in rows
    )


def render_drafts_page(report: dict[str, Any]) -> str:
    """The whole page, self-contained: no scripts fetched, no styles fetched."""
    drafts = report["drafts"]
    quality = report["quality"]
    finalize = report["finalize"]
    settle = report["settle"]
    decision = report["repair_decision"]
    ledger = report["ledger"]

    checks = _safe_dict(finalize.get("constraint_checks")) or _safe_dict(
        quality.get("constraint_checks")
    )
    failing = [key for key, value in checks.items() if value is False]
    blockers = finalize.get("readiness_blockers") or []
    status = (
        finalize.get("pipeline_status")
        or report["status"].get("status")
        or "unknown"
    )

    stage_rows = ledger.get("by_stage") or []
    totals = _safe_dict(ledger.get("totals"))
    total_cost = sum(
        row.get("cost_usd") or 0.0
        for row in stage_rows
        if isinstance(row, dict) and isinstance(row.get("cost_usd"), (int, float))
    )

    chips = [
        _chip("Verdict", str(status), "good" if status == "ready_for_staging" else "bad"),
        _chip("Drafts", str(len([d for d in drafts if d["stage"] != "final"]))),
        _chip("Metered cost", f"${total_cost:,.2f}" if total_cost else "n/a"),
        _chip("Tokens", f"{totals.get('total_tokens', 0):,}"),
        _chip("Repair attempts", str(settle.get("repair_attempts", 0))),
    ]
    if settle.get("reverted_to_earlier_draft"):
        chips.append(_chip("Kept draft", "reverted to an earlier one", "warn"))

    band_min = checks.get("word_count_target_min")
    band_max = checks.get("word_count_target_max")
    band = f"{band_min}–{band_max}" if band_min and band_max else "not set"

    tabs: list[str] = []
    panes: list[str] = []
    for index, draft in enumerate(drafts):
        marks = []
        if draft["is_shipped"]:
            marks.append('<span class="tag ship">shipped</span>')
        # Two verdicts, because they can disagree: the gate reads the pipeline
        # counter, which on the Lima run failed a draft whose actual words were
        # inside the band. When they split, the draft says so.
        counter_side = band_side(draft["pipeline_words"], band_min, band_max)
        if counter_side:
            marks.append(f'<span class="tag over">counter: {counter_side} band</span>')
            if not band_side(draft["words"], band_min, band_max):
                marks.append('<span class="tag ok">words in band</span>')
        delta = draft["pipeline_words"] - draft["words"]
        title_html = (
            f'<p class="meta">Title: {html.escape(draft["title"])}</p>'
            if draft["title"]
            else ""
        )
        tabs.append(
            f'<button class="tab{" active" if index == 0 else ""}"'
            f' data-pane="{index}">{html.escape(draft["label"])}'
            f'<span class="tab-count">{draft["words"]} words</span></button>'
        )
        panes.append(
            f'<section class="pane{" active" if index == 0 else ""}" id="pane-{index}">'
            f'<header class="pane-head"><h2>{html.escape(draft["label"])}'
            f'{"".join(marks)}</h2>'
            f'<p class="meta"><b>{draft["words"]}</b> words &middot; pipeline counter'
            f' says <b>{draft["pipeline_words"]}</b>'
            f'{f" (+{delta})" if delta else ""} &middot; band {html.escape(band)}'
            f'{" &middot; " + draft["at"] if draft["at"] else ""}</p>'
            f"{title_html}</header>"
            f'<article class="prose">{markdown_to_html(draft["content"])}</article>'
            "</section>"
        )

    revisions = quality.get("required_revisions") or []
    revision_html = "".join(f"<li>{html.escape(str(item))}</li>" for item in revisions)

    decision_html = ""
    if decision:
        decision_html = (
            '<p class="meta">Repair gate: <b>'
            f'{html.escape(str(decision.get("route", "")))}</b> — '
            f'{html.escape(str(decision.get("reason", "")))}, '
            f'{decision.get("attempts_used", 0)} of '
            f'{decision.get("attempts_allowed", 0)} attempts, '
            f'{decision.get("tokens_spent") or 0:,} of '
            f'{decision.get("token_budget", 0):,} tokens spent.</p>'
        )

    heading = drafts[0]["title"] if drafts and drafts[0]["title"] else "Prompt2Blog run"
    ledger_rows = "".join(
        f'<tr><td>{html.escape(str(row.get("stage", "")))}</td>'
        f'<td>{row.get("total_tokens", 0):,}</td>'
        f'<td>{("$%.4f" % row["cost_usd"]) if isinstance(row.get("cost_usd"), (int, float)) else "—"}</td></tr>'
        for row in stage_rows
        if isinstance(row, dict)
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Drafts — {html.escape(report["run_id"][:8])}</title>
<style>
  :root {{
    --bg:#f7f5f1; --panel:#fffdfa; --ink:#1d1b18; --muted:#6b6660;
    --line:#e2ddd4; --accent:#3b5bdb; --bad:#b3261e; --good:#1a7f4b; --warn:#a8620a;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#161513; --panel:#1e1d1a; --ink:#eae7e1; --muted:#a09a92;
      --line:#302e2a; --accent:#8ea2ff; --bad:#ff8a80; --good:#7ddba3;
      --warn:#e0a458; }}
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif; }}
  header.top {{ padding:24px 32px 16px; border-bottom:1px solid var(--line); }}
  h1 {{ font-size:20px; margin:0 0 4px; }}
  .runid {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    color:var(--muted); font-size:13px; }}
  .chips {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }}
  .chip {{ background:var(--panel); border:1px solid var(--line); border-radius:8px;
    padding:6px 10px; display:flex; gap:8px; align-items:baseline; font-size:13px; }}
  .chip-label {{ color:var(--muted); }}
  .chip-value {{ font-weight:600; }}
  .chip.bad .chip-value {{ color:var(--bad); }}
  .chip.good .chip-value {{ color:var(--good); }}
  .chip.warn .chip-value {{ color:var(--warn); }}
  .wrap {{ display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:24px;
    padding:24px 32px 64px; align-items:start; }}
  @media (max-width:1000px) {{ .wrap {{ grid-template-columns:1fr; }} }}
  .tabs {{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }}
  .tab {{ background:var(--panel); border:1px solid var(--line); border-radius:8px;
    padding:8px 12px; cursor:pointer; color:var(--ink); font:inherit; font-size:14px;
    display:flex; gap:8px; align-items:baseline; }}
  .tab.active {{ border-color:var(--accent); box-shadow:inset 0 -2px 0 var(--accent); }}
  .tab-count {{ color:var(--muted); font-size:12px; }}
  .pane {{ display:none; background:var(--panel); border:1px solid var(--line);
    border-radius:12px; padding:24px 28px; }}
  .pane.active {{ display:block; }}
  .pane-head h2 {{ font-size:17px; margin:0 0 6px; display:flex; gap:8px;
    align-items:center; flex-wrap:wrap; }}
  .meta {{ color:var(--muted); font-size:13px; margin:0 0 4px; }}
  .tag {{ font-size:11px; text-transform:uppercase; letter-spacing:.06em;
    border-radius:999px; padding:2px 8px; font-weight:700; }}
  .tag.ship {{ background:var(--good); color:#fff; }}
  .tag.over {{ background:var(--warn); color:#fff; }}
  .tag.ok {{ background:transparent; color:var(--good);
    border:1px solid var(--good); }}
  .prose {{ max-width:70ch; margin-top:20px; border-top:1px solid var(--line);
    padding-top:20px; }}
  .prose h2 {{ font-size:19px; margin:28px 0 8px; }}
  .prose h3 {{ font-size:16px; margin:22px 0 6px; }}
  .prose p {{ margin:0 0 14px; }}
  aside section {{ background:var(--panel); border:1px solid var(--line);
    border-radius:12px; padding:16px 18px; margin-bottom:16px; }}
  aside h3 {{ font-size:13px; text-transform:uppercase; letter-spacing:.07em;
    color:var(--muted); margin:0 0 10px; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  td {{ padding:4px 0; border-bottom:1px solid var(--line); vertical-align:top; }}
  td:first-child {{ color:var(--muted); padding-right:10px; }}
  td:last-child {{ text-align:right; font-variant-numeric:tabular-nums; }}
  ul.revisions {{ margin:0; padding-left:18px; font-size:13px; }}
  ul.revisions li {{ margin-bottom:6px; }}
  .fail {{ color:var(--bad); font-weight:600; }}
</style></head>
<body>
<header class="top">
  <h1>{html.escape(str(heading))}</h1>
  <div class="runid">{html.escape(report["run_id"])}</div>
  <div class="chips">{"".join(chips)}</div>
</header>
<div class="wrap">
  <main>
    <div class="tabs">{"".join(tabs)}</div>
    {"".join(panes)}
  </main>
  <aside>
    <section>
      <h3>Audit</h3>
      <p class="meta">Overall score <b>{quality.get("overall_score", "—")}</b>{
        "<br>Failing: <span class='fail'>" + html.escape(", ".join(failing)) + "</span>"
        if failing else ""}</p>
      {decision_html}
      {"<ul class='revisions'>" + revision_html + "</ul>" if revision_html else ""}
      {"<p class='meta'>Blockers: " + html.escape(", ".join(map(str, blockers))) + "</p>"
       if blockers else ""}
    </section>
    <section><h3>Checks</h3><table>{_table(sorted(checks.items()))}</table></section>
    <section><h3>Spend by stage</h3><table>{ledger_rows}</table></section>
    <section><h3>Routing</h3><table>{_table(list(report["routing"].items()))}</table></section>
  </aside>
</div>
<script>
  document.querySelectorAll('.tab').forEach(function (tab) {{
    tab.addEventListener('click', function () {{
      document.querySelectorAll('.tab').forEach(function (other) {{
        other.classList.remove('active');
      }});
      document.querySelectorAll('.pane').forEach(function (pane) {{
        pane.classList.remove('active');
      }});
      tab.classList.add('active');
      document.getElementById('pane-' + tab.dataset.pane).classList.add('active');
    }});
  }});
</script>
</body></html>
"""
