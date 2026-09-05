# Writer packet and anti-AI audit

2026-09-05. Research and proposed changes only. No application code, runtime prompts, database rows, or live services changed. No model calls purchased.

**Recommendation:** retain the canonical evidence dossier and verification rendering; give compose a deterministic projection. Fix contradictory authority and duplicated instructions before shortening the anti-AI rules. Test examples inside the existing voice file separately. Prompt size is measured; its causal effect on dullness is not.

## Evidence and limitations

Read ADRs 0030–0032, the project vocabulary, relevant pipeline code, and ADR 0034 after finding its reference in finalize. Queried `data/pipeline.db` through SQLite `mode=ro`. The backend-local database has no tables. The brief's `prompt-dump/` was not found at repository root or inside this application; stored `pipeline_v3.debug.pipeline_trace` supplies actual prompts instead.

The database contains 27 outputs: three identical fixture-like “Improved comparison headline” outputs and 24 other articles. I screened openings and section structures across all 24, measured surface features, and closely read selected good/bad specimens. Twenty outputs carry comparable named quality-score fields, but they span changing prompts and pipeline versions. This is an observational corpus, not a controlled experiment or 24 independent human ratings.

The inspected run is `95a74dce-fa41-4bbb-b7a5-2e4e8d417dfe`. Its current stored snapshot differs from the brief:

| Measurement | Brief | Current stored snapshot |
|---|---:|---:|
| Compose context | 82,395 chars | 82,411 chars |
| Complete compose prompt | Not totaled | 105,385 chars |
| Evidence ledger, excluding surrounding policy | Not isolated | 66,172 chars |
| Claim prose | 13,906 chars | 13,746 chars |
| Per-claim source lists, including the sources label and separator | 12,299 chars | 12,459 chars |
| Anti-AI block | 10,555 chars | 10,555 chars |
| Audit overall / originality | 4 / 8 | 6 / 8 |
| Accumulated run estimate | About $0.31 | $0.475075 across 38 calls |

The ledger preserves three compose attempts and three audit attempts; a stage row is not the complete attempt history. These differences do not invalidate the original session's measurements, but they must not be mixed into a single baseline. The saved measurements include a SHA-256 of the inspected ledger.

## A. Evidence: consumer ownership

“Grounding” here compares prose against supplied records. It does not independently open source URLs. “Readiness” has two paths: current v4 `assess_coverage` reads structured statuses/kinds/premises; the v3 readiness module also owns a follow-up prompt that embeds the complete ledger. Keeping that distinction avoids mistaking prompt dependencies for deterministic field reads.

| Field | Compose | Grounding | Readiness / follow-up | Recommendation |
|---|---|---|---|---|
| Source ID | No ordinary citation need; retain linkage for substantive source-only notes | Joins claims to their provenance | Preserve in replacement research packages | Omit ordinary source links from compose only |
| Source title | Cannot be used as attribution; not an independent permitted claim | Provenance context, though URL-handle titles are poor evidence | Preserve through follow-up | Omit from compose unless inseparable from meaningful source context |
| Publisher | Cannot be used merely as attribution; actors in claim text remain | Authority/context | Follow-up needs original provenance | Omit ordinary bibliography from compose |
| Source URL | No demonstrated prose use | Traceability, not fetched verification | Needed for source records and follow-up | Keep canonical; omit ordinary URLs from compose |
| Published date | Bibliographic date is not automatically a date the article may assert | Recency/qualification context | Preserve in follow-up | Keep meaningful qualification in claims/notes; never substitute retrieval date |
| Retrieved date | Generally provenance; preserve for meaningful operator note | Recency context, not proof a claim is current | Preserve in follow-up | Remove empty bibliography records from compose |
| Source type | Relevant when distinguishing first-hand material or evidence limits | Authority context | v3 form-source gates read it | Preserve with substantive notes; retain structured original |
| Material type | First-hand/interview context can matter | Evidence interpretation | v3 source gates read it | Same treatment as source type |
| Source note | Potential facts, limitations, exact first-hand words or operator resolution | Load-bearing context | Preserve in follow-up | Preserve meaningful notes exactly; omit placeholder in compose |
| Claim ID | Outline refers to these IDs | Traceability | Coverage references them | Keep current IDs; do not introduce a mapping change in first cut |
| Claim text | Primary factual material | Exact support boundary | Follow-up and linked coverage | Preserve byte-for-byte |
| Claim `as_of`, confidence | Prevent widening or modernizing a claim | Explicitly checked | Preserve in follow-up | Keep |
| Per-claim source list | Ordinary lists have no reader-facing use | Links to authority and notes | Required to preserve dossier integrity | Remove from compose except retained source-context links |
| Claim/requirement links and coverage | Helps relate outline, support and omissions | Support context | Core bookkeeping | Keep in first projection; compress only as a separate experiment |
| Premise findings | Settled facts and limits; never narrate research | Detect assertions resting on false premises | Core gate/follow-up input | Keep, including basis and verdict |
| Conflicts and resolution | Determines which assertion is permitted | Must catch unsupported settlement | Conflict/follow-up input | Keep exactly; never silently select a number |
| Gaps | Internal omission constraints, never prose | Prevent invented completions | Core follow-up input | Keep internal, not reader-facing |

Nobody needs the literal placeholder “No note recorded for this source.” as article content. There are 55 instances. That does **not** mean nobody needs the underlying sources.

Code evidence: `evidence_v3.py:191` builds the shared ledger; `instructions_v3.py:153` wraps it for compose; `stages/v3/groundedness.py:34` consumes it; `research_readiness_v3.py:417` embeds it in follow-up; `stages/v3/finalize.py:207` preserves it in the debug receipt. `coverage_v4.py:78` is the active structured coverage check.

### Measured compose projection

The accompanying `compose-evidence-projection.md` is a review artifact, not a runtime prompt change. Its transformation:

1. Retain source records with substantive notes, including their type/material/date and source ID. In this snapshot that is the operator's distance instruction.
2. Omit the other bibliography records and placeholder notes from compose.
3. Remove per-claim source lists except links to retained source-context records.
4. Keep all 80 claim IDs, exact texts, requirement links, confidence and as-of values. Keep everything from requirement coverage through premises, conflicts and gaps unchanged.

| Scope | Before | Proposed | Reduction |
|---|---:|---:|---:|
| Evidence rendering | 66,172 chars | 31,015 chars | 35,157 chars / 53.1% |
| Complete compose prompt, all else fixed | 105,385 chars | 70,228 chars | 33.4% |
| Approximate evidence tokens | 16,543 | 7,754 | 8,789 |
| Approximate complete prompt tokens | 26,346 | 17,557 | 8,789 |

Token numbers are characters divided by four, not tokenizer measurements. Actual recorded compose input is 32,309 tokens for the latest main call, illustrating the approximation's limits. No provider counting call was made.

At the historical ledger's approximately $0.30/million input-token rate, the estimated saving is **$0.00264 per compose call**, about a quarter of a cent. That is about 0.85% of a 31-cent article, or 2.9% of the brief's nine-cent writing half, holding other calls fixed. Do not apply this percentage to the entire pipeline: grounding remains full-sized, output/reasoning is not assumed to shrink, and retries are not assumed to disappear. This is historical scenario arithmetic, not a newly verified price quote.

This is the smallest **demonstrated conservative candidate here**, not a mathematically proven minimum. Requirement bookkeeping and long claim IDs could shrink further, but changing them entangles outline references. Generic source-only qualifications must survive. A source note identical to a claim might be deduplicated, but the operator's settlement deserves explicit visibility in the first implementation.

### Two renderings: viable, with a narrow maintenance boundary

One normalized dossier, existing verification renderer unchanged, one pure compose renderer. No second research package, model summary, persisted editable copy, or parallel truth store. Render from typed data; the text transformation used for measurement is not the proposed production parser.

Maintenance cost: another field-to-text projection, fingerprint/size instrumentation, and tests proving claim/qualification preservation and source-note retention. Any new evidence field must be reviewed for both consumers. Leave groundedness, readiness, resume data and receipts on the canonical rendering. This isolates the savings without weakening their input.

Offline checks already performed on the candidate: all 80 claim texts and their remaining suffix fields match; coverage, premise, conflict and gap text is byte-identical. These checks establish data preservation, **not identical model behavior**. A later evaluation must check omission of limits, source-only caveats and conflicting claims.

## B. Anti-AI block: preserve the working result, correct its attribution

The narrow surface result is real: the inspected final article has zero em dashes, en dashes, lowercase alphabetic hyphen compounds, and listed brochure words. But the brief's conclusion that the instruction block alone caused these zeroes is not supported by current code or traces.

`stages/v3/compose.py:78` calls `enforce_anti_ai`; `dependencies.py:74` delegates to the shared validator/repair wrapper; `shared/text/normalize.py:418` can purchase one targeted repair. The latest stored compose trace proves a transformation: raw parsed prose includes **“mosaic-covered” and “six-month”**; returned prose removes them. The usage ledger records a second compose-attempt-3 call of 2,021 input and 2,136 output tokens. Repair-stage prose also calls this wrapper.

This conflicts with ADR 0032's documented removal of the enforcement pass. Report it; **do not remove the functioning backstop while attempting compression**. First reconcile intended behavior and observed wiring. The raw and returned drafts must both be measured in any experiment.

The zero-hyphen metric is narrow: numeric compounds such as “10-kilometer” survive, as do capitalized date ranges. Keep the original metric for comparability, but add numeric compounds and reviewed proper-name exceptions. Do not describe lowercase-regex zero as complete compliance with the blanket rule.

### What occupies 10,555 characters?

| Block | Characters |
|---|---:|
| Banned constructions, including shape explanations/examples | 3,170 |
| Disclaimers, four explanatory families | 2,043 |
| Dashes and compounds | 1,214 |
| Unanchored superlatives | 838 |
| Rhythm | 766 |
| Specificity / do not fabricate anchors | 606 |
| Additional voice | 330 |
| Personification | 274 |
| Hedges | 254 |
| Diction | 252 |
| Summary patterns | 249 |
| Adjective stacking | 203 |
| Final test | 190 |
| Precedence | 140 |
| Separators | 26 |

A reproducible lexical-versus-explanation proxy counts the union of double-quoted examples plus the explicit unquoted hedge, imperative-verb and personification-verb lists: **2,964 chars, 28.1%**. The remainder, **7,591 chars, 71.9%**, includes shape rules, operative instructions, explanations and formatting. This is a lexical-span measure, not a claim that 71.9% is dispensable explanation. Examples also teach shapes; those categories cannot be cleanly separated by counting bullets.

The contrastive-pivot and vague-payoff explanations deliberately generalize beyond literal strings. The no-fabrication exception prevents the specificity rule manufacturing facts. The dash explanation distinguishes subordination from choppy full stops. No ablation evidence establishes that those explanations are dead weight. The shared phrase-coverage test also couples some listed phrases to the validator; careless deletion changes which rules a writer sees before it is judged.

### Duplication and conflicts

| Overlap / conflict | Evidence | Proposed ownership |
|---|---|---|
| Voice and conventions each appear twice | Both in compose context and again under STYLE DIRECTIVE; **3,474 duplicate body chars** | One injection of each; retain length settings separately |
| No attribution / no research narration | Voice, conventions, house rules, evidence disposition, compose template, anti-AI disclaimers | Factual disposition owns meaning; anti-AI retains necessary phrase/shape prevention |
| Gaps exposed versus silently omitted | House rules: “Missing support remains a visible gap”; disposition: internal metadata only | Clarify house rule's internal scope |
| Preserve conflicts versus publish settled facts | House rules demand disclosure; evidence policy forbids narrating resolved disagreement | Preserve supported uncertainty, omit research process; unresolved conflicts stay internal constraints |
| Universal anti-AI precedence versus factual limits | Block says it overrides any instruction above; also says “Risk being wrong” and “Do not caveat a fact” | Limit this precedence to expression; evidence limits remain authoritative |
| Price as-of frame versus anti-disclaimer wording | Conventions require dates; disclaimers reject dates used as shields | Keep dates that affect reader action or factual scope; remove only defensive process narration |
| Stale commission/title/exclusions language | House rules and `_brief_body` retain old terms; ADR 0034 makes Seed the title | Align with ADR 0034; do not restore provenance-only title behavior |
| Mechanical specificity versus character | Many bans and examples, but no developed demonstration of transforming a fact into a reader consequence | Add examples to the existing voice file, not another rules document |

The voice file itself uses contrastive constructions and hyphens in its explanations. That is understandable explanatory prose, but examples intended for imitation should obey the actual output rules.

### Cut / merge / add, with zeroes at risk

* **First: remove duplicate injection, not either canonical file.** Saves 3,474 chars plus wrappers. None of the measured bans is deleted, but instruction-frequency effects are untested; recheck every surface metric.
* **Merge `_VOICE` and `_FINAL_TEST` into the existing voice's responsibility.** They restate taking a view and avoiding generic writing. Removing those two blocks and separators would take anti-AI from 10,555 to 10,031 chars. No explicit dash, compound or stock-phrase ban is removed. Risk is less reinforcement of specificity/originality; validate before adoption.
* **Keep dash/compound rules and rhythm explanation initially.** Cutting them risks the em-dash, en-dash/alternative punctuation, compound zeroes, and sentence-length distribution. En-dash prevention is not an explicit standalone instruction in this block, so inspect validator coverage too.
* **Keep construction shapes, diction, personification, hedge and adjective rules initially.** Cutting shapes risks contrastive-pivot and stock-opener zeroes; cutting lexical examples risks phrase/brochure-word zeroes. Some table words are covered indirectly rather than literal bans, making measured outputs more important than string-list coverage alone.
* **Keep the no-fabrication exception.** Removing it risks factual invention while trying to satisfy “specificity.” A surface-zero result would not compensate for that regression.
* **Consolidate factual-disposition wording only after authority is explicit.** Surface metrics alone will miss lost uncertainty, omitted as-of dates or research-process leakage.
* **Add two or three short approved examples within `questurian-voice.md`.** Show a fact becoming a consequence and a reason to choose. Do not paste an entire “good” article or copy voice rules into another pipeline. This can disturb any surface metric; treat it as a separate hypothesis test.

One useful stored example from `9923d1c1`:

> Walking a few blocks for groceries is a different task in Laureles than it is on El Poblado's slopes.

It translates terrain into a task the reader understands. The weak park specimen says:

> Parque Mahatma Gandhi, dedicated to the pacifist leader, sits on the cliff overlooking the Pacific.

The latter is permissible evidence, but contributes little to choosing where to stop. The lesson is selection and consequence, not permission to invent sensory detail. The Medellín article also has catalog passages and balanced rhetorical summaries: mine selected examples, not its entire style.

## C. Additional findings, ordered by confidence

### Confirmed: voice already repeats; percentage alone cannot explain failure

The brief's 2.5% calculation covers one context occurrence. The complete prompt contains the 2,068-character voice body twice, about 3.9% of its 105,385 characters. Thus “a larger voice section” could help by adding concrete examples, but merely repeating or expanding abstractions is not a supported remedy.

The existing originality instruction fails operationally: it provides no comparative anchor or required evidence of editorial contribution, and the auditor cannot see the source prose it is asked to compare against. In 20 scored outputs, originality is 7 in eight, 8 in seven, 9 in three, 6 in one and 5 in one. The park gets 8; the owner-noted good Medellín specimen gets 9; the known failed short Lima restaurant article `16872313` also gets 9. Scores have not demonstrated reliable agreement with human quality judgments. Missing voice in the canonical audit context remains worth fixing, but cannot by itself calibrate this scale; the legacy STYLE DIRECTIVE also carries voice content, so actual prompt access is subtler than the context manifest implies.

### Confirmed: upstream prompts reward collecting more than the piece needs

The park work order contains 16 questions: 11 load-bearing and five texture. `build_gather_prompt` explicitly says answer fully, “Then keep going,” including interesting adjacent discoveries. `build_batch_prompt` asks for two or three claims per question, but this package carries 80 claims: five per question on average. Geographic inventories and four-season weather enter before compose.

Do not blindly cap questions at six: endpoint, continuity, distance and operating constraints can be independently essential. Instead, review the approved work order for which decision each question supports, keep separate verification questions where needed, and prevent answered research questions becoming mandatory prose. Weather relevant to a morning walk is useful; printing every season's temperatures and the Humboldt Current explanation is an editorial selection problem.

### Confirmed: intake misclassifies editorial instructions as material

The park brief contains six `interview` material entries totaling 1,349 characters. They repeat the reader, question, outcome, spine and failure criteria rather than supplying reported interview evidence. `_material_from` proves an answer was copied exactly, but not that it is factual material. Preserve the transcript; nominate factual material separately from commissioning decisions. Do not paraphrase first-hand words or weaken the exact-copy safeguard.

Relatedly, brief assembly calls a walk through a place `destination-guide`, while that form's full “Do not use when” warns against a single practical problem. Outline/compose project only Reader promise, Required evidence, Allowed structures and Failure modes; they never see that selection warning. This is a credible form-selection mismatch to resolve at intake, not permission for compose to change an approved form.

### Confirmed: outline shape is locked before the writer can exercise judgment

`_facts_by_subject` reads `claim.subject`, but `NormalizedClaim` has no such field. All facts fall into **General**. This does not prove subject grouping would improve prose; it proves the advertised grouping is not happening.

The accepted outline has six sections and 730 planned words for a 900-word target. Compose must follow its headings and order. Its final amenities/weather section links 24 claims against a 100-word budget. Selection is squeezed by an inventory-shaped plan and dense obligations.

There is also a real prompt contradiction: outline template asks section budgets to total the target, while injected planning rules ask target minus roughly 165 words. This run followed the latter, so that contradiction is not proof of this overrun's cause. Remove it nevertheless.

### Confirmed: audit asks repair to add something repair cannot add

Outline records `water_refill_points` as unsupported. Audit nevertheless requests water-fountain information. Audit sees work-order requirements but no explicit evidence-availability projection; a general “grounded” verdict does not communicate each omitted unsupported requirement. Repair is forbidden to add any fact absent from the previous draft. That revision cannot be satisfied within repair's contract.

Give audit a small support/omission status projection, so it distinguishes an unsupported omission from forgotten available material. If genuinely new facts are needed, classify that as editorial follow-up, not a prose-repair command. Do not send the full ledger merely to solve this.

### Confirmed: budget exhaustion prevented this run's repair

Latest audit's decision is `settle`, reason `token_budget_reached`: 444,405 tokens spent against 425,000, zero repair attempts on that latest leg. Earlier attempts exist in the accumulated ledger. The final article remains `needs_revision`. Smaller compose input can reduce pressure, but the measured single-call reduction would not by itself erase the latest 19,405-token deficit. Do not claim compression guarantees repair or raise the budget automatically.

### Confirmed: “texture” readiness measures labels, not enjoyable material

`coverage_v4.assess_coverage` sets `has_texture` when at least one texture-tagged requirement has an accepted status. It does not read prose for scene, usefulness or pleasure. This is a legitimate cheap structural gate, but its message “Nothing here would be a pleasure to read” overstates what it can measure. Keep the gate advisory meaning precise; develop editorial judgment in the deliberately deferred quality work rather than pretending it already exists.

### Confirmed limits: grounding is record consistency, not factual certification

Most source notes are empty placeholders; citation titles/URLs alone cannot prove that a claim matches the underlying page. The prompt also exempts general background and permits `grounded=true` with low-severity unsupported claims. Therefore preserve this valuable check but do not equate its green result with verified real-world correctness.

The inspected receipt still contains one unresolved distance conflict alongside an operator settlement note. Grounding accepts the operator's figure. The compose projection deliberately keeps both; it does not silently settle or discard the conflict. Future renderer tests need this exact case so a cleanup cannot remove the only instruction explaining which distance to use.

### Proposed measurement: sentence shape, separately from repeated facts

Current code already measures sentence-length spread and cross-section content-word repetition. The latter deliberately removes many proper nouns; neither measures repeated subject-led sentence shape. Add a diagnostic reporting consecutive entity-led openings and dominant opening patterns, with quoted sentence windows. Four consecutive park-name descriptions are a useful review example.

Do not make “85%” a hard failure threshold. The brief does not supply its sentence splitter or entity-labeling rule; this checkout's simple punctuation splitter counts 68 prose units in the stored final article, not 59, and abbreviations such as `a.m.` can distort it. Establish a reproducible splitter, distinguish names from pronouns and temporal openers, and manually label a small reference set. Travel guides legitimately repeat place names. Report repetition; let a human judge whether it obstructs the intended walk.

Polish already consumes measured rhythm/repetition problems, but fixes headings, order, every fact and every proper noun. It cannot remove an inventory-shaped outline under that contract. Finalize itself makes no prose-model call. Do not expect either step to supply missing editorial selection.

## Approval-ready sequence

1. **Low risk, offline first:** implement compose projection while preserving canonical records; remove duplicate voice/conventions injection; record section sizes. Validate all claim texts, dates/confidence, meaningful notes, conflicts and references. Test an operator settlement, first-hand note, source-only limitation, unresolved conflict and unsupported requirement. No paid test needed for these preservation checks.
2. **Resolve authority drift:** retain Seed-as-title under ADR 0034; align stale prose, internal gaps and factual precedence. Reconcile ADR 0032 versus active anti-AI enforcement without removing the backstop as collateral cleanup. Make outline budgeting unambiguous.
3. **Improve selection at its owner:** repair the ineffective subject grouping only after choosing a real source for that grouping; review brief material classification and form selection; keep research coverage separate from prose obligations; pass omission statuses to audit.
4. **Run a controlled, owner-approved paid comparison:** fixed model, evidence, brief and outline for baseline versus projection; measure raw and post-enforcement prose separately. Then independently compare existing voice versus selected approved examples. Include the park, the good Medellín specimen and a failure with unsupported material. Keep all current surface checks, groundedness and uncertainty preservation; blind human judgments cover usefulness, flow and willingness to read. A few outputs are a pilot, not proof of a stable effect.
5. **Only then trial anti-AI compression:** start with the 524-character redundant voice/final-test removal. Retain shape rules and factual exceptions until an isolated ablation demonstrates no regression. Shared consumers need their own fixtures before any shared-rule edit.

No new tone, duplicate voice file, post-writing gate, model migration, live change, paid call or PR is part of this audit. The next decision is whether to implement steps 1–3 and set a separate evaluation budget for steps 4–5.

## Reproduction notes

Read `stages.data` JSON's `data` envelope for `pipeline_v3`; the trace contains full compose/outline/audit prompts. Read `outputs.markdown` for final corpus text; do not substitute raw compose for final output. Read `usage_ledger` for attempt-level accounting.

Evidence projection measurement splits the stored ledger at `CLAIMS`, retains source records carrying a non-placeholder note, removes other source-list spans, and asserts exact equality of all 80 claim bodies and remaining claim fields. The suffix beginning `REQUIREMENT COVERAGE` is unchanged. `measurements.json` records exact string lengths before the extra trailing newline used when saving the Markdown file.

Primary code locations beyond those cited above: `instructions_v3.py` (`_facts_by_subject`, stage-context assembly); `support.py` (`_format_style_directive`); `prompts/editorial_v3.py`; `brief_v4.py` (`build_brief_prompt`, `_material_from`); `work_order_v4.py` (`build_work_order_prompt`); `research_v4.py` (`build_gather_prompt`, `build_batch_prompt`); `quality.py` (`measure_sentence_spread`, `measure_repetition`); `polish_v4.py`; and `shared/prompts/anti_ai_tells.py`. All paths are under `apps/backend/app/features/prompt2blog` unless otherwise specified.
