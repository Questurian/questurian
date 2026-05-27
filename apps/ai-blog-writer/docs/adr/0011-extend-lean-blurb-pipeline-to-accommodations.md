# ADR 0011 — Extend lean blurb pipeline to accommodations

## Status

Accepted. Extends the lean writer + Writer Brief path established for nightlife (ADR 0007) and dining (ADR 0009). Operates within the operator-selected-angle contract from ADR 0010.

## Context

Accommodations was scaffolded by ADR 0004 with a 6-angle pool but kept on the fat-prompt bucket-dump writer path. Now that nightlife (1 angle) and dining (6 angles) have proven out the lean writer + Writer Brief curator, accommodations is the next category to migrate.

Two things made this more than a copy-paste of dining:

1. **Itinerary anchoring**: hotels are where days start and end in a listicle-itinerary. Geography matters more than for restaurants, so the angle pool and bucket set need to surface where the property sits and what's around it.
2. **Public evidence shape**: property sites are amenity-heavy and photo-heavy; reviews are crowd-heavy and view-heavy; backstory is thin for most chains. The angle pool needs to lean into the strong-evidence dimensions and not strain to manufacture provenance.

## Decision

### Angle pool (9)

`location-and-setting`, `view-and-vista`, `design-and-aesthetic`, `signature-amenity`, `food-and-beverage`, `trip-fit`, `property-backstory`, `booking-tip`, `whats-different`.

Compared to the original 6-angle scaffold:

- **New**: `location-and-setting`, `view-and-vista`, `food-and-beverage` — the three strongest accommodations-specific lead shapes that were missing.
- **Renamed**: `room-style` → `design-and-aesthetic` (lobby/restaurant/pool deck often carry more identity than rooms); `best-for-stay-type` → `trip-fit` (wider scope than stay-length).
- **Kept**: `signature-amenity` (scoped tightly to standalone features like rooftop hammam, library, observatory — not a catch-all hook); `property-backstory` (no `has-story` flag — the existing fallback ladder prevents fabrication); `booking-tip` (opportunistic, fine to come back empty); `whats-different` (researched as today, *not* derived; the curator can draw on cross-bucket findings via the grounded call's natural cross-reference).
- **Promoted to buckets** (universal, not angle-specific): `neighborhood-context` and `crowd-and-vibe`. These are itinerary support and atmosphere that *every* accommodations blurb needs as texture regardless of the lead shape — putting them in buckets means they back up every angle, not just blurbs where the operator picks them as the lead.

### Bucket schema

`STANDARD_RESEARCH_BUCKETS` grows from 11 to 13 with `neighborhood-context` and `crowd-and-vibe` added as universal buckets. They are available to every category; existing category prioritization tuples (dining, nightlife, attractions) are unchanged, so they fill only when the grounded call finds cited evidence.

`CATEGORY_BUCKET_PRIORITIES["accommodations"]` is re-tuned to: `neighborhood-context`, `specific-offerings`, `experience-texture`, `crowd-and-vibe`, `best-for`, `visual-assets`, `caveats-or-fit-warnings`. Same 7-priority shape as dining.

### Category gates

`accommodations` joins `ANTI_AI_PROMPT_CATEGORIES` and `LEAN_PROMPT_CATEGORIES`. Operator-selected angle is always required (ADR 0010); the writer prompt is the lean prompt + Writer Brief.

### No category calibration block

Accommodations ships without an `ACCOMMODATIONS_BLURB_CALIBRATION` block. Dining ships without one and works; nightlife has one only because a production audit surfaced specific failure modes. If first-run accommodations generations expose systematic tells, a 4–6 line block can be added as a hotfix.

## Consequences

- `STANDARD_RESEARCH_BUCKETS` grows to 13. Research Profile responses for dining/nightlife/attractions gain two empty `[]` lanes; negligible token cost.
- `LISTICLE_ANGLE_GUIDANCE` gets three new entries and two rewrites (renames). `ANGLE_DIRECTIVES_BY_CATEGORY` gets a new `accommodations` block of 9 venue-facing directives.
- Frontend `ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS` ships with 9 options. The 9-angle dropdown is a wider operator choice than dining's 6; accept the operator UX cost.
- `_build_lean_writer_prompt` gains an `accommodations` branch (editor_role "travel editor", descriptor "accommodations listicle").
- CONTEXT.md is updated to reflect: 13 universal buckets, accommodations on the lean writer path, accommodations Writer Brief category scope.

## Alternatives considered

- **Wide 11-angle pool with `neighborhood-context` and `crowd-and-vibe` as angles**. Rejected: they're cross-cutting texture every blurb needs, not lead shapes. Operators would have to pick them as the lead to get the evidence, which is a UX trap.
- **Accommodations-only buckets**. Rejected: would change CONTEXT.md's "all standard buckets stay in the schema" rule and add a new per-category extension mechanism for two buckets that genuinely help other categories (nightlife crowd, foodie-trail neighborhood).
- **`has-story` flag for `property-backstory`**. Rejected: the existing fallback ladder (unsupported → buckets → identity-only) already prevents fabrication; (a)-LM-field would couple ABW to a Location Manager schema change; (b)-builder-toggle adds per-item UI for an edge case. Revisit if production audits show operators picking `property-backstory` for storyless chains.
- **`whats-different` as derived from other buckets** (no selected-angle research call). Rejected as premature structural divergence: today's pipeline scopes selected-angle research per-angle uniformly, and the grounded call for `whats-different` is allowed to cross-reference amenity/design/F&B/location signals naturally. Synthesis-from-buckets adds a special-case branch for one angle's behavior.
- **Preemptive `ACCOMMODATIONS_BLURB_CALIBRATION` block**. Rejected: predicting failure modes before seeing real outputs is guesswork; dining works without one. Write a tight block after the first audit if needed.
