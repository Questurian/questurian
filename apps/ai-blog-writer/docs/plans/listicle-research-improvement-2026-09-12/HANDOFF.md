# Listicle research — handoff, 2026-09-12

The work in `IMPLEMENTATION.md` beside this file is **done and merged into the
branch**. This document is what is left, and what a new session needs to know
before touching any of it.

## Where things are

Branch `listicle/research-evidence-pilot`, four commits, working tree clean.
**Nothing is pushed. No PR. Nothing deployed.**

```
52673e40 feat(listicle): Google's reviewers, and a reply that stops mid-sentence
454332e6 docs(listicle): the comparison report, and the true cost of the baseline
4328ee5f test(listicle): a retest returns the whole packet, and a discard stays discarded
ecac99f8 feat(listicle): a research request reads the pages it cites
```

Read **ADR 0040** (`docs/adr/0040-a-research-request-reads-its-sources.md`)
before changing any of it. It amends ADR 0039 and explains every constraint
below. `AGENTS.md` and `CONTEXT.md` still apply.

### Verification baseline, as of this handoff

| | |
|---|---|
| backend pytest | **2,565 pass, 0 fail** (`cd apps/backend && ../../.venv/bin/python -m pytest tests -q`) |
| frontend vitest | **962 pass** (`pnpm exec vitest run --config apps/frontend/vite.config.ts`) |
| frontend tsc | clean (`pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json`) |

The full backend suite takes ~7 minutes. Run it in the background and do not
start a second one alongside it — two competing runs crawl.

A pre-pilot copy of the database is at
`scratchpad/pipeline.db.baseline` in the session that produced this. If that is
gone, the baseline rows are still in `data/pipeline.db` and in
`baseline-attempts.json` beside this file.

## What the design does now

One press of Research this place, in order, with a ceiling nothing inside can
raise:

1. **A brief**, computed from stored data. No model call.
2. **Google's reviews** — one Places Details call. Not fetched over HTTP, spends
   none of the page budget, branch-anchored by Place ID.
3. **Read known source leads** — operator links and audit links.
4. **One grounded search**, which asks for *pages*, not a profile.
5. **Read the pages it named**, within an eight-page budget.
6. **One ungrounded extraction** over the collected text, forced schema.
7. **Checks in code** — passage presence, branch scope, price channel, speaker,
   dates. Nothing is deleted for failing.

Budget: **two model generations, eight pages, one Places call.** `extract_only`
is a fourth mode that re-extracts over pages already collected and buys no
search.

## What happened in the pilot, and after it

Three places authorised, six generations, three grounded — spent exactly.
Verdict was **partial success**; the report is `pilot-report.html` beside this
file and at
https://claude.ai/code/artifact/4bfbc2df-b318-434f-b2dd-031ff2210592

Then two things happened that the report does **not** yet include:

**A production failure was diagnosed and fixed.** The operator pressed Research
again on BarBarian and got "the reply was not JSON". The real cause was
gemini-2.5-flash losing the thread: 2,623 characters of pages, then the digit
`0` repeated 5,466 times, then the whole answer restarted, then 5,466 more.
11,778 output tokens charged. Attempt `06d62efa37ad` holds it. Salvage and
degeneracy reporting were added; the lost reply had named a real 2018 piece of
food writing.

**Google reviews were wired in.** `places.py` already fetched them and was wired
only into the old whole-run pass, which is why the pilot found zero attributable
opinion. See ADR 0040.

**Then the operator re-ran BarBarian themselves** — attempt `0e07e0e64514`,
2026-09-12 17:11, and it validates all three fixes at once:

- 0 → **6 findings, all `evidence_ready`**, 4 of 6 pages read, zero validation
  issues.
- **The first attributable customer opinion in the project**: Israel Ruiz, via
  Google reviews, dated 2025-08-09 — *"The wings were flavorful, and the beer
  selection was excellent."* `named_reviewer`, `branch`, `evidence_ready`.
- `thecitylane.com` (the salvaged lead) read. `barbarian.pe` read — the DNS fix.
  Rappi's redirect-to-index caught and noted.

Be honest about that opinion when reporting it: it is a real instance of the
mechanism working and it is still a thin sentence editorially. "Flavorful" is
not a reason to put a bar on a list.

### Current state of the three profiles

| profile | findings | validation | curation |
|---|---|---|---|
| BarBarian `2a8808edaefc` | 10 | 6 ready, 4 not_checked | 3 kept, 7 unreviewed |
| Casa `018c7cd7f650` | 12 | 6 ready, 2 review_needed, 4 not_checked | 12 unreviewed |
| McCarthy `d84b87f3e9b4` | 16 | 11 ready, 5 not_checked | 16 unreviewed |

`not_checked` rows are the preserved baselines. **Do not touch them.** All 13
baseline findings and all 5 baseline attempts are byte-identical to before this
work; keeping them that way is a requirement, not a courtesy.

## What is left, in the order it should be decided

### 1. An open question the operator has not answered

They wrote: *"i think google reviews is fine but but not via the google api
means get the reviews via api call"*. This was read as **fetch them through an
API rather than scrape**, and Places Details is what was built. If they meant
*do not call Google's API at all*, there is no other sanctioned route — scraping
Google reviews breaks their terms — and the whole reviews stage backs out as one
commit (`52673e40`). **Ask before building anything further on top of it.**

### 2. The discovery model — a spending decision, not a bug

`listicle.profile_research` runs on `gemini-2.5-flash`. Its record in this
pipeline is **9 grounded calls, 3 unreadable (33%)**, in three different failure
modes: truncation at the old token cap, a single output token, and the
degeneracy loop. The failures burned the most tokens of any calls made.

Two of the three are now survivable (the cap was raised; degeneracy is
salvaged). The underlying unreliability is not fixed and cannot be fixed here.

Since the discovery call now returns a short page list rather than a full
packet, moving it up a tier costs little. **`jobs.json` has not been touched.**
This is the operator's call.

### 3. Evidence that is still missing

From the pilot report, still true after BarBarian:

1. **A substantial attributable opinion.** One thin one now exists. Casa and
   McCarthy still have none — their Google reviews have not been fetched,
   because both were researched before the reviews stage existed. **A refresh of
   each would now pull them.** Two places, two generations each, two Places
   calls.
2. **La Casa's dine-in price at Los Olivos.** The S/ 25.00 on the brand site has
   no channel and no branch; the extraction said so and it is flagged
   `review_needed`.
3. **Whether McCarthy's thirteen sauces and its Monday promotion still hold.**
   Both are 2020 facts off a launch article.

### 4. Known weaknesses, unfixed on purpose

- **Present-tense phrasing of a dated fact passes the checks.** McCarthy's "the
  wings are served with a choice of 13 sauces" rests on a 2020-12-28 article.
  The passage is really there, so it passes; the date is stored and shown; the
  extraction listed the currency question as unresolved. Nothing stops the
  sentence. This is the one release criterion the pilot missed.
- **`value_portions` fires the price-channel note on portion claims.** "A
  portion contains 6 pieces" is flagged for a missing channel. Mildly wrong
  wording, harmless, not worth a migration on its own.
- **Review platforms are unreachable.** Restaurant Guru 404, PedidosYa 403,
  Mercado Negro 403, TripAdvisor 403 on both `.com` and `.com.pe`. The prep
  card's TripAdvisor box already reaches the reader, so pasting URLs costs no
  code and buys a `blocked` page record. Do not build a TripAdvisor path.
- **Places returns at most five reviews**, chosen by Google as "most relevant".
  Not a sample anybody designed; the page record says so.
- **Storing review text** is what the whole-run pass has always done. *Quoting*
  it in a published article is a separate decision with its own terms to read,
  and nobody has made it.

### 5. Not authorised, do not do

- **The other fifteen places.** The operator reviews the pilot before any
  expansion. A wider run right now buys more menus and no recommendations.
- **Deployment.** Nothing has been pushed.
- **Any spend not explicitly asked for.** Every research action costs two
  generations and one Places call on the owner's own accounts.

## Where the code is

All under `apps/ai-blog-writer/`.

| what | where |
|---|---|
| the brief | `apps/backend/app/features/listicle_pipeline/research_brief.py` |
| the page reader | `.../source_reader.py` |
| extraction + checks | `.../evidence.py` |
| discovery prompt, parser, salvage | `.../profile_research.py` |
| the sequence | `.../profile_service.py` (`research`, `_save_packet`) |
| the three seams tests replace | `.../api.py` — `_research_call`, `_extract_call`, `_read_pages`; plus `profile_service.fetch_reviews` |
| Google reviews | `.../places.py` — `reviews_as_page` |
| storage | `.../research_store.py`, `.../profile_store.py` (additive columns only) |
| frontend | `apps/frontend/src/features/listiclePipeline/` — `types.ts`, `components/ResearchViewer.tsx`, `components/CandidateCard.tsx` |
| the harness | `scripts/listicle-research-pilot.py` (`--dry-run`, `--spend`, `--report`, `--artifact`) |
| tests | `apps/backend/tests/test_listicle_place_research.py`, `test_listicle_evidence_checks.py`, `apps/frontend/src/features/listiclePipeline/place-research.test.tsx` |

**Every test in this feature must stand in front of all four seams.** A test
that leaves `_read_pages` or `fetch_reviews` real reaches the web, or bills the
owner's Google account, from a suite whose whole promise is that it does not.
The `client` fixture in `test_listicle_place_research.py` patches all four.

## Running things

```bash
cd apps/ai-blog-writer
set -a; source .env; set +a          # GOOGLE_CLOUD_PROJECT, Claude switches
export PYTHONPATH="$PWD/apps/backend:$PWD/packages/utils/src:$PWD/packages/shared/src:$PWD/../../packages/model-gateway/src"

.venv/bin/python scripts/listicle-research-pilot.py --dry-run     # free
.venv/bin/python scripts/listicle-research-pilot.py --report out.html
```

`--dry-run` buys nothing and prints each place's brief, its leads and the
ceiling. Run it before any spend; it also refuses if the board's identities have
moved since the prefill was captured.

The run is `efd5a7cd`, topic `chicken-wings`, 18 retained candidates. Pilot
attempts carry `pilot = "three-place-2026-09-12"`.

## Things that cost a session to learn

- **`data/pipeline.db` is the real database.** Back it up before any run that
  writes. Tests use `isolated_db`; a script does not.
- **trafilatura invents publication dates** from copyright years. The reader
  accepts a date only when it appears verbatim in the HTML.
- **A 200 can be a redirect to an index.** Rappi does this for unknown slugs.
- **A host with no DNS record is not a private address**; they are separate
  states (`no_such_host` vs `refused_address`).
- **Forced-tool calls reported zero tokens** until `usage_out` was threaded
  through `invoke_structured_tool`. Anthropic and Claude-CLI branches still
  report nothing — only the Gemini branch was wired.
- **`packages/utils`**: adding a new top-level name there breaks the abw suite
  (sys.modules stubbing). Adding a keyword argument to an existing function is
  fine.
- **Do not chain `git stash push` with a later pop.**
