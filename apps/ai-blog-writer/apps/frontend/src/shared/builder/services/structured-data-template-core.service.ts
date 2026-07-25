/**
 * Shared helpers for building JSON-LD structured data templates.
 *
 * Re-exports from the four focused modules so the two builder services
 * (singleTypeListicles, listicleItineraries) keep a single import site:
 * - structured-data-primitives      value guards, path picking, compaction
 * - structured-data-text.service    lexical/markdown text → description
 * - structured-data-entity.service  entity field resolution from a record
 * - structured-data-media.service   selected photo / Instagram permalink
 */

export {
  asArray,
  compactValue,
  getNestedValue,
  getNodeType,
  isRecord,
  isValidAbsoluteHttpUrl,
  normalizeAbsoluteUrl,
  normalizeText,
  pickFirstText,
  pickStringArray,
  toFiniteNumber,
  toSchemaDate,
} from './structured-data-primitives'

export {
  STRUCTURED_DESCRIPTION_MAX_LENGTH,
  clipReadableText,
  extractDraftText,
  extractLexicalText,
  stripMarkdownSyntax,
  stripPromotionalLeadIn,
  toStructuredDescription,
} from './structured-data-text.service'

export {
  normalizePriceRange,
  resolveEntityAddress,
  resolveEntityGeo,
  resolveEntityName,
  resolveEntityPhone,
  resolveEntityPriceRange,
  resolveEntityTypeLabel,
  resolveEntityWebsite,
} from './structured-data-entity.service'

export {
  resolveSelectedImageUrl,
  resolveSelectedInstagramPermalink,
} from './structured-data-media.service'

export function serializeStructuredDataTemplate(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}
