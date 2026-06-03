# Context: Questura / server / features / homepage-featured-content

## Scope

The server-side bounded context for **curated homepages** — the main homepage and per-location (city / neighborhood) homepages. Owns:

- The `LocationHomepages` collection and the `MainHomepage` global.
- The **page-block** model: definition, normalization, validation, candidate search, selection, and public resolution for every curated block type.
- Draft → published lifecycle (snapshots, per-block publish status, publishability rules).
- The REST surface backing the studio editor (`/api/homepage-featured-content/*` and `/api/location-homepages/[id]/*`).

## Out of Scope

- The editor UI, block components, and CSS — those live in **ai-blog-writer frontend** (`apps/ai-blog-writer/apps/frontend/src/features/homepageFeaturedContent`). This is a **dual-repo feature**: a new block type or contract change touches both repos.
- The underlying content collections a block points at (`articles`, `accommodations`, `tours`, `locations`, listicles, …) — owned by their own features; this context only references them.
- Public page rendering (Questura client).

## Purpose

A curated homepage is an ordered list of **page blocks**. Each block names a `blockType`, a `slotCount`, optional section heading/subheading, and an `items` array of references into a content collection. Editors arrange blocks in a private **draft**; **publishing** snapshots the draft into a public copy. This context is the single source of truth for what block types exist, how their items are validated, and how a draft becomes the served homepage.

## Layout

Two stores, fanning out to per-block-type **vertical slices**:

- `collection.ts` — `LocationHomepages` collection. Three block arrays: `draftPageBlocks` (editor working copy), `publishedPageBlocks` (public snapshot), and legacy `pageBlocks` (hidden, migrated). Its `beforeValidate` hook is the server-side write path (see below).
- `main-homepage/global.ts` + `main-homepage/service.ts` — the `MainHomepage` Payload global, same block model, no per-location scope.

Each curated block type is a **slice** under its own folder following a near-uniform shape:

```
<block-type>/
  block.ts          Payload Block definition (slug, fields, slot limits)
  constants.ts      slot-count limits, labels
  service.ts        barrel re-exporting the slice's public functions
  lib/
    refs.ts         normalize raw input → refs; build stored global data
    candidate.ts    shape a candidate row for the picker
    repository.ts   query the backing collection
  operations/
    search.ts       candidate search for the picker route
    selection.ts    resolve stored items → editor selection
    validate.ts     validate items (count, existence, scope, drafts)
  types/            api / internal / public types + index barrel
```

Slices present today: `featured-article`, `featured-article-carousel`, `featured-articles`, `article-grid`, `article-list`, `location-grid`, `questurian-maps`, `hotel-grid`, `tour-grid`, `where-to-eat-drink`, `things-to-do-listicles`, `things-to-do-attractions`, `newsletter-signup`.

Cross-cutting slices (operate across all block types):

- `block-registry/` — the **single source of truth for which block types exist *and how each behaves***. `curatedBlockRegistry` holds an ordered `CuratedBlockDefinition[]` of `{ blockType, block, behavior }` and exposes `keys`, `blocks` (feeds the collection's three block arrays), `has` (the membership guard), and `get`. `behaviors.ts` defines the per-type `CuratedBlockBehavior` — `prepareRecord` / `assertAllowed` / `clearsItems` / `buildStoredItems` (write path), `resolveSelection` (read path), and `isArticleBlock` / `requiredImageField` (publish rules). The write-path normalizer, read-path resolver, and publish-status rules all **iterate the registry** instead of restating a `blockType` switch. See ADR 0005.
- `resolve-page-blocks/` — turns stored blocks into editor / public payloads. `operations/normalize-page-blocks.ts` is the **write-path driver** (`curatedBlockRegistry.get` → `behavior.prepareRecord` / `assertAllowed` / `buildStoredItems`). `operations/resolve-blocks.ts` is the **read-path** driver (`behavior.resolveSelection`). Both are now type-agnostic loops.
- `candidate-route.ts` — `createCandidateHandler` (homepage / main-homepage) and `createLocationCandidateHandler` (per-location, with `withLocationKey` / `withLocationGridScope`) factories. The 14 `*-candidates` route files are thin: each names its `searchXCandidates` function, a fallback message, and (location family) how the homepage doc resolves into search params. Not exported from `index.ts` (it pulls in `next/server`); routes import it by deep path.
- `location-homepages/` — homepage lifecycle (get / publish / delete) and `lib/publish-status.ts` (publishability rules + draft-vs-published status).
- `location-homepage-blocks/` — add / delete / reorder / update a single block in a draft.
- `slot-count/` — resolve stored slot count per block type.
- `convert-empty-block/` — convert an empty block from one type to another.
- `reset-all-content/` — clear a homepage.

`index.ts` is the feature's public barrel — API routes import from `@/features/homepage-featured-content`, never from deep paths.

## Glossary

### Page block

One entry in a homepage's block array. `{ id, blockType, slotCount, sectionHeading?, sectionSubheading?, items[] }`. The `id` is Payload-minted and stable across edits; it is the identity used to match a draft block to its published snapshot.

### `blockType`

The discriminant. The authoritative server-side list is `curatedBlockRegistry` in `block-registry/` — `collection.ts` derives its three block arrays from `curatedBlockRegistry.blocks`, and the write/read dispatchers look each block's `behavior` up via `curatedBlockRegistry.get`. The frontend mirror is `HOMEPAGE_PAGE_BLOCK_TYPES` in `pageBlocks.ts`.

### Slot / `slotCount`

How many items a block holds. Each type declares `min`/`max` (and sometimes a fixed count) via `constants.ts` on the server and `minSlotCount`/`maxSlotCount`/`quickSlotCounts` in `pageBlocks.ts`. Some types reject specific counts (e.g. `article-grid` only 4 or 8; `featured-articles` has no 6).

### Item / ref

An entry in a block's `items`. On input it's a loose reference; `lib/refs.ts` normalizes it to a `ref`, `operations/validate.ts` checks it, and `buildXGlobalData` produces the stored shape.

### Candidate

A pickable row returned by a `*-candidates` route, used to populate the editor's item picker. Produced by `operations/search.ts` via `lib/candidate.ts` + `lib/repository.ts`.

### Selection

The resolved, editor-facing view of a block's items (`HomepageFeaturedSelection`, `HomepageHotelGridSelection`, `HomepageLocationGridSelection`), including `totalSlots`, `items`, and `isComplete`.

### Draft / Published / snapshot

`draftPageBlocks` is the editor's private working copy. **Publishing** runs `assertPublishableResolvedBlocks`, then `snapshotDraftBlocksForPublish` deep-clones the draft into `publishedPageBlocks`, stamping each published row with `sourceBlockKey = String(draftBlock.id)`. The public site serves the published snapshot.

### `sourceBlockKey`

The published row's pointer back to the draft block it came from. Added by `withSourceBlockKey` (a hidden field on every block) and used by `augmentBlocksWithPublishStatus` to compute per-block status.

### `publishStatus` / `validationStatus` / `publishBlockers`

Per-block metadata attached on read by `augmentBlocksWithPublishStatus`. `publishStatus`: `live` | `modified` | `unpublished` (content vs. the published snapshot). `validationStatus`: `publishable` | `blocked`. `publishBlockers`: human-readable reasons a block can't publish, from `getBlockPublishBlockers` — the single source of truth reused by the publish guard (throws the first) and the editor "Won't publish" badge.

### Scope (`LocationGridScope`)

Child-location constraint for location homepages. `location-grid` and `questurian-maps` are valid only on main + city scopes (not neighborhoods); the write path throws if a `location-grid` lands on a neighborhood. Resolved by `resolveLocationGridScopeFromLocation`.

## Key flows

**Write (save a draft/published array):** Payload `LocationHomepages.beforeValidate` (or the global's equivalent) → enforce location level + one-homepage-per-location → resolve scope → `normalizePageBlocksArrayInPlace` for each of `pageBlocks` / `draftPageBlocks` / `publishedPageBlocks`. The normalizer mutates each curated block in place via its registry `behavior`: resolves slot count, `prepareRecord` (per-type layout / media-aspect defaults), then (for changed blocks) `assertAllowed` and `buildStoredItems` (normalize → validate → build). `shouldValidatePageBlock` skips blocks whose `{blockType, slotCount, items}` are unchanged vs. the original, so untouched blocks aren't re-validated.

**Read (render editor or public):** `resolve-page-blocks/service.ts` → `resolve-blocks.ts` resolves each stored block into a selection; `location-homepages` formatters and `augmentBlocksWithPublishStatus` add publish metadata. API routes return these payloads.

**Publish:** `location-homepages/operations/publish-homepage.ts` → `assertPublishableResolvedBlocks` → `snapshotDraftBlocksForPublish` → write `publishedPageBlocks`, bump `publishedRevision`, stamp `lastPublishedAt` / `lastPublishedBy` → `revalidateLocationHomepageAfterChange`.

## How to add a new block type (choke-point checklist)

Adding a block type is a fan-out across fixed sites in **both repos**. Miss one and the block half-works (saves but won't validate, or validates but won't render). Server first:

1. **Slice** — new `<block-type>/` folder: `block.ts` (Payload `Block`), `constants.ts` (slot limits), `lib/refs.ts`, `lib/candidate.ts` + `lib/repository.ts`, `operations/{search,selection,validate}.ts`, `types/`, `service.ts` barrel. Prefer **extending** an existing slice (e.g. clone `hotel-grid`) over a parallel implementation when behavior matches.
2. **`block-registry/behaviors.ts`** — add a `CuratedBlockBehavior` entry keyed by the block slug (its `buildStoredItems` / `resolveSelection`, plus any `prepareRecord` / `assertAllowed` / `isArticleBlock` / `requiredImageField`). Most reference grids are one `gridBehavior({ normalize, validate, build, resolveSelection })` call.
3. **`block-registry/registry.ts`** — import the block and add it to `CURATED_BLOCK_DEFINITIONS` (in editor order). This registers the type for the collection's block arrays, the membership guard, **and** wires the behavior at once — the registry throws at load if a block has no behavior. The write-path normalizer, read-path resolver, and publish-status rules need **no edit**.
4. **`slot-count/lib/resolve.ts`** — add slot-count resolution if non-default.
5. **`convert-empty-block/constants.ts`** — add to source/target lists if it should be convertible.
6. **`resolve-page-blocks/constants.ts`** — add to `PUBLIC_ARTICLE_BLOCK_TYPES` if its public payload is article-shaped.
7. **Candidates route** — add `app/api/homepage-featured-content/<block>-candidates/route.ts` **and** `app/api/location-homepages/[id]/<block>-candidates/route.ts`, each a few lines via `createCandidateHandler` / `createLocationCandidateHandler` (`candidate-route.ts`).
8. **`index.ts`** — export the new block + service.
9. **Frontend (ai-blog-writer)** — `pageBlocks.ts`: add to `CuratedHomepageBlockType`, `HOMEPAGE_PAGE_BLOCK_CONFIG`, `HOMEPAGE_PAGE_BLOCK_TYPES`, response type + union, and the `isX` guard. Then the editor component (`CuratedHomepageBlockEditor.tsx` or a dedicated editor), `MainHomepagePage.tsx` / `LocationHomepagePage.tsx` wiring, `api.ts` helper, and CSS.
10. **Types + tests** — run `pnpm payload generate:types` if generated types are consumed; run vitest under `homepage-featured-content`.

See `.cursor/rules/questurian-payload-studio.mdc` for the dual-repo working rules, and **ADR 0005** (`apps/questura/docs/adr/0005-curated-block-definition-shape.md`) for why the slice shape is what it is.

## Open Questions

- **Block-type list duplication (largely resolved).** `block-registry/` (ADR 0005) is the single source of truth: the collection's block arrays, the membership guard (`isCuratedBlockType` + the former `CURATED_BLOCK_TYPES` array, now derived from `keys`), the write/read dispatchers, and the publish-rule article set (`ARTICLE_BLOCK_TYPES` → `behavior.isArticleBlock`) + `requiredImageField` all derive from it. The 14 `*-candidates` routes collapsed behind `candidate-route.ts` factories. Still restated independently and **not yet folded in**: `PUBLIC_ARTICLE_BLOCK_TYPES` (read-path public formatting — kept deliberately separate from the publish-rule flag), the convert source/target lists, slot-count resolution, the section-heading list, and the frontend `HOMEPAGE_PAGE_BLOCK_CONFIG` + `isX` guards (a cross-repo move). These are the remaining later-phase candidates.
- **`isCuratedHomepageBlockType` drift (resolved).** The guard is gone; membership is `curatedBlockRegistry.has`, derived from the one definition list, so the former type-union-vs-runtime-body drift (`tour-grid` omitted from the union) can no longer occur.
- Closes the root `CONTEXT.md` open question (§ Open Questions) that flagged `homepage-featured-content` as large enough to warrant its own `CONTEXT.md`.
