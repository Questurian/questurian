/**
 * NOT IN USE. The Itinerary Pipeline is decommissioned.
 *
 * The Listicle Itineraries builder (src/features/listicleItineraries) replaced
 * it and is the itinerary tool we actually use. This feature has no card on the
 * home page any more.
 *
 * The code stays on purpose. Nothing here is deleted, the /itinerary-pipeline
 * route still resolves, and the backend feature is still mounted, so an old
 * link keeps working. Treat this folder as frozen: do not build new work on it,
 * and put itinerary changes in the builder instead.
 */
export { default as ItineraryPipelinePage } from './ItineraryPipelinePage'
