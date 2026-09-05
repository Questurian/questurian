# Writer packet: fix plan

From the audit in `audit.md` (2026-09-05). Every claim below was independently
re-verified in the code before being filed — see "Verified" on each item.

**The goal is not saving money.** Halving the compose packet saves about a
quarter of a cent per article. The goal is that the writer receives a clear
instruction instead of a contradictory one, and that the article stops being
shaped like its own research plan.

## Phases

Ordered so the cheap changes that could plausibly change the writing come
first, and the expensive ones that need paid evaluation come last.

---

### Phase 1 — Three small fixes that decide the article's shape

All three are in the outline/prompt path, all are small, and all are currently
defeating instructions the system already has.

| # | issue | what |
|---|---|---|
| 1.1 | #509 | Subject grouping has never worked — `claim.subject` does not exist |
| 1.2 | #510 | Two contradictory section-budget rules reach the outline |
| 1.3 | #511 | The voice and conventions are injected into compose twice |

**Verified:** `NormalizedClaim` carries `claim_id, text, source_ids,
requirement_ids, as_of, confidence` and no `subject`, so
`getattr(claim, "subject", "")` files every fact under "General". The outline
template says budgets "should total roughly the target word count" while the
injected planning rules say "Budget the sections to the target minus that
[~165 words]" — 900 − 165 = 735, and the outline planned 730 in both runs.
`_format_style_directive` re-emits the voice and writing-conventions bodies
that the compose stage context already carries: **3,474 duplicated characters**,
matching the audit exactly.

**Exit:** one paid run on the same Malecón seed. Does the outline stop being
one section per research question? Nothing else changes, so nothing else can
explain a difference.

---

### Phase 2 — Instructions that cannot be obeyed

| # | issue | what |
|---|---|---|
| 2.1 | #512 | The grader tells repair to add facts repair is forbidden to add |
| 2.2 | #513 | The brief files the operator's own answers as interview evidence |
| 2.3 | #514 | The form's "Do not use when" warning never reaches outline or compose |
| 2.4 | #515 | Repair did not run because the token budget was already spent |

These do not shrink anything. They stop the pipeline arguing with itself.

---

### Phase 3 — The packet diet

| # | issue | what |
|---|---|---|
| 3.1 | #516 | Give compose its own evidence rendering; leave grounding's alone |

The audit's main proposal, and the one with real risk. `records_text` is built
once and consumed by compose, groundedness and readiness follow-up. Compose is
forbidden to cite; groundedness exists to verify. Two renderings from one
dossier, not one smaller rendering.

Measured candidate: evidence 66,172 → 31,015 chars (53%), whole compose prompt
105,385 → 70,228 (33%). Claims preserved byte-for-byte; coverage, premises,
conflicts and gaps byte-identical.

**Do not start this before Phase 1.** If Phase 1 changes the article's shape,
the packet's contents may want re-deciding.

---

### Phase 4 — Make the problem measurable

| # | issue | what |
|---|---|---|
| 4.1 | #517 | Report sentence-shape repetition as a diagnostic, not a threshold |
| 4.2 | #518 | Quality scores do not discriminate — reconcile or retire them |
| 4.3 | #519 | ADR 0032 says the anti-AI enforcement pass was dropped; it runs twice |

4.3 is documentation drift with teeth: the surface-tell zeroes may depend on a
pass the ADR says does not exist. **Nobody may remove that pass as cleanup**
until this is settled.

---

### Phase 5 — Paid evaluation, owner approval required

| # | issue | what |
|---|---|---|
| 5.1 | #520 | Add worked examples to the voice file and A/B them |

The hypothesis: the packet is heavy on prohibition and light on demonstration,
so the writer avoids bad prose without producing good prose. Test it; do not
assume it. A few outputs is a pilot, not proof.

---

## What is deliberately not here

- **Capping research questions.** The audit is right that 16 questions for a
  park walk is too many, but it is also right that endpoint, distance and
  continuity can each be independently essential. The fix is to stop an
  answered research question becoming a mandatory paragraph — which is Phase 2
  and Phase 3 territory — not a cap.
- **Writing more instructions about being enjoyable to read.** Two already
  exist and neither is enforced.
- **Anything that weakens grounding.** Factual accuracy is what currently
  works.

## Corrections this plan carries

Three claims from the original session's brief were wrong and the audit caught
them:

1. The surface-tell zeroes are not the instruction block alone — a validator
   rewrites the prose afterwards, with trace evidence ("mosaic-covered" and
   "six-month" present in the raw draft, absent from the returned one).
2. "85% of sentences open with a place name" is not reproducible: the splitter
   was never specified, and another splitter counts 68 units rather than 59.
   Report the shape; do not make the number a rule.
3. "The voice is 2.5% of the packet" measured one of its two occurrences.
