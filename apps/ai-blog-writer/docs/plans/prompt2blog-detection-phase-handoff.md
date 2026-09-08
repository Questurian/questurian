# Prompt2Blog: where this branch is, and what comes next

Branch `codex/prompt2blog-brief-to-article`, off `main` at `4c55c99d`.
**Not merged. Do not merge without the owner asking.**

Read `docs/adr/0036-the-brief-goes-straight-to-the-writer.md` first, then
`docs/plans/prompt2blog-brief-to-article-handoff.html` (the original plan).

## What is built and working

The path from an approved Article Brief to a finished article has been replaced.
The grill, the seed and the brief are **untouched** -- `grill_v4.py`,
`GrillScreen.tsx` and `SeedScreen.tsx` have zero changes on this branch, and
that was verified rather than assumed.

| | old | new |
|---|---|---|
| jobs between brief and article | 37 | 1 |
| writer instruction | ~30,000 chars | 5,647 chars |
| Valparaiso brief `e001d48c` | `needs_revision` | 954-word article |

1. **`writer_prompt.py`** -- a pure function that formats the brief into one
   fixed template. No model call, no network, no database. Same brief and
   template version produce the same bytes, which is what the prompt
   fingerprint depends on. The operator reads the exact text before anything is
   spent.
2. **`cli_writer.py`** -- a scoped research capability. `RESEARCH_TOOLS` grants
   WebSearch, WebFetch and TodoWrite to the article writer only;
   `RESEARCH_DENIED_TOOLS` is derived by subtraction, so a tool added to
   `DENIED_TOOLS` is denied here automatically and the only way to grant one is
   to name it. Shell, filesystem and subagents stay denied. **The global deny
   list is unchanged and every other consumer keeps today's restrictions.**
3. **`writer_v5.py`** -- sends the frozen prompt, parses article and research
   note. Forgiving on purpose: a missing note, a doubled heading or a missing
   headline is recovered with the problem named. The raw reply is always kept.
4. **`generation_v5.py`** -- the lifecycle. The claim on a run is written before
   the call, so a double click finds it there. Attempts accumulate rather than
   overwrite, so a failed retry leaves the previous draft readable.
5. **UI** -- brief screen (every field), prompt screen (exact text, read-only),
   draft screen (article, research note beside it, receipt naming the model
   that actually answered). No score, no readiness verdict, no badge.

Articles reach Saved Articles and staging under a `prompt2blog_v5` artifact key.
The research note is stored beside the article, never as body text.

**Verified by a real run**, filed as `v5-valparaiso-2026-09-07`: one call, 35
provider round trips, 6 minutes, $1.75, 954 words, no parse issues. The article
refused to invent seating and said so in the research note, and found the
brief's own premise wrong -- the published fare split is foreign tourists versus
everyone, not residents versus visitors -- and used the supported framing.

Tests: backend 2012, frontend 819, tsc clean, gateway 89.

## Where the work is now: the detection phase

**The detector is wired up.** `editor_v5.py` was a module and a proven prompt
with no route, no storage and no UI; it now has all three. What was added:

- **`p2b.review` in the gateway.** Its own job, on the research transport, at
  `claude-opus-5-high`. Borrowing `p2b.write` would have worked and would have
  filed every review's cost and served model on the writer's line -- the fault
  that had every v4 Claude call recorded as Haiku. Deliberately *not* filed
  with `p2b.audit` and `p2b.edit_review` on Gemini, even though the shared
  blind-spot argument applies: the detector has to open pages, and the museum
  price finding is not producible without retrieving the museum's own page.
  The reason is written into `jobs.json`'s `writerNote` so a later reader does
  not "fix" it for consistency.
- **`review_v5.py`**, the lifecycle, shaped like `generation_v5.py`. The claim
  is written before the call, reviews accumulate rather than overwrite, and
  every row carries the draft version it read.
- **A read is not the run.** `begin_review` records the run's status and puts
  it back when the read finishes, either way. A failed review must not mark a
  run failed when its article is finished and staged, and a review of a run
  whose last write failed must not come out looking completed.
- **Three routes**: start a read, read the findings, settle one finding.
- **The draft screen** marks flagged paragraphs, opens the finding on click,
  and offers *Real problem* / *Not a fault*. Nothing applies anything.
- **`scripts/p2b-findings.py`**, the cross-run read. This is the thing the
  phase actually runs on.

Two decisions made while building, both by the owner:

- **Findings are marked on the article**, not listed under it. They anchor to
  the *paragraph*, not to an exact span: the editor copies its quote by hand
  out of an article containing bold and links, so character-exact matching
  fails often and fails silently. A quote that matches nothing, and a
  WHOLE ARTICLE finding, are listed below the article rather than dropped.
  `components/findings.ts` holds the matching and is tested on its own.
- **The operator can mark a finding** agreed or not-a-fault. Nothing in the app
  acts on it; it exists so the cross-run script can drop findings already
  thrown out. Kept beside the model's words, never over them.

One change to the parser, and it matters: a reply with **no findings and no
verdict** is now refused rather than read as a clean article. That shape is
what a Claude refusal looks like, and it arrives as an ordinary success. Read
as a review it would report the one wrong answer this phase cannot afford --
the signal it runs on, saying all clear.

Tests: backend 2039, frontend 844, gateway 89, tsc clean.

The owner's framing, and it governs what comes next:

> Nobody knows what is actually wrong with these articles yet. This phase is
> detection. Read a draft, say what is bad. Run that across several articles.
> The faults that keep coming back are the real to-do list, and those get fixed
> at the source -- one at a time.

Three things follow, and a future agent should not quietly undo any of them:

- **The editor proposes no fixes and applies nothing.** An earlier version had
  proposed replacement text and an apply step. That was cut. Fixing before the
  faults are known is how the old pipeline got 41 prohibitions and no
  description of what a good piece is.
- **Findings carry a label the model writes in its own words**, not one chosen
  from a list in the code. A fixed vocabulary would decide in advance what kinds
  of fault exist, which is the thing being investigated. Let the labels repeat
  on their own.
- **Do not reintroduce `app/shared/prompts/anti_ai_tells.py` here.** It is a
  good catalogue and it is the right thing for a *writer prompt* in the old
  system. Bolting it onto the writer is a recorded cause of database-flavoured
  prose, and bolting it onto the detector replaces judgement with string
  matching. This was proposed during this session and the owner rejected it,
  twice, correctly.

### The first detection run

Saved at `docs/audits/2026-09-07-valparaiso-first-detection-run.json`, against
the draft at `docs/audits/2026-09-07-valparaiso-first-draft.json`.
One call, 8 round trips, 3 minutes, $0.66. Seven findings:

| severity | label | what it caught |
|---|---|---|
| serious | Museum price wrong by threefold | Baburizza admission stated as 11,000 pesos; actual is 4,000. The article builds a "skip it, that's ten rides" recommendation on the wrong number. |
| serious | Asserts the fare it just hedged | Says the Concepcion foreign fare is "posted at 1,000" two paragraphs after saying the notice does not resolve it. |
| notable | Article narrates its own sourcing | "I could not confirm", "I found no source", and a closing paragraph reporting what was verified on which date. |
| notable | Seating question left unanswered | The brief requires seating for each named lift; two of four never answer. |
| notable | Route collapses at the fourth stop | Hands the reader stop to stop for three legs, then drops them on the wrong hill. |
| notable | Half the readership stranded in an aside | The brief's reader arrives from Vina or the bus; the itinerary assumes the port. |
| minor | Two different network totals | Sixteen structures in one paragraph, fifteen in another. |

The detector found a factual error a human reader would not have caught without
opening the museum's website. That is the strongest evidence so far that this
phase is worth running.

## What to do next

1. ~~Wire the detector up.~~ Done, above. **Not yet exercised against a real
   model** -- every test drives it with a scripted reply, so the first real
   review through the UI is still the proving run.
2. **Run it across several articles** on genuinely different briefs -- the owner
   has said the ascensores topic is dull and wants a real one. Collect the
   findings.
3. **Read the labels across runs**, with `python3 scripts/p2b-findings.py`. The
   ones that recur are the real fault categories. Fix those at the source: in
   the brief, in the writer prompt, in the grill. One at a time, each with
   evidence behind it.
4. Only after that: decide whether anything should propose fixes, and whether
   phase 5 (deleting the retired work-order, research, gate, selection, packet
   and graph modules) should run. **The owner has explicitly said not to delete
   yet** -- he wants a body of good runs first. The old code is still reachable
   for pre-ADR-0036 runs and harms nothing where it sits.

## Operational notes

- `.venv/bin/python` resolves only from the app root. `apps/backend/.venv` is a
  self-referential symlink and will fail.
- Driving a run headlessly needs `sys.path` entries for `apps/backend`,
  `packages/shared/src` and `packages/utils/src`, plus `load_dotenv` on
  `apps/backend/.env`.
- Research is gated on `claude_provider() == CLAUDE_PROVIDER_SUBSCRIPTION_CLI`,
  **not** on `WRITER_PROVIDER`. `WRITER_PROVIDER` is unset on this machine and
  means something else; gating on it refuses to research on a machine whose
  Claude is fine. This was a real bug on this branch and is fixed.
- The database was backed up before the real run:
  `data/backups/db/pipeline-2026-09-07-pre-v5-run.db`.
