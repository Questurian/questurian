---
Status: proposed
---

# Replace the manual itinerary `tour-agency` stop with attraction-linked tours

The itinerary builder has a manual `tour-agency` stop type (operator/price/duration/starting point typed by hand), which reads as forced promo and duplicates data that already exists: the Payload `attractions` collection carries an ordered `tours` relationship ("Ordered tours linked from Location Manager", `Attractions.ts`), managed in LM via `AttractionToursManager`/`TourSelector`. The proposed direction is to drop the standalone `tour-agency` stop and instead let an **attraction stop card recommend that attraction's linked tours** — the blurb is editorial copy about the place, and the linked tours (title/price/bookingLink/img) render beneath it as structured data, not AI prose.

This is recorded as **proposed** and deliberately **out of scope for the current AI auto-write hookup** (the auto-write only writes blurbs; linked tours never touch the AI). It is hard to reverse (deprecating a published Payload block + migrating existing itinerary docs), crosses the LM/Payload boundary (the canonical attraction→tours link lives upstream of ABW), and has a real alternative (keep `tour-agency` as a manual escape hatch for tours not yet modeled in LM). Considered options: (a) keep `tour-agency` manual stop; (b) surface attraction-linked tours and deprecate `tour-agency`; (c) support both. Leaning (b), to be confirmed in the follow-up effort that builds the tours-in-card rendering.
