# Context: AI Blog Writer / Frontend

## Scope

React SPA for operators. Lets a human:

- start a pipeline run for one of the features (Prompt2Blog, YouTube2Blog, Url2Blog, Review2Blog, LocationDocuments, KeywordIntel, ListicleItineraries, SingleTypeListicles, BatchUpload, BatchImageRecreation, …).
- watch a Running Pipeline by polling status.
- edit the resulting Draft locally.
- Sync the Draft to a Payload entity (Questura).

## Out of Scope

- Executing the pipeline → backend.
- Markdown / HTML / Lexical conversion → converter service.
- Long-term storage of articles → Payload (Questura) once synced.
- Type definitions in Python → frontend mirrors `packages/shared` but does not import it.

## Purpose

Operators need a tactile UI: pick inputs, watch progress, hand-edit before pushing to production. The frontend is intentionally chatty over the network (polling) because runs are long.

## Tech Stack

- TypeScript 5.5, React 18.3, Vite 5.4
- TanStack Query (data fetching, polling, optimistic updates)
- Lexical editor (matches Payload's editor)
- `react-markdown` + `remark-gfm` for previewing Markdown
- Payload CMS client (for sync targets)

## Glossary

### Feature Page

Definition: one top-level UI per pipeline. Lives in `src/features/<featureCamelCase>/`.
Examples: `Prompt2BlogPage`, `YouTube2BlogPage`, `Url2BlogPage`, `LocationDocumentsPage`, `KeywordIntelPage`, `ItinerariesPipelinePage`, `ListicleItinerariesPage`, `SingleTypeListiclesPage`, `BatchUploadPage`, `BatchImageRecreationPage`, `HomepageFeaturedContentPage`, `StagingPage`.

### Draft

Definition: a local working copy of generated content, not yet pushed to Payload. Drafts can be created from a finished run or edited from a previously synced Payload entity.
Examples: `LocationDocumentDraft`, `Prompt2BlogDraft`, `Url2BlogDraft`.

### Payload entity

Definition: a remote CMS record. The frontend treats Payload as the destination store.
Examples: `PayloadArticle`, `PayloadLocationDoc`, `PayloadLocationGuide`.

### Sync

Definition: the act of reconciling a Draft with its Payload entity.
Related: `lastPayloadSyncSignature` (a hash captured at last successful sync), `hasUnsyncedPayloadChanges` (predicate over the current Draft vs that signature).

### `ArticleTypeOption`

Definition: UI choice rendered in a selector. Has `id`, `name`, `definition`.

### `InputOption`

Definition: generic UI option for tone, length, brand voice, creativity level, etc.

### `PipelineStartRequest`

Definition: payload sent to backend to start a run.

### `PipelineStatusResponse`

Definition: backend → client poll response. Field `state` is `pending` / `running` / `completed` / `failed`.

### `LocationFieldDefinition`

Definition: schema row for the location-documents form. Includes `type`, `path`, `aiEnabled`, optional `relationshipFieldDefinition`.

### `EditorAssistModelName`

Definition: LLM model selector for the editor-assist tools (e.g. `gemini-2.5-flash`, `gemini-3.1-pro`).

## Relationships

- A **Feature Page** owns at most one active **Run** at a time (current poll).
- A **Run** result produces one or more **Draft**s.
- A **Draft** points to zero or one **Payload entity**; Sync writes through.
- A `PipelineStatusResponse.state = "completed"` is the trigger for hydrating a Draft from the run output.

## Domain Rules

- Polls run with TanStack Query `refetchInterval` while `state ∈ {pending, running}`; stop when terminal.
- Drafts are not auto-synced. A user action triggers Sync.
- `hasUnsyncedPayloadChanges` is computed from a signature, not by deep equality, to keep CPU bounded on large documents.
- Frontend types **mirror** backend Pydantic shapes; do not import Python.

## Naming Conventions

- Feature folder: camelCase (`prompt2blog/`, `locationDocuments/`).
- Top component: `<Feature>Page.tsx`.
- API hooks: `useStart<Feature>`, `use<Feature>Status`, `use<Feature>Draft`.
- Draft types: `<Feature>Draft`.

## Decisions

- **Polling, not WebSockets.** Simpler ops, acceptable latency.
- **Lexical editor on the frontend** matches Payload's editor so the synced content round-trips faithfully.
- **TanStack Query owns server-state shape**; component state stays local.
- → **Suggest ADR**: the Sync signature scheme isn't documented. If we add multi-user editing, this becomes contentious.

## AI Guidance

- **Inspect first:** the relevant `src/features/<feature>/` folder, its `*Page.tsx`, and the matching backend `features/<feature>/routes.py`.
- **Preserve verbatim:** `Draft`, `Sync`, `Payload entity`, `lastPayloadSyncSignature`, `hasUnsyncedPayloadChanges`, `PipelineStartRequest`, `PipelineStatusResponse`.
- **Do not** import from `packages/shared` (Python) — mirror the types.
- **Do not** sync silently on edit; sync is an explicit user action.
- Ask before changing the polling cadence — the backend currently runs pipelines in request lifecycle.

## Open Questions

- Type mirroring is hand-maintained — should we generate TS types from Pydantic?
- `BatchUpload` and `BatchImageRecreation` are operationally bulk; do they need a different progress UI than per-run pipelines?
- `staging/` is a feature folder but acts like a holding area — should it be promoted into the glossary or removed?
