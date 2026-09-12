# Per-place research: what was built, and what three real calls returned

Implements `listicle-research-card-implementation-handoff.html` end to end.
Decisions are in [ADR 0039](../adr/0039-one-place-one-request-one-profile.md);
vocabulary is in `CONTEXT.md`. Shipped in PR #559.

Readable version, with the pilot output:
https://claude.ai/code/artifact/07225c32-b936-48e3-bf0d-f0c719823f54

## Files

New backend, under `app/features/listicle_pipeline`:

| file | what it owns |
|---|---|
| `candidate_prep.py` | stored preparation, and the one readiness computation both the card and the request read |
| `profile_service.py` | the orchestration: resolve the profile, snapshot the input, own the attempt, make the call, commit |
| `research_store.py` | research attempts and the one-at-a-time slot — execution, kept apart from evidence |

Extended: `profiles.py` (finding, source, attempt, possible angle contracts),
`profile_store.py` (findings, sources, evidence, revisions, angles, candidate
links, and the additive migration), `profile_research.py` (the single-call path
and its parser, beside the old whole-run one), `api.py` (eight routes),
`spec.py` (the topic key).

New frontend, under `src/features/listiclePipeline`: `usePlaceResearch.ts`,
`components/ResearchViewer.tsx`, `styles/research.css`. Reworked:
`CandidateCard.tsx` (the checklist is now stored preparation),
`SearchResults.tsx` (carries the board), `api.ts`, `types.ts`.

Shared: `packages/utils/src/utils/google_grounding.py` now reads
`groundingMetadata.webSearchQueries`, so what a grounded call actually searched
is recorded apart from what it was asked to search.

## Migration verification

Run against a copy of the developer's real `data/pipeline.db`:

- row counts identical before and after, across every table
- `ensure_research_tables()` run twice; second run is a no-op
- `listicle_profile_claims` widened from 9 columns to 23; existing rows keep
  their ids and read as `curation=unreviewed`, `origin=unknown`, no categories
- the profile tables did not exist in that database at all before this, which
  is why the handoff said to check rather than assume

## Tests

- `apps/backend/tests/test_listicle_place_research.py` — 54 tests: the
  readiness matrix, paid-call accounting, the migration over pre-existing
  claims, cross-topic reuse, branch separation, the date rules, and every
  terminal state.
- `apps/frontend/src/features/listiclePipeline/place-research.test.tsx` — 21
  tests through the screen, including keyboard use and error recovery.
- `listicle-resume.test.tsx` updated: the checklist is a round trip now.
- Full `apps/backend/tests` suite green. 98 frontend tests pass. `tsc` clean.
  `flake8` clean for every file this touched.

## UI walkthrough

Against the running dev stack on run `efd5a7cd` (chicken wings, Lima):

1. Board opens; 44 cards, each with its blockers named. No provider call.
2. Ticked both required checks on Barbarian [Miraflores]; saved; reloaded; the
   ticks and the enabled button came back from the database.
3. Pressed Research this place; the card showed Researching, then
   "4 findings · 1 unresolved question".
4. Opened the viewer: findings with their sources, three dates apart, "Date
   unknown" where it is unknown, curation actions per row.
5. Kept a finding, then unkept it. Both changes are in that finding's history.

## The pilot

Five calls, three places, about $0.06 at Flash rates.

| place | result | findings | tokens |
|---|---|---|---|
| BarBarian (Miraflores) | completed | 4 | 11,069 |
| La Casa de las Alitas (Los Olivos) | truncated, then completed | 4 | 17,479 |
| McCarthy's Irish Pub (Miraflores) | empty reply, then completed | 5 | 10,548 |

Both failures produced a fix, in this branch:

- **3,843 output tokens against a 3,072 cap** truncated a four-source answer
  mid-object. The budget is now 8,192, and an unterminated code fence is
  stripped so the error names the real problem.
- **A reply of three characters** with 2,423 thinking tokens spent. Reported as
  "the model stopped before writing an answer" rather than "this is not JSON".
- **Eighteen searches under "BarBarian Bonilla 108"** found three aggregators
  and no food writing. Google's name carries the branch; the press writes
  "BarBarian". The board's shorter name now goes along as an alias.

Neither failure was retried automatically. Both sat on the card until somebody
pressed again.

## Provider-access limitations

- The grounded path is Google-only, so this job runs on Gemini Flash whatever
  the dashboard says about other jobs. Whether a stronger model reaches Lima's
  food press is not answered here.
- What came back leans on delivery menus and review aggregators — Rappi,
  Restaurant Guru, Facebook. One usable sourced sentence per place.
- Aggregators report a page-updated date and the pipeline stores it as a
  publication date, because that is what the source claims. A Restaurant Guru
  page "published 2026-08-09" means the page moved.
- Optional source links are stored and sent as text. Nothing fetches them, and
  adding retrieval would need its own access and SSRF controls.

## Not proven

Whether this research is good enough to write from. Three places is three
places, and one sourced sentence each is not yet a listicle entry.
