# Itinerary research reduction: controlled live comparison

Plan: `docs/plans/itinerary-research-reduction-plan.html`. Baseline frozen in
`apps/backend/tests/fixtures/itinerary_lima_audit/`. Three new runs, the
plan's maximum, all on `claude-sonnet-5` at high effort, same as the baseline.
Costs are the CLI's recorded `total_cost_usd`, which is observational (the
calls draw on the Claude subscription).

| | Baseline (v1) | 1 · same direction | 2 · revised direction | 3 · three stops |
|---|---|---|---|---|
| Day | Lima day 1, 7 stops | Lima day 1, 7 stops | Lima day 1, 7 stops | workspace `20c6daba898b` d1, 3 stops |
| Sent to the call (chars) | 35,803 prompt + schema + system | 24,572 | 23,094 | 20,021 ¹ |
| Allowance (searches / reads) | none | 18 / 12 | 18 / 12 | 10 / 8 |
| Searches / page reads | 51 / 20 | 36 / 6 | 21 / 12 | 12 / 6 |
| Turns | 75 | 45 | 36 | 21 |
| Time | 21m 26s | 12m 36s | 9m 56s | 8m 06s |
| Recorded cost | $3.67 | $2.15 | $1.57 | $1.09 (earlier v1 runs of this day: $2.25, $2.70) |
| Answer (chars) | 40,070 | 18,624 | 14,707 | 9,710 |
| Article words | — | 593 | 595 | 288 |
| Complete for planning | no | no: 3 blocking closure issues | no: 2 blocking closures + 6 timing conflicts | yes |

¹ This day's accepted direction is also a long one; the brief is flagged over
18,000. A normal day measures 13,800 / 15,100 / 15,800 characters at 3 / 7 / 9
stops (`test_itinerary_compact.py`).

Run 1 used the exact accepted agreement, run 2 a copy of it with the
"lunch and dinner must survive any dietary or access answer" requirements
removed. **Run 2's revision exists only in a copied database**; it was never
accepted in the real workspace. The difference between runs 1 and 2 is the
cost of that scope, not of serialisation.

## Against the release gates

- **One call** — met. One research invocation per run, nothing around it.
- **Input reduction** — met for normal days (≤ 18,000). The Lima agreement
  stays over after lossless projection (24,572) and is labelled as such, with
  its brief named as the largest part. Nothing accepted was removed.
- **Research efficiency (≤ 30 tool calls, ≤ 10 min, ≤ $1.75, seven stops)** —
  NOT met with the audited agreement (42 calls, 12.6 min, $2.15). Nearly met
  with the revised scope (33 calls, 9.9 min, $1.57). Diagnosis from run 1's
  transcript: about 8 searches went to access and non-seafood menus (the
  "survive any answer" requirements), about 8 to walking distances (the
  "fifteen minutes on foot" rule), and the rest to cycling lunch candidates
  after one failed a requirement. Two instructions were tightened after run 1
  (one search per journey, then a labelled estimate; check a requirement once
  and move on), and run 3 used them.
- **Output size (≤ 20,000)** — met on all three.
- **Editorial quality** — prose is specific and in voice, one paragraph per
  stop; introductions run slightly long (77–94 words against 60–90).
- **Planning quality** — the closure conflicts the audit found hidden in notes
  now arrive as blocking issues (run 1: Sunday/Monday dinner, Monday bakery,
  conflicting lunch closed day). Run 2 scheduled against the low end of each
  journey estimate, which the new route check caught on every leg; the
  scheduling instruction was made explicit after it, and run 3 sized its
  rests to exclude the journey.
- **Evidence** — requires a person. Not yet done for these runs. Points to
  check: run 1 labels the Surquillo market as Miraflores and rated the district
  breach non-blocking; runs 1 and 2 disagree on Mercado Santa Cruz's opening
  days; run 2 often has one fact per stop; several sources are aggregators.

## What was left where

- Run 1's answer is waiting, unsaved, in step 4 of the real Lima Day 1.
- Run 3's answer is waiting, unsaved, in step 4 of workspace `20c6daba898b`
  day d1 (that day already has a saved v1 result; nothing replaced it).
- Run 2 lives only in the evaluation copy.
