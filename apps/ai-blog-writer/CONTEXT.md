# Context: AI Blog Writer

## Scope

A multi-feature AI content pipeline. Turns source material (YouTube videos, URLs, plain prompts, reviews, location data) into stage-tracked artifacts: Markdown, structured JSON, and Payload-compatible LexicalJSON.

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

Definition: a pipeline module under `apps/backend/app/features/`. Each feature owns its own routes, prompts, and storage layout. Current features: `youtube2blog`, `url2blog`, `prompt2blog`, `review2blog`, `keyword_intel`, `keyword_intel_content_plan`, `location_documents`, `itineraries_pipeline`, `images`, `editor_assist`, `article_types`.
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

## Relationships

- A **Run** has one **PipelineMeta** and many **StageResults**, finalized into one **PipelineArtifact**.
- A **Feature** defines its own route, prompts, and may produce a Markdown article, a structured JSON output, or both.
- A **Draft** points to at most one Payload entity; an unbound Draft has no Sync state.
- A **Pipeline Artifact** may be converted to **LexicalJSON** before being synced to Payload.
- `location_documents` and `keyword_intel` are features that do **not** produce articles — they emit structured data only.

## Domain Rules

- A `run_id` is immutable for the life of the run.
- Stage outputs are append-only; once persisted, they are read-only.
- An article cannot be synced to Payload from a Draft with `hasUnsyncedPayloadChanges = false` that has not been edited locally — that's a no-op, not an error.
- `aiFieldPaths` filled by AI Blog Writer **must** conform to `/location-guide-contract.json`. Out-of-contract writes are rejected at the contract boundary.
- Vertex AI usage is centralized in `packages/utils.get_vertex_llm`; features should not instantiate clients directly.

## Naming Conventions

- Feature folders: snake_case verb_noun pairs (`youtube2blog`, `prompt2blog`, `location_documents`).
- Stage classes: `Stage[N]Output`, `StageEditorialAugmentationOutput`.
- Frontend feature pages: camelCase folder, `*Page` component (`Prompt2BlogPage`, `LocationDocumentsPage`).
- REST routes: kebab-case feature path (`/youtube2blog`, `/location-documents`).
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
- Should `keyword_intel` and `location_documents` (non-article features) be split into their own context? They share the run lifecycle but not the article shape.
- Is the converter genuinely stateless across content edge cases (tables, embedded HTML)? No regression tests exist at the converter boundary.
- The `images` and `editor_assist` features are not represented in the Stage[N] vocabulary — they're orthogonal services. Should the glossary distinguish "article features" vs "assist features"?

## Child Contexts

- [apps/backend](./apps/backend/CONTEXT.md) — FastAPI pipeline orchestrator
- [apps/frontend](./apps/frontend/CONTEXT.md) — React operator UI
- [apps/converter](./apps/converter/CONTEXT.md) — Markdown ↔ Lexical service
- [packages/shared](./packages/shared/CONTEXT.md) — Pydantic pipeline contract
- [packages/utils](./packages/utils/CONTEXT.md) — Vertex LLM + JSON helpers
