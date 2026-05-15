# ADR 0002 — Unified Image Upload Flow

## Status

Accepted

## Context

The ai-blog-writer frontend has 5–7 distinct image upload surfaces (editorial featured image, editorial block image, media library UploadTab, OG social image modal, external image crop editor, reference image crop modal for FLUX). Each surface has its own drag-drop zone, its own alt text handling, its own CSS, and its own upload wiring. They look different, behave differently, and duplicate the same logic in parallel.

Three specific problems drove this decision:

1. **Visual inconsistency.** Each surface uses a different CSS class namespace (`image-upload-*`, `ml-*`, `stl-*`, `irp-*`) and was designed independently. Users see noticeably different upload experiences depending on where they are.

2. **Missing features on some surfaces.** The OG image modal has no alt text or photographer credit UI — both are silently injected by the parent. The media library UploadTab produces a single-asset MediaSet (one variant), which is never selectable as a featured image because `FeaturedImagePicker` defaults to `requireMediaSet = true` and filters out assets without a full variant set.

3. **Controlled API sprawl.** `useImageUploadFlow` required `altText`, `photographerCredit`, and `onAltTextGenerated` as external props, forcing every callsite to manage upload-internal state that no parent actually needs until `onComplete`.

## Decision

Unify all upload surfaces in the ai-blog-writer frontend around three layers:

### 1. Refactored `useImageUploadFlow` hook (uncontrolled)

The hook owns `altText`, `photographerCredit`, the AI generation state, and upload progress internally. Callers provide only upload parameters (`externalRef`, `locationRef`, `token`) and an `initialAltText` for pre-fill. The hook fires `onComplete({ mediaSetId, altText, photographerCredit })` when done.

Stage machine: `select → metadata → crop → uploading → done | error`

Two modes controlled by a `variant` prop:
- `'full'` — crop step uses `MultiVariantCropper` (all 7 variants), uploads to `/images/upload-variants`
- `'og'` — crop step uses inline `react-easy-crop` fixed to 1200×630, uploads to `/images/upload-social-image`

### 2. Shared UI primitives

`<DropZone>`, `<AltTextField>`, `<PhotographerCreditField>`, `<UploadProgressBar>` — all under `src/shared/images/components/upload-primitives/`. Single CSS file with a `iu-*` namespace. Every upload surface renders these; no surface re-implements them.

### 3. Surface layouts stay surface-specific

Each surface composes the shared hook and primitives into its own layout (modal, tab, inline panel). The shared layer does not prescribe a single wrapper component — it prescribes the atoms and the state machine.

### UploadTab becomes full 7-variant

UploadTab currently calls `/images/upload` (single-asset MediaSet). Under this ADR it migrates to the `'full'` variant mode, producing a complete 7-variant MediaSet. This is required because `FeaturedImagePicker` (requireMediaSet = true) and the public article API both prefer the MediaSet variant path; single-asset uploads from the media library were dead ends.

### OG modal collects alt text and photographer credit

The OG image modal adds an `<AltTextField>` (AI-generated, editable) and `<PhotographerCreditField>` (pre-filled `'Questurian Creative'`, editable). The parent no longer injects these values — the modal handles them via the `'og'` variant mode of the hook.

## Alternatives considered

**Keep surfaces independent, align CSS only.** Rejected: visual alignment rots the moment any surface is touched without touching the others. The duplication stays.

**One monolithic `<ImageUploadPanel>` component.** Rejected: the surfaces have genuinely different layouts (modal vs tab vs inline). A single component would need so many layout-override props it would become harder to use than the primitives directly.

**Controlled hook (keep current pattern).** Rejected: no callsite reads `altText` or `photographerCredit` mid-flight. Keeping them as external props forces boilerplate on every caller and was the root cause of the 6-prop API sprawl on `ImageUpload.tsx`.

## Consequences

- All upload surfaces gain AI alt text + manual editing and photographer credit.
- Media library uploads produce full 7-variant MediaSets, making them selectable as featured images.
- New upload surfaces default to the shared primitives; visual consistency is structural, not enforced by convention.
- `useImageUploadFlow` API is a breaking change for its current callers (`ImageUpload.tsx`); migration is required as part of this work.
- The `'og'` mode of the hook keeps the OG endpoint (`/images/upload-social-image`) as a separate backend path — the OG crop remains fixed to 1200×630 and does not run through MultiVariantCropper.
