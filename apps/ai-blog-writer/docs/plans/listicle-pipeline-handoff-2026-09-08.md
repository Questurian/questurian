# Listicle pipeline — handoff, 2026-09-08

Written for a fresh session. Read this before touching
`app/features/listicle_pipeline` or `features/listiclePipeline`.

## What this pipeline is

An operator types a title. An interview (the "grill") settles six markers —
kind, place, count, bar, cut, angles. Those become a **search order**. Each
angle is one grounded web search. The pooled named places are candidates.
Nothing after that is built: there is no evidence check, no gate, no article.

Decisions: `docs/adr/0037-the-search-order-is-the-source-of-truth.md`.
Vocabulary: the "Listicle Pipeline (search order)" section of `CONTEXT.md`.

## State right now

**Committed. Not yet pushed past the first commit.** Branch
`listicle/search-order-rework`, open as **PR #557** against `main`.

    fdfbcf73  the rework itself, 39 files          (pushed, on the PR)
    1250ca61  a marker answered twice is resolved  (local)
    580dad5f  the screen opened on a stored run    (local)
    575b7f65  what a search bought is recorded     (local)
    c3af7c3d  the screen stops implying the cut    (local)
    3c538775  the over-tightening claim's control  (local)

**This file only exists on that branch.** If you are reading a checkout of
`main` you cannot see it, and you cannot see the code either:

    git switch listicle/search-order-rework

The owner's unrelated Prompt2Blog work is committed separately on
`p2b/paste-an-article` (PR #558) — two commits, a paste-an-article path and a
staging CSS extraction. Nothing of it is mixed into this branch. Do not merge
the two.

Working tree is clean and **CI is green on all five checks**. Verification on
this branch: 2264 backend tests, 880 frontend, tsc clean, flake8 clean apart from two pre-existing F401s
in `listicle_pipeline/api.py` and `profiles.py`. (2249 / 871 at the first
commit; the repeated-marker fix and the contribution record added the rest.)

eslint is clean over the whole frontend: 0 errors, 2 pre-existing warnings.
The one error — a literal U+00A0 inside a regex in
`prompt2blog/intake/components/findings.ts` — arrived on `main` with commit
4bd7e813 and had nothing to do with this branch, but it was why every CI run
here was red, so it is fixed (written as the escape instead).

Those counts are lower than the 2263 / 876 quoted while the two branches shared
a working tree, and the difference is not a regression: the owner's
`test_prompt2blog_pasted_article.py` and its frontend tests live on
`p2b/paste-an-article` and are not on this branch. `main` alone is 2084 / 855.

## Driving a real run

`apps/backend/scripts/drive_listicle_run.py` — the same code the HTTP routes
call, with no server, auth or browser. Both runs below were driven with it.

    cd apps/ai-blog-writer
    set -a && . ./apps/backend/.env && set +a
    export PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py start "<title>"
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py answer <run> "<answer>"
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py order <run>
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py search <run>
    .venv/bin/python apps/backend/scripts/drive_listicle_run.py report <run>

`report` reads a finished run and spends nothing. `search` is the expensive
command: one grounded web search per angle.

Two more that spend nothing, both reading what is already stored:

    .venv/bin/python apps/backend/scripts/listicle_angle_variance.py
    .venv/bin/python apps/backend/scripts/backfill_listicle_contribution.py --dry-run

`listicle_angle_variance.py` prints the wording-versus-noise table behind open
item 4. `backfill_listicle_contribution.py` recomputes contribution for runs
stored before it was recorded; both stored runs have already been done.

Two rules when answering, both learned the hard way:

- **Answer as a statement, never as a reply.** The text is stored verbatim and
  reaches the searches as the operator's own words. "Yes, that" says nothing.
- **The recommendation is a proposed answer, not part of the question.** Read
  the question, decide what is true, write that. Accept the proposal when it is
  good; reword it when it is not, without referring to it.

## What was built (plan phases 1-4, plus half of 5)

From the improvement plan at
`~/.codex/visualizations/2026/09/08/01a082ef-f684-7cb0-b61f-635305a9dac1/listicle-pipeline-improvement-plan.html`.

- Search results stop being rendered through the interview's view builder.
- Runs are addressed by id in the URL and reopen without spending.
- The count is resolved against what was proposed, stored, and correctable.
- Conservative candidate matching; blocked merges shown as possible duplicates.
- Bounded list-marker stripping, so `1900 Hotel` keeps its 1900.
- `job_id` carried through, so listicle spend stops billing Prompt2Blog.
- Per-angle durable attempts, reuse by request fingerprint, targeted retry.
- Subject-aware shape catalogue; hard collision groups replaced by explained
  overlap; discovery roles set each angle's allowance.
- Eight evaluation cases with criteria fixed in advance
  (`listicle_pipeline/evaluation.py`); the paid comparison script refuses to
  run without `--i-know-this-costs-money` and **has never been run**.

## Two real runs, both stored

Both stored in the dev database and readable with `report` above.

| run | questions | searches | rows | places | notes |
|---|---:|---:|---:|---:|---|
| `292e71e3` | 5 (2 were repeats) | 7 | 62 | 47 | before the fixes below |
| `33fca394` | 3 (no repeats) | 7 | 62 | 43 | clean, no intervention |

Only **14 places appear in both runs**. Union is 76. The searches sample a
pool much larger than 40 rather than enumerating it — pooling repeat runs of
one order is the obvious untried lever.

Everything runs on `gemini-2.5-flash` (`listicle.grill`,
`listicle.grill_lookup`, `listicle.search` — all registered, all resolve).

## The one thing that had to be fixed first -- fixed 2026-09-09

**A marker's value was read from the LAST turn that settled it, and a repeated
question silently replaced the earlier answer.**

That was correct for a genuine correction and wrong for the *additive*
follow-up the grill actually asks. Run `292e71e3` asked, after exclusions were
settled, "are there any other types of establishments ... that you would like
to exclude?", recommending "No hotel restaurants." Answering it naturally would
have made that the entire cut and thrown away chains, delivery-only and
ceviche-not-primary. The run would have looked completely normal. It did not
happen only because the operator that day had read the code and retyped the
full list.

`spec.resolve_answer` now reads every turn that answered a marker and decides
between them, and the decision is written on the order rather than taken
silently:

- A later answer that says everything the earlier one said **replaces** it
  (`restated`). That is the retype, and it does not store the list twice.
- A later answer that says something different is **added** to it (`combined`)
  for the `bar` and the `cut`, which are the two markers a follow-up asks an
  increment about.
- `kind`, `place` and `angles` still take the last answer (`replaced`), on
  purpose: the first two are single nouns, and the angle picker sends the whole
  current selection, so un-ticking a box already is the explicit replace.
  Accumulating there would put back an angle the operator just dropped, and
  every angle is a paid search.
- A *partial* restatement -- three rules repeated and a fourth gone -- is read
  as an addition and both are kept. Over-restricting a search is visible on the
  results; under-restricting it is not.

Because keeping both can hold a rule they meant to drop, the combination is
said on screen (`SearchOrder.answer_notes`) and the bar and the cut are now
correctable there, the way the count already was. `service.revise_order` takes
`standard` and `exclusions`; correcting one clears its note.

Checked against both stored runs: neither changes (`292e71e3`'s cut resolves
`restated`, `33fca394`'s is `single`), and neither produces a note. Replaying
`292e71e3` with turn 2 answered naturally now keeps all four rules.

The engine was deliberately left alone. `grill_v4._WastedTurn` still retries a
repeated-marker question once and then shows it anyway, because a dead
interview is worse than a repeat.

## Other open items, in order

0. **Anyone can open the screen now.** `docs/plans/listicle-how-to-test.md` is
   the plain-language version. `pnpm run dev:local`, then
   `http://localhost:3003/listicle-pipeline/33fca394`. No login: the Payload
   sign-in is stood in for by a dev-only session
   (`VITE_DEV_OFFLINE_LOGIN=true`, already in `apps/frontend/.env`), fenced on
   Vite's `DEV` literal and off under vitest. A production build made with the
   flag deliberately ON was checked to contain no trace of it. Do not
   hand-edit `RequireAuth` any more.

1. **The screen has now been opened on stored runs; the interview has not.**
   Done 2026-09-09 against both stored runs, at `/listicle-pipeline/<run>` with
   the dev servers up (`pnpm run dev:local`, ports 4003/3003; `.claude/launch.json`
   starts them). What was exercised for real:

   - The order panel renders from a stored run. Every listicle call returned
     200; the console's `ERR_CONNECTION_REFUSED` noise is Payload on :3000,
     which does not run on this machine, and is unrelated.
   - The repeated-marker note appears, and correcting the cut posted, made
     revision 2, replaced the value and cleared the note.
   - The results table draws, and its shared/only-this columns are where open
     item 2 below is visible on screen: `purist` 10 rows for 1 unique, `hours`
     6 rows for 0.
   - The per-angle "run this one" and "Retry 1 failed search" controls render
     for an interrupted angle, with the honest wording about being charged
     again. **Not clicked** — clicking spends.

   Two things the browser still has not seen, both because they need a live
   interview and money: `AnglePicker` sending selections on a real turn, and a
   retry actually running. The frontend requires a Payload staff session and
   Payload does not run on this machine, so the check above was made with a
   temporary local edit to `RequireAuth` that was reverted immediately. Anyone
   repeating it has to do the same.

2. ~~**Angles that contribute nothing still cost a search.**~~ **Done
   2026-09-09.** Contribution used to be computed when the results screen was
   drawn and thrown away with it, so an angle's worth only ever existed after
   the money was spent.

   It is now recorded on the attempt (`found` / `shared` / `exclusive`), and
   the order screen says what each search returned the last time it ran about
   the same subject — *before* this time is paid for. An angle is matched
   across runs by its SHAPE, not its wording: the model rewrites the sentence
   every run. The results screen also names how many searches finished having
   found no place the others missed, which nothing said before.

   Recomputed after every batch, because retrying one angle changes the pool
   and so changes what the other six turn out to have contributed.

   Nothing acts on it. No angle is dropped, reordered or discouraged: two runs
   is a fact about two runs.

   Both stored runs were backfilled with
   `scripts/backfill_listicle_contribution.py` (recomputes from sightings
   already on disk; spends nothing; safe to re-run). Checked on the real data:
   opening `33fca394` now shows six history lines on the order and "1 of 7
   searches returned no place the others missed" on the results.

   One correction to the note this replaces: it said "roughly two of seven"
   bought nothing. Exactly one of the seven returned zero exclusive places
   (`hours`). `purist` returned ten rows for one exclusive place, which is
   poor value but is not nothing — so the screen counts zero, and leaves "ten
   rows for one place" to the operator's judgement.

3. **The `cut` reaches every search prompt and the model ignores it.**
   Confirmed on the stored run, 2026-09-09: 8 of `33fca394`'s 43 candidates —
   Hanzo (twice), Maido, Nikko, Osaka Nikkei, Shizen, Tomo, Toshi — are places
   the cut explicitly barred.

   **Correction to what this note used to say.** It said catching this was the
   unbuilt evidence/gate step's job. That is wrong, and acting on it would have
   wasted the work: `gate.assess` **is** built and tested, and it answers a
   different question — is enough published about this place to write about it.
   Every one of those eight is written about constantly, so a fully wired gate
   would have passed all eight.

   Checking the cut is a separate per-place judgement that does not exist
   anywhere. It cannot be done from a name; it needs evidence about the place,
   which means `build_profile` running for every candidate — around forty paid
   calls per run — plus a new verdict the gate does not currently have. That is
   a real feature and a spending decision, so it was **not** built here.

   What was done instead, because it costs nothing and the screen was lying by
   omission: the results now say plainly that nothing below has been checked
   against the cut. The rule still goes to every search. Do not reach for more
   prompt text — that is what produced the eight.

4. **The over-tightening claim is NOT established, and the stored runs say
   why.** Checked 2026-09-09 with `scripts/listicle_angle_variance.py`
   (spends nothing; reads the contribution now recorded on each attempt).

   The claim was that the model narrows its own wording and it costs
   measurably, evidenced by the `informal` angle: 9 words returning 11 places
   in run 1, 12 words returning 4 in run 2. That is a real drop. But the same
   two runs contain the control it needs:

   | | shapes | widest swing |
   |---|---:|---|
   | wording UNCHANGED between runs | 1 (`institution`) | 5 rows, 5 exclusive |
   | wording REWORDED between runs | 5 | 5 rows, 7 exclusive |

   `institution` ran with **identical wording** in both runs and moved 7 rows
   to 12, one exclusive place to six. Unchanged wording swings almost as far as
   the widest reworded pair, so nothing here separates wording from chance.

   Of the five reworded pairs: three moved the predicted way, `lesser-known`
   moved the opposite way (longer wording did *better*, 7 exclusive to 10), and
   `producer-links` did not move at all.

   **The noise floor has to be bought before the comparison is.** One case's
   order re-run three times with wording held identical is about 21 grounded
   searches. Until that number exists, the 8-case comparison in item 5 cannot
   be read — it would measure noise and call it wording. This is also the
   "pooling repeat runs" lever already flagged as obvious and untried, so it
   buys two answers at once.

5. **No paid angle comparison has been run, and it should not be the first
   purchase.** `evaluation.py` holds the eight cases and their criteria, fixed
   in advance on purpose. `scripts/listicle_angle_comparison.py` runs one arm
   and refuses without `--i-know-this-costs-money`.

   Cost, in the only unit that is certain — grounded searches, all on
   `gemini-2.5-flash` (see `listicle.search` in the model gateway's
   `jobs.json`); the per-search grounding rate is whatever the account's is:

   - noise floor, 1 case × 7 angles × 3 repeats — **~21 searches**
   - full comparison, 8 cases × 2 arms × ~7 angles — **~112 searches**, plus an
     interview per arm

   Thresholds have to be agreed before either, not after. Suggested, and not
   yet approved by the owner:

   - **Read the noise floor first.** Take the widest exclusive-place swing
     across the three identical repeats. Call that N.
   - A comparison arm counts as better only if it beats the other by **more
     than N** exclusive places on the same case. On today's single data point
     N would be 5, which is most of a seven-angle run — that is the honest
     reading, and it is the argument for buying the repeats first.
   - Report per case, never pooled. Eight cases with one run each is eight
     anecdotes, and averaging them hides that.
   - Discovery only. A returned place being real, open or worth writing about
     is not what this measures and must not be claimed from it.

## Things that will bite you

- `spec.searchable_kind` exists because the interview correctly declines to
  ask about a marker the title already answers, which leaves no turn to read.
  Any marker can be covered without a turn; check the fallback before trusting
  a field.
- `GrillOption.group` is filled from the catalogue in `api._view` and
  `spec._theme_for`, never from the model. A live run sent the shape's label on
  one turn, its key on the next, and nothing on a third. Code supplies
  catalogue metadata; the model supplies wording.
- The research callable returns a 3- or 4-tuple. `search._search_once` reads
  both. Do not tighten it — every existing test sends three.
- `source_urls` are opaque `vertexaisearch.cloud.google.com` redirects and
  identify nothing. `source_titles` (added here) carry the real domains and are
  what answers "did it read Spanish sources". It did: `ohlalima.com`,
  `elcomercio.pe`, `larepublica.pe`, `infobae.com`, `gestion.pe`, `andina.pe`,
  `mesa247.pe` among 40 publications in run 2.
- Backend tests can write to the real dev database. Take the `isolated_db`
  fixture for anything touching storage.
- Adding a new exported name to `packages/utils` breaks the backend suite —
  tests install a process-global `utils` stub. A new field on an existing
  dataclass is fine; read it with `getattr(..., default)`.

## What this pipeline does not claim

Receiving a search result is not verification. Nothing establishes that a
returned place is real, currently open, independently sourced or worth writing
about. Repeated discovery is reported as repeated discovery, not as quality.
A green test suite says the machinery behaves and says nothing about whether
the angles find better places.
