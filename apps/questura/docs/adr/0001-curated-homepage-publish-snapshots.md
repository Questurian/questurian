# Curated Homepage Publish Snapshots Live On The Same Record

Curated Homepages need operator-safe editing without exposing incomplete blocks or broken featured items to the public site. We will store the private Homepage Page Draft and the Published Homepage snapshot as separate fields on the same Curated Homepage record, with publish metadata (`lastPublishedAt`, `lastPublishedBy`, `publishedRevision`) describing the current public snapshot.

## Considered Options

- Live-only mutation: rejected because editing a homepage would immediately risk broken public pages.
- Payload versions: rejected for v1 because public rendering and reference locks need a clear current published snapshot, not a generic revision log.
- Separate `homepage-versions` collection: rejected for v1 because it adds query and reference-scan complexity before rollback/history is a requirement.
- Same-record draft/published fields: accepted because publish is atomic, reference locks are straightforward, and public rendering has one stable snapshot to read.

## Consequences

Whole-page publish fails closed when draft blocks contain publish blockers. Hard delete is blocked for `articles`, `single-type-listicles`, and `listicle-itineraries` referenced by either draft or published homepage snapshots; unpublish is blocked only when the item appears in a Published Homepage.
