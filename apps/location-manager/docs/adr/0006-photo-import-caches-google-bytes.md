# Operator-staged photo import caches Google Place Photo bytes as Upload sources

**Status:** accepted (2026-05-20); scope narrowed 2026-05-21 to the edit-surface flow only — the Add-flow path is governed by ADR-0007.

## Context

Operators populating Locations spend significant time hunting for usable source photography. Google Places returns ~10 photos per place via the Places API (New) `photos` field, addressable by `places/{id}/photos/{photo_name}` and resolved to a temporary signed URL via `media?skipHttpRedirect=true`.

The Photo Import flow lets the operator pull that set into the existing image-set pipeline: pre-Create grid → deselect unwanted → post-Create download → `StagedSource` rows → manual per-variant cropping → finalized `Upload` image-sets, identical to operator-uploaded photos thereafter.

This decision is non-obvious for two reasons:

1. **Google's stated model is render-only.** The Places API photo endpoint is documented as a redirect to a short-lived image URL intended to be rendered live, with attribution requirements. The reference implementation we modelled the flow on explicitly comments: *"Compliance: returns temporary Google-hosted render URL only. Never fetch/cache/proxy/store image bytes or URI."* Treating Google bytes as a persistent source we crop, store, and serve from our own pipeline diverges from that model.
2. **LM CONTEXT.md positions LM as the source-of-truth producer for source images** that flow into Questura's `MediaSet`. Introducing Google as an upstream byte source for LM's `Upload` rows extends that producer role in a way the existing context does not anticipate.

A future reader looking at `Upload.imageSet.sourceImage.path` populated from a Google `photo_name` will reasonably ask *"is this allowed?"* — this ADR records why we proceeded.

## Decision

The Photo Import flow downloads the bytes of operator-selected Google Place Photos and persists them as `StagedSource` rows (`Upload` with `format: "imageset"` and empty `variants: []`). After manual cropping, these become indistinguishable from operator-uploaded image-sets and flow through the existing MediaSet sync to Questura.

Photographer credit is mapped from `authorAttributions[0].displayName` and is operator-editable. No additional attribution URI is stored; no Google-required display chrome is rendered.

## Why this is acceptable today

This is a **school-project / offline / non-public-serving** deployment. Questura is not serving these images to the public web; the Location Manager pipeline operates in a closed operator environment for educational purposes. The compliance posture that would forbid caching in a commercial public-rendering product does not apply to this deployment.

If the deployment posture ever changes — Questura begins serving these images to the public web, or this codebase is forked into a commercial product — this ADR must be revisited **before** any Google-imported MediaSet reaches a public surface.

## Alternatives considered

### Render-only

Store only `photo_name` + attribution on the Location; render via the Places `media` endpoint at view time; no `Upload` row, no Sharp variants, no MediaSet.

**Rejected:** breaks the user-stated requirement that imported photos go through the same crop and variant pipeline as operator-uploaded photos. Also defeats the operator workflow — operators routinely re-crop photos for `square` / `portrait` / `hero` variants; render-only loses that affordance entirely.

### Operator-driven manual reuse

Operator manually downloads Google photos in their browser and re-uploads them via the existing upload UI.

**Rejected:** this is the status quo. The Photo Import flow exists specifically to remove the manual step; describing the existing affordance does not address the operator-time problem.

## Consequences

- `Upload` rows now carry sources whose provenance is Google, not operator. The `photographerCredit` field is the only attribution carried forward; no structured `provenance` field is added to `Upload` today.
- The `Rejected Source` per-Location list is a new sidecar concept (stored as `rejected_google_photo_names: string[]` on the Location row). This is the only new schema artefact the flow introduces beyond reuse of the existing `uploads` table.
- The flow's data model deliberately reuses `Upload.format = "imageset"` with empty `variants: []` (the state already supported by `reprocessUploadVariants`). No new `Upload` format is introduced.
- A `staged_source_status` column (`downloading | ready | failed`) and `error_message` column on `uploads` are added to support the optimistic-route post-Create UX (per-tile progress and per-tile retry on partial download failures).
- If commercial deployment is ever pursued, this ADR is the gate that must be revisited; the StagedSource → MediaSet → Questura sync path is the surface where a render-only refactor would land.

## Scope

- Categories enabled: Accommodations, Dining, Nightlife. Nightlife additionally requires `placeId` to be present on the Location before the import button is shown (its schema allows blank `placeId`).
- Surfaces enabled: post-Create "Pull from Google" button on each Location's edit surface, gated on `placeId` presence. **The pre-Create Add-flow path was removed from this ADR on 2026-05-21 and now lives in ADR-0007** — operators in the Add flow crop client-side before Create and never produce StagedSources.
- Not enabled today: Attractions, Key Locations. Adding them is straightforward (their staged forms already gate Next on `placeId`) but is out of scope for this ADR.
