# Context Map: Meta Monorepo

## Scope

Questurian is a **meta-monorepo**: a single git repository that contains multiple nested monorepos and apps, each with its own pnpm workspace, build pipeline, runtime, and ubiquitous language.

This file is the **context map**. It tells future readers where each bounded context lives, what it owns, and how contexts relate. It does **not** duplicate any nested context's glossary — domain terms live in the nearest relevant `CONTEXT.md`.

## Repository Map

| Path | Context | Owns | Does NOT own | Read next |
|------|---------|------|--------------|-----------|
| `apps/ai-blog-writer` | **AI Blog Writer** (nested monorepo) | Multi-stage AI content pipelines (YouTube/URL/Prompt/Review → Markdown + LexicalJSON), run storage, LLM orchestration, location-documents pipeline. | Publishing the final article (handed off to Payload via HTTP); the canonical Location store (consumed from Location Manager via the contract). | [apps/ai-blog-writer/CONTEXT.md](./apps/ai-blog-writer/CONTEXT.md) |
| `apps/ai-blog-writer/apps/backend` | ABW Backend | FastAPI routes per pipeline, run lifecycle, Vertex AI calls, quality gates, augmentation. | Markdown↔Lexical conversion; type contract; LLM helpers. | [.../backend/CONTEXT.md](./apps/ai-blog-writer/apps/backend/CONTEXT.md) |
| `apps/ai-blog-writer/apps/frontend` | ABW Frontend | Operator UI: start runs, watch progress, edit Drafts, sync to Payload. | Pipeline execution; rich-content conversion; CMS persistence. | [.../frontend/CONTEXT.md](./apps/ai-blog-writer/apps/frontend/CONTEXT.md) |
| `apps/ai-blog-writer/apps/converter` | ABW Converter | Stateless Markdown/HTML ↔ Lexical state conversion. | Persistence, LLM, any domain logic. | [.../converter/CONTEXT.md](./apps/ai-blog-writer/apps/converter/CONTEXT.md) |
| `apps/ai-blog-writer/packages/shared` | ABW Pipeline Contract | Pydantic `Stage[N]Output`, `PipelineArtifact`, `RawVideoRecord`. | I/O, business logic. | [.../shared/CONTEXT.md](./apps/ai-blog-writer/packages/shared/CONTEXT.md) |
| `apps/ai-blog-writer/packages/utils` | ABW LLM Utils | Vertex client, JSON parsing, grounded generation. | Storage, routing, feature logic. | [.../utils/CONTEXT.md](./apps/ai-blog-writer/packages/utils/CONTEXT.md) |
| `apps/location-manager` | **Location Manager** (nested monorepo) | Internal admin platform: enrich Location data (dining, accommodations, attractions, nightlife, key-locations), run grounded-search AI field suggestions, request alt text, push to Payload. | Public rendering (Questura owns that); long-form article body (AI Blog Writer). | [apps/location-manager/CONTEXT.md](./apps/location-manager/CONTEXT.md) |
| `apps/location-manager/packages/server` | LM Server | Canonical Location store (SQLite), image processing (Sharp), Payload sync state, TripAdvisor place data via SerpAPI. | Alt-text inference; public rendering. | [.../server/CONTEXT.md](./apps/location-manager/packages/server/CONTEXT.md) |
| `apps/location-manager/packages/client` | LM Client | Operator UI: location create/browse/edit, taxonomy admin, pipeline dashboards. | Persistence; external integrations. | [.../client/CONTEXT.md](./apps/location-manager/packages/client/CONTEXT.md) |
| `apps/location-manager/packages/shared` | LM Shared Types | TypeScript types shared by client + server. | Runtime behaviour. | [.../shared/CONTEXT.md](./apps/location-manager/packages/shared/CONTEXT.md) |
| `apps/location-manager/packages/python-alt-text` | LM Alt-Text Service | Vertex AI image-to-alt-text, neighborhood prose, accommodations field suggestions. | Storage, retries, batching. | [.../python-alt-text/CONTEXT.md](./apps/location-manager/packages/python-alt-text/CONTEXT.md) |
| `apps/questura` | **Questura** (nested monorepo) | Public travel platform. Payload CMS backend + Next.js public site. Serves public location pages, attractions, dining, accommodations, nightlife, tours, currencies, paid content. | Enrichment workflow (delegated to Location Manager); article body generation (delegated to AI Blog Writer). | [apps/questura/CONTEXT.md](./apps/questura/CONTEXT.md) |
| `apps/questura/apps/server` | Questura Server | Payload 3 collections, GraphQL + REST, public view-models, auth, payments. | UI rendering. | [.../server/CONTEXT.md](./apps/questura/apps/server/CONTEXT.md) |
| `apps/questura/apps/client` | Questura Client | Next.js public site, SSR, i18n, Stripe checkout UI, maps. | Data ownership; CMS state. | [.../client/CONTEXT.md](./apps/questura/apps/client/CONTEXT.md) |
| `apps/dashboard` | **Dashboard** (single app) | Terminal CLI + Hono service to monitor dev services (health, port, type) across the meta-monorepo. Passive observer. | Any business data; launching services. | [apps/dashboard/CONTEXT.md](./apps/dashboard/CONTEXT.md) |

## Context Reading Order

When an AI agent or human is working on a task, read context files from broadest to narrowest:

1. This file (meta-monorepo root).
2. The relevant nested monorepo or app root `CONTEXT.md` (e.g. `apps/questura/CONTEXT.md`).
3. The specific app/service/package `CONTEXT.md` (e.g. `apps/questura/apps/server/CONTEXT.md`).
4. Any deeper domain `CONTEXT.md` if it exists (none today — see Open Questions).

## Shared Language

Only terms shared across **multiple nested monorepos** belong here. Anything that lives inside one context goes in that context's glossary.

### Location

The canonical record of one place: a country, city, or neighborhood. Identified by `country|city|neighborhood` key.

- **Owner of the data shape:** Location Manager (`@questurian/lm-shared`).
- **Source of truth for production:** Questura's `Locations` collection (Payload).
- **Producers:** Location Manager (sync via `/api/collections/*`); AI Blog Writer's LocationDocumentsPage can update currently supported Payload Location fields.
- **Consumers:** Questura client (SSR public location pages).
- **Bridge:** HTTP sync and Questura Payload collection schemas. The retired guide-field contract is not active.

### LocationLevel

`"country" | "city" | "neighborhood"`. Used by every context that touches location data.

### MediaSet, MediaAsset, MediaPlacement, MediaSetStatus

Public-image vocabulary. Defined authoritatively in `apps/questura/docs/adr/0001-mediaset-as-public-image-source.md` and `apps/questura/docs/adr/0002-media-source-focal-point-and-pipeline.md`.

- **Owner:** Questura (public-serving rules, validation, MediaPlacement requirements, **variant generation pipeline**).
- **Producer of source images:** Location Manager (uploads source + focal point via Questura's `POST /api/media-sets/from-source`; does **not** crop locally).
- Variant nomenclature follows Questura's `MEDIA_VARIANT_KEYS` (`thumbnail`, `square`, `wide`, `portrait`, `hero`, `open_graph`, `editorial`). LM's `'social'` is renamed to `'open_graph'`.
- Do **not** treat `MediaSetStatus` as a public-readiness gate; placement readiness is decided per-placement.

### LexicalJSON

Payload's rich-editor serialization. Generated by AI Blog Writer's converter, persisted by Questura.

## Cross-Context Relationships

```
                       ┌─────────────────────┐
                       │   AI Blog Writer    │
                       │  (content pipeline) │
                       └──────────┬──────────┘
                                  │ LexicalJSON
                                  │ (article body, location prose)
                                  ▼
┌─────────────────────┐   sync   ┌─────────────────────┐   GraphQL/REST   ┌──────────────────┐
│  Location Manager   │─────────▶│   Questura Server   │─────────────────▶│ Questura Client  │
│ (operator admin)    │  HTTP    │ (Payload + Postgres)│                  │  (Next.js site)  │
└─────────────────────┘          └─────────────────────┘                  └──────────────────┘
        ▲                                  ▲
        │ alt text / prose                 │
        ▼                                  │
┌─────────────────────┐                    │
│ python-alt-text     │                    │
│ (Vertex AI service) │                    │
└─────────────────────┘                    │

                       ┌─────────────────────┐
                       │      Dashboard      │  observes ports/health of all of the above
                       │  (Ink + Hono TUI)   │  (no inbound dependency from anyone else)
                       └─────────────────────┘
```

- **Questura is the source of truth** for production location/media data.
- **Location Manager is the source of truth** for enrichment workflow state (review fetching, taxonomy corrections, pre-sync checklists).
- **AI Blog Writer is the source of truth** for the run lifecycle (`run_id`, stages, artifacts) and for generated Markdown/LexicalJSON.
- **Dashboard owns nothing**; it only reads.

## Cross-Repo Rules

- **Nested monorepos do not import each other's code.** All coupling is HTTP plus documented collection/API contracts.
- **Shared packages (`packages/shared`, `packages/utils`) must not depend on app code.** They are type/utility floors, not orchestration layers.
- **Domain terms must not be redefined with different meanings inside a context.** When a term crosses a boundary, the consumer adopts the producer's definition and references the producing context in its glossary. Example: Questura is the owning context for `MediaSet`; Location Manager must conform.
- **"Article" is overloaded.** AI Blog Writer's `Article` (Markdown output of a pipeline run) is **not** the same as Questura's `Articles` collection (a Payload record with editorial lifecycle). Each context defines it locally; never assume parity.
- **Generated code must not define new domain language.** Payload's generated `payload-types.ts` reflects the collection schema; new vocabulary belongs in the schema first.
- **The pipeline contract (`Stage[N]Output`, `PipelineArtifact`) is Python-side only.** TypeScript frontends mirror the shape; they do not import it.

## Package Scopes

| Scope | Where | Notes |
|-------|-------|-------|
| `@questurian/*` | Cross-meta-mono (dashboard, lm-server/client/shared, abw-server/client/converter) | Anything shared at meta level. |
| `@questura/*` | Inside `apps/questura` only | `@questura/client`, `@questura/server`. |

## Tooling

- **Package manager:** pnpm 10 (`pnpm-workspace.yaml`). **Do not use npm.** Some nested monorepos use Nx alongside Turbo (`apps/ai-blog-writer`); the meta-root orchestrator is Turbo (`turbo.json`).
- **Top-level scripts:** `pnpm run dashboard | questura | dev | build | lint | test`.
- **The Dashboard's `PROJECTS` config (`apps/dashboard/src/cli/dashboard/config/projects.ts`) is the canonical inventory of dev ports.**

## AI Guidance

When working in this repo:

1. **Read this file first**, then the nearest nested `CONTEXT.md`, then any deeper one if present.
2. **Do not assume terms mean the same thing across contexts.** "Article", "Location", "Media", "Sync", "Draft" all shift meaning across boundaries.
3. **When language is fuzzy, ask.** Don't guess which context owns a term.
4. **When a decision is non-obvious or hard to reverse, suggest creating an ADR** (see `apps/questura/docs/adr/` for the existing example).
5. **Do not introduce a code-level dependency between nested monorepos.** If you need to share data, extend an HTTP or collection/API contract.
6. **Use pnpm, not npm.** The user has confirmed this is a hard rule.

## Open Questions

- Should Location Manager add an ADR mirroring `0001-mediaset-as-public-image-source.md` to document the LM-side responsibilities (variant file generation, pre-sync validation)?
- AI Blog Writer's `Article` vs Questura's `Articles` — should we rename one to remove the overlap?
- Inbound LexicalJSON from AI Blog Writer → Questura has no formal contract. Should we publish one?
- Several Questura server features (`media`, `location`, `articles`) are large enough that they may warrant their own `CONTEXT.md`. `homepage-featured-content` now has one ([apps/questura/apps/server/src/features/homepage-featured-content/CONTEXT.md](./apps/questura/apps/server/src/features/homepage-featured-content/CONTEXT.md)); revisit the rest once the language stabilises.
- The Dashboard duplicates port/path knowledge from the actual workspace. Could it derive `PROJECTS` from a single source instead?
