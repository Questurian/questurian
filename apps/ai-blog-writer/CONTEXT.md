# Context: AI Blog Writer

## Scope

A multi-feature AI content pipeline. Turns source material (YouTube videos, URLs, plain prompts, location data) into stage-tracked artifacts: Markdown, structured JSON, and Payload-compatible LexicalJSON.

Owns the **run lifecycle** (`run_id`, stages, artifacts) and **all LLM orchestration** for content generation in the Questurian system.

## Out of Scope

- Publishing the final article (handed off to Payload at Questura over HTTP).
- The canonical Location store (lives in Location Manager; AI Blog Writer only fills `aiFieldPaths` defined by `/location-guide-contract.json`).
- Public rendering / SEO / SSR — Questura.
- Operator UI for Locations themselves — Location Manager. AI Blog Writer's frontend is only for run management.

## Purpose

Editorial content scales poorly when humans write it from scratch. This context exists to **automate the path** from raw input to publishable article while keeping a full audit trail (stage outputs, prompts used, model decisions). It also doubles as the LLM hub for non-article tasks (location prose, keyword research, image-recreation prompts) so prompt strategies live in one place.

## Tech Stack

- Python 3.11 + FastAPI (backend), TypeScript + React 18 + Vite (frontend), TypeScript + Express + Lexical (converter)
- pnpm workspace + Nx + Turbo
- Vertex AI (Gemini 2.5 Pro / Flash, 3.1), LangGraph
- SQLite for run storage, Pydantic for the contract
- Payload CMS client for syncing drafts

## Glossary

### Run

Definition: one execution of a pipeline, identified by a UUID `run_id`. All stage outputs and the final artifact are keyed off it.
Related terms: Stage, Pipeline Artifact.
Do not confuse with: a Payload `Article` record (that's downstream and persistent in Questura).
Code references: `apps/backend/app/core/storage`, `packages/shared/PipelineArtifact`.

### Stage

Definition: one phase of a pipeline. Stages 0–4 cover input envelope → cleanup → classify → compose → augment → title. Each stage emits a `Stage[N]Output`.
Related terms: Run, Stage Result, Pipeline Artifact.
Do not confuse with: a "step" inside a feature's internal graph (e.g. LangGraph nodes).
Code references: `packages/shared/src/shared/Stage[0..4]Output.py`.

### Feature

Definition: a pipeline module under `apps/backend/app/features/`. Each feature owns its own routes, prompts, and storage layout. Current features: `youtube2blog`, `url2blog`, `prompt2blog`, `keyword_intel`, `itineraries_pipeline`, `images`, `editor_assist`, `article_types`.
Related terms: Pipeline Route.
Do not confuse with: frontend "Feature Page" — that's the UI per feature.
Code references: `apps/backend/app/features/`.

### Media Library

Definition: a standalone operator workspace inside the ABW frontend for managing Questura's Payload `MediaSet` and `MediaAsset` collections. Not tied to any pipeline run. Provides four tools: Browse (visual grid + inline field editing), Audit (find MediaSets missing required fields + bulk AI alt-text generation), Orphans (MediaAssets not linked to any MediaSet), and Upload (create new MediaSets via the existing `images` backend pipeline).
Related terms: MediaSet, MediaAsset (both defined in Questura's context).
Do not confuse with: Questura's Payload admin UI (that's the CMS admin panel); the old `batchUpload` feature (removed, superseded by Media Library).
Code references: `apps/frontend/src/features/mediaLibrary/`.

### Pipeline Artifact

Definition: the immutable record of a run. Bundles `PipelineMeta` + all stage outputs + final markdown path.
Code references: `packages/shared` Pydantic models.

### Article Type

Definition: a classification template (40+ kinds: review, guide, tutorial, listicle, comparison, …). Each carries a `guideline` (compose instructions) and a `title_guideline`.
Related terms: Classification (the model's choice of one).
Do not confuse with: Questura's `Articles` collection record.

### Markdown

Definition: canonical article output format. Persisted to disk; converted to LexicalJSON on demand.

### LexicalJSON

Definition: Payload-compatible rich-editor serialization. Produced by the converter service.
Code references: `apps/converter`.

### Draft

Definition: a local frontend working copy of generated content that has not yet been pushed to Payload.
Related terms: Sync.

### Sync

Definition: bidirectional state merge between a frontend Draft and its Payload entity. Uses `lastPayloadSyncSignature` and `hasUnsyncedPayloadChanges` to detect drift.

### Editorial Augmentation

Definition: post-compose structural pass that adds pull quotes, key takeaways, FAQ blocks, etc.
Code references: backend `Stage_EditorialAugmentation`.

### Quality Gate / Coverage Analysis

Definition: validation checkpoints during compose. Coverage Analysis asks whether the composed article covers the article-type guideline; Quality Gate triggers `repair` + `retry` if not.

### Critical Fields Guideline

Definition: a thin, category-agnostic pre-flight gate that confirms a Location has the minimum static identity needed to enter the listicle blurb pipeline. Checks four booleans: has `name`, has a supported `category`, has a resolvable location label (neighborhood or city), has Payload doc identity. If any fail, the venue is hard-blocked before Research Profile runs.
Related terms: Research Profile.
Do not confuse with: Article Type `guideline` (that's compose instructions per article type, not per-venue input requirements).
History: previously a per-category Tier 1/2/3 LM field whitelist (Tier 2 "scoped Grounded Research when missing"); this premise was retired once public evidence scanning became the source of research scoping and the audit found most LM nightlife/dining detail fields were poor blurb input.

### Grounded Research

Definition: writer-ready cited findings gathered for a chosen listicle blurb framing, consisting of selected-angle evidence plus standard Research Buckets.
Related terms: Research Profile.
Do not confuse with: Research Bucket (a kind of evidence gathered for the writer); retired Reviews Digest concept.
Code references: today the only research path is `invoke_google_grounded_text` in `packages/utils/src/utils/google_grounding.py`; the EP+GR merged call will replace its current usage.
History: previously a separate pipeline stage that ran after Critical Fields with its own grounded LLM call, then briefly merged into Evidence Profile; ADR 0006 split it into Evidence Scan + Research Profile, and ADR 0010 removed Evidence Scan when auto-angle was retired — Research Profile is now the only research path.

### Research Bucket

Definition: a reusable evidence lane collected for listicle blurb writing regardless of the selected Listicle Angle, currently `reputation-summary`, `specific-offerings`, `experience-texture`, `history-or-ownership`, `practical-usefulness`, `best-for`, `standout-hook`, `social-proof`, `visual-assets`, `caveats-or-fit-warnings`, `timing-tips`, `neighborhood-context`, and `crowd-and-vibe`. `neighborhood-context` and `crowd-and-vibe` are universal but added primarily for accommodations (ADR 0011) — itinerary geography and social texture that every accommodations blurb needs and that nightlife/dining/attractions may benefit from when cited evidence appears.
Related terms: Research Profile, Grounded Research, Listicle Angle.
Do not confuse with: Evidence Profile `bucket` (`rich-public-evidence`, `sparse-public-evidence`, `no-public-evidence`), which summarizes public evidence richness rather than naming what evidence was gathered.
Writer boundary: selected Listicle Angle evidence supplies the blurb's lead framing; Research Buckets supply supporting texture and factual backup.
Collection rule: Research Buckets run for every Research Profile even when selected-angle evidence is strong; each bucket may return zero to two cited findings, and uncited findings are dropped.
Boundary rule: Research Buckets inform facts only; Listicle Angle controls the blurb's framing and lead shape even when bucket names resemble angle names.
Category rule: all standard buckets stay in the schema, but each venue category can prioritize a subset in the Research Profile prompt; low-signal buckets should stay empty rather than padded.
`visual-assets` boundary: this bucket gathers visual details for blurb prose only and does not select, upload, or mutate media assets.
`standout-hook` boundary: this bucket captures the strongest concise fact found, but it must not override the selected Listicle Angle as the blurb's framing.
`caveats-or-fit-warnings` boundary: this bucket may guide claim avoidance or appear in final prose when useful to readers, but caveats must stay factual and restrained.
Usability threshold: standard buckets are usable for fallback when they contain at least two cited findings across any buckets, or one cited `standout-hook` finding.

### Research Profile

Definition: the cited evidence bundle for one blurb, scoped to the selected Listicle Angle plus standard Research Buckets and backed by citations. Not directly fed to the writer; passes through [[Writer Brief]] curation first.
Related terms: Grounded Research, Research Bucket, Listicle Angle, Writer Brief.
Do not confuse with: Writer Brief, which is the lean writer-ready payload derived from Research Profile.
Mechanism: one grounded LLM call per blurb that mentions the operator-selected Listicle Angle plus the standard Research Buckets.
Source visibility: generated item responses keep merged `source_urls`, the run inspector shows sources per angle and bucket, and published Payload prose does not expose citations by default.
Caching: Research Profiles are generated fresh per run and are not cached until source freshness and invalidation rules exist.
Source boundary: request identity fields can ground search and writer identity, but Research Bucket findings require citations unless a future LM-curated fact source is explicitly added.
Target scope: Research Profiles are for blurb targets only; intro generation does not run per-venue Research Profiles.
Skip rule: when `skip_existing` skips an existing blurb, the pipeline should skip Research Profile work for that target too.

### Evidence Profile

Definition: retired umbrella name for the former combined angle-validation and findings pass in the listicle blurb pipeline.
Related terms: Research Profile.
Do not confuse with: Research Profile, the current single research call (auto-angle and its sibling Evidence Scan were retired in ADR 0010).
Ownership: AI Blog Writer owns Research Profile as the editorial writeability concept; Location Manager owns venue facts.

### Writer Brief

Definition: the lean writer-ready payload for one blurb, derived from a [[Research Profile]] by a per-blurb curation step. Bundles two things: a venue-tailored angle directive (filled from a per-angle template, e.g. "Open by naming the kind of night {venue} is best for, and give one concrete reason rooted in the room, the drinks, the crowd, or the pacing.") and a flat, deduped Source Facts list of 2 to 8 bullets drawn across all Research Buckets with bucket labels stripped. Citations are preserved per fact for inspector display but not shown in the writer prompt.
Related terms: Research Profile, Listicle Angle, List Tone.
Do not confuse with: Research Profile (the upstream cited evidence bundle, still bucket-labeled and potentially overlapping); Critical Fields Guideline (a pre-flight identity gate, not a writer payload).
Mechanism: one short LLM call per blurb that takes the Research Profile plus selected Listicle Angle and emits JSON `{ angle_directive, source_facts: [{ fact, citations }] }`. If the call fails or returns zero facts, the pipeline falls back to identity-only writer prompt and marks the blurb low-confidence.
Category scope: nightlife (ADR 0007), dining (ADR 0009), accommodations (ADR 0011), and attractions (ADR 0012). key_location has no Writer Brief path. Categories on the lean writer path are tracked by `LEAN_PROMPT_CATEGORIES` in `angle_assignment.py`, orthogonal to `ANTI_AI_PROMPT_CATEGORIES`.

### Listicle Pipeline Audit

Definition: a review of how a listicle request moves from selected Locations through evidence gathering, composition, and validation before changing generation behavior.
Related terms: Research Profile, Grounded Research, Critical Fields Guideline, Listicle Angle.
Do not confuse with: a production pipeline change or a Payload Sync audit.

### Reviews Digest

Definition: retired concept. It referred to a compact per-venue summary derived from LM merged Google + TripAdvisor review artifacts, but LM removed the review pipeline in ADR-0005. ABW listicle blurbs should not depend on `reviewsFetchedAt`, `reviewsCount`, or `_reviewsDigest` as active evidence.
Related terms: Grounded Research.
Do not confuse with: grounded-search citation snippets, which are produced on demand by Grounded Research and are not cached LM review artifacts.

### List Tone

Definition: a single editorial register chosen by the operator at listicle setup that applies uniformly to every blurb and the intro in that listicle (e.g. Elevated, Casual, Hidden Gem, Family-Friendly, Date Night, Budget). One per listicle.
Related terms: Listicle Angle.
Do not confuse with: Article Type (which is the structural template — single-type-listicle vs guide vs review — not a voice register).

### Listicle Angle

Definition: a per-item editorial framing for each blurb in a listicle, drawn from a category-specific pool of angles that map to lead-sentence shapes (named noun + fact, sensory detail + room, person + fact, actionable tip, occasion + evidence, differentiator). Always operator-selected per item; the pipeline has no auto-angle path (ADR 0010). Combined with List Tone, the writer prompt becomes "write in <tone> from the <angle> angle for <venue>."
Per-category pool status: dining has a production pool (`signature-dish`, `atmosphere`, `founders-backstory`, `insider-tip`, `best-for`, `whats-different`) since ADR 0003 and routes through the lean writer prompt + Writer Brief since ADR 0009; nightlife ships with a single-angle pool (`best-for-night`); accommodations ships with a 9-angle pool (`location-and-setting`, `view-and-vista`, `design-and-aesthetic`, `signature-amenity`, `food-and-beverage`, `trip-fit`, `property-backstory`, `booking-tip`, `whats-different`) since ADR 0011 and routes through the lean writer prompt + Writer Brief; attractions ships with a 6-angle pool (`signature-feature`, `setting`, `history-built`, `visit-time-tip`, `best-for-visit-type`, `whats-different`) since ADR 0012 and routes through the lean writer prompt + Writer Brief; key_location has no pool yet.
Pool use: each pool serves as the vocabulary for the operator dropdown and Research Profile selected-angle evidence.
Requested vs effective: `requested_angle` is the operator's intent; `effective_angle` is the supported angle actually sent to the writer and may be null when the operator's chosen framing lacks cited evidence (low-confidence fallback).
Related terms: List Tone, Critical Fields Guideline.
Do not confuse with: List Tone (one per listicle vs one per item); `idealFor` (a venue attribute, not an editorial angle).

## Relationships

- A **Run** has one **PipelineMeta** and many **StageResults**, finalized into one **PipelineArtifact**.
- A **Feature** defines its own route, prompts, and may produce a Markdown article, a structured JSON output, or both.
- A **Draft** points to at most one Payload entity; an unbound Draft has no Sync state.
- A **Pipeline Artifact** may be converted to **LexicalJSON** before being synced to Payload.
- `keyword_intel` is a feature that does **not** produce articles — it emits structured data only.
- `LocationDocumentsPage` is a frontend-only operator tool that writes directly to Payload (Questura) over the Payload REST API; it has no AI Blog Writer backend pipeline.

## Domain Rules

- A `run_id` is immutable for the life of the run.
- Stage outputs are append-only; once persisted, they are read-only.
- An article cannot be synced to Payload from a Draft with `hasUnsyncedPayloadChanges = false` that has not been edited locally — that's a no-op, not an error.
- `aiFieldPaths` filled by AI Blog Writer **must** conform to `/location-guide-contract.json`. Out-of-contract writes are rejected at the contract boundary.
- Vertex AI usage is centralized in `packages/utils.get_vertex_llm`; features should not instantiate clients directly.
- **Listicle Angle is always operator-selected.** The pipeline has no auto-angle path; generation is blocked until the operator picks an angle from the category pool (ADR 0010).
- A user-selected **Listicle Angle** is authoritative research intent; if cited evidence cannot support it, the writer may fall back to **Research Bucket** evidence only and must mark the item low-confidence rather than invent angle support or silently switch angles.
- **Research Profile** proves or rejects the selected angle while gathering standard **Research Buckets**; if selected-angle evidence is weak/unsupported, the writer falls back to Research Buckets as low-confidence, then identity-only low-confidence if buckets are also unusable.
- Only supported selected-angle evidence reaches the writer as a **Listicle Angle**; weak or unsupported angle evidence is excluded from the writer prompt and surfaced as a warning.
- Listicle Angle viability is a backend research concern; the frontend may restrict angle values by category but must not pre-validate web evidence.
- Unsupported or weak selected Listicle Angle evidence is a generated-with-warning case, not a hard error; hard errors are reserved for Critical Fields failure, model failure, or validation failure.
- A blurb is low-confidence whenever the operator's selected angle framing fails, even if standard Research Buckets contain usable evidence.
- The pipeline does not support forcing an unsupported Listicle Angle; operators can manually edit generated copy when they have off-pipeline knowledge.

## Naming Conventions

- Feature folders: snake_case (`youtube2blog`, `prompt2blog`, `url2blog`).
- Stage classes: `Stage[N]Output`, `StageEditorialAugmentationOutput`.
- Frontend feature pages: camelCase folder, `*Page` component (`Prompt2BlogPage`, `LocationDocumentsPage`).
- REST routes: kebab-case feature path (`/youtube2blog`, `/keyword-intel`).
- LLM presets: `LLMPresets.<intent>` (e.g. `compose`, `classify`).

## Decisions

- **Pydantic is the contract; TypeScript types are mirrored on the frontend.** No code-level Python↔TS import.
- **Markdown is canonical**, LexicalJSON is derived. The converter is stateless and replaceable.
- **Per-feature route folders** instead of one global router — easier to retire a feature.
- **SQLite for run storage** because runs are local-only and replayable; not a multi-tenant store.
- → **Suggest ADR**: the LexicalJSON ↔ Payload sync protocol has no formal spec; this is hard-to-reverse and crosses a context boundary.

## AI Guidance

When working in this context:

- **Inspect first:** `apps/backend/app/features/<feature>/`, `packages/shared/src/shared/Stage*.py`, the feature's `routes.py`, and the relevant `*Page.tsx` on the frontend.
- **Preserve these terms verbatim:** `run_id`, `Stage[N]Output`, `PipelineArtifact`, `Article Type`, `Coverage Analysis`, `Editorial Augmentation`, `Draft`, `Sync`.
- **Do not casually rename** feature folders or stage class names — the converter, frontend mirrors, and storage layout all key off them.
- **Do not** introduce a direct dependency from frontend code to `packages/shared` (Python). Mirror the types instead.
- **Do not** write Payload entities directly from a backend feature; go via the frontend Draft → Sync path, or via an explicit out-of-band script.
- **Ask before:** adding a new Stage to the canonical 0–4 chain (it's a contract change); changing LLM presets in a way that affects multiple features; introducing a second LLM provider.

## Open Questions

- Where does the contract for **inbound** content into Payload live? Today it's implicit ("Payload-accepts-this").
- Should `keyword_intel` (non-article feature) be split into its own context? It shares the run lifecycle but not the article shape.
- Is the converter genuinely stateless across content edge cases (tables, embedded HTML)? No regression tests exist at the converter boundary.
- The `images` and `editor_assist` features are not represented in the Stage[N] vocabulary — they're orthogonal services. Should the glossary distinguish "article features" vs "assist features"?

## Child Contexts

- [apps/backend](./apps/backend/CONTEXT.md) — FastAPI pipeline orchestrator
- [apps/frontend](./apps/frontend/CONTEXT.md) — React operator UI
- [apps/converter](./apps/converter/CONTEXT.md) — Markdown ↔ Lexical service
- [packages/shared](./packages/shared/CONTEXT.md) — Pydantic pipeline contract
- [packages/utils](./packages/utils/CONTEXT.md) — Vertex LLM + JSON helpers
