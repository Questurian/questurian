# Handoff: narrowing what research asks for

Written 2026-09-06 at the end of a long session, for whoever picks this up.
Branch `p2b-research-redesign`, 13 commits, 1518 backend tests and 765
frontend tests green, `tsc` clean.

Two changes are proposed and **not built**. Everything else described here is
shipped and verified. Read "What I got wrong" before you start — I reasoned my
way to two wrong answers on this exact question before measuring, and the
measurement is at the bottom.

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

### 1. Tell the planner how long the article is

`build_work_order` (`work_order_v4.py`) does not know the target length. Give
it the resolved word count and the fact budget that follows from it, and ask it
to plan questions the article has room to use.

**This is not a ratio and must not become one.** The owner pushed back on a
fixed "900 words → N questions" rule and was right: a head-to-head comparison
legitimately needs evidence for both sides, a service guide legitimately needs
every option ranked, and a piece with one venue needs far less. The form
decides. The length is a constraint the planner weighs, not a number it divides
by. Do not add a global cap — the redesign plan says this explicitly, and so
does the owner.

There is already a `budget_projection` on the work order stage that reports
question count against a cost budget. It said run 2's 57 questions "fits",
which was true about money and silent about editorial room. That projection is
the natural place to also report the fact budget.

### 2. Make each question say what it is for

Add `purpose` to `WorkOrderRequirement` — one line on why the article needs
this answer. A question that cannot name its job in the article does not get
bought.

This is the plan's own design (`docs/plans/`, and the research redesign plan
the owner supplied). It also kills the five unanswerable questions: a question
whose purpose cannot be stated without inventing a use is the same question
that no source can answer.

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

## How to verify it worked

Both briefs are stored, so this is a before/after on identical input, not a new
topic. Re-plan and re-research runs `2197ccc4` and `e23257c0` and compare:

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
