# Handoff: narrowing what research asks for

Written 2026-09-06 at the end of a long session, for whoever picks this up.
Written on branch `p2b-research-redesign` (13 commits, 1518 backend tests and
765 frontend tests green, `tsc` clean); that work is now on `main`.

Two changes were proposed here and are now **built** (2026-09-06, 1530 backend
tests and 768 frontend tests green, `tsc` clean). They have **not been measured
on a real run** — "How to verify it worked" below is the outstanding work, and
until it has been done neither change is known to have helped.

Read "What I got wrong" before you touch this. I reasoned my way to two wrong
answers on this exact question before measuring, and the measurement is at the
bottom.

---

## Where things stand

The research redesign (ADR 0035) is shipped: the dossier records what was
learned, the selection records what belongs in this article, and a **writing
packet** — built by code, no model call — is what the writing stages read.
Compose, the outline, the audit, repair, the punch list and polish were all
changed together so that no stage after the writer can undo the editorial cut.

Two real articles were produced end to end on this branch:

| | run 1 `2197ccc4` | run 2 `e23257c0` |
|---|---|---|
| seed | Stay in Getsemaní, not inside Cartagena's walls | Sort your ride from Bogotá's airport before you land |
| form | comparison | service guide |
| outcome | `ready_for_staging`, no blockers | `needs_revision` — caused by a bug, since fixed |
| real money (Gemini) | ~$0.245 | $0.67 |

Both are readable, cohesive, and neither reads like a database — which was the
point of the redesign. Both are in `output/`.

---

## The problem to solve

**The article can only hold about 18 facts, and nothing tells the planner that.**

`target_claim_count` is 2 facts per 100 words, so a 900-word article keeps 18.
That is independent of how much research happened:

| | run 1 | run 2 |
|---|---:|---:|
| questions asked | 15 | 57 |
| research returned | 139 KB | 605 KB |
| facts found | 98 | 431 |
| **facts that reached the writer** | **18** | **18** |
| notes per question | ~9,300 chars | ~10,600 chars |
| structuring batches | 8 | 20 |
| real money | ~$0.245 | $0.67 |

Read the last two rows together with the middle one. **Per question, both runs
behave the same.** Run 2 did not dig deeper; it asked 3.8× as many questions,
and cost scaled with that. And it delivered the identical 18 facts.

Run 2's work order asked 4 transport modes × 3 zones × (fare, time) = 24
questions by mechanical expansion. A 900-word article cannot quote twelve
fare-and-time pairs. Roughly 39 of its 57 questions produced research that
could not have reached a reader however good it was.

Five of them could not be answered at all: they asked for per-company data on
something that is not per-company ("travel time from El Dorado for Kiwitaxi").
No source will ever carry that. Those five blocked the research gate and had to
be omitted by hand before the run could be written.

---

## The two changes

### 1. Tell the planner how long the article is — built

`build_work_order` (`work_order_v4.py`) did not know the target length. It now
takes `target_word_count`, and `plan_research` passes
`default_target_word_count()` — the same catalog entry selection reads, so the
two cannot drift. The prompt gains one block naming the length and the fact
budget that follows from it, placed directly under the brief and above "Write
the questions".

The fact budget is `article_fact_budget` in `selection_v4.py`, split out of
`target_claim_count` so there is one definition of "how many facts fit". The
planner needs it before a question has been asked, where there is no dossier to
count; selection needs it against one it can count. Two definitions would
drift, and the one the planner reads would be the one nobody checked.

**This is not a ratio and must not become one.** The owner pushed back on a
fixed "900 words → N questions" rule and was right: a head-to-head comparison
legitimately needs evidence for both sides, a service guide legitimately needs
every option ranked, and a piece with one venue needs far less. The form
decides. The length is a constraint the planner weighs, not a number it divides
by. Do not add a global cap — the redesign plan says this explicitly, and so
does the owner.

There is already a `budget_projection` on the work order stage that reports
question count against a cost budget. It said run 2's 57 questions "fits",
which was true about money and silent about editorial room. It now carries
`fact_budget` and an `editorial_note` alongside — a second sentence, not a
rewrite of the money one, because a plan can be affordable and still buy
research the article has no room to print. Both are rendered on the cut screen.
Neither refuses anything: `enforce_plan_fits` is untouched, and there is still
no cap on how many questions a plan may ask.

### 2. Make each question say what it is for — built

`WorkOrderRequirement` now carries `purpose` — one line on the question's job
in this article. The prompt asks for it, requires it in the schema, and tells
the planner to write it first and drop the question if it cannot be written.
It also kills the five unanswerable questions: a question whose purpose cannot
be stated without inventing a use is the same question that no source can
answer.

**A missing purpose does not drop the question.** That was a deliberate call
against the wording above ("does not get bought"). A model omitting a field is
a compliance problem, not evidence the question is bad, and this parser exists
because `p2b.work_order` renames and drops fields constantly — run b78a9fe8
lost six specific, checkable questions to the word `query`. So the gate is the
operator's, where it already was: the purpose is shown under each question on
the cut screen, and a question with none says so in the flag position. If real
runs show the planner routinely leaving it blank, that is the compliance signal
the risks section predicted, and the fix is the model tier, not a parser that
throws questions away.

An operator's own added question gets "Asked for by the operator." rather than
a blank, because a blank on that screen means something specific.

The plan pairs `purpose` with `answer_boundary` — what makes an answer
sufficient. **I recommend deferring `answer_boundary`.** See below.

---

## What I got wrong, so you do not repeat it

I reached two wrong conclusions before measuring. Both sounded right.

**Wrong once: "62 questions cost 62 searches."** They do not. Questions are
grouped and gathered together — run 2 ran 18 searches for 57 questions, run 1
ran 7 for 15. Merging questions therefore wins very little; it is already
happening. Check `stage_v4_research_notes` call counts in the usage ledger
before claiming otherwise.

**Wrong twice: "the cost is that each search brings back too much."** The
gather prompt does say "Answer it as fully as you can, with sources. Then keep
going", and its last bullet explicitly asks for material nobody requested. That
looks like the culprit and is not: per-question volume is ~9,300 chars in run 1
and ~10,600 in run 2, near identical. Run 1 produced a clean article on the
same per-question volume.

That last bullet is also **where texture comes from**. Run 1's best details —
a bakery counter opening at 6 AM on Calle del Espíritu Santo, the "open-air
living room" line — arrived through it. Bounding it starves the colour the
texture reserve was built to protect. That is why `answer_boundary` should wait
until after change 1 and 2 are measured: it is aimed at a volume problem that
the numbers do not show, and it endangers something the numbers do show works.

---

## What the re-plan measured — done 2026-09-06

The planning half is measured. **The research half is not**: nothing below was
re-researched, so facts found, conflicts retained and texture claims are still
open, and those are where the real risk sits.

Both stored briefs were re-planned off a copy of `pipeline.db`, four to five
plans each, on `p2b.work_order` as it now ships. About $0.35 of Gemini.

| run | plan | questions | texture | share |
|---|---|---:|---:|---:|
| 2197ccc4 | stored (before both changes) | 15 | 4 | 27% |
| 2197ccc4 | purpose only, no length | 20 | 3 | 15% |
| 2197ccc4 | shipped, 900 words | 18 / 15 / 13 | 3 / 4 / 6 | 17–46% |
| e23257c0 | stored (before both changes) | **57** | 8 | 14% |
| e23257c0 | purpose only, no length | 44 | 2 | 5% |
| e23257c0 | shipped, 900 words | **25 / 31 / 36** | 4 / 0 / 5 | 0–16% |

**Change 1 is doing the work, not change 2.** Asking each question to name its
job took run 2 from 57 to 44. Naming the length took it to the twenties and
thirties. If only one of these survives, it is the length.

**The named fault is gone.** Questions asking for travel time *per taxi
company* — the five no source could answer, struck by hand before run 2 could
be written — went 6 → 3 → **0** as the constraint was added.

**Compliance is not the problem the risks section feared.** 107 of 107
questions across every plan came back with a stated purpose, on
`gemini-2.5-flash`. `p2b.work_order` does not need moving up a tier for this.

**Run 1 did not shrink, and was not meant to.** 15 stored against 13, 15 and 18
— the constraint does not crush a plan that was already the right size, which
was the thing most worth checking.

### The one regression, and it is the one that was predicted

**A plan can now come back with zero texture questions.** e23257c0 sample B
did: 31 questions, none of them texture. That is not a duller article, it is a
blocked run — `assess_coverage` sets `can_write=False` and
`nothing_worth_reading` when no texture question is answered, and no texture
questions means none can be. "Texture is the first thing to die" was right.

Nothing in the contract requires a texture question and nothing should: the
prompt asks for texture and the operator can add one. What is missing is that
**nobody is told before the money is spent.** `texture_count` is already on the
work order stage record; the gate says "nothing here would be a pleasure to
read" only after research has been bought. That sentence belongs on the cut
screen, next to the budget note, for exactly the reason the budget note is
there: run 03c6702f died against a ceiling its own stage record had already
predicted. Not built.

### Read the counts as a spread, not a number

Four samples of the identical shipped configuration on run 2 gave 18, 25, 31
and 36. One plan is an anecdote. Anything claiming "the change saves N
questions" from a single run is reading noise.

---

## How to verify the rest of it

**Still outstanding: nothing has been re-researched.** Both briefs are
stored, so this is a before/after on identical input, not a new topic. Re-plan and re-research runs `2197ccc4` and `e23257c0` and compare:

- **question count** — expect run 2 to fall substantially, run 1 barely at all
- **facts found** and **facts selected** — selected must stay 18; if facts
  found collapses toward 18, research is too narrow
- **conflicts retained** — run 2 found 9 conflicts and carried 10 caveat notes
  into the packet where run 1 had none. Those came from breadth and are the
  most valuable thing it produced. **If conflicts drop to zero, back the change
  out.**
- **texture claims** — run 1 kept 8 texture facts of 18. If the texture share
  falls, the boundary is biting the wrong thing.
- **re-asks and gate blocks** — the danger is moving work into re-asks, which
  cost more than the searches saved. A run that now blocks at the gate where it
  did not before is a regression, not a saving.
- **real money** — Gemini `rate-table` calls only. See "Costs" below.

---

## Risks

- **Under-researching pushes cost into re-asks.** A re-ask buys one search plus
  a full re-structuring of the whole dossier, which on a 431-claim dossier is
  the most expensive single operation in the pipeline. Two re-asks can cost
  more than the forty questions you removed.
- **Texture is the first thing to die.** It is the least "necessary"-looking
  material and the thing the articles are actually good because of.
- **The planner runs on `gemini-2.5-flash`.** Adding two fields and a length
  constraint to its prompt is asking more judgement of the cheapest model in
  the table. If compliance is poor, the honest fix is to move `p2b.work_order`
  up a tier rather than to add more instructions.

---

## Costs, and how to read them

Only Gemini is real money. Claude calls run on the owner's subscription and
bill nothing extra; the ledger tags them `cost_basis: measured`, which is the
Claude CLI's estimate of API-rate cost, and `_run_billed_cost` deliberately
counts only `rate-table` rows.

Run 2: **$0.67 real** (42 Gemini calls) against $2.05 notional Claude.
Run 1: **~$0.245 real**.

The owner cares about the Gemini number. Report that one.

---

## Driving a real run (corrected recipe)

`reference_p2b_drive_a_real_run` in memory is right except for two things this
branch changed, plus one mistake I made:

1. `writing_request(run_id, length_id=...)` now returns a **`WritingHandoff`**
   with `.request` and `.selection`, not a bare request.
2. `prepare_v3_runtime_request(request, selection)` takes the selection and
   builds the frozen packet. Both arguments are required — there is
   deliberately no way to get the whole dossier by omitting one.
3. **Always call `_services(run_id)`, never `_services()`.** Without the run id
   it builds a fresh usage tracker, and writing the ledger then replaces the
   run's whole accounting with that call's slice. I wiped run 1's cost record
   twice this way. The API routes pass it; hand-driving must too.

Working driver scripts from this session are gone with the scratchpad. The
sequence is: `begin_intake` → `answer_intake` until `status == "agreed"` →
`approve_brief` → `plan_research` → `do_research` → (`blocking_questions` /
`settle_gate` if blocked) → `writing_request` → `prepare_v3_runtime_request` →
`run_pipeline_v3` → `punch_list`.

The grill interviews whoever drives. Say so out loud in the report: the
editorial decisions in these two articles were mine, not the owner's.

---

## Open issues not being fixed here

- **`covers_primary_subject` is too literal.** Run 2's outline was discarded
  because no heading named "El Dorado International Airport" — the primary
  subject — although the piece is about getting *from* the airport into Bogotá.
  The article was written with no section plan and still came out well. The
  owner has deprioritised this. Likely fix: accept the brief's `location` as
  well as the primary subject.
- **The repair receipt misreports itself.** `repair_outcome.explanation` said
  "Repair did not run: the draft passed the audit" on run 1 while
  `repair_applied` was true and seven edits were listed. Finalize is reading
  the decision made *after* repair. Pre-existing.
- **`compose_records_text` in `evidence_v3.py` has no production reader.**
  Compose reads the packet now. It is ~17 KB built per run and stored in the
  snapshot. Harmless, but it is a second competing projection somebody could
  wire back in.
- **Unsupported inference is unchecked.** Groundedness verifies that each claim
  traces to evidence — it does not check the reasoning connecting them. Run 1
  shipped three: a recommendation with no support ("book toward the Torre del
  Reloj end"), an arithmetic misreading of two correct numbers, and an intro
  promising advice the body then withdrew. This is the most interesting quality
  gap the two runs exposed and nothing addresses it.
- **Stale facts survive selection.** Run 2's article cites an Uber/Duolingo
  detail from September 2015 to advise a 2026 traveller. It is sourced, dated
  and grounded, and it beat 317 other candidates into the final 18.

---

## What none of this proves

Two articles, both commissioned by an AI driving the grill, both about
Colombian cities, both read by one person. The redesign demonstrably fixed the
density problem — no section on either run exceeded 3.5 facts per hundred words
against a baseline worst case of 28. It has not been shown to make articles
*better*, and nobody outside this project has used any of it.
