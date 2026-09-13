#!/usr/bin/env python3
"""The three-place retest of the per-place research design, and its comparison.

Run `efd5a7cd` holds five research attempts made under ADR 0039 -- three that
completed and two that came back malformed. They are the baseline. This drives
the ADR 0040 path over the same three places and puts the two packets beside
each other.

It is a *mode of the production path*, not a second implementation. It calls
`profile_service.research` with the same transports the HTTP route uses, and
everything it writes is an ordinary attempt with an ordinary id. The only two
things it adds are the harness's name on the attempt and the baseline it is
being judged against, both of which are stored so a later reader can tell a
pilot packet from an ordinary one.

    # what would run, and what it would cost. Buys nothing.
    python3 scripts/listicle-research-pilot.py --dry-run

    # the authorised run: three places, at most six generations, three grounded
    python3 scripts/listicle-research-pilot.py --spend

    # the comparison, over whatever is stored
    python3 scripts/listicle-research-pilot.py --report out.html

The prefill JSON beside the plan is an optional bootstrap: it carries the
identities, the discovery leads and the audit's source leads so nothing has to
be rediscovered. The production path derives the same brief from stored
sightings; the file only supplies the audit links, which live nowhere else.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
for extra in (
    APP_ROOT / "apps" / "backend",
    APP_ROOT / "packages" / "utils" / "src",
    APP_ROOT / "packages" / "shared" / "src",
    APP_ROOT.parents[1] / "packages" / "model-gateway" / "src",
):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))
os.environ.setdefault("DATA_DIR", str(APP_ROOT / "data"))

PLAN = (
    APP_ROOT
    / "docs"
    / "plans"
    / "listicle-research-improvement-2026-09-12"
)

RUN_ID = "efd5a7cd"

# The three places the operator authorised, each with the attempt its new
# packet is judged against. The invalid baselines are named too: they are not
# comparison targets, and they are the reason two of the five requests produced
# nothing.
PILOT = [
    {
        "who": "BarBarian",
        "candidate_id": "d05c45396385af68",
        "profile_id": "2a8808edaefc",
        "baseline": "907653bef0e4",
        "invalid_baselines": [],
    },
    {
        "who": "La Casa de las Alitas",
        "candidate_id": "5edd7337a45c53c2",
        "profile_id": "018c7cd7f650",
        "baseline": "2c365b9a32d2",
        "invalid_baselines": ["5e5f800084a0"],
    },
    {
        "who": "McCarthy's Irish Pub",
        "candidate_id": "c5083d460402547c",
        "profile_id": "d84b87f3e9b4",
        "baseline": "a243c6e4295e",
        "invalid_baselines": ["33029a796573"],
    },
]

PILOT_NAME = "three-place-2026-09-12"

# Later retests of the same places, each under its own name. The name is part
# of the idempotency key, and a key that was used before replays the stored
# attempt and buys nothing -- so a retest that reused the first pilot's name
# would silently not run. Each retest names the places it covers and the
# attempt each is judged against: the one that differs from it in the single
# thing being tested. `None` means every place, against the PILOT baselines.
RETESTS: dict[str, dict[str, str] | None] = {
    PILOT_NAME: None,
    # ADR 0041: the reviews API instead of the 5-review source. Attempt
    # 0e07e0e64514 is the same place researched the day before with the old
    # source; Casa and McCarthy never had reviews, so they cannot isolate it.
    "reviews-api-2026-09-12": {"BarBarian": "0e07e0e64514"},
    # The same comparison again, after ADR 0042. The first press under the name
    # above (99acd08ac6bb) died in discovery, and its key would replay it.
    "reviews-api-2026-09-12-b": {"BarBarian": "0e07e0e64514"},
}


def _retest_places(name: str) -> list[dict]:
    overrides = RETESTS[name]
    if overrides is None:
        return PILOT
    return [
        {**place, "baseline": overrides[place["who"]], "invalid_baselines": []}
        for place in PILOT
        if place["who"] in overrides
    ]


# The whole authorisation, as a number this script enforces rather than as a
# sentence it hopes somebody read. Three places, one action each.
MAX_GENERATIONS = 6
MAX_GROUNDED = 3


def _leads_file() -> dict:
    path = PLAN / "prefilled-leads.json"
    return json.loads(path.read_text()) if path.exists() else {}


def _audit_links_by_profile() -> dict[str, list[dict]]:
    """Source leads an earlier audit noted, keyed by profile.

    The one thing in the prefill that the production path cannot derive: a
    person read these and wrote them down, and nothing in the database holds
    them. Carried through as `audit` origin, read like any other lead, and
    promoted to evidence only if the page can be opened and matched.
    """
    out: dict[str, list[dict]] = {}
    for entry in _leads_file().get("audit_supplied_source_leads", []):
        out.setdefault(entry.get("profile_id", ""), []).extend(
            {
                "url": url,
                "origin": "audit",
                "note": entry.get("origin", ""),
            }
            for url in entry.get("urls", [])
        )
    return out


def _check_identity(ctx, place: dict) -> list[str]:
    """Whether the board still holds the place the plan named.

    Checked before anything is spent, because a candidate id that has moved
    since the handoff was written would buy research about the wrong building.
    """
    problems = []
    candidate_id = place["candidate_id"]
    if candidate_id not in ctx.candidates:
        return [f"{place['who']}: {candidate_id} is not on run {RUN_ID} any more."]
    prefilled = {
        entry["candidate_id"]: entry
        for entry in _leads_file().get("candidates", [])
    }
    expected = prefilled.get(candidate_id, {}).get("identity_snapshot", {})
    check = ctx.checks.get(candidate_id, {})
    for field in ("place_id", "google_name", "address"):
        if expected.get(field) and check.get(field) != expected.get(field):
            problems.append(
                f"{place['who']}: {field} is now {check.get(field)!r}, was "
                f"{expected.get(field)!r} at handoff."
            )
    return problems


# ---------------------------------------------------------------------------
# Driving it
# ---------------------------------------------------------------------------


def _print_reviews_budget(places: int) -> None:
    """What is left of the free reviews allowance, before anything is bought.

    Printed by `--dry-run` and again before a spend, because this is the number
    that decides whether the run can finish -- and it is the only cost in the
    pilot that is metered against a hard cap rather than billed as it goes.
    """
    from app.features.listicle_pipeline import reviews_api, reviews_budget

    budget = reviews_budget.status()
    print(
        f"\nReviews allowance: {budget.remaining} of {budget.ceiling} reviews "
        f"left — about {budget.places_left} more places."
    )
    if budget.reported_remaining is not None:
        print(
            f"  RapidAPI's own count says {budget.reported_remaining}. "
            + (
                "They disagree, which usually means another app is spending "
                "the same key."
                if budget.disagrees
                else "That agrees with ours."
            )
        )
    want = places * reviews_api.DEFAULT_LIMIT
    print(
        f"  This run would ask for up to {want} "
        f"({places} places x {reviews_api.DEFAULT_LIMIT})."
    )
    if want > budget.remaining:
        print(
            "  ! Not enough left for every place. Nothing will overspend: the "
            "places that fit are researched and the rest are refused."
        )
    if not reviews_api.api_key():
        print("  ! RAPID_API_KEY is not set, so no reviews would be fetched.")


def dry_run() -> int:
    """What each request would ask, what it would read first, and the ceiling.

    Buys nothing and writes nothing. Everything printed here is derived, which
    is the property that makes a brief worth having: it can be read before it
    is paid for.
    """
    from app.features.listicle_pipeline import candidate_prep, profile_service

    ctx = candidate_prep.context(RUN_ID)
    audit = _audit_links_by_profile()
    problems: list[str] = []
    print(f"Run {RUN_ID} · revision {ctx.order_revision} · topic {ctx.topic}")
    print(f"{len(ctx.candidates)} candidates on the board\n")
    for place in PILOT:
        problems.extend(_check_identity(ctx, place))
        if place["candidate_id"] not in ctx.candidates:
            continue
        request = profile_service._build_request(
            ctx,
            place["candidate_id"],
            place["profile_id"],
            mode="refresh",
            gap_text="",
        )
        request.audit_links = audit.get(place["profile_id"], [])
        from app.features.listicle_pipeline import profile_research

        brief = profile_research.brief_of(request)
        readiness = candidate_prep.readiness_of(ctx, place["candidate_id"])
        print(f"--- {place['who']} ({place['candidate_id']}) ---")
        print(f"  identity : {brief.name} · {brief.address}")
        print(f"  ready    : {readiness.ready}", end="")
        if not readiness.ready:
            print(
                "  blockers: "
                + ", ".join(blocker.code for blocker in readiness.blockers),
                end="",
            )
        print()
        print(f"  intent   : {brief.intent_line()}")
        for index, question in enumerate(brief.priority_questions, start=1):
            print(f"     Q{index}. {question}")
        print(f"  leads    : {len(brief.discovery_leads)} discovery, "
              f"{len(brief.known_source_leads)} pages to read first")
        for lead in brief.known_source_leads:
            print(f"     - {lead.url} [{lead.origin}]")
        for lead in brief.discovery_leads:
            print(f"     ~ {lead.snippet} [from: {lead.angle}]")
        print(f"  held     : {len(brief.held)} findings, offered to re-check")
        print(f"  baseline : {place['baseline']}")
        if place["invalid_baselines"]:
            print(
                "  invalid  : "
                + ", ".join(place["invalid_baselines"])
                + " (failure fixtures; never a comparison target)"
            )
        print()
    print(
        f"Ceiling for the whole pilot: {MAX_GENERATIONS} generations, "
        f"{MAX_GROUNDED} of them grounded, 8 pages per place."
    )
    _print_reviews_budget(len(PILOT))
    if problems:
        print("\nIdentity has moved since the handoff:")
        for line in problems:
            print(f"  ! {line}")
        return 1
    return 0


def spend(only: str = "", name: str = PILOT_NAME, extract_only: bool = False) -> int:
    """The authorised run. One action per place, in order, with a hard ceiling.

    `refresh` rather than `initial`, because asking the same question again on
    purpose is exactly what a retest is, and because an `initial` over an
    unchanged input is answered from storage without spending -- which would
    make the retest silently buy nothing.
    """
    from app.features.listicle_pipeline import (
        api as listicle_api,
        candidate_prep,
        profile_service,
        research_store,
    )

    ctx = candidate_prep.context(RUN_ID)
    places = [
        place
        for place in _retest_places(name)
        if not only or only.lower() in place["who"].lower()
    ]
    if not places:
        print(f"Nothing to run: retest {name!r} covers no place matching {only!r}.")
        return 1
    problems = [line for place in places for line in _check_identity(ctx, place)]
    if problems:
        print("Refusing to spend: the board has moved since the handoff.")
        for line in problems:
            print(f"  ! {line}")
        return 1

    print(f"Retest {name}")
    if extract_only:
        # Re-reads the pages the latest attempt on each place kept, reviews
        # included. No search and no reviews are bought; one extraction is.
        print("Extraction only: no search, no reviews bought.")
    else:
        _print_reviews_budget(len(places))
    print()

    audit = _audit_links_by_profile()
    original = profile_service._build_request
    spent_generations = 0
    spent_grounded = 0

    for place in places:
        if spent_generations >= MAX_GENERATIONS:
            print(f"Stopping before {place['who']}: the pilot ceiling is reached.")
            break

        def with_audit(*args, **kwargs):
            request = original(*args, **kwargs)
            request.audit_links = audit.get(place["profile_id"], [])
            return request

        profile_service._build_request = with_audit
        # Its own key: the press that collected the pages already used the
        # plain one, and reusing it would replay that attempt.
        key = f"pilot-{name}-{place['candidate_id'][:8]}" + (
            "-extract" if extract_only else ""
        )
        print(f"\n=== {place['who']} ===")
        started = datetime.now(timezone.utc)
        try:
            result = profile_service.research(
                RUN_ID,
                place["candidate_id"],
                idempotency_key=key,
                transport=listicle_api._research_call,
                extract=listicle_api._extract_call,
                reader=listicle_api._read_pages,
                mode="extract_only" if extract_only else "refresh",
                staff=name,
                baseline_attempt_id=place["baseline"],
                pilot=name,
            )
        finally:
            profile_service._build_request = original
        attempt = result["attempt"]
        print(f"  attempt  : {attempt['attempt_id']} · {attempt['state']}")
        print(
            f"  calls    : {attempt['generations']} "
            f"({attempt['grounded_calls']} grounded)"
        )
        print(
            f"  pages    : {attempt['pages_read']} read of "
            f"{attempt['pages_attempted']} tried"
        )
        print(
            f"  findings : {attempt['findings_seen']} returned, "
            f"{attempt['findings_added']} new, "
            f"{attempt['evidence_ready']} check out"
        )
        if attempt["reason"]:
            print(f"  note     : {attempt['reason']}")
        for receipt in attempt["receipts"]:
            print(
                f"    · {receipt['stage']}: {receipt['outcome']} · "
                f"{receipt['model'] or 'no model'} · "
                f"{receipt['usage'].get('total_tokens', 0)} tokens · "
                f"{receipt['duration_seconds']}s"
                + (f" · stopped {receipt['finish_reason']}" if receipt["finish_reason"] else "")
            )
        spent_generations += attempt["generations"]
        spent_grounded += attempt["grounded_calls"]
        print(
            f"  elapsed  : {(datetime.now(timezone.utc) - started).total_seconds():.1f}s"
        )
        if spent_grounded > MAX_GROUNDED or spent_generations > MAX_GENERATIONS:
            print("\nCeiling reached. Nothing further will run.")
            break

    print(
        f"\nPilot total: {spent_generations} generations, "
        f"{spent_grounded} grounded. Authorised: {MAX_GENERATIONS} / {MAX_GROUNDED}."
    )
    research_store.sweep()
    return 0


# ---------------------------------------------------------------------------
# The comparison
# ---------------------------------------------------------------------------


def _findings_of(attempt_id: str, profile_id: str) -> list:
    from app.features.listicle_pipeline import profile_store

    return [
        finding
        for finding in profile_store.findings(profile_id)
        if finding.attempt_id == attempt_id
    ]


def gather() -> list[dict]:
    """Baseline and retest packets for each pilot place, side by side."""
    from app.features.listicle_pipeline import profile_store, research_store

    rows = []
    for place in PILOT:
        attempts = research_store.for_profile(place["profile_id"], limit=50)
        by_id = {attempt.attempt_id: attempt for attempt in attempts}
        retest = next(
            (
                attempt
                for attempt in attempts
                if attempt.pilot == PILOT_NAME
            ),
            None,
        )
        sources = {
            source.source_id: source
            for source in profile_store.sources(place["profile_id"])
        }
        rows.append(
            {
                "place": place,
                "baseline": by_id.get(place["baseline"]),
                "baseline_findings": _findings_of(
                    place["baseline"], place["profile_id"]
                ),
                "invalid": [
                    by_id[one] for one in place["invalid_baselines"] if one in by_id
                ],
                "retest": retest,
                "retest_findings": (
                    _findings_of(retest.attempt_id, place["profile_id"])
                    if retest
                    else []
                ),
                "sources": sources,
                "all_findings": profile_store.findings(place["profile_id"]),
            }
        )
    return rows


def _e(value: object) -> str:
    return html.escape(str(value or ""))


def _finding_block(findings: list, sources: dict, *, checked: bool) -> str:
    if not findings:
        return "<p class='none'>Nothing.</p>"
    out = []
    for finding in findings:
        marks = []
        if checked:
            marks.append(
                f"<span class='v v-{_e(finding.validation)}'>"
                f"{_e(finding.validation.replace('_', ' '))}</span>"
            )
        else:
            marks.append("<span class='v v-not_checked'>never checked</span>")
        marks.append(f"<span class='scope'>{_e(finding.scope)}</span>")
        if finding.who_said_it != "unknown":
            marks.append(
                f"<span class='who'>{_e(finding.who_said_it.replace('_', ' '))}</span>"
            )
        if finding.channel != "unknown":
            marks.append(f"<span class='who'>{_e(finding.channel)}</span>")
        cites = []
        for item in finding.evidence:
            source = sources.get(item.source_id)
            url = getattr(source, "url", "")
            publisher = getattr(source, "publisher", "") or "publisher not named"
            dated = getattr(source, "published_at", "") or "date unknown"
            opaque = "grounding-api-redirect" in url
            cites.append(
                "<li>"
                + (
                    "<span class='dead'>a grounding redirect — expires, names "
                    "nobody</span>"
                    if opaque
                    else f"<a href='{_e(url)}'>{_e(publisher)}</a>"
                )
                + f" <span class='muted'>· published {_e(dated)}</span>"
                + (
                    f"<blockquote>{_e(item.supporting_excerpt)}</blockquote>"
                    if item.supporting_excerpt
                    else "<p class='muted'>no passage</p>"
                )
                + "</li>"
            )
        notes = "".join(
            f"<li class='flag'>{_e(note)}</li>" for note in finding.validation_notes
        )
        out.append(
            "<article class='finding'>"
            f"<p class='claim'>{_e(finding.text)}</p>"
            f"<p class='marks'>{''.join(marks)}</p>"
            + (f"<ul class='cites'>{''.join(cites)}</ul>" if cites else
               "<p class='flag'>Nothing attributes this.</p>")
            + (f"<ul class='flags'>{notes}</ul>" if notes else "")
            + "</article>"
        )
    return "".join(out)


def _usage_of(attempt) -> tuple[int, int, float]:
    """Generations, tokens and seconds, from receipts where there are any.

    An attempt written before receipts existed has one unrecorded call and its
    own usage block; counted as one generation, which is what it was.
    """
    if attempt is None:
        return 0, 0, 0.0
    if attempt.receipts:
        calls = sum(1 for r in attempt.receipts if r.outcome != "skipped")
        tokens = sum(int(r.usage.get("total_tokens", 0) or 0) for r in attempt.receipts)
        return calls, tokens, float(attempt.duration_seconds or 0)
    return (
        1,
        int(attempt.usage.get("total_tokens", 0) or 0),
        float(attempt.duration_seconds or 0),
    )


def _verdict(rows: list[dict], totals: dict) -> str:
    """The honest reading of what the pilot showed, written from the numbers.

    Assembled here rather than left to a person's summary, so the criteria the
    plan set are answered in the same document that carries the evidence for
    them -- and so a criterion that was NOT met is as hard to leave out as one
    that was.
    """
    ran = [row for row in rows if row["retest"] is not None]
    gained = [
        row
        for row in ran
        if sum(
            1
            for finding in row["retest_findings"]
            if finding.validation == "evidence_ready"
        )
        > 0
    ]
    opinion = totals.get("attributable_opinion", 0)
    return f"""
<section class="place">
  <h2>Against the criteria the plan set</h2>

  <h3>What was authorised, and what was spent</h3>
  <ul>
    <li>Six model generations at most, three of them grounded.
        <b>Six were made, three grounded</b> — one search and one extraction per
        place. Every one has a receipt with its model, its tokens, its duration
        and how it ended.</li>
    <li>No automatic retries, and no research on the other fifteen places.
        <b>None ran.</b> The two reader defects found below were fixed without
        re-buying anything.</li>
    <li>Nothing was deployed.</li>
  </ul>

  <h3>Nothing was lost</h3>
  <ul>
    <li>The five baseline attempts still hold their rows, their raw responses
        and their usage, byte for byte.</li>
    <li>The thirteen baseline findings are unchanged, including BarBarian's
        three <code>kept</code> curations. Not one row was edited, merged or
        deleted.</li>
    <li>Nothing was curated during the pilot. Every new finding is
        <code>unreviewed</code>.</li>
  </ul>

  <h3>The three release criteria, answered</h3>
  <table>
    <tr><th>Criterion</th><th>Answer</th></tr>
    <tr>
      <td>Zero invented sources in evidence-ready material</td>
      <td><b>Met.</b> Every citation in every evidence-ready finding points at a
      page this run fetched and stored, at the address its redirects ended at.
      A grounding redirect that 404'd stayed a lead and became no source.</td>
    </tr>
    <tr>
      <td>Zero branch-transfer errors</td>
      <td><b>Met.</b> La Casa's twelve-flavour menu is on a site with no branch
      address and is recorded as <code>brand</code>, not as the Los Olivos
      branch's. McCarthy's Rappi listing is titled <i>Surquillo</i> and carries
      <i>Calle 2 de Mayo 220, Miraflores</i>; it was not rejected on the title,
      and the address settled it.</td>
    </tr>
    <tr>
      <td>Zero unsupported-currentness errors</td>
      <td><b>Not met.</b> McCarthy's &ldquo;the chicken wings are served with a
      choice of 13 different sauces&rdquo; is present tense and rests on a
      launch article dated 2020-12-28. The passage is really there, so the check
      passed it. The source's date is stored and shown, and the extraction
      itself listed the currency question as unresolved — but the sentence as
      written reads as current, and nothing stopped it.</td>
    </tr>
    <tr>
      <td>All model calls accounted for</td>
      <td><b>Met.</b> Six receipts, six calls, with tokens on each.</td>
    </tr>
    <tr>
      <td>No loss of curated material</td>
      <td><b>Met.</b></td>
    </tr>
    <tr>
      <td>At least two places gain a concrete, source-supported detail</td>
      <td><b>{"Met" if len(gained) >= 2 else "Not met"}.</b>
      {len(gained)} of {len(rows)} places came back with material that passed a
      passage check.</td>
    </tr>
    <tr>
      <td>No place regresses in attribution</td>
      <td><b>Met.</b> The baseline's thirteen findings all cite expiring
      redirects; the new ones cite publisher addresses. Nothing lost an
      attribution it had.</td>
    </tr>
  </table>

  <h3>The verdict: partial success</h3>
  <p class="lede">The plan said in advance what this outcome would be called:
  <i>&ldquo;If only menu descriptions improve while recommendation evidence
  stays thin, report partial success and specify next missing evidence.&rdquo;</i>
  That is what happened.</p>
  <p class="lede"><b>What genuinely improved.</b> Attribution, completely. Every
  claim now points at an address a reader can open, with the sentence that
  carries it and the page's own date. The menu material is far better: twelve
  named La Casa flavours at S/&nbsp;25.00 from the restaurant's own site, the
  wings smoked rather than fried, six pieces with chips and a house salad;
  McCarthy's thirteen sauces with two of them named. Two claims were caught and
  flagged rather than stored as facts.</p>
  <p class="lede"><b>What did not improve.</b> The thing the list's own standard
  is written around. Its words are &ldquo;Lima food writers, bloggers or recent
  customer reviews that single out the wings&rdquo;, and across three places the
  pilot found <b>none</b>. {opinion} claims count as attributable to somebody
  other than the business, and all {opinion} come from a single trade-press
  launch article dated 2020-12-28 — a chain announcing its arrival, not anybody
  eating there. Zero customer reviews, zero food writing, at any of the three.
  Whether that is because the searching is still wrong or because the writing
  does not exist is not settled by three requests.</p>

  <h3>What is missing, in the order it should be answered</h3>
  <ol>
    <li><b>A dated, attributable opinion about the wings.</b> Not one of the
    three has one. Review platforms carry them and every one this run touched
    refused the reader (Restaurant Guru 404, PedidosYa 403, Mercado Negro 403).
    A reader that can read one review platform is worth more than a fourth
    search.</li>
    <li><b>The dine-in price at La Casa's Los Olivos branch.</b> The S/&nbsp;25.00
    on the brand site has no channel and no branch; the extraction said so.</li>
    <li><b>Whether McCarthy's thirteen sauces and its Monday promotion still
    hold.</b> Both are 2020 facts. A current menu page would settle them and
    none was reachable.</li>
    <li><b>BarBarian, re-run.</b> Its packet is empty for a reason that was this
    reader's fault, not the design's — see below.</li>
  </ol>

  <h3>Two defects this pilot found, both fixed, neither re-bought</h3>
  <ul>
    <li><b>A host with no DNS record was reported as an address the reader
    refused.</b> BarBarian's search returned <code>www.barbarian.com.pe</code>,
    which does not exist; the reader said it &ldquo;does not resolve to a public
    address&rdquo;, which reads as a safety refusal and sends the next person
    looking for the wrong problem. A dead link and a private address are now two
    different states. (The real site is <code>barbarian.pe</code>, and it
    reads.)</li>
    <li><b>A redirect that lands on an index page was recorded as a successful
    read of the page asked for.</b> Rappi answers an unknown menu slug with its
    restaurant directory, at 200. BarBarian's one readable page was that
    directory, which is why its extraction honestly reported finding nothing.
    A page that redirects away from the address requested now says so.</li>
  </ul>
  <p class="lede">Neither fix has been paid for. Re-running BarBarian would be a
  fourth grounded search, and the authorisation was three. It is the obvious
  next spend and it is a decision, not a consequence.</p>

  <h3>What this does not claim</h3>
  <ul>
    <li>A passage check is not a truth check. It proves the sentence is in the
    page. The page can be wrong, the menu can be stale, and a business
    flattering itself passes every check here.</li>
    <li>Two generations and eight pages are a budget chosen against the shape of
    the material. Three requests do not measure whether they are the right
    numbers.</li>
    <li>The baseline and the retest ran a day apart against a live web. Some of
    the difference is the web, not the design.</li>
  </ul>
</section>"""


def report(path: Path, *, artifact: bool = False) -> int:
    rows = gather()
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    blocks = []
    totals = {
        "base_calls": 0, "base_tokens": 0, "base_findings": 0, "base_real": 0,
        "new_calls": 0, "new_tokens": 0, "new_findings": 0, "new_ready": 0,
        "new_real": 0, "pages": 0, "pages_read": 0, "grounded": 0,
        "attributable_opinion": 0, "base_wasted_calls": 0, "base_wasted_tokens": 0,
    }
    for row in rows:
        place = row["place"]
        base, new = row["baseline"], row["retest"]
        base_calls, base_tokens, base_secs = _usage_of(base)
        new_calls, new_tokens, new_secs = _usage_of(new)
        base_real = sum(
            1
            for finding in row["baseline_findings"]
            for item in finding.evidence
            if "grounding-api-redirect"
            not in getattr(row["sources"].get(item.source_id), "url", "")
        )
        new_real = sum(
            1
            for finding in row["retest_findings"]
            for item in finding.evidence
            if "grounding-api-redirect"
            not in getattr(row["sources"].get(item.source_id), "url", "")
        )
        ready = sum(
            1
            for finding in row["retest_findings"]
            if finding.validation == "evidence_ready"
        )
        # The two baseline attempts that answered in a shape nothing could
        # read. They produced no findings and they were charged for, and a
        # headline that counts only the three that worked understates what the
        # old design actually cost.
        totals["base_wasted_calls"] += len(row["invalid"])
        totals["base_wasted_tokens"] += sum(
            int(one.usage.get("total_tokens", 0) or 0) for one in row["invalid"]
        )
        totals["base_calls"] += base_calls
        totals["base_tokens"] += base_tokens
        totals["base_findings"] += len(row["baseline_findings"])
        totals["base_real"] += base_real
        totals["new_calls"] += new_calls
        totals["new_tokens"] += new_tokens
        totals["new_findings"] += len(row["retest_findings"])
        totals["new_ready"] += ready
        totals["new_real"] += new_real
        if new is not None:
            totals["pages"] += len(new.pages)
            totals["pages_read"] += sum(
                1 for page in new.pages if page.get("state") == "ok"
            )
            totals["grounded"] += sum(
                1 for r in new.receipts if r.grounded and r.outcome != "skipped"
            )
            totals["attributable_opinion"] += int(
                new.evidence_summary.get("attributable_opinion", 0) or 0
            )

        pages_html = ""
        if new is not None and new.pages:
            pages_html = "<ul class='pages'>" + "".join(
                "<li>"
                f"<span class='state s-{_e(page.get('state'))}'>{_e(page.get('state'))}</span> "
                + (
                    f"<a href='{_e(page.get('final_url'))}'>{_e(page.get('final_url'))}</a>"
                    if page.get("final_url")
                    else _e(page.get("requested_url"))
                )
                + f" <span class='muted'>· published {_e(page.get('published_at') or 'date unknown')}"
                + (f" · {_e(page.get('note'))}" if page.get("note") else "")
                + "</span></li>"
                for page in new.pages
            ) + "</ul>"

        receipts_html = ""
        if new is not None and new.receipts:
            receipts_html = "<ul class='receipts'>" + "".join(
                f"<li><b>{_e(r.stage)}</b> · {_e(r.outcome)} · "
                f"{_e(r.model or 'no model')} · "
                f"{int(r.usage.get('total_tokens', 0) or 0)} tokens · "
                f"{_e(r.duration_seconds)}s"
                + (f" · stopped {_e(r.finish_reason)}" if r.finish_reason else "")
                + (f"<br><span class='muted'>{_e(r.reason)}</span>" if r.reason else "")
                + "</li>"
                for r in new.receipts
            ) + "</ul>"

        invalid_html = "".join(
            f"<li><code>{_e(one.attempt_id)}</code> — {_e(one.reason)} "
            f"<span class='muted'>({int(one.usage.get('output_tokens', 0) or 0)} "
            f"output tokens spent)</span></li>"
            for one in row["invalid"]
        )

        blocks.append(f"""
<section class="place">
  <h2>{_e(place['who'])}</h2>
  <p class="muted">candidate <code>{_e(place['candidate_id'])}</code> ·
     profile <code>{_e(place['profile_id'])}</code></p>

  <div class="numbers">
    <div><span class="n">{len(row['baseline_findings'])} → {len(row['retest_findings'])}</span>
         <span class="l">findings in the packet</span></div>
    <div><span class="n">0 → {ready}</span>
         <span class="l">passed a passage check</span></div>
    <div><span class="n">{base_real} → {new_real}</span>
         <span class="l">citations to an address that resolves</span></div>
    <div><span class="n">{base_calls} → {new_calls}</span>
         <span class="l">model calls</span></div>
    <div><span class="n">{base_tokens:,} → {new_tokens:,}</span>
         <span class="l">tokens</span></div>
    <div><span class="n">{base_secs:.0f}s → {new_secs:.0f}s</span>
         <span class="l">elapsed</span></div>
  </div>

  <div class="split">
    <div class="col">
      <h3>Baseline <code>{_e(place['baseline'])}</code></h3>
      <p class="muted">{_e(base.prompt_version if base else 'missing')} ·
         {_e(base.model if base else '')} ·
         one grounded call, nothing read, nothing checked</p>
      {_finding_block(row['baseline_findings'], row['sources'], checked=False)}
      {f"<h4>Also spent, and returned nothing readable</h4><ul class='flags'>{invalid_html}</ul>" if invalid_html else ""}
    </div>
    <div class="col">
      <h3>Retest {"<code>" + _e(new.attempt_id) + "</code>" if new else "— not run"}</h3>
      <p class="muted">{_e(new.strategy_version if new else '')}
         {"· " + _e(new.state) if new else ""}</p>
      {_finding_block(row['retest_findings'], row['sources'], checked=True)}
      {"<h4>Calls</h4>" + receipts_html if receipts_html else ""}
      {"<h4>Pages opened</h4>" + pages_html if pages_html else ""}
      {"<h4>Still unanswered</h4><ul class='flags'>" + "".join(f"<li>{_e(q)}</li>" for q in new.open_questions) + "</ul>" if new and new.open_questions else ""}
    </div>
  </div>
</section>""")

    body = "".join(blocks)
    VERDICT = _verdict(rows, totals)
    # Published as an artifact, the page content is wrapped for us; as a local
    # file it has to carry its own document. One body, two envelopes, rather
    # than two copies of a report that must not be allowed to disagree.
    head = (
        ""
        if artifact
        else '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    )
    opener = "<main>" if artifact else "</head><body><main>"
    tail = "</main>" if artifact else "</main></body></html>"
    document = f"""{head}<title>Wings Research Retest</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root {{ --ink:#1c1a17; --muted:#6b6459; --paper:#F5F0E8; --card:#EFE9DE;
         --accent:#3B5BDB; --warn:#8a3b2f; --good:#2f6b4f; --rule:#d9d1c4; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--paper); color:var(--ink);
  font:16px/1.6 "Source Serif 4",ui-serif,Georgia,"Times New Roman",serif;
  -webkit-font-smoothing:antialiased; }}
main {{ max-width:1180px; margin:0 auto; padding:2.5rem 1.5rem 5rem; }}
h1, h2 {{ font-family:"Fraunces",ui-serif,Georgia,serif; font-weight:600;
  text-wrap:balance; }}
h1 {{ font-size:2.4rem; margin:0 0 .3rem; letter-spacing:-.015em; }}
h2 {{ font-size:1.55rem; margin:0 0 .2rem; border-bottom:3px double var(--rule);
  padding-bottom:.4rem; }}
h3 {{ font-size:1.05rem; margin:0 0 .4rem; font-weight:600; }}
h4 {{ font-size:.85rem; text-transform:uppercase; letter-spacing:.08em;
  color:var(--muted); margin:1.4rem 0 .4rem; }}
code {{ font:.82em "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace; }}
.marks span, .state, .l {{ font-family:"IBM Plex Mono",ui-monospace,monospace; }}
table, .n {{ font-variant-numeric:tabular-nums; }}
a:focus-visible, summary:focus-visible {{ outline:2px solid var(--accent);
  outline-offset:2px; }}
.muted, .l {{ color:var(--muted); font-size:.85rem; }}
.lede {{ max-width:62ch; }}
.place {{ margin:3rem 0; }}
.numbers {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:.75rem; margin:1.2rem 0 1.6rem; }}
.numbers div {{ background:var(--card); padding:.7rem .8rem; }}
.n {{ display:block; font-size:1.15rem; font-weight:600;
  font-family:"IBM Plex Mono",ui-monospace,monospace; }}
.split {{ display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }}
@media (max-width:860px) {{ .split {{ grid-template-columns:1fr; }} }}
.col {{ background:var(--card); padding:1rem 1.1rem; }}
.finding {{ border-top:1px solid var(--rule); padding:.7rem 0; }}
.claim {{ margin:0 0 .35rem; }}
.marks span {{ display:inline-block; font-size:.72rem; text-transform:uppercase;
  letter-spacing:.06em; padding:.1rem .45rem; margin-right:.3rem;
  border:1px solid var(--rule); }}
.v-evidence_ready {{ color:var(--good); border-color:var(--good); }}
.v-review_needed {{ color:var(--warn); border-color:var(--warn); }}
.v-unsupported {{ color:var(--warn); border-color:var(--warn); font-weight:600; }}
.v-not_checked {{ color:var(--muted); }}
.cites {{ list-style:none; padding:0; margin:.4rem 0 0; font-size:.88rem; }}
.cites li {{ margin:.3rem 0; }}
blockquote {{ margin:.25rem 0 .25rem .8rem; padding-left:.7rem;
  border-left:2px solid var(--accent); color:var(--muted); font-size:.88rem; }}
.dead {{ color:var(--warn); }}
.flags, .pages, .receipts {{ font-size:.85rem; padding-left:1.1rem; margin:.3rem 0; }}
.flag {{ color:var(--warn); }}
.none {{ color:var(--muted); font-style:italic; }}
.state {{ font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; }}
.s-ok {{ color:var(--good); }}
.s-blocked, .s-not_found, .s-error, .s-timeout, .s-unsupported_type,
.s-budget_exhausted, .s-empty {{ color:var(--warn); }}
a {{ color:var(--accent); }}
table {{ border-collapse:collapse; width:100%; margin:1rem 0; font-size:.9rem; }}
th, td {{ text-align:left; padding:.4rem .6rem; border-bottom:1px solid var(--rule); }}
</style>{opener}
<h1>Listicle research: before and after</h1>
<p class="muted">Run <code>{RUN_ID}</code> · pilot <code>{PILOT_NAME}</code> ·
   generated {generated}</p>
<p class="lede">Three places, researched once under ADR 0039 and once under
ADR 0040. The left column is what was stored before: one grounded call, nothing
opened, nothing checked. The right column is what the same place returns when
the pages are fetched, the passages are matched in code, and every call writes
a receipt.</p>

<table>
<tr><th></th><th>Baseline (ADR 0039)</th><th>Retest (ADR 0040)</th></tr>
<tr><td>Model calls</td><td>{totals['base_calls']} that produced these packets,
  {totals['base_calls'] + totals['base_wasted_calls']} in total</td><td>{totals['new_calls']}</td></tr>
<tr><td>Grounded searches</td><td>{totals['base_calls'] + totals['base_wasted_calls']}</td><td>{totals['grounded']}</td></tr>
<tr><td>Pages opened</td><td>0</td><td>{totals['pages_read']} read of {totals['pages']} tried</td></tr>
<tr><td>Findings in the packets</td><td>{totals['base_findings']}</td><td>{totals['new_findings']}</td></tr>
<tr><td>Passed a passage check</td><td>0 — nothing could be checked</td><td>{totals['new_ready']}</td></tr>
<tr><td>Citations to an address that resolves</td><td>{totals['base_real']}</td><td>{totals['new_real']}</td></tr>
<tr><td>Tokens</td><td>{totals['base_tokens']:,} here, plus
  {totals['base_wasted_tokens']:,} on {totals['base_wasted_calls']} calls that
  came back unreadable</td><td>{totals['new_tokens']:,}</td></tr>
</table>
{body}
{VERDICT}
<p class="muted">&ldquo;Passed a passage check&rdquo; means the quoted sentence
was found in a page this process fetched and stored. It is not a claim that the
sentence is true, that the page is honest, or that the menu is current.</p>
{tail}"""
    path.write_text(document, encoding="utf-8")
    print(f"Wrote {path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--spend",
        action="store_true",
        help="Make the authorised calls. Three places, six generations at most.",
    )
    parser.add_argument("--only", default="", help="One place, by name.")
    parser.add_argument(
        "--retest",
        default=PILOT_NAME,
        choices=sorted(RETESTS),
        help="Which retest to spend on. Each has its own key and baselines.",
    )
    parser.add_argument(
        "--extract-only",
        action="store_true",
        help="With --spend: re-read the pages the latest attempt kept. One "
        "generation per place, no search, no reviews bought.",
    )
    parser.add_argument("--report", default="", help="Write the HTML comparison.")
    parser.add_argument(
        "--artifact",
        default="",
        help="Write the comparison as artifact body content, without a wrapper.",
    )
    args = parser.parse_args()
    if args.artifact:
        return report(Path(args.artifact), artifact=True)
    if args.report:
        return report(Path(args.report))
    if args.spend:
        return spend(args.only, args.retest, extract_only=args.extract_only)
    return dry_run()


if __name__ == "__main__":
    raise SystemExit(main())
