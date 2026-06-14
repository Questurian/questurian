# Unified Image Picker — uncontrolled engine with caller slots

ABW had four divergent image-selection surfaces — the reusable `FeaturedImagePicker` (header/stops), the staging `FeaturedImageModal`/`BlockImageModal`, and the location-docs `CoverImagePickerField` — each with its own state model, loading strategy, CSS namespace, and a near-verbatim copy of the Unsplash/Pexels import-crop flow. We are consolidating them into a single **Image Picker** at `src/shared/images/picker/` (beside the Upload Flow, per [ADR 0002](./0002-unified-image-upload-flow.md)) that every ABW surface adopts.

The picker is **uncontrolled**: it owns its own data fetching, server-side whole-library search, infinite-scroll, and the external import-crop flow, and merely **emits the selected entity** (a `MediaAsset`/`MediaSet` doc, or the raw `UploadImageResponse`). Each call site's `onSelect` maps that entity to whatever id it persists — an asset id, a set id, or a set's preview-asset id. This follows the precedent ADR 0002 set for upload, which is the one part of the old pickers that was already unified.

## Considered Options

- **Uncontrolled engine, callers handle side-effects (chosen).** Three of the four sites already own their own state, so this deletes code rather than adding it, and it forces the three loading strategies to collapse into one (infinite scroll). The cost is the largest rewrite at staging, whose modal-data view-models are deleted while its timeline side-effects (block insertion, captions, trio format) stay behind `onSelect`.
- **Headless/controlled engine, callers feed data (rejected).** Would keep staging's view-models but force every *other* site to wire up data plumbing it doesn't currently need, and keep all three loading paradigms alive — the opposite of the goal.
- **Hybrid uncontrolled-with-controlled-escape-hatch (rejected).** Two wiring modes to maintain forever to avoid building one ReactNode slot.

## Consequences

- Domain-specific controls (caption field, trio square/wide toggle) render via an opaque `aboveGrid` ReactNode slot; the engine owns the confirm button (enabled only at exactly N) and takes its label as a prop. The engine stays ignorant of staging's domain.
- In exact-N multi mode the engine's selection buffer is **source-agnostic**: a Payload-grid click toggles it and an Unsplash/Pexels import pushes into it (rolling window — drop oldest at N), preserving staging's existing ability to assemble a pair/trio from mixed sources. Only the Upload tab is disabled in multi mode. Two existing staging tests are invariants the engine must keep: upload `externalRef` regenerates per modal-open session and is stable while open (`useEditorialStageFeaturedMedia.test`), and referenced block assets missing from the current page are hydrated by id and merged (`useEditorialStageMedia.test`).
- Per-site variant/dimension constraints are a **reactive `query` prop** (browseUnit, variant, dimensions, requireMediaSet, requirementLabel). "Uncontrolled" means the engine owns the fetch *state machine*, not the filter *criteria* — changing the prop resets and refetches, which is how the trio toggle changes the query at runtime. Filtering is server-side.
- Prerequisite: `fetchMediaAssets` must gain `where[filename][like]` (and alt_text via `where[or]`) so whole-library search works for assets as it already does for sets. Frontend-only; the calls hit Payload's REST API directly.
- Migration is incremental and easy-first: the self-contained sites (FeaturedImagePicker, CoverImagePicker) migrate and validate before staging, whose existing media hooks/tests are the behavioral guardrails.
- A fresh `ip-*` CSS namespace replaces both `fip-*` and `stage-article-modal-*`.
