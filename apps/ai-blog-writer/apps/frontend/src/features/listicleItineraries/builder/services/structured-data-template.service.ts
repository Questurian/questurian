/**
 * Stable public surface for listicle-itinerary JSON-LD generation.
 *
 * Construction, stop resolution, schema policy, and validation live in focused
 * modules; existing callers continue to import from this facade.
 */
export {
  ITINERARY_STOP_SCHEMA_TYPE,
  getSchemaTypeForItineraryBlockType
} from './itinerary-stop-schema.service'

export { buildListicleItineraryStructuredDataTemplate } from './structured-data-template-builder.service'

export { validateListicleItineraryStructuredDataShape } from '../validators/structured-data-template.validator'

export { serializeStructuredDataTemplate } from '../../../../shared/builder/services/structured-data-template-core.service'
