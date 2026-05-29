# Itinerary fit-scoring runs on existing tags; no rating field, no enrichment backfill

Itinerary Autobuild scores how well each candidate record matches the operator's brief using **only the signals the data collections already carry** — `priceLevel`/`priceTier`, `cuisines`, `idealFor`, `vibe`, `perfectFor`, `type`, amenity booleans, coordinates. We explicitly **do not add a `rating`/review field and do not add an enrichment-profile field**, and we do not backfill the ~173 records.

This is surprising because the original brief leaned on "ratings" and "best-rated" as a scoring axis — and no rating field exists. We checked the live data: the existing tags are well-populated and human-readable (e.g. dining `idealFor: ["Fine Dining","Tasting Menu"]`, accommodations `vibe: ["Luxury","Boutique"]`, nightlife `theSpace.vibe: ["Upscale","Exclusive"]`), so the matching surface is already there. A 1-D star rating would add little; a rich enrichment field would be powerful but is a **cross-context schema + backfill project** (Questura collection + `@questurian/lm-shared` types + Location Manager UI) that this feature doesn't need.

The cost we accept: the same intent ("high-end") appears under different tokens across collections, which a deterministic `where` filter can't bridge. We handle that by making **the LLM own fit-scoring** (it bridges vocabularies semantically) and normalizing only at read time (e.g. nightlife price). A controlled tag vocabulary remains a legitimate but **separate** Location-Manager data-quality initiative, to be revisited only if semantic bridging proves unreliable.

## Consequences

- No dependency on a data migration before the feature can ship.
- Fit-scoring must stay LLM-driven; a future move to deterministic scoring would re-introduce the vocabulary-normalization problem this ADR avoids.
- "Quality/prominence" is not a signal the rubric has — `priceLevel` is the only proxy for "upscale."
