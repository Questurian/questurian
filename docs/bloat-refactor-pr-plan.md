# Bloat Refactor PR Plan

This plan breaks the four high-score bloat findings into reviewable PRs. The goal is structural refactoring only: preserve behavior, keep public imports stable where practical, and move logic behind focused modules before changing implementation details.

## Current Diagnosis

| File | LOC | Main concerns | Risk |
| --- | ---: | --- | --- |
| `apps/ai-blog-writer/apps/frontend/src/features/homepageFeaturedContent/HomepageFeaturedContentPage.tsx` | 723 | List querying/mutations, grouping/search logic, row rendering, confirmation modals, full page layout | Medium |
| `apps/ai-blog-writer/apps/frontend/src/features/homepageFeaturedContent/useHomepageFeaturedSlots.ts` | 355 | Slot math, candidate query state, autosave, mutation state, broad type/export surface | Medium |
| `apps/ai-blog-writer/apps/frontend/src/features/listicleItineraries/builder/components/BuilderStopsPanel.tsx` | 1746 | Stop card rendering, manual tour editing, related item/media derivation, modal orchestration, image hydration, route-point transforms | High |
| `apps/location-manager/packages/client/src/features/location-edit/components/LocationDetail.tsx` | 728 | Form shell, field sections, controlled row primitives, helper utilities, modal wiring | Medium |

## PR 1: Split Homepage Manager Page Into Helpers And Components

### Title

`refactor(homepage): split homepage manager page`

### Scope

- Move pure location-homepage list logic from `HomepageFeaturedContentPage.tsx` into `locationHomepageList.utils.ts`.
- Move `CityHomepageGroup` and `CountryHomepageGroup` types into either `locationHomepageList.types.ts` or the existing feature `types.ts`, depending on import churn.
- Move `LocationRow`, `DeleteConfirmModal`, and `ResetAllConfirmModal` into focused components.
- Keep `HomepageFeaturedContentPage.tsx` as the query/mutation/page composition shell.

### Proposed Files

```text
apps/ai-blog-writer/apps/frontend/src/features/homepageFeaturedContent/
  HomepageFeaturedContentPage.tsx
  locationHomepageList.types.ts
  locationHomepageList.utils.ts
  components/
    LocationHomepageRow.tsx
    DeleteLocationHomepageModal.tsx
    ResetAllHomepageContentModal.tsx
```

### Migration Map

| Source | Destination | Reason |
| --- | --- | --- |
| `formatDate`, label helpers, grouping/search helpers | `locationHomepageList.utils.ts` | Pure utility logic, unit-testable without React |
| `CityHomepageGroup`, `CountryHomepageGroup` | `locationHomepageList.types.ts` | Shared contract between utilities and page rendering |
| `LocationRow` | `components/LocationHomepageRow.tsx` | Row presentation |
| `DeleteConfirmModal` | `components/DeleteLocationHomepageModal.tsx` | Modal presentation and Escape handling |
| `ResetAllConfirmModal` | `components/ResetAllHomepageContentModal.tsx` | Modal presentation and Escape handling |
| Page body | `HomepageFeaturedContentPage.tsx` | Auth, queries, mutations, navigation, composition |

### Acceptance Criteria

- `HomepageFeaturedContentPage.tsx` drops below 300 LOC.
- Existing `HomepageFeaturedContentPage.test.tsx` passes unchanged or with import-only updates.
- Add focused tests for grouping/search helpers if current page tests do not cover country/city/neighborhood grouping.

### Verification

- `cd apps/ai-blog-writer && pnpm test -- --run HomepageFeaturedContentPage`
- `cd apps/ai-blog-writer && pnpm test -- --run locationHomepageList`

## PR 2: Narrow `useHomepageFeaturedSlots` Around Slot State

### Title

`refactor(homepage): extract featured slot state helpers`

### Scope

- Move pure slot helpers to `homepageFeaturedSlots.utils.ts`.
- Move exported hook result/options types to `homepageFeaturedSlots.types.ts`.
- Extract candidate query state into `useHomepageFeaturedCandidates.ts` if the public result shape can remain stable.
- Keep `useHomepageFeaturedSlots` as the compatibility facade used by existing editors and layouts.

### Proposed Files

```text
apps/ai-blog-writer/apps/frontend/src/features/homepageFeaturedContent/
  useHomepageFeaturedSlots.ts
  homepageFeaturedSlots.types.ts
  homepageFeaturedSlots.utils.ts
  useHomepageFeaturedCandidates.ts
```

### Migration Map

| Source | Destination | Reason |
| --- | --- | --- |
| `SlotValue`, `CandidateParams`, options/result types | `homepageFeaturedSlots.types.ts` | Reduce hook export surface and type churn |
| `createEmptySlots`, `mapSelectionToSlots`, ref equality, duplicate detection, save item builder | `homepageFeaturedSlots.utils.ts` | Pure slot transformations |
| Candidate page/search/filter state and candidates query | `useHomepageFeaturedCandidates.ts` | Separate data fetching from slot draft/autosave state |
| Draft/saved slot state, autosave, mutation handlers | `useHomepageFeaturedSlots.ts` | Feature orchestration facade |

### Acceptance Criteria

- Existing imports of `useHomepageFeaturedSlots`, `SlotValue`, `CandidateParams`, and `UseHomepageFeaturedSlotsResult` still work through the same file or an intentional barrel.
- `useHomepageFeaturedSlots.ts` drops below 220 LOC.
- Existing layout and slot-swap tests pass.

### Verification

- `cd apps/ai-blog-writer && pnpm test -- --run FeaturedArticlesLayout7`
- `cd apps/ai-blog-writer && pnpm test -- --run CuratedArticleSlotSwap`
- `cd apps/ai-blog-writer && pnpm test -- --run CuratedSlotSwapLayouts`

## PR 3: Extract Builder Stops Pure Logic And Hydration Hook

### Title

`refactor(listicles): extract stops panel logic`

### Scope

- Move route-point, existing-stop, media-mode, and block-reset helpers out of `BuilderStopsPanel.tsx`.
- Move manual image hydration into `useManualStopImageAssets.ts`.
- Keep all JSX in `BuilderStopsPanel.tsx` for this PR to limit behavior risk.

### Proposed Files

```text
apps/ai-blog-writer/apps/frontend/src/features/listicleItineraries/builder/
  components/BuilderStopsPanel.tsx
  hooks/useManualStopImageAssets.ts
  utils/stopMediaMode.utils.ts
  utils/existingStopSelection.utils.ts
  utils/itineraryStopBlock.utils.ts
```

### Migration Map

| Source | Destination | Reason |
| --- | --- | --- |
| `MEDIA_MODE_OPTIONS`, `getAvailableMediaModeOptions` | `utils/stopMediaMode.utils.ts` | Shared media option rules |
| Existing stop constants and selection/route helpers | `utils/existingStopSelection.utils.ts` | Pure route-point and related-item mapping |
| `formatTourDurationLabel`, `resetItemForBlockType`, `createKeyLocationRow` | `utils/itineraryStopBlock.utils.ts` | Stop-specific transformations |
| Missing manual image ID detection and fetch effect | `hooks/useManualStopImageAssets.ts` | Side effect isolation |

### Acceptance Criteria

- `BuilderStopsPanel.tsx` drops below 1300 LOC without JSX extraction yet.
- Existing `BuilderStopsPanel.test.tsx` passes.
- Add utility tests for existing-stop route selection and block reset behavior.

### Verification

- `cd apps/ai-blog-writer && pnpm test -- --run BuilderStopsPanel`
- `cd apps/ai-blog-writer && pnpm test -- --run existingStopSelection`
- `cd apps/ai-blog-writer && pnpm test -- --run itineraryStopBlock`

## PR 4: Split Builder Stop Card Rendering

### Title

`refactor(listicles): split builder stop card components`

### Scope

- Extract the per-row derived view model from the `step3Rows.map` body.
- Split stop card rendering into focused components for the major field groups.
- Move modal rendering behind a single `BuilderStopModals` component that receives active picker state and handlers.
- Keep `BuilderStopsPanel` responsible for day-level actions, panel header, lock fieldset, and row ordering.

### Proposed Files

```text
apps/ai-blog-writer/apps/frontend/src/features/listicleItineraries/builder/components/stops/
  BuilderStopCard.tsx
  BuilderStopFields.tsx
  ManualTourFields.tsx
  RelatedItemMediaFields.tsx
  StopBlurbFields.tsx
  StopInsertZone.tsx
  BuilderStopModals.tsx
  useBuilderStopViewModel.ts
```

### Migration Map

| Source | Destination | Reason |
| --- | --- | --- |
| `StopInsertZone` | `components/stops/StopInsertZone.tsx` | Reusable insertion affordance |
| Per-item derived variables in `step3Rows.map` | `useBuilderStopViewModel.ts` | Keeps render components prop-driven |
| Header/actions/block type/related item fields | `BuilderStopFields.tsx` | Common stop card fields |
| Manual tour fields, starting point, route points, image/Instagram | `ManualTourFields.tsx` | Manual stop workflow |
| Media mode, photos, Instagram, tour picks | `RelatedItemMediaFields.tsx` | Related item media workflow |
| Blurb angle/editor/reason field | `StopBlurbFields.tsx` | Editorial content workflow |
| Picker and preview modals | `BuilderStopModals.tsx` | Modal orchestration |
| `<article className="stl-item-card">...` | `BuilderStopCard.tsx` | Stop-level composition |

### Acceptance Criteria

- `BuilderStopsPanel.tsx` drops below 450 LOC.
- `BuilderStopCard` has no data fetching side effects.
- `BuilderStopsPanel.test.tsx` remains the regression suite; add component tests only for extracted pieces with meaningful branch logic.

### Verification

- `cd apps/ai-blog-writer && pnpm test -- --run BuilderStopsPanel`
- Manual browser pass on listicle itinerary builder Step 3: add stop, select related item, select photos, manual tour route points, Instagram preview, remove stop.

## PR 5: Split Location Detail Sections And Form Rows

### Title

`refactor(location-manager): split location detail sections`

### Scope

- Move controlled row primitives into reusable form row components.
- Move each detail section into a focused component file.
- Move small helpers into a local utility file.
- Keep `LocationDetail.tsx` as loading/error/form shell and section composition.

### Proposed Files

```text
apps/location-manager/packages/client/src/features/location-edit/components/
  LocationDetail.tsx
  location-detail/
    BasicsSection.tsx
    TaxonomySection.tsx
    ContactSection.tsx
    DetailsSection.tsx
    ExternalLinksSection.tsx
    MediaSection.tsx
    ControlledDetailRows.tsx
    locationDetail.utils.ts
```

### Migration Map

| Source | Destination | Reason |
| --- | --- | --- |
| `BasicsSection` | `location-detail/BasicsSection.tsx` | Basic fields |
| `TaxonomySection` | `location-detail/TaxonomySection.tsx` | Identity unlock state and taxonomy editor |
| `ContactSection` | `location-detail/ContactSection.tsx` | Contact fields |
| `DetailsSection` | `location-detail/DetailsSection.tsx` | Ideal-for tags, price, hours, detailed text |
| `ExternalLinksSection` | `location-detail/ExternalLinksSection.tsx` | External identifier fields |
| `MediaSection` | `location-detail/MediaSection.tsx` | Read-only media counts |
| `ControlledInputRow`, `ControlledTextareaRow`, `ControlledSelectRow` | `location-detail/ControlledDetailRows.tsx` | Reusable form primitives |
| `fieldProvenance`, `formatCoords`, `bookingUrlLabelFor` | `location-detail/locationDetail.utils.ts` | Pure helpers |

### Acceptance Criteria

- `LocationDetail.tsx` drops below 220 LOC.
- Public import path `@client/features/location-edit/components/LocationDetail` remains unchanged.
- No behavior change to post-create or edit usages.

### Verification

- `cd apps/location-manager/packages/client && pnpm lint:full -- src/features/location-edit/components/LocationDetail.tsx src/features/location-edit/components/location-detail`
- `cd apps/location-manager/packages/client && pnpm test` currently reports that client tests are intentionally skipped.
- Manual browser pass: edit dining location, post-create dining flow, operation hours modal, taxonomy unlock/lock.

## Suggested PR Order

1. PR 1 first because it is medium-risk, well-covered, and establishes the extraction pattern for homepage code.
2. PR 2 second because slot helper imports affect many homepage layouts and tests but should be mechanically safe.
3. PR 5 third because Location Manager is independent of AI Blog Writer and can be reviewed in parallel once the pattern is proven.
4. PR 3 fourth because it reduces `BuilderStopsPanel` risk before JSX movement.
5. PR 4 last because it touches the largest UI surface and benefits from PR 3's utility seams.

## Review Strategy

- Each PR should include a before/after LOC summary for the target file.
- Keep refactors import-compatible unless the PR explicitly states a breaking import cleanup.
- Avoid opportunistic UI text or styling changes.
- Prefer snapshot-free behavioral tests around extracted pure helpers.
- For `BuilderStopsPanel`, avoid moving helper logic and JSX in the same commit when possible; reviewers should be able to distinguish mechanical moves from prop wiring changes.

## Definition Of Done

- All four original files are below the warning threshold where practical, or have a documented reason for remaining above it.
- Pure transformation logic has direct tests.
- Page/panel/container components contain orchestration and composition only.
- Existing user workflows pass the listed automated and manual checks.
