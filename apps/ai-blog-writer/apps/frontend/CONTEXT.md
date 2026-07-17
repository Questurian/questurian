# Context: AI Blog Writer / Frontend

## Scope

React SPA for operators. Lets a human:

- start a pipeline run for one of the features (Prompt2Blog, YouTube2Blog, Url2Blog, LocationDocuments, ListicleItineraries, SingleTypeListicles, BatchUpload, BatchImageRecreation, …).
- watch a Running Pipeline by polling status.
- edit the resulting Draft locally.
- Sync the Draft to a Payload entity (Questura).
- manage editorial staffing (Staff management): admins create writer/editor Staff identities and promote writers; every Staff identity edits its own Author profile.

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
Examples: `Prompt2BlogPage`, `YouTube2BlogPage`, `Url2BlogPage`, `LocationDocumentsPage`, `ItinerariesPipelinePage`, `ListicleItinerariesPage`, `SingleTypeListiclesPage`, `BatchUploadPage`, `BatchImageRecreationPage`, `HomepageFeaturedContentPage`, `StagingPage`.

### Staff management

Definition: the admin-gated feature for editorial staffing — creating `writer`/`editor` Staff identities (invite-style, no shared passwords), promoting a writer to editor, and self-service Author profile editing for every logged-in Staff identity. Deliberately narrower than the Payload admin panel; see `docs/adr/0023`.
Related terms: Staff identity, Author profile (both defined in Questura's CONTEXT.md — Payload owns the records; this is only a surface over them).
Do not confuse with: Visitor accounts (BetterAuth, public site) — never touched here.

### Saved Articles Page

Definition: the operator page for reviewing generated article runs, opening or creating local Drafts, and viewing Payload Sync state for article-producing pipeline features. Prompt2Blog, Url2Blog, and YouTube2Blog share the same end goal and user flow here, even when feature-specific logic differs.
Related terms: Feature Page, Draft, Sync, Payload entity.
Do not confuse with: Payload's long-term Articles collection in Questura.

### Draft

Definition: a local working copy of generated content, not yet pushed to Payload. Drafts can be created from a finished run or edited from a previously synced Payload entity.
Examples: `LocationDocumentDraft`, `Prompt2BlogDraft`, `Url2BlogDraft`.

### Payload entity

Definition: a remote CMS record. The frontend treats Payload as the destination store.
Examples: `PayloadArticle`, `PayloadLocationDoc`.

### Sync

Definition: the act of reconciling a Draft with its Payload entity.
Related: `lastPayloadSyncSignature` (a hash captured at last successful sync), `hasUnsyncedPayloadChanges` (predicate over the current Draft vs that signature).

### `ArticleTypeOption`

Definition: UI choice rendered in a selector. Has `id`, `name`, `definition`.

### `InputOption`

Definition: generic UI option for tone, length, brand voice, creativity level, etc.

### Upload Flow

Definition: the shared multi-stage process for adding images across all upload surfaces. Stages: select → metadata → crop → uploading → done. Implemented by `useImageUploadFlow`. Two variant modes: `'full'` (7-variant MediaSet via MultiVariantCropper) and `'og'` (single open_graph variant, fixed 1200×630 crop).

### DropZone

Definition: the shared file-selection primitive. Handles drag-and-drop and click-to-browse. Entry point for every Upload Flow. Rendered from `src/shared/images/components/upload-primitives/`.

### Upload Primitive

Definition: a shared UI atom used by every upload surface — `DropZone`, `AltTextField`, `PhotographerCreditField`, `UploadProgressBar`. All use the `iu-*` CSS namespace. No upload surface re-implements these; visual consistency is structural.

### Image Picker

Definition: the single shared component for choosing an existing image (from Payload), uploading a new one, or importing from Unsplash/Pexels, across every ABW surface that needs an image. Owns its own data fetching, search, infinite-scroll, and external-import flow (uncontrolled); emits the selected entity and lets the caller persist whatever id it stores.
Related terms: Upload Flow (its Upload tab), MediaAsset, MediaSet, browse unit.
_Avoid_: "image selector", "image modal", "picker field" as names for the feature — "modal" refers only to its presentation, not the feature.
Do not confuse with: **Media Library** (the standalone management UI for editing Payload media), which the Image Picker does not replace.
Code references: `src/shared/images/picker/`.

### `PipelineStartRequest`

Definition: payload sent to backend to start a run.

### `PipelineStatusResponse`

Definition: backend → client poll response. Field `state` is `pending` / `running` / `completed` / `failed`; field `stage` names the current pipeline phase.

### `LocationFieldDefinition`

Definition: schema row for the location-documents form. Includes `type`, `path`, `aiEnabled`, optional `relationshipFieldDefinition`.

### `EditorAssistModelName`

Definition: LLM model selector for the editor-assist tools (e.g. `gemini-2.5-flash`, `gemini-3.1-pro`).

### `ImageRecreationPromptsPage`

Definition: operator tool for crafting a single image-recreation prompt from a reference image. Composes scene category, people handling, camera/lens, capture style, lighting, film-look, and Flux model into a structured prompt, then calls `generateFluxEditedImage` directly — no pipeline run, no Draft, no Sync. Includes a `ReferenceImageCropModal` for trimming the reference before generation.
Related terms: Flux Model, Prompt Preset, Scene Category.
Do not confuse with: `BatchImageRecreationPage` (bulk variant that processes many images against saved settings) or any `*Page` listed under Feature Page (those run pipelines; this is a direct LLM tool).
Code references: `src/features/imageRecreationPrompts/`, `promptBuilder.ts`, `shared/images.generateFluxEditedImage`.

### Itinerary Header

Definition: the top section of a listicle-itinerary draft — headline + **Intro** prose + hero media. A layout region, not a single field.
Related terms: Intro, Title writer, Intro auto-writer.
Do not confuse with: the **Intro**, which is only the prose field inside the Header.
Code references: `src/features/listicleItineraries/builder/components/BuilderHeaderPanel.tsx`, `draft.header`.

### Intro

Definition: the reader-facing opening prose of a listicle itinerary. Stored as `draft.header.introMarkdown`; backend `field_type: 'intro'`.
Related terms: Itinerary Header, Intro auto-writer, Plan overview.
Do not confuse with: the headline/title (produced by the **Title writer**), or the autobuild **Plan overview** (internal rationale, not reader-facing).
Code references: `header.introMarkdown`, `getItineraryIntroTargetId`.

### Title writer

Definition: the Step-1 editor-assist tool that generates the itinerary headline/title (backend `generate_title`). Distinct from any Intro generation; its output is an **input** to the Intro, not part of it.
Related terms: Intro, Itinerary Header.
Code references: `compose-itinerary` setup panel AI-title action; backend `editor_assist/generate_title`.

### Plan overview

Definition: trip-level rationale for an autobuilt itinerary — *why this plan*. Internal/persisted, produced by Itinerary Autobuild's reasons-and-overview stage. Reader sees it only as an **ⓘ AI plan overview** note in the builder, never on the published page.
Related terms: Selection reason, Intro, Itinerary Autobuild.
Do not confuse with: the **Intro** (reader-facing). Plan overview is *input* the Intro can be written from, not the Intro itself.
Code references: `draft.planOverview`; `itineraries_pipeline/llm_stages.py` reasons/overview stage.

### Selection reason

Definition: per-stop rationale for *why this pick* filled a slot. Internal/persisted, shown as **ⓘ Why this pick** in the builder, and consumed as a seed by the day-blurb composer. Has two provenances: **Autobuild** (produced by Itinerary Autobuild's reasons stage for stops it selected) and **operator** (authored by the operator for a stop they added or swapped post-pipeline, via a rough "why did you pick this?" answer the system cleans/expands into tooltip-quality prose).
Provenance rule: a Selection reason is bound to a stop's *resolved identity*. Changing a stop's identity (a swap) invalidates the existing reason regardless of provenance — the old reason describes the wrong venue.
Related terms: Plan overview, Stop, Itinerary Autobuild.
Do not confuse with: the stop's **blurb** (reader-facing prose).
Code references: `item.selectionReason`; `StopReasonField.tsx` ("Why this pick" + Refine); backend `editor_assist/compose-itinerary-stop-reason`.

### Page-level article exclusion

Definition: the rule that any item (article, listicle, or itinerary — all `HomepageFeaturedCollection` types) already present in any block's draft slots on a page is blocked from being picked into any other block on the same page. Enforced in the picker UI (greyed out, "In use") and at save time (`saveDisabled`). Applies to both `MainHomepagePage` and `LocationHomepagePage`.
Code references: `externalUsedKeys` prop on `CuratedHomepageBlockEditor`; `pageBlockSlotKeys` state in each page component.

### Featured Articles

Definition: a curated homepage block made of ordered editorial slots for articles, listicles, or itineraries.
Related terms: Curated slot, HomepageFeaturedCollection, Page-level article exclusion.
Do not confuse with: a single `featured-article` spotlight block.
Code references: `src/features/homepageFeaturedContent/HomepageFeaturedSlotEditor.tsx`.

### Article Grid

Definition: a curated homepage block made of 4 or 8 ordered article slots rendered as a uniform visual grid.
Related terms: Curated slot, HomepageFeaturedCollection, Page-level article exclusion.
Do not confuse with: Featured Articles, which has asymmetric editorial layouts.
Code references: `src/features/homepageFeaturedContent/ArticleGridLayout.tsx`.

### Curated slot

Definition: a numbered editorial position inside a homepage block; for Featured Articles, each slot may map to a distinct visual role such as hero, side card, or list row.
Related terms: Featured Articles, Article Grid.
Do not confuse with: a time slot or upload slot.

### Slot swap

Definition: drag reorder behavior where dropping one curated slot on another exchanges only those two slot contents.
Related terms: Featured Articles, Article Grid, Curated slot.
Do not confuse with: insert-and-shift list reordering.

### Slot replacement

Definition: picker behavior where a user chooses a different item for the same curated slot.
Related terms: Curated slot, Slot swap.
Do not confuse with: Slot swap, which exchanges two existing slot contents.

## Relationships

- A **Feature Page** owns at most one active **Run** at a time (current poll).
- A **Run** result produces one or more **Draft**s.
- A **Draft** points to zero or one **Payload entity**; Sync writes through.
- A **Saved Articles Page** can share workflow UI across article-producing pipeline features while delegating feature-specific fetch, delete, map, route, and Draft creation logic.
- A `PipelineStatusResponse.state = "completed"` is the trigger for hydrating a Draft from the run output.
- **Featured Articles** has 3–9 **Curated slots**; a **Slot swap** preserves the number of slots and exchanges exactly two slot contents.
- **Slot replacement** preserves the slot position and changes only the item assigned to that **Curated slot**.
- **Article Grid** has either 4 or 8 **Curated slots** and uses the same **Slot swap** behavior as Featured Articles.

## Domain Rules

- Polls run with TanStack Query `refetchInterval` while `state ∈ {pending, running}`; stop when terminal.
- Article-producing pipeline pages use `usePipelineRunPoll` for TanStack Query status polling. Feature hooks may still own feature-specific terminal handling such as result hydration, debug fetches, or latest-run fallback.
- Drafts are not auto-synced. A user action triggers Sync.
- Shared Saved Articles Page code must preserve feature-specific behavior through adapters rather than forcing identical logic across Prompt2Blog, Url2Blog, and YouTube2Blog.
- In the Saved Articles Workflow, shared code owns layout, page states, delete confirmation, Payload Sync status display, local Draft storage helpers, and the React Query orchestration shape. Feature adapters own API calls, route builders, run/article-to-Draft mapping, title/type extraction, feature labels/classes, query key prefix, and storage key.
- Saved Articles Workflow deduplication should be behavior-preserving and separate from pipeline polling normalization. Polling changes belong in a later task because they affect active Run lifecycle behavior.
- Saved Articles Workflow refactors are complete only when Prompt2Blog, Url2Blog, and YouTube2Blog article routes preserve generated article loading, local Draft storage keys, generated and local delete behavior, stage-article links, Payload Sync labels, and existing tests. The refactor must not require storage key migration, backend changes, new UI, or polling changes.
- `hasUnsyncedPayloadChanges` is computed from a signature, not by deep equality, to keep CPU bounded on large documents.
- Frontend types **mirror** backend Pydantic shapes; do not import Python.
- Homepage curated blocks preserve their configured slot count; empty curated slots are draft-only and are not persisted.
- Clicking a filled curated slot starts **Slot replacement** for every curated homepage block type.

## Naming Conventions

- Feature folder: camelCase (`prompt2blog/`, `locationDocuments/`).
- Top component: `<Feature>Page.tsx`.
- API hooks: `useStart<Feature>`, `use<Feature>Status`, `use<Feature>Draft`.
- Draft types: `<Feature>Draft`.

## Decisions

- **Polling, not WebSockets.** Simpler ops, acceptable latency.
- **Lexical editor on the frontend** matches Payload's editor so the synced content round-trips faithfully.
- **TanStack Query owns server-state shape**; component state stays local.
- **Unified Upload Flow** — all image upload surfaces share `useImageUploadFlow` (uncontrolled) and Upload Primitives. See `docs/adr/0002-unified-image-upload-flow.md`.
- **Unified Image Picker** — all image-selection surfaces share one uncontrolled engine that emits the selected entity; callers map it to the id they persist. See `docs/adr/0020-unified-image-picker.md`.
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
