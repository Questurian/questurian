# Listicle reviews — handoff, 2026-09-12 (second session)

Supersedes the reviews half of `HANDOFF.md` beside this file. Everything that
document says about the pilot, the baselines and the research sequence still
holds. **What changed is where customer reviews come from and what happens to
them before the extraction sees them.**

Read **ADR 0041** (`docs/adr/0041-customer-reviews-come-from-the-reviews-api.md`)
before touching any of it. It amends ADR 0040 and explains every constraint
below.

## Where things are

Branch `listicle/research-evidence-pilot`, working tree clean.
**Nothing is pushed. No PR. Nothing deployed.**

```
21384b61 feat(listicle): something chooses which reviews are worth the page
a8b4a42e fix(listicle): the reviews page was the one page that ignored the ceiling
e819a6f0 docs(listicle): the reviews source moved, and the handoff says so
2bd5f568 feat(listicle): twenty reviews instead of five, and a switch that stops at 500
e7b5e4a8 docs(listicle): hand off what is left   <- previous session ended here
```

### Verification baseline

| | |
|---|---|
| backend pytest | **2,600 pass, 0 fail** (`cd apps/backend && ../../.venv/bin/python -m pytest tests -q`) |
| frontend vitest | **966 pass** (`pnpm exec vitest run --config apps/frontend/vite.config.ts`) |
| frontend tsc | clean (`pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json`) |

Backend suite takes ~7 minutes. Run it in the background; do not start two.

## The one thing that will cost money if you get it wrong

**The reviews API is billed per review object returned, not per request**, on a
free plan of **500**. `26 are spent` as of this handoff — three calls made while
building. `474 left, 23 places.`

`reviews_budget.py` is the guard. Its rules, all of them deliberate:

- **Refuses before the request leaves**, never after.
- **Refuses on the whole of what a call could cost.** Asking for 20 requires 20
  available. Charging the difference to optimism is how a ceiling gets crossed
  by exactly one call.
- **Two counters, stricter wins.** Our ledger in `pipeline.db`, and RapidAPI's
  own `x-ratelimit-businesses-remaining` header. Ours cannot see Location
  Manager spending the same key; theirs cannot see a call that never returned.
  A disagreement is shown on screen, not resolved.
- **A call with no answer is charged in full.** Undercounting is the only error
  here that costs money.
- **It does not auto-reset when the month rolls over.** A person calls
  `reviews_budget.reset("reason")`. A machine deciding on its own that it is
  safe to start buying is the failure this exists to prevent.

Remaining budget is always said in **places left**, never in review objects —
board payload, research drawer, and `--dry-run`.

**No test may reach this API.** The `client` fixture in
`test_listicle_place_research.py` patches `profile_service.fetch_reviews`.
`reviews_api` also refuses without `RAPID_API_KEY`, but do not rely on that.

## What the reviews path does now

1. **Derive the subject's words** from the run's own stored search evidence.
   Run `efd5a7cd` yields `alitas, wings, salsas, chicken`. No model call, no
   translation table.
2. **Ask the API for those reviews** (`query=alitas`), by Google Place ID,
   `limit=20`, `sort_by=most_relevant`, `region=pe`, `language=es`.
3. **Rank what comes back** — subject, then substance, then the reviewer's
   standing, then length.
4. **Fill one page** to the same 12,000-character ceiling every fetched page
   obeys, dropping whole reviews rather than cutting text.
5. The page note says what was bought, what was kept, and why the rest was not.

## Traps — each one cost real time this session

- **Subject terms are DERIVED, so they can be wrong.** The first version
  *filtered* on them. A run whose terms came out narrow silently destroyed real
  material and returned no page — a place with opinions reading as a place with
  none. **Subject decides the order, never survival.** Do not turn ranking back
  into filtering. `test_a_wrong_subject_word_costs_a_review_its_place_not_its_existence`
  is the guard.
- **A length threshold of 80 characters is too high.** "Pedimos unas alitas y
  estaban con mal sabor" is 44 characters and is exactly the material the list
  is made of. The only hard floor is `MIN_USABLE_CHARS = 25`.
- **Calendar words poison term derivation.** `agosto` outranks real subject
  words on document frequency and would mark any review mentioning August as
  on-topic. Months and weekdays are stopwords by name.
- **`business-reviews-v2` returns only `reviews` and `cursor`.** No business
  name, no rating. The page title's place name must be passed in by the caller.
- **Location Manager's `reviews-api.client.ts` types describe an older response
  shape** (`reviews_data`, `review_rating`, nested `author`). Live v2 is flat.
  Both are accepted in `reviews_api.py`. **LM's types are stale — worth fixing
  there separately.**
- **Per-review permalinks are deliberately NOT in the page text.** ~170 chars
  each, 28% of the page budget across twenty, and nothing downstream follows
  them. With links 16 reviews fit; without, all 20 do.
- **`RAPID_API_KEY` is one account key**, shared with `apps/location-manager`.
  Copied into `apps/ai-blog-writer/.env`. Both are gitignored.

## What is left, in the order it should be decided

### 1. Nobody has pressed the button yet

**This is the whole point and it has not happened.** No place has been
researched through this path. Everything above is a design with tests behind
it, not a result.

**BarBarian is the honest comparison** — it was researched yesterday
(`0e07e0e64514`) with the old 5-review source and produced 6 findings. Same
place, one thing changed. Casa and McCarthy have never had reviews at all, so
they would jump for reasons you could not separate.

Cost per press: 2 model generations + up to 20 reviews.

### 2. The extraction can be truncated and nothing notices

`EXTRACTION_MAX_TOKENS` is 8,192 and `structured()` reports no finish reason, so
a reply cut off at the ceiling is indistinguishable from one that finished.
Four times the review material makes it likelier. Two things hold it down
rather than remove it: the page ceiling bounds how much the input grew, and
0040's `extract_only` re-runs extraction over pages already collected without
buying a second search.

**The real fix is threading a finish reason through the model gateway's
structured path.** Not done. Touches a shared package.

### 3. `sort_by=newest` is built and switched off

The sharpest remaining answer to the standing weakness — a dated fact phrased
in the present tense passes every check. `most_relevant` is already
recency-weighted (BarBarian's twenty span 2017–2026), so what `newest` buys
over it has to be measured, not assumed. Buying both sorts is two calls and
halves how many places the free allowance covers.

### 4. Issue #560 — the discovery model

`listicle.profile_research` runs on `gemini-2.5-flash`: 3 of 10 attempts
unreadable, and the worst failure was the most expensive call of the ten.
`jobs.json` untouched; the operator's call.
https://github.com/Questurian/questurian/issues/560

### 5. Selection is rules, not judgement

Nothing reads a review and decides whether it is any good. It counts words,
matches terms and sorts. It removes the worst of the noise; it does not pick
the best material. Whether that is enough is the question pressing the button
answers.

## Not authorised

- **The other fifteen places.** The pilot is reviewed before any expansion.
- **Deployment.** Nothing pushed.
- **Any spend not explicitly asked for.**

## Where the code is

| what | where |
|---|---|
| the reviews call | `apps/backend/app/features/listicle_pipeline/reviews_api.py` |
| the 500 cap | `.../reviews_budget.py` — `check()` is the switch |
| subject words + ranking | `.../review_selection.py` |
| the sequence | `.../profile_service.py` — `research`, `fetch_reviews`, `board` |
| the seams tests replace | `.../api.py` — `_research_call`, `_extract_call`, `_read_pages`; plus `profile_service.fetch_reviews` |
| frontend | `apps/frontend/src/features/listiclePipeline/` — `types.ts`, `components/ResearchViewer.tsx` (`ReviewsAllowance`, `SubjectTerms`), `components/SearchResults.tsx` |
| tests | `apps/backend/tests/test_listicle_reviews_budget.py`, `test_listicle_review_selection.py`, `test_listicle_place_research.py`, `apps/frontend/src/features/listiclePipeline/place-research.test.tsx` |

## Running things

```bash
cd apps/ai-blog-writer
set -a; source .env; set +a
export PYTHONPATH="$PWD/apps/backend:$PWD/packages/utils/src:$PWD/packages/shared/src:$PWD/../../packages/model-gateway/src"

./.venv/bin/python scripts/listicle-research-pilot.py --dry-run     # free
```

`--dry-run` buys nothing, prints each place's brief and the reviews allowance,
and refuses if the board's identities have moved.

**`data/pipeline.db` is the real database.** Back it up before any run that
writes. Tests take `isolated_db`; a script does not.
