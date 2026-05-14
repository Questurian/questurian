# AI Blog Writer / Frontend — Context

## Purpose
React SPA for operators: kick off pipelines, watch runs, edit drafts, sync to Payload.

## Tech stack
- TypeScript 5.5, React 18.3, Vite 5.4
- TanStack Query (data fetching + polling)
- Lexical editor, react-markdown + remark-gfm
- Payload CMS client

## Ubiquitous language

| Term | Definition |
|------|------------|
| Feature Page | One UI per pipeline: `Prompt2BlogPage`, `YouTube2BlogPage`, `Url2BlogPage`, `LocationDocumentsPage`, `KeywordIntelPage`, … |
| Draft | Local working copy not yet pushed to Payload (e.g. `LocationDocumentDraft`, `Prompt2BlogDraft`). |
| Payload entity | Remote CMS entity (e.g. `PayloadLocationDoc`, `PayloadLocationGuide`, `PayloadArticle`). |
| Sync | Reconcile Draft ↔ Payload entity. `lastPayloadSyncSignature`, `hasUnsyncedPayloadChanges`. |
| `ArticleTypeOption` | UI choice: `id`, `name`, `definition`. |
| `InputOption` | UI choice for tone/length/brand_voice/creativity_level. |
| `PipelineStartRequest` | Client → backend payload to start a run. |
| `PipelineStatusResponse` | Backend → client poll: `state` ∈ `pending` / `running` / `completed` / `failed`. |
| `LocationFieldDefinition` | Form-schema row: `type`, `path`, `aiEnabled`, `relationshipFieldDefinition`. |
| `EditorAssistModelName` | LLM model selector (`gemini-2.5-flash`, `gemini-3.1-pro`, …). |

## Boundary

- **Owns:** all UI state, forms, local drafts, polling, optimistic updates.
- **Delegates:** pipeline execution → backend; rich-content conversion → converter service; CMS persistence → Payload via sync bridge.

## Shared contracts

- Consumes REST endpoints from `apps/backend`.
- Reads Payload types via Payload client.
- No direct import from `packages/shared` (Python) — frontend types mirror those contracts.
