# Baseline: what the writer receives today

Step 0 of the research redesign plan. Measured 2026-09-06 against the eight
most recent stored runs that reached compose, by replaying their saved rows
through the real assembly code (`scripts/p2b-handoff-baseline.py`). Nothing was
generated and no model call was bought. Numbers are characters, because this is
assembled before a tokenizer is in reach; a four-to-one ratio finds the big one.

`baseline.json` holds the full measurement, including every stage context's
size by named part and every outline section's claim allocation.

## The three numbers this redesign has to move

| run | dossier | selected | compose context | facts | research bookkeeping | worst section |
|---|---:|---:|---:|---:|---:|---|
| `4a56545b` | 292 | 25 | 29,878 | 7,225 | 10,371 (59%) | 12 claims / 195 words |
| `8a7e9aa4` | 228 | 30 | 27,483 | 8,417 | 6,798 (45%) | 8 claims / 95 words |
| `3750891f` | 137 | 27 | 30,933 | 9,496 | 10,280 (52%) | 5 claims / 85 words |
| `9e66bf84` | 105 | 105 | 45,244 | 26,592 | 7,423 (22%) | 56 claims / 200 words |
| `90f348df` | 54 | 54 | 30,397 | 13,973 | 5,162 (27%) | 11 claims / 259 words |
| `1cd644b5` | 58 | 58 | 33,545 | 14,722 | 7,678 (34%) | 12 claims / 105 words |
| `a3c20e41` | 51 | 51 | 30,604 | 12,141 | 7,482 (38%) | — |
| `b88081a0` | 100 | 100 | 46,649 | 24,111 | 11,486 (32%) | 16 claims / 85 words |

"Facts" and "research bookkeeping" split the compose evidence rendering at
`REQUIREMENT COVERAGE`. Above the line: the claims a writer may use. Below it:
every research question, its status, its gap, and which claims closed it.

## What it says

**Selection already works, and the packet did not get smaller.** The four runs
with a selection kept 25 to 30 claims out of 137 to 292 — a real editorial cut.
Their compose contexts are 27,000 to 31,000 characters, which is what the runs
with *no* selection cost. Cutting 90% of the facts did not cut the prompt,
because the prompt was never mostly facts.

**The bookkeeping grew as the facts shrank.** On `4a56545b`, 25 chosen facts
arrive as 7,225 characters, followed by 10,371 characters naming all 28
research questions — 59% of the writer's evidence is a list of what was asked
rather than of what was found. Eleven of those rows read `claims: none kept for
this article`, which is the editorial cut being reported to the writer as a
hole. The cut is made and then handed over with its own receipt attached.

**Density is still the failure mode.** `9e66bf84` remains the worst case at 56
claims in a 200-word section. But `8a7e9aa4`, which selected 30 of 228, still
gave one section 8 claims in 95 words — one fact per twelve words. Selection
narrowed what reached the outline; it did not change what the outline does with
what it receives.

**Cost is not in this table on purpose.** These runs predate the receipt on
`run_cost` or carry a partial one, and a partial total quoted as the price of
an article is exactly how the last set of numbers went wrong. The script
reports it as missing rather than reconstructing it.

## What this does not measure

The compose *prompt* is bigger than the compose *context* measured here: the
stage adds its own template and the outline plan around it. This measures the
assembled context, which is the part the redesign changes. It says nothing
about whether the articles are good — no draft was read for this table, and no
run was generated to produce it.

## After the packet boundary was wired in

Same three runs, same stored dossiers and selections, replayed through the new
assembly. No model call was bought for this table either.

| run | compose context | its evidence part | outline context | its facts part |
|---|---|---|---|---|
| `4a56545b` | 29,878 → **17,566** | 19,014 → **6,702** | 23,029 → **15,873** | 9,055 → 8,503 |
| `8a7e9aa4` | 27,483 → **18,158** | 16,633 → **7,308** | 20,719 → **16,832** | 9,832 → 9,476 |
| `3750891f` | 30,933 → **19,333** | 21,194 → **9,594** | 17,015 → **17,517** | 7,656 → 11,272 |

The compose evidence part falls by roughly two thirds while every chosen fact
survives verbatim. What left is the research bookkeeping: the question list,
the statuses, the gaps and the claims nobody chose.

`3750891f` is the useful counter-example. Its outline context grew, and both of
its facts parts grew, because it is the run with seven real source caveats —
they now travel with the facts they qualify instead of sitting in a
bibliography the writer was told not to cite. A packet that got smaller there
would have got smaller by dropping the thing that makes a fact true.
