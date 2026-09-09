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

**Everything below is uncommitted**, in a working tree that also holds
unrelated Prompt2Blog edits belonging to the owner. Committing is the first
thing to do, and only the listicle paths:

    app/features/listicle_pipeline/    features/listiclePipeline/
    app/features/prompt2blog/grill_v4.py      (repeat-marker guard)
    app/features/prompt2blog/contracts_v4.py  (GrillOption.shape/role)
    packages/utils/src/utils/google_grounding.py  (source titles)
    apps/frontend/src/App.tsx  CONTEXT.md  docs/adr/0037-*.md
    apps/backend/tests/test_listicle_*.py  tests/listicle_test_support.py

Verification: 2263 backend tests, 876 frontend, tsc and eslint clean,
flake8 clean apart from two pre-existing F401s in `api.py` and `profiles.py`.

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

Driven headlessly through `service` + `api._base_dependencies()`; no server or
auth needed. The driver is in the session scratchpad and is trivial to rewrite:
`start` / `answer <run_id> <text> [selections_json]` / `order` / `search`.
Source `apps/backend/.env` and set
`PYTHONPATH=apps/backend:packages/shared/src:packages/utils/src`.

| run | questions | searches | rows | places | notes |
|---|---:|---:|---:|---:|---|
| `292e71e3` | 5 (2 were repeats) | 7 | 62 | 47 | before the fixes below |
| `33fca394` | 3 (no repeats) | 7 | 62 | 43 | clean, no intervention |

Only **14 places appear in both runs**. Union is 76. The searches sample a
pool much larger than 40 rather than enumerating it — pooling repeat runs of
one order is the obvious untried lever.

Everything runs on `gemini-2.5-flash` (`listicle.grill`,
`listicle.grill_lookup`, `listicle.search` — all registered, all resolve).

## THE ONE THING THAT MUST BE FIXED FIRST

**A marker's value is read from the LAST turn that settled it, and a repeated
question silently replaces the earlier answer.**

`spec._answer_for` walks `reversed(state.turns)` and takes the first match.
That is correct when a marker is genuinely corrected. It is wrong when the
grill asks an *additive* follow-up, which run `292e71e3` did: after exclusions
were settled it asked "anything else you would like to exclude?", recommending
"No hotel restaurants."

Answering that naturally would have made "No hotel restaurants" the entire cut
and thrown away chains, delivery-only and ceviche-not-primary. The run would
have looked completely normal and searched under one quarter of the operator's
exclusions. It did not happen only because the operator that day had read the
code and retyped the full list.

`grill_v4._WastedTurn` now retries a repeated-marker question once, which makes
the repeat much rarer — but on the second failure it **shows the question
anyway** (deliberately: a dead interview is worse). So the path is still open.

The fix is at the `spec` layer, not the engine: a marker answered twice needs
either explicit accumulation or an explicit replace, not last-write-wins. Do
not "fix" it by making the engine refuse — that trades silent data loss for a
stuck interview.

## Other open items, in order

2. **The UI has never seen a live run.** Both runs were driven headlessly.
   `AnglePicker` sending selections, `OrderPanel`'s count correction, the
   per-angle retry buttons — all unit-tested, none exercised end to end in a
   browser. Do this before trusting the screen.

3. **Angles that contribute nothing still cost a search.** In `33fca394`,
   `purist` returned 10 rows for 1 unique place and `hours` returned 6 rows for
   0. Roughly two of seven searches bought nothing. There is no mechanism that
   notices this, and contribution is only visible after the money is spent.

4. **The `cut` reaches every search prompt and the model ignores it.** Run 2
   returned Maido, Osaka Nikkei, Hanzo (twice), Toshi, Nikko, Tomo and Shizen
   against an explicit "no places where ceviche is not the primary offering".
   Composing the rule in is necessary and not sufficient. Catching it is the
   unbuilt evidence/gate step's job — do not try to solve it with more prompt
   text.

5. **The model still over-tightens its own wording, and it costs measurably.**
   Run 1's market angle was "ceviche counters inside the city's markets or
   street stalls" → 11 rows, 11 unique. Run 2's was the same plus "not
   traditional sit-down restaurants" → 6 rows, 4 unique. One comparison is not
   proof, but it is the predicted direction and a large drop.

6. **No paid angle comparison has been run.** `evaluation.py` holds the eight
   cases and their criteria, fixed in advance on purpose.
   `scripts/listicle_angle_comparison.py` runs one arm. Agree thresholds before
   spending, not after.

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
