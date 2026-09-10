# Listicle pipeline — handoff, 2026-09-10

Written mid-task, for a session starting with no context. Everything you need
to pick this up is here or linked from here.

**Branch:** `listicle/verified-plan-a-to-g` — 10 commits off `f3449708`,
**not pushed, no PR**. 47 files, +10,775 / −745.

**State:** 2,383 backend tests pass. All 12 probes in the plan's reproduction
harness are fixed. Frontend typecheck and eslint clean. $0.80 of real searches
spent, deliberately.

---

## 1. What this is

`apps/backend/app/features/listicle_pipeline` — the newer pipeline (NOT the
`editor_assist` listicle blurb pipeline, which is a different thing with
overlapping vocabulary; see CONTEXT.md).

You type a title → it interviews you → it settles a `SearchOrder` → it runs one
grounded web search per angle → it pools the places that come back.

Two decision records, read in this order:

- `docs/adr/0037-the-search-order-is-the-source-of-truth.md` — the design. Its
  new final section names which three of its own decisions were wrong.
- `docs/adr/0038-the-record-says-what-actually-happened.md` — **this work.**

---

## 2. The job, and where it stands

The brief was `docs/plans/listicle-pipeline-implementation-plan.html` — a
second audit that reproduced **ten failures and two spend mechanisms** against
real modules and a real disposable SQLite database. Batches A–H.

| batch | what | state |
|---|---|---|
| A | attempt identity, owner-token lease, pool snapshots | **done** |
| B | re-agreement, interview baseline, expected revision | **done** |
| C | candidate identity without guessing | **done** |
| D | cut review by candidate id, fingerprint, chunks | **done** |
| E | subject routing and catalogue repairs | **done** |
| F | phase-specific catalogue, schema adapter | **done** |
| G | profile identity | **done** |
| H | **paid** discovery comparison | **deliberately not run** — see §6 |

All ten faults were one fault: **the pipeline stored what something currently
is, where it should have stored what happened.** ADR 0038 has the table.

---

## 3. Read this before you touch anything

### The harness is the ground truth, and its exit code is inverted

```bash
cd apps/ai-blog-writer
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python docs/plans/listicle-pipeline-verification/recheck.py
```

**Exit 0 means the faults still reproduce. Exit 1 means they are fixed.** It
should exit 1 now. Parse the JSON and check `findings[].reproduces` is `false`
everywhere and both `controls` are `true`.

Three probes were adapted where a fix necessarily changed the interface they
call. The adaptations and reasons are in the harness's own docstring. Do not
"fix" the harness to agree with the code — that makes it agree by construction.

### Commands that actually work

```bash
cd apps/ai-blog-writer                       # everything below is from here
.venv/bin/python -m pytest apps/backend/tests -p no:warnings --tb=line -rN
```

- `pyproject.toml` sets `addopts = "-q"`, so **without `-rN` you get no summary
  line at all** and it looks like nothing ran.
- There is no `pytest-timeout`; `--timeout=` errors out.
- Frontend: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` and
  `npx vitest run --config vite.config.ts src/features/listiclePipeline`.
- Lint: `.venv/bin/python -m flake8 <paths>`. Two pre-existing F401s in
  `api.py` and `profiles.py` — not mine, leave them.

**Gotcha that cost me twice:** `cd some/path && python3 - <<'PY'` silently
skips the whole heredoc when the `cd` fails, and prints nothing. The shell's
cwd also gets reset between calls. **Use absolute paths in scripts.**

### Running the app

```bash
pnpm run dev:local     # app on :3003, backend on :4003
```

`.claude/launch.json` has it as `abw` for the Browser tools. Header will say
"Payload Offline" — correct, Payload isn't running, don't chase it. The only
console errors should be `localhost:4000` connection-refused (that's Payload).

**The Browser pane renders nothing while hidden** — screenshots come back
blank. Use `get_page_text` / `find` / `read_page`, or `javascript_tool` with
`window.scrollBy`. Those reads are better evidence for this kind of work anyway.

### Seeing every screen state without spending

```bash
PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src \
  .venv/bin/python apps/backend/scripts/build_listicle_demo_run.py
```

Builds run `zzdemo01` offline — failed refresh over standing work, two branches
with one name, a hotel bar kept apart from its lobby bar, a partial cut review
with unjudged rows. `--remove` deletes it. Open
`http://localhost:3003/listicle-pipeline/zzdemo01`.

### The database

Real runs live in `data/pipeline.db`. Backed up before the attempt migration to
`data/backups/pipeline-before-listicle-attempt-migration-20260909T221857.db`.

Migration ran clean on real data: 20 attempts → 20 rows in the new
`listicle_attempts`, all labelled `reconstructed`, old table untouched. Three
real runs (`33fca394`, `292e71e3`, `0de432fa`) all still open.

---

## 4. Two things that look like regressions and are not

1. **Run `33fca394` shows 48 candidates, not 43.** Containment no longer
   merges, and a row with no district no longer groups with one that has one.
   More visible duplicates is the accepted trade — a duplicate costs a glance,
   a false merge deletes a venue with nothing on screen to notice.
2. **Stored runs read `cut_checked: false`.** Their verdicts were filed by
   NAME, which *is* the R5 fault. They are kept as a record, shown as "an
   earlier check exists, filed under different rules", and cannot be applied to
   candidate-id rows.

---

## 5. The live run — what $0.80 bought

Three cases, one arm, once each, on 2026-09-10. Receipts in `docs/audits/`.

| case | rows | places | target | publications |
|---|---|---|---|---|
| narrow-hotels | 36 | 34 | 20 | 33 |
| narrow-bars | 28 | 24 | 15 | 28 |
| specialist-restaurants | 36 | 32 | 20 | 22 |

18 grounded searches, 66,294 tokens, **no retries, no failures**.

**Measured price: ~$0.045 per grounded search** — ~$0.035 grounding request
(charged per request, dominates) + ~$0.01 tokens. Use this number, not an
estimate.

### It found two faults 2,382 tests could not

Both need real model output, so no fixture could have caught them.

- **Square-bracketed qualifiers were not read.** `27 Tapas`,
  `27 Tapas (Iberostar…)` and `27 Tapas [Iberostar…]` became THREE candidates.
  One bar, counted three times, overlap split three ways.
- **The noise-word list was written for restaurants** — the same fault the
  shape catalogue had, one layer down. `hotel` and `apart` counted as
  distinguishing words, so nine unrelated aparthotels were all cross-linked.
  17 of 34 hotels came back flagged; a label that fires on half the list is one
  the operator learns to scroll past.

Both fixed, then **re-measured against the stored raw replies at zero extra
cost** — which is exactly why the harness records `provider_calls[].rows_text`.
Hotels 17 flagged → 12; bars 26 places → 24 (two genuine three-way splits
collapsed); cevicherias 2 → 4 flags (correctly: `La Mar [Miraflores]` is now
readable as possibly `La Mar Cebichería`).

**A regression the suite caught mid-fix:** putting `rooftop`/`bar`/`terrace`
into the noise list emptied `qualifier_tokens` for `(Rooftop bar)`, merging
`Hotel B` into `Hotel B (Rooftop bar)` — and next would have merged a hotel's
lobby bar into its rooftop bar. `_NOISE_WORDS` and `_ASIDE_NOISE` are separate
lists now and must stay separate: **a word that is generic inside a business's
NAME is often the whole distinction inside its BRACKETS.**

### First human read of a returned list

Checked the 34 hotels against their own brief (independent, week-plus stays).
**The list is good** — furnished apartments, monthly rates, kitchens. Two
arguable: `Villa Barranco by Ananay Hotels` and `Barranco Boutique Hotel by 3B`
(small Peruvian groups, not international chains). About 4 genuine duplicate
pairs remain, all correctly flagged, so the true distinct count is ~29 against
a target of 20.

The bars and cevicherias lists have **not** been read yet. That is free and it
is the next task.

---

## 6. Why Batch H is not next, and the decision behind it

The operator asked to "just do it" believing it cost $1–2. It is ~**$13**:
8 cases × 2 arms × 3 repetitions × 6 searches = 288 grounded searches at the
measured $0.045.

He was told the real number and we agreed **not** to run it, for two reasons
that should survive into the next session:

1. **There is no wording B to test.** Batch H compares a proposed angle
   strategy against the current one. Nobody has committed to a proposed change,
   so the experiment has no second arm. The "improvements to evaluate" in the
   plan (§05) are hypotheses, not decisions.
2. **$13 buys 288 unjudged lists.** The plan's own adoption rule needs a person
   to resolve each venue and confirm eligibility against source pages, blind to
   arm. No amount of searching substitutes for that.

Meanwhile $0.80 of real searching found two real bugs in an hour, and every
re-analysis of that same data was free. **Small run → fix → repeat is roughly
forty times better per dollar than the comparison, at this stage.**

Revisit H only when there is a specific wording change worth proving.

---

## 7. What is genuinely not built

In priority order — this is the actual remaining work:

1. **The interview has never run live.** The three live runs supplied angles by
   hand via `--angles`. The path where the *model* writes angles from the
   repaired catalogue (`prompts.build_listicle_turn_prompt` → the grill →
   `spec.selected_angles`) has not been exercised against a real model. This is
   the biggest untested gap. **~$0.15** — interview turns are text calls, no
   grounding.
2. **One full run, seed → interview → searches → cut check.** ~$0.30.
3. **Nothing verifies a place is real or still open.** The cut check reads what
   the search *said* about a place; it does not look the place up. `gate.assess`
   exists but answers a different question (is enough published to write about
   it) and is not wired.
4. **No article is written from any of this.** The pipeline ends at a candidate
   pool.

Known, accepted, not worth fixing yet: `Lima House` ↔ `Manor House Lima` are
still cross-linked (set-containment is word-order blind). It is a hint, one
line, and worth a human glance — do not over-tune the pooling on one run.

---

## 8. Next actions, agreed with the operator

| # | task | cost |
|---|---|---|
| 1 | Read the bars and cevicherias lists in `docs/audits/` against their briefs, as was done for hotels | **$0** |
| 2 | **Run one live interview** and read the angles the model writes from the repaired catalogue | ~$0.15 |
| 3 | One full run end to end | ~$0.30 |
| 4 | Batch H | ~$13, deferred |

The operator's stated preference, and it is the right one: **small tests, fix
what they show, repeat, until the pipeline is visibly working better.**

Ask before spending anything. He is fine with sub-dollar runs and wants to know
the number first.

---

## 9. Working notes on this operator

- **Plain words, short.** Lead with the result. Long technical messages get
  skipped.
- He decides, the agent codes. Give a recommendation, not a survey.
- He will push back on numbers, and he is usually right to. Show the
  arithmetic.
- Do not park a fix behind "after the first article ships" — that condition has
  proved circular before.
