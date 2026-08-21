# Editors may edit writer-linked and orphan Authors

Editorial staffing needs a middle tier: an editor curating bylines should be able to fix a
writer's photo, display name or bio without an admin doing it for them. `Authors.update`
therefore widens from *admin, or your own record* to *admin, or your own record, or — for
`editor` — any Author linked to a `writer` plus any Author with no linked Staff identity at all*.
Nothing else moves: the `slug` field stays `isAdminFieldLevel`, and the `Users` collection is not
touched, so an editor still cannot read, create, disable or re-role any Staff identity but their own.

This is deliberately a change to **Authors**, not to **Users**. ADR-0007 split the two so that
public authorship outlives employment; that split is what makes this safe to widen. An Author
record is public editorial content — the same category of thing as an article — and editors already
have unrestricted update on `articles` and on `media-assets`. A Staff identity is a credential, and
credentials stay admin-only.

## Considered options

- **Widen `Users.read` so the ABW UI could list staff and badge roles.** Rejected: it would let every
  writer enumerate every colleague's email to make a *list* render, which is a real widening bought for a
  cosmetic gain. The Author Directory queries `authors` instead, which all staff can already read.
- **Give editors every Author, including other editors' and admins'.** Rejected as too blunt, though it
  would have been a one-line rule. The chosen scope needs a relationship-traversing `where`, which is
  the cost of the extra precision.
- **Denormalise the linked user's role onto `Authors`** so the scope could be a direct column. Rejected:
  a second copy of the role that can drift from the real one, in the collection whose whole point is
  that it does not own identity.
- **Editors get writer-linked Authors only, excluding orphans.** Rejected: an orphan Author is exactly
  the byline of someone who left, and it is the record most likely to need a correction with nobody
  left to make it. Excluding it would leave the commonest real case admin-only.

## Consequences

- The access rule is the first in this server to filter on a relationship subfield:
  `{ or: [ { 'user.role': { equals: 'writer' } }, { user: { exists: false } } ] }`. Verified against
  `@payloadcms/drizzle` 3.79.1 — single (non-`hasMany`) relationships take the "simple relationships"
  branch in `getTableColumnFromPath`, which joins the related table and recurses, and query joins
  default to `leftJoin`, so rows with a null `user` survive the join and the second `or` branch is
  reachable. Both facts are load-bearing; a Payload upgrade that changed either would silently narrow
  or widen this rule, so it is covered by a test rather than left to inspection.
- Filtering on `user.role` is raw SQL and performs **no** read-access check against `users`. That is
  what lets an editor scope by role while still being unable to read a single Staff identity — and it
  also means the join must never be used to *return* Users data.
- A demotion or promotion changes who an editor may edit, immediately and with no backfill, because
  the scope is evaluated per request against the live role.
- `media-assets` needed no change: `mediaAssetAccess` already lets writer, editor and admin create,
  and `setUploadedBy` stamps the uploader. A delegated avatar upload therefore records the *editor*
  in `MediaAsset.user`, not the subject. Accepted as provenance — `Authors.avatar` is the real link.
