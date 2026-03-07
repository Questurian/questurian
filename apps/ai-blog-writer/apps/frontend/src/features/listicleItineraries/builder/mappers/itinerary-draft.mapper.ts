import { DEFAULT_EDITOR_ASSIST_MODEL } from '../../../staging/api/ai/models'
import { getSchemaPublisherConfig } from '../../../shared/seo/services/schema-publisher-config.service'
import { createEmptySeoSection, normalizeSeoSection } from '../services/seo-section.service'
import type { ItineraryItemBlock, ListicleItineraryDraft, PayloadItineraryDoc } from '../../types'
import { buildPayloadItineraryMetadataPatch } from '../services/payload-itinerary-metadata.service'
import { getRelationshipId, normalizeDurationMinute, normalizePeriod, normalizeQuarterMinute } from '../utils/field-normalizers.utils'
import { getRelationshipIds, isMediaMode } from '../utils/item-media.utils'
import { normalizeTripIntent } from '../../../trip-intent'

const schemaPublisherConfig = getSchemaPublisherConfig()

export function payloadDocToDraft(doc: PayloadItineraryDoc, existingDraftId?: string): ListicleItineraryDraft {
  const items: ItineraryItemBlock[] = (doc.items || []).map((item, index) => ({
    id: item.id || `item_${Date.now()}_${index}`,
    blockType: item.blockType || 'itinerary-dining',
    item: getRelationshipId(item.item),
    mediaMode: isMediaMode(item.mediaMode) ? item.mediaMode : 'photos',
    selectedPhotos: getRelationshipIds(item.selectedPhotos),
    selectedInstagramPost: getRelationshipId(item.selectedInstagramPost),
    timeHour: typeof item.timeHour === 'number' ? item.timeHour : 9,
    timeMinute: normalizeQuarterMinute(item.timeMinute),
    timePeriod: normalizePeriod(item.timePeriod),
    durationHours: typeof item.durationHours === 'number' ? item.durationHours : 1,
    durationMinutes: normalizeDurationMinute(item.durationMinutes),
    blurbMarkdown: '',
    blurbLexical: item.blurb,
    blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
  }))

  const hasStep2Content = Boolean(
    (doc.header?.intro && typeof doc.header.intro === 'object')
    || getRelationshipId(doc.header?.featuredImage),
  )
  const hasStep3Content = items.length > 0
  const normalizedSeoSection = normalizeSeoSection(doc.seoSection || createEmptySeoSection())

  return {
    draftId: existingDraftId || `lit_payload_${doc.id}`,
    ...buildPayloadItineraryMetadataPatch({
      doc,
      fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
    }),
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    title: doc.title || '',
    location: doc.location || '',
    locationRef: getRelationshipId(doc.locationRef),
    dayAudience: doc.dayAudience || '',
    itineraryStartHour: typeof doc.itineraryStartHour === 'number' ? doc.itineraryStartHour : 9,
    itineraryStartMinute: normalizeQuarterMinute(doc.itineraryStartMinute),
    itineraryStartPeriod: normalizePeriod(doc.itineraryStartPeriod),
    itineraryEndHour: typeof doc.itineraryEndHour === 'number' ? doc.itineraryEndHour : 6,
    itineraryEndMinute: normalizeQuarterMinute(doc.itineraryEndMinute),
    itineraryEndPeriod: normalizePeriod(doc.itineraryEndPeriod),
    step1_complete: Boolean(doc.step1_complete),
    in_update_mode: Boolean(doc.in_update_mode),
    tripIntent: normalizeTripIntent(doc.tripIntent),
    step2_complete: Boolean(doc.step2_complete) || hasStep2Content,
    step2_in_update_mode: Boolean(doc.step2_in_update_mode),
    step3_complete: Boolean(doc.step3_complete) || hasStep3Content,
    step3_in_update_mode: Boolean(doc.step3_in_update_mode),
    header: {
      introMarkdown: '',
      introLexical: doc.header?.intro,
      introJsonText: doc.header?.intro ? JSON.stringify(doc.header.intro, null, 2) : '',
      featuredImage: getRelationshipId(doc.header?.featuredImage),
    },
    items,
    seoSection: normalizedSeoSection,
    status: doc.status || 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: doc.updatedAt || new Date().toISOString(),
  }
}
