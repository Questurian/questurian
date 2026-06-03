/**
 * Reference-lock policy seam for article collections.
 *
 * Editorial collections (articles, single-type listicles, listicle itineraries)
 * must refuse to delete or unpublish content that a curated homepage still
 * references. The reference scan itself is homepage knowledge and rightly lives
 * in the homepage feature — but the article collections should depend on *this*
 * article-owned seam rather than reaching into homepage internals directly.
 *
 * This keeps the editorial lifecycle's dependency on homepage infra in one
 * place: if the homepage reference model changes, only this file moves.
 */
export {
  assertCanDeleteHomepageFeaturedContent,
  assertCanUnpublishHomepageFeaturedContent,
} from '@/features/homepage-featured-content/location-homepages/lib/reference-locks'
