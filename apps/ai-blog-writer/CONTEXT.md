# AI Blog Writer — Context

## Purpose
Multi-feature AI content pipeline: turn source material (YouTube, URLs, prompts, reviews, location data) into stage-tracked articles, Markdown, and Payload-compatible LexicalJSON.

## Tech stack
- Python 3.11 + FastAPI (backend), TypeScript + React 18 + Vite (frontend), TypeScript + Express + Lexical (converter)
- Pnpm workspace, Nx, Turbo
- Vertex AI (Gemini), LangGraph, SQLite, Pydantic
- Payload CMS client integration

## Ubiquitous language

| Term | Definition |
|------|------------|
| Run / `run_id` | One execution of a pipeline. Identified by UUID. |
| Stage | Pipeline phase. Stages 0–4 cover cleanup, classify, compose, augment, title. |
| Pipeline Artifact | Immutable record of a run: meta, all stage outputs, final markdown. |
| Article Type | Classification template (40+: review, guide, tutorial, …) with `guideline` + `title_guideline`. |
| Feature | A pipeline module: `youtube2blog`, `url2blog`, `prompt2blog`, `keyword_intel`, `location_documents`, `itineraries_pipeline`. |
| Source Material | Raw input (transcript, URL content, text prompt). |
| Markdown | Canonical article output format. |
| LexicalJSON | Payload-compatible rich-editor serialization. |
| Draft | Local frontend working copy before sync to Payload. |
| Sync | Bidirectional state merge between Draft and Payload entity. |
| Editorial Augmentation | Post-compose structural pass (pull quotes, key takeaways, FAQ, etc.). |
| Quality Gate / Coverage Analysis | Validation checkpoints during compose. |

## Boundary

- **Owns:** the article pipeline, all AI/LLM calls, run storage, Markdown output, LexicalJSON conversion, location-documents pipeline.
- **Delegates:** publishing the final article (to Payload via HTTP), location data ingestion (relies on Location Manager output via the location-guide contract).

## Shared contracts

- Internal: `packages/shared` (Pydantic models — `Stage[N]Output`, `PipelineArtifact`, `RawVideoRecord`) and `packages/utils` (Vertex LLM, JSON parsing).
- External: produces content consumed by Payload (Questura) via LexicalJSON; fills `aiFieldPaths` defined in `/location-guide-contract.json`.

## Child contexts

- [apps/backend](./apps/backend/CONTEXT.md) — FastAPI pipeline orchestrator
- [apps/frontend](./apps/frontend/CONTEXT.md) — React UI for runs, drafts, sync
- [apps/converter](./apps/converter/CONTEXT.md) — Markdown ↔ Lexical service
- [packages/shared](./packages/shared/CONTEXT.md) — Pydantic models for stages
- [packages/utils](./packages/utils/CONTEXT.md) — LLM + JSON helpers
