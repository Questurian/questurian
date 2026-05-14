# AI Blog Writer / Backend — Context

## Purpose
FastAPI orchestrator. Runs all pipelines, persists stage outputs, exposes REST routes per feature, talks to Vertex AI.

## Tech stack
- Python 3.11, FastAPI, Pydantic
- SQLite (storage), LangGraph (location-documents)
- Vertex AI Gemini (2.5 / 3.1)

## Ubiquitous language

| Term | Definition |
|------|------------|
| Pipeline Route | REST endpoint per feature (`/youtube2blog`, `/url2blog`, `/prompt2blog`, `/location-documents`, `/keyword-intel`, …). |
| Running Pipeline | In-flight async run; status polled by clients. |
| `run_id` | UUID for one pipeline execution. |
| Transcript | Extracted text from a video (YouTube). |
| Classification | ML-determined `article_type` with `confidence` + `reasoning`. |
| Coverage Analysis | Semantic check: does composed article cover the guideline? |
| Quality Gate | Validation checkpoint with `repair` + `retry`. |
| Editorial Augmentation | Adds pull_quote, key_takeaways, faq_block, etc. |
| `ArticleType` (table row) | `id`, `name`, `definition`, `guideline`, `title_guideline`, timestamps. |
| `ArticleTypeOption` | Pydantic shape returned to clients for selection UI. |
| `LocationDocumentDraft` | StrictModel for the location-documents pipeline. |
| `LocationDocumentsGraphState` | LangGraph TypedDict state for that pipeline. |

## Boundary

- **Owns:** all REST routes, run storage, LLM calls, prompt assembly, quality gates, augmentation.
- **Delegates:** Markdown ↔ Lexical conversion → `apps/converter`; type contracts → `packages/shared`; Vertex client + JSON parsing → `packages/utils`; Payload writes → external HTTP.

## Shared contracts

- Imports `RawVideoRecord`, `Stage[N]Output`, `PipelineArtifact`, `StageResult` from `@questurian/abw-shared` (`packages/shared`).
- Imports `get_vertex_llm`, `parse_json_response`, `invoke_google_grounded_text` from `packages/utils`.
- Exposes status/result JSON consumed by `apps/frontend`.
