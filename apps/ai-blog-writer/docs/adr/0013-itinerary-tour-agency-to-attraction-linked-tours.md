---
Status: accepted
---

# Replace the manual itinerary `tour-agency` stop with attraction-linked Tour Picks

The itinerary builder has a manual `tour-agency` stop type (operator/price/duration/starting point typed by hand), which reads as forced promo and duplicates data that already exists: the Payload `attractions` collection carries an ordered `tours` relationship ("Ordered tours linked from Location Manager", `Attractions.ts`), managed in LM via `AttractionToursManager`/`TourSelector`.

## Decision

Attraction stops carry **Tour Picks**: a curated, ordered subset of the attraction's LM-linked tours, selected per stop by the operator in the builder. The `tour-agency` block is **removed outright** (not kept as an escape hatch, not soft-deprecated). Tour Picks apply to both attraction surfaces — `ItineraryAttractionsBlock` in listicle itineraries and the `data-attractions` row in single-type listicles (one factory, same field shape, same cap).

- **Curation, not pass-through.** An attraction may carry a deep tour list in LM (tens of tours); the listicle features only the few the operator picks, so the published site reads as curated rather than dumping the full attachment list. This rejects the original pass-through lean ("recommend its linked tours" wholesale).
- **Live references, not snapshots.** The itinerary block stores tour IDs in operator order; tour content (title, price, bookingLink, img) is populated at render time. Price and affiliate-link freshness beat frozen approval state, and this matches how every other stop already references its venue doc.
- **Picks are a subset of the attraction's LM-linked tours.** The listicle cannot attach a tour LM never linked to that attraction — otherwise a second, invisible attachment path exists that LM can't see. The fix for a missing tour is to link it in LM, not side-door it in ABW. Zero linked tours ⇒ no tour section on that stop.
- **Tours never touch the AI.** Autobuild/autowrite write blurbs (editorial prose); Tour Picks are operator-selected structured data rendered beneath the blurb.

## Migration of existing `tour-agency` stops

Inventory → hand-migrate → remove at zero usage. A `tour-agency` stop has no attraction link, so scripted conversion cannot infer where its tour belongs — migration is necessarily human: create the Tour in LM, link it to the right attraction, re-pick it as a Tour Pick on that itinerary's attraction stop, delete the manual stop. The block is dropped from the Payload schema (and client/builder types) only once no doc uses it.

## Considered alternatives

(a) keep `tour-agency` as a manual escape hatch — rejected: every tour change gets built twice and "not in LM yet" has a cleaner fix (add it in LM, where it's reusable); (b) raw pass-through of all linked tours — rejected: surrenders editorial curation; (c) snapshot tour data into the listicle — rejected: stale prices/affiliate links on published articles.
