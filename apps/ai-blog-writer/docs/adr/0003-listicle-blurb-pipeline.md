# ADR 0003 — Listicle blurb generation: LM-backed two-model pipeline with gap-driven research

## Status

Proposed

**Note (2026-05-25):** LM review artifacts were removed by Location Manager ADR-0005, so ABW no longer gates on `reviewsFetchedAt`, `reviewsCount`, or Reviews Digest. The former "Fallback Research" step is now **Grounded Research**: dining and nightlife blurbs always run a grounded search pass for current public reputation/context, and Tier-2 gaps only scope additional research topics.

## Context

The single-type-listicle and listicle-itinerary features currently generate blurbs and intros via a single Gemini call with Google Search grounding (`invoke_google_grounded_text`). The per-venue context sent to the model is `title`, a one-line `location` string, and `idealFor` tags — nothing else. The prompt instructs "research this online" and the grounding tool does the heavy lifting. This produces generic, sometimes hallucinated blurbs because:

- The model is researching from scratch every time, instead of using the curated venue facts that already exist in Location Manager (cuisines, price level, hours, ideal-for, aggregated reviews).
- Every list of 20 blurbs reads in the same voice with the same paragraph shape, because there is no per-item editorial variation.
- "Best model for writing" and "best capability for research" are conflated into one Gemini call when they are actually different jobs that different model families do best.

Three architectures were considered for sourcing venue context:

- **A — Payload-only.** Grow the Payload `Dining`/`Accommodations`/etc. schema to hold descriptions and review summaries; the writer reads only Payload. Avoids cross-context calls but bloats Payload with operator-only data that the public site never renders.
- **B — LM-only.** Bypass Payload for venue identity and read directly from LM. Ignores Payload's published-state contract.
- **C — Bridge.** Payload owns "what the operator picked and what's published"; LM owns rich editorial data and reviews; ABW backend joins them via LM's existing `payload_sync_state` table.

Three options were considered for review handling: raw passthrough (token explosion), on-demand cached digest, or skipping reviews entirely.

Three options were considered for editorial variation: list-level tone only (doesn't fix monotony), per-blurb angle rotation inside a list tone (structural fix), or fully operator-authored directives per blurb (high operator effort, low consistency).

## Decision

**Adopt a two-model pipeline with LM as the canonical context source, Critical Fields Guideline as the data-quality gate, and a List Tone + Listicle Angle layer for editorial variation.**

Pipeline shape for a single blurb:

1. **Identity.** Item identity comes from the Payload doc id + collection (already what the listicle picks).
2. **Enrichment.** ABW backend resolves the LM record via `payload_sync_state` (`POST /api/payload/locations/by-refs` batched per listicle run) and pulls Tier-1/Tier-2/Tier-3 fields plus the Reviews Digest.
3. **Gate.** Apply the per-category Critical Fields Guideline. Tier-1 missing → block, surface error to operator. Tier-2 missing or reviews stale (dining 12mo / nightlife 6mo / attractions 18mo) → trigger Fallback Research.
4. **Fallback Research (conditional).** Gemini with Google Search grounding, scoped to the specific Tier-2 gaps, returns short structured findings.
5. **Angle assignment.** Per-item Listicle Angle from a category-specific pool (dining: Signature Dish, Atmosphere, Founders/Backstory, Insider Tip, Best-For, What's Different), assigned heuristically based on LM data availability with rotation to avoid adjacent repeats, operator-overrideable per item.
6. **Composition.** Premier writer model (Anthropic / OpenAI, configurable per listicle) receives: List Tone + assigned Listicle Angle + Tier-1 fields + Tier-2 fields (LM-or-research) + Reviews Digest. Prompt stops saying "research this online" and starts saying "use the facts below."
7. **Validation.** Existing `validate_generated_text` rules (single paragraph, no headings, no em dashes, no leaked research process, word count) still apply. Existing retry-on-failure path still applies.

Adopted: **C (bridge)**, **(ii) on-demand cached Reviews Digest**, **per-blurb angle rotation inside a list tone**.

## Consequences

- ABW backend gains one new outbound dependency: HTTP calls to the LM server (`/api/payload/locations/by-refs`). New surface, batched per run to keep latency bounded.
- New LM endpoint required: `POST /api/payload/locations/by-refs` taking `[{collection, docId}, …]`, returning hydrated venue records + Reviews Digest. LM owns the digest generation + invalidation by `reviewsFetchedAt`.
- Reviews Digest is a new file artifact on the LM side (`reviews_digest_{locationId}.json`), produced by a one-time Gemini summarization the first time a venue is touched after a reviews-pipeline run.
- Payload schema does **not** grow. Reviews are not stored in Payload Postgres. This is a deliberate refusal.
- The prompt in `listicle_writer.py` splits: the existing "research this online" rule is removed from the writer prompt and migrated into a new Fallback Research prompt. The writer prompt gains structured slots for tone, angle, venue facts, and digest evidence.
- The single-LLM-call assumption in `_generate_single_listicle_target` becomes a multi-call orchestration (optional Fallback Research → required Writer). Token cost per blurb roughly doubles on the worst case (Tier-2 gap + first-time digest); on the steady-state (well-enriched LM, cached digest) it stays at one writer call.
- Provider abstraction is needed: `invoke_google_grounded_text` stays for Fallback Research; a sibling `invoke_writer_model` is added that routes to Anthropic / OpenAI / Vertex by configured model name. `_resolve_grounded_model`'s Gemini allow-list is no longer the bottleneck for the writer.
- Frontend adds two new draft fields: `listTone: ListTone` (set at setup) and per-item `angle: ListicleAngle | null` (auto-assigned, operator override via dropdown). Forwards Payload doc id + collection in each `target` of the `generate-listicle-content` request.
- Existing `RelatedItemOption` shape on the frontend stays the same; enrichment happens server-side, not by fattening the frontend type.

## Alternatives considered

- **A (Payload-only).** Rejected: bloats Payload with operator-only review text the public site never renders, and would still need a research path for missing fields.
- **B (LM-only).** Rejected: ignores Payload's published-state authority; would mean operators can publish a listicle item that points at a Payload doc whose LM record diverges from what's actually live.
- **Pure round-robin angle assignment.** Rejected: assigning Founders/Backstory to a venue with no founder data reintroduces the hallucination problem the rest of the design exists to eliminate.
- **Raw reviews in prompts.** Rejected: token explosion, fixates the writer on outlier reviews, no per-prompt cost amortization across listicles that share venues.
- **Status quo (single Gemini call, always-grounded, no LM enrichment).** Rejected: this is what we have, and it produces the generic / hallucinated blurbs we are trying to fix.
