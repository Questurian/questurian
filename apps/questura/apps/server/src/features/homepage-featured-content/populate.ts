import type { PopulateType } from 'payload'

/**
 * What a city homepage block read is allowed to drag in behind it (#596).
 *
 * `depth` decides how far a read follows relationships; the top-level
 * `select` decides which fields of the *root* document come back. Neither
 * limits what those fields pull in turn — a selected `locationRef` populates
 * the whole location document, and that document's own relationships then
 * populate as well. `populate` closes that gap: it says which fields come
 * back on each *related* document, so a document narrowed to its identity
 * has no relationship fields left to follow.
 *
 * `media-assets` is deliberately absent, so assets populate in full: their
 * `afterRead` hook rewrites `url`, and every placement resolves from those
 * fields. `media-sets` keeps the whole `variants` group, so the
 * `featuredImage → mediaSet → variants` chain that imagery depends on is
 * intact; what it loses is the set's own `createdBy`, `location`, `tags` and
 * `source`, which no placement reads and which were dragging a user, a
 * location and its cover image in behind every image on the page.
 *
 * A document's `id` always comes back, so an empty select is "id only".
 *
 * WARNING — this is a silent coupling. A normalizer that starts reading a
 * field missing from this map gets `undefined` rather than an error.
 * `populate.test.ts` reads a real document both ways and fails when the
 * normalized candidates differ.
 */

/** Admin bookkeeping (`createdBy`, `user`). No block renders any of these. */
const ID_ONLY = {} as const

/**
 * `locationRef` is read for display names and the pipe key, never for its
 * own cover image or parent. Location *grid* cards are a different read:
 * there the location is the root document and `locationGridSelect` applies.
 */
export const LOCATION_LABEL_POPULATE = {
  locationKey: true,
  countryName: true,
  cityName: true,
  neighborhoodName: true,
} as const

/**
 * Shared by every block repository. The union of what the block normalizers
 * read is small enough that splitting it per block would buy nothing but
 * more places to forget to update.
 */
export const HOMEPAGE_BLOCK_POPULATE: PopulateType = {
  // Exactly what `resolveMediaSetForPlacement` reads. `variants` is a group,
  // so selecting it keeps every variant asset relationship inside it.
  'media-sets': { title: true, alt_text: true, variants: true },
  // Byline: `displayName`, `slug` and the avatar asset. Dropping `user` is
  // what stops an article read reaching the staff account behind the byline.
  authors: { displayName: true, slug: true, avatar: true },
  // Category chip: name and slug.
  'article-categories': { name: true, slug: true },
  locations: LOCATION_LABEL_POPULATE,
  users: ID_ONLY,
  'article-tags': ID_ONLY,
  'instagram-posts': ID_ONLY,
  'perfect-for-tags': ID_ONLY,
  'affiliate-products': ID_ONLY,
  'key-locations': ID_ONLY,
}
