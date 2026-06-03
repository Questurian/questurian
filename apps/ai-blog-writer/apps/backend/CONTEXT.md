# Context: AI Blog Writer / Backend

## Scope

FastAPI service that orchestrates every pipeline in AI Blog Writer. Owns:

- REST endpoints per feature (`/youtube2blog`, `/url2blog`, `/prompt2blog`, `/itineraries-pipeline`, `/editor-assist`, `/images`, `/article-types`).
- Run storage in SQLite.
- All Vertex AI Gemini calls and prompt assembly.
- Quality gates, coverage analysis, editorial augmentation.

## Out of Scope

- Markdown ↔ Lexical conversion → handed to `apps/converter`.
- Type contracts → `packages/shared`.
- Vertex client + JSON parsing → `packages/utils`.
- Persisting articles into Payload → done by the frontend or out-of-band scripts; the backend produces artifacts but does not push them.

## Purpose

Pipelines need a single home: shared run lifecycle, shared LLM client, shared storage shape. This service is that home. The frontend treats it as an opaque "run controller"; consumers see status JSON.

## Tech Stack

- Python 3.11, FastAPI, Pydantic
- SQLite (run + feature storage)
- LangGraph via the shared `ai_graph` runtime (used by `prompt2blog`, `youtube2blog`, `url2blog`, `editor_assist`)
- Vertex AI Gemini (`packages/utils.get_vertex_llm`)
- Nx for build/serve via the parent ABW monorepo

## Glossary

### Pipeline Route

Definition: REST endpoint that owns one feature's run lifecycle.
Code references: `app/features/<feature>/routes.py`.

### Running Pipeline

Definition: in-flight async run. The client polls its status until completion.
Related terms: `PipelineStatusResponse` (on the frontend mirror).

### `run_id`

Definition: UUID for one pipeline execution.

### Transcript

Definition: text extracted from a video (YouTube). Persisted as part of `Stage0Output`.
Related terms: `RawVideoRecord` (the structured wrapper).

### Classification

Definition: ML-determined `article_type` plus `confidence` and `reasoning`.
Code references: `Stage2Output`.

### Coverage Analysis

Definition: a semantic check that asks whether the composed article fulfils the article-type guideline. Triggers repair/retry on failure.

### Quality Gate

Definition: validation checkpoint, typically wrapping Coverage Analysis with `repair` and `retry` policies.

### Editorial Augmentation

Definition: post-compose stage that adds pull quotes, key takeaways, FAQ blocks, etc. Emits `StageEditorialAugmentationOutput`.

### `ArticleType` (table row)

Definition: a row in the `article_types` table. Fields: `id`, `name`, `definition`, `guideline`, `title_guideline`, timestamps.
Do not confuse with: `ArticleTypeOption` (the DTO sent to UI).

### `ArticleTypeOption`

Definition: the Pydantic shape exposed to clients for selection UI. Subset of the table row.

## Relationships

- A **Pipeline Route** owns one **Running Pipeline** at a time per `run_id`.
- A **Running Pipeline** writes one **StageResult** per stage to SQLite; the final state assembles a **PipelineArtifact**.
- A **Classification** binds a run to one **`ArticleType`** row, which provides the `guideline` consumed by compose.

## Domain Rules

- All Vertex AI calls go through `packages/utils.get_vertex_llm`. Features do not import `google-cloud-aiplatform` directly.
- `run_id` is generated server-side at run start; clients never invent one.
- A Quality Gate failure must trigger at least one repair attempt before the run is marked `failed`.
- StageResults are append-only.
- `ArticleType` rows are mutable from admin tooling but should not be deleted while runs reference them.

## Naming Conventions

- Module layout per feature: `routes.py`, `service.py`, `prompts.py`, `models.py`, `storage.py`, `graph.py` (when LangGraph is used).
- REST paths: kebab-case feature name (`/url2blog`, `/itineraries-pipeline`).
- Pydantic models: `Stage[N]Output`, `*Request`, `*Response`, `*Option`.

## Decisions

- **SQLite per-feature schema fragments** rather than one shared schema. Easier to retire a feature.
- **LangGraph is the default orchestration substrate** via the shared `ai_graph` runtime; features compose nodes rather than hand-rolling stage chains.
- **No background worker queue** — pipelines run inside FastAPI request lifecycle with async tasks. Acceptable today; revisit if a pipeline grows past a few minutes.
- → **Suggest ADR**: persistence layout for runs is informal; if multi-tenant or remote storage is ever needed, this becomes hard to retrofit.

## AI Guidance

- **Inspect first:** the feature folder for the route you're touching (`app/features/<feature>/`), then `Stage*Output` in `packages/shared`, then `packages/utils.get_vertex_llm`.
- **Preserve verbatim:** `run_id`, `Stage[N]Output`, `Coverage Analysis`, `Quality Gate`, `Editorial Augmentation`, `Pipeline Route`.
- **Do not** call Vertex directly — go through utils.
- **Do not** add a new top-level Stage to the 0–4 chain without an ADR; it's a contract change for the frontend mirror.
- **Do not** modify `ArticleType` row shape without coordinating with the frontend (uses `ArticleTypeOption`).
- Ask before merging two feature folders — the storage layout depends on the boundary.

## Open Questions

- Should non-article features (`images`, `editor_assist`) live in a separate sub-context with their own non-stage vocabulary?
- Where does the contract for pushing into Payload live? Today the frontend assembles writes; the backend does not own the schema there.
