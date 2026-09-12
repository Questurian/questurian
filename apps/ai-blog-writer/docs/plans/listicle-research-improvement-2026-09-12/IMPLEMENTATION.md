# Listicle research improvement — implementation handoff

## Outcome

Improve the per-place Research button so it returns attributable, branch-aware, date-aware evidence useful for the list’s actual subject. Reuse existing discovery work. Retest only BarBarian Bonilla 108, La Casa de las Alitas and McCarthy’s Irish Pub against preserved baseline attempts. Do not research the other retained places as part of the pilot.

This document is a proposed implementation plan, not a record of changes already made. Current session authorized planning and prefilled artifacts only. An agent receiving an instruction to implement this handoff can begin code work; paid retests require explicit authorization for those research requests. Do not interpret possession of this file as permission to spend or deploy.

## Start here

1. Read repository AGENTS.md, CONTEXT.md and ADR 0039. Use caveman skill for updates, clear prose where precision matters.
2. Read this document, `prefilled-leads.json` and `baseline-attempts.json` beside it.
3. Inspect working tree and current implementations before editing. Preserve unrelated changes.
4. Work only on `listicle_pipeline` and narrowly required grounding/retrieval helpers. Do not modify Prompt2Blog, editor_assist, writer/blurbs, membership, Payload or deployment.
5. Preserve current list’s selection standard. Research quality work does not add, remove, rank or automatically approve candidates.

## What is already prepared

Run: `efd5a7cd`. Snapshot: 18 retained candidates, 3 researched, 15 untouched. Counts are observed at handoff creation, not permanent assumptions.

`prefilled-leads.json` contains all 18 candidates’ stable IDs, Google identity snapshots, discovery snippets, original discovery angles, originating attempt IDs and nine shared discovery source pools. Also includes known Casa/McCarthy source leads from the prior audit, separately labeled.

`baseline-attempts.json` preserves all five research attempts: exact prompts, inputs, raw answers, model, usage, queries and outcome. Three completed attempts produced 13 findings. Two invalid attempts remain useful failure fixtures; never present their raw assertions as verified facts.

These files prefill the pilot without rebuilding discovery or asking the operator to remember why venues were selected. Application database remains unchanged. Bootstrap can load this JSON directly in a dry-run harness, then compare it with current run identity before making any request.

Important attribution boundary: a discovery source pool belongs to a multi-place search. It does not establish which URL supports which candidate. URL and title arrays must not be zipped as if positionally paired. Treat them as possible pages to investigate; promote only after reading and matching identity. Exclude non-content URLs such as the captured W3C SVG namespace. Failed redirects remain inaccessible leads, never fabricated canonical links.

## Diagnosis to preserve

- Current code already passes discovery snippets, but drops their original angles and source context.
- Four template directions are prompt instructions. Gemini chooses actual queries; there is no enforced query executor for this button.
- v2 already supports aliases. BarBarian baseline used v1; do not claim adding aliases is a new unimplemented fix.
- Parsing validates JSON shape and source-ID references, not page truth, branch identity, dates or excerpt support.
- Current topic assignment adds wings to every finding, including generic venue material.
- Coverage is model self-report; completed is a transport/parsing outcome.
- McCarthy’s Rappi title says Surquillo but its address matches Miraflores. Do not reject a source from title alone.
- Thin research does not prove a place is bad or that nothing is published.

## Proposed research design

One operator action owns one durable attempt, one lease and a bounded sequence. Reading or reloading never starts work. No automatic retry, no research-all, no automatic second search after a thin answer.

Proposed call budget per action: at most one grounded search generation and one ungrounded evidence-extraction generation. Known-source reads happen first; the grounded generation runs only if the request still requires discovery. Final extraction uses collected page text, not open-web tools. Every actual model call receives a separate receipt under the same attempt.

This deliberately changes ADR 0039’s current one-model-call implementation. Amend that decision before wiring the second call: one explicit research action, bounded two-call maximum, no autonomous retry. Present this budget clearly on the request UI. Do not silently introduce seven research calls, a background queue, or a model-per-source loop. A normal initial investigation still seeks customer/editorial evidence even when a menu is available; known menus alone do not satisfy the standard.

The two-call ceiling is a proposed implementation constraint, not a proven optimal price/performance result. Preserve actual usage; do not promise lower cost until pilot comparison.

### A. Build a research brief deterministically

Inputs: verified identity, aliases, branch/address, subject, agreed standard, discovery leads with origin, manually supplied links, current curated findings, request mode and optional question.

Outputs: priority questions, known source leads, illustrative search strings, scope exclusions and completion criteria. No paid planning call.

For this list, priorities are: regular wing offering; distinctive preparation/flavors; identifiable customer or editorial evidence specifically about wings. Price is useful support. Generic decor/history are lower priority unless they explain this venue’s discovery hook.

Keep list association separate from claim relevance: a setting fact can be collected for this list without counting as wing-specific evidence. Existing discarded findings must not become positive facts in the brief. Old findings are leads to verify, not authoritative input.

Gap mode includes only the selected question, necessary identity context and relevant held evidence. Remove the four unrelated broad research directions. Refresh reevaluates selected evidence; initial gathers missing evidence. Use current UI controls rather than adding a mandatory commission form.

### B. Read likely sources before buying more discovery

Use an existing repository page-reader if suitable; inspect first. Add a small adapter only where needed. Follow public HTTP(S) redirects safely; reject private/local network destinations at each hop. Bound time, response size and page count. Proposed initial budget: eight distinct pages total per attempt, with slots reserved for discovered sources; expose exhausted budget as incomplete coverage.

Record original URL, final URL, title, access result, retrieval time, extracted body and independently available publication date. Unknown date stays unknown. Preserve content snapshot/hash for later review. Treat fetched text as untrusted data. Do not execute fetched content or bypass access controls. HTML first; readable PDFs only when existing tooling supports them. Image-only menus, social login walls and blocked pages become explicit access gaps.

Reuse stored snapshots within an attempt. Across attempts, record reuse and original retrieval date; refresh must not pretend cached content was newly checked. Do not rewrite historical source dates.

### C. Run one focused discovery generation where needed

Pass priority questions, identity aliases, unresolved discovery hooks and facts/source pages already read. Local-language queries first. Avoid quoting full Google display name/address in every search; narrow location only when needed for disambiguation.

Ask for candidate sources and attributable passages answering missing questions, not a padded general profile. Separate brand/market facts from branch observations. Mark provider snippets as snippets until direct page reading confirms them. Prioritize official menu for availability and attributable reviews/editorial reporting for experience; availability does not prove quality.

Keep requested directions and provider-reported actual queries separate. If Gemini selects queries, label sample strings as guidance, not guaranteed execution. Do not build a deterministic search scheduler while still claiming the provider ran the supplied queries exactly.

Read promising returned pages within remaining page budget. A source blocked to the reader can remain an unverified lead with provider snippet; never upgrade it to directly read evidence.

### D. Extract and check evidence once

One non-grounded extraction call receives bounded collected source text with stable source IDs. Return atomic claims and source-specific supporting passages. Each evidence item has its own excerpt; no shared composite excerpt copied onto multiple sources.

Checks before writer-eligible material:

- Citation points to a real collected source record, with visible passage supporting that claim. Normalize whitespace when checking passage presence; passage presence alone is not semantic proof.
- Branch scope requires address/identity support. One branch’s price never becomes chain-wide pricing by relabeling it brand.
- Distinguish delivery price, dine-in price, portion and observed date; do not merge prices across channels.
- Preserve source publication date separately from retrieval and event dates. Historical opening coverage cannot independently establish a current menu.
- A review claim retains reviewer/date where available. Keywords and aggregator prose do not become consensus or personal testimony. Marketing claims remain attributed to the business.
- Unsupported or contradicted claims remain visible as unresolved leads/review-needed material, excluded from evidence-ready counts. Do not delete them or pretend automated checking proves truth.
- Compute supported coverage from accepted evidence. Keep search status separately: unsearched, searched without useful evidence, inaccessible, budget-limited. Never infer exhaustive absence from one query.

For malformed extraction JSON: record raw response and finish reason, retain fetched sources, show invalid outcome. Do not rerun search automatically. Allow explicit extraction-only recovery over retained sources as a later user action; receipt must show zero new search calls.

## Persistence and UI changes

Extend the existing attempt/store and viewer rather than creating a parallel pipeline. Suggested concepts: structured research brief, source-read records, per-call receipts, evidence validation state and derived coverage. Choose storage boundaries after reading profile/research store migrations; use additive SQLite migrations and preserve existing rows/curation.

Version prompt, research strategy and extraction rules separately or in one explicit composite strategy version. Include question-affecting versions and structured brief in input hash. Keep idempotency for network retry; a user-authorized retest uses a new attempt ID/key and records its baseline comparison target.

Show a short prefilled intent: “Check smoked anticuchera wings, current menu and specific customer comments.” Expand for source leads and questions. Optional edit only; no required human query writing. Show known facts versus unresolved leads, source dates/scopes, and why evidence was flagged. Existing Keep/Discard edits remain untouched.

Completion state remains operational. Evidence coverage is separate and cannot block/remove candidates or start another call. Preserve one active research slot and lease ownership checks across every stage. A crash/reload cannot rerun completed provider calls. Partial stage receipts and pages survive failure.

## Implementation order and relevant files

1. Freeze fixtures and build a dry-run brief from prefill JSON. No network, no DB mutations. Verify the three pilot identities against current board before execution.
2. Extend request construction and prompt scoping. Main files: `profile_service.py`, `profile_research.py`, `search.py`, `store.py` under `apps/backend/app/features/listicle_pipeline/`.
3. Add bounded source-reader adapter and page receipts; integrate existing utilities where practical. Do not install downloaded code without required authorization.
4. Implement single extraction pass, evidence validation and derived coverage. Extend `profiles.py`, `profile_store.py`, `research_store.py` additively. Preserve corrected/kept/discarded findings and version history.
5. Amend ADR 0039 and wire bounded orchestration in `profile_service.py` / `api.py`; extend shared grounding return metadata only as needed. Do not change unrelated jobs’ model selection or budgets.
6. Update frontend `types.ts`, `usePlaceResearch.ts`, `components/ResearchViewer.tsx` and relevant card UI. Follow existing styles. Show per-action budget and receipts.
7. Run focused regression tests; execute authorized three-place pilot; produce before/after report. Stop before wider rollout.

Grounding helper: `packages/utils/src/utils/google_grounding.py`. Current provider configuration sends 8,192 max output tokens in this path, despite broader repo output-floor policy. Confirm shared contract, honor repository generation policy, capture finish reason and test truncated/empty outputs. Do not silently use smaller ceilings to control cost; bound sources and actual request count instead.

## Three-place retest protocol

Use a named pilot mode in a CLI/harness, not a hardcoded production special case. Prefill file is optional bootstrap input; normal production path derives the same brief from stored sightings and source pools. No need to backfill all 18 profiles before proving the design.

- BarBarian: candidate `d05c45396385af68`; profile `2a8808edaefc`; baseline `907653bef0e4`. Investigate published brand aliases, Bonilla menu and wing-specific experience. Huancayo menu must not support Bonilla prices or universal brand pricing.
- Casa: candidate `5edd7337a45c53c2`; profile `018c7cd7f650`; completed baseline `2c365b9a32d2`; invalid baseline `5e5f800084a0`. Investigate smoked/anticuchera hook, current branch offering and identifiable wing reviews. Preserve disputed delivery complaint as a lead only; determine identity/date before using it.
- McCarthy’s: candidate `c5083d460402547c`; profile `d84b87f3e9b4`; completed baseline `a243c6e4295e`; invalid baseline `33029a796573`. Read menu sauce details; verify address rather than title; distinguish 2020 launch history and Paraguay claims from present Lima evidence.

Each pilot gets one bounded action: maximum one grounded and one extraction generation, up to eight pages. Across three pilots: at most six model generations, at most three grounded. No automatic repeat if results disappoint. Preserve per-call usage, elapsed time, access failures and actual queries.

Retest must re-extract a complete comparable topic packet, including facts also present in baseline. Do not let “existing findings: do not repeat” suppress known facts and make new results artificially thin. Store pilot packet by new attempt ID before deduplication against persistent profile. Report both complete packet size and net new findings; never compare baseline total with only net additions. Do not change curation during the pilot.

## Tests and acceptance

Extend existing `test_listicle_place_research.py`, `test_listicle_attempt_identity.py`, `test_listicle_recovery.py` and frontend `place-research.test.tsx` where applicable. Add realistic stored-response fixtures rather than assertions that only mirror prompt strings.

Required behavior tests:

- Prefill provenance resolves to original discovery attempts; shared source pools never become candidate citations automatically.
- Refresh comparison retains full packet; old human edits/discards survive; identical idempotency key triggers no extra model call.
- Gap request contains only gap-related questions; no hidden broad research.
- Wrong-branch price, outdated offering, unmatched excerpt and keyword-as-review fail evidence-ready checks.
- McCarthy’s conflicting title/matching address is not automatically rejected.
- Generic setting can remain saved without increasing wing-specific coverage.
- Empty/truncated response, blocked page and crash between stages preserve receipts; no automatic retry or extra call beyond budget.
- UI separates completed status from supported evidence and displays original source dates.

Compare all three places in one report: direct source reads, supported wing-specific claims, attributable wing opinions, unresolved priority questions, scope/date errors, generic claims, model-call count, actual usage and duration. Show exact claim and source for each improvement. Mark source freshness differences between old/new runs; this is a small pilot, not a controlled model benchmark.

Release criteria: zero known branch-transfer, invented-source or unsupported-currentness errors in pilot evidence-ready packets; all model calls accounted for; no loss of curated material; all three packets judged against agreed standard. At least two places should gain a concrete, source-supported wing detail or a materially resolved uncertainty, and no place should regress in attribution. If only menu descriptions improve while recommendation evidence stays thin, report partial success and specify next missing evidence. Do not declare success merely because JSON parses or counts rise.

## Final handoff deliverables

Return code diff summary, focused test results, schema/ADR changes, and HTML before/after report with exact new attempt IDs and receipts. State which questions remain unanswered. No deployment or 15-place batch. User reviews three-place pilot before expanding.
