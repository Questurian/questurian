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

Editor Assist has its own domain vocabulary and internal Module map in
[`app/features/editor_assist/CONTEXT.md`](./app/features/editor_assist/CONTEXT.md).
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

### API usage report

A one-line report of one external call, sent to the Dashboard's collector (`apps/dashboard`) after the call has already happened. Emitted by `app/shared/api_usage.py` via `observe_external_call(...)`, which times the call, counts its tokens, prices it when it can be priced, and records a failure with its classified fault kind before the exception reaches the caller.

Distinct from the **usage ledger** (`features/prompt2blog/pricing.py`), which is this app's own per-run receipt with per-stage attribution. Both see the same model call and neither replaces the other: the ledger answers "what did this run cost", the report answers "how is this provider behaving over time". The ledger is the source of truth for a run's cost.

### `ArticleTypeOption`

Definition: the Pydantic shape exposed to clients for selection UI. Subset of the table row.

## Relationships

- A **Pipeline Route** owns one **Running Pipeline** at a time per `run_id`.
- A **Running Pipeline** writes one **StageResult** per stage to SQLite; the final state assembles a **PipelineArtifact**.
- A **Classification** binds a run to one **`ArticleType`** row, which provides the `guideline` consumed by compose.
- Prompt2Blog's model calls each produce two records: an entry in the run's **usage ledger** and an **API usage report** to the Dashboard. The report is fire-and-forget; the ledger is not.

## Domain Rules

- All Vertex AI calls go through `packages/utils` helpers such as `get_vertex_llm`, `invoke_vertex_multimodal_text`, and `invoke_google_grounded_text`. Features do not import Vertex SDKs directly.
- `run_id` is generated server-side at run start; clients never invent one.
- With `ABW_REQUIRE_STAFF_AUTH=true`, article-producing runs record the verified
  Payload Staff User id as `owner_staff_id`. Writers may delete only their own
  runs; editors/admins may delete any run. Unowned runs are editor/admin-only.
  See ADR 0027.
- A Quality Gate failure must trigger at least one repair attempt before the run is marked `failed`.
- **Telemetry may never affect a run.** `app/shared/api_usage.py` does nothing without `USAGE_MONITOR_URL`, queues rather than blocks, drops rather than waits, and swallows every error. A collector that is down, slow or absent changes nothing about a pipeline.
- **Report the provider, not the model name.** `provider_for_llm` reads the class of the object `get_vertex_llm` returned, because `claude-opus-5` runs on the subscription CLI or the Anthropic API and only the object knows which.
- **One token normaliser.** `app/shared/token_usage.py` owns `normalize_token_usage`, the Vertex rate table and `estimated_vertex_cost`; both the run ledger and the usage monitor read it. Never write a second one — the second one got thinking tokens and Anthropic cache reads wrong, in the undercounting direction, and nothing caught it because both numbers looked plausible.
- **A flat-rate subscription is never priced in a usage report.** The Claude CLI's `total_cost_usd` is a hypothetical API price, not money owed. The ledger may record it (a run receipt is a fair use); the dashboard must not (a cost chart answers "what will I be billed").
- StageResult writes are idempotent, last-wins upserts keyed by `run_id + stage`: re-running a stage (e.g. a LangGraph resume) replaces its stored payload rather than appending. Payload shapes are intentionally feature-specific — `StageResult.data` is untyped (`Dict[str, object]`) and the storage adapter does not validate against `Stage[N]Output`.
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

- **Inspect first:** the feature folder for the route you're touching (`app/features/<feature>/`), then `Stage*Output` in `packages/shared`, then `packages/utils`.
- **Preserve verbatim:** `run_id`, `Stage[N]Output`, `Coverage Analysis`, `Quality Gate`, `Editorial Augmentation`, `Pipeline Route`.
- **Do not** call Vertex directly — go through utils.
- **Do not** put new shared helpers in `packages/utils`. Tests install a process-global `utils` stub in `sys.modules`; a new name there breaks unrelated tests. Use `app/shared/` — see `provider_faults.py` and `api_usage.py`.
- **Do not** let a usage report raise or slow a call. If you instrument a new seam, wrap the provider call and nothing else.
- **Do not** add a new top-level Stage to the 0–4 chain without an ADR; it's a contract change for the frontend mirror.
- **Do not** modify `ArticleType` row shape without coordinating with the frontend (uses `ArticleTypeOption`).
- Ask before merging two feature folders — the storage layout depends on the boundary.

## Open Questions

- Should the non-article `images` feature also gain its own sub-context and non-stage vocabulary?
- Where does the contract for pushing into Payload live? Today the frontend assembles writes; the backend does not own the schema there.
