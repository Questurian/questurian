import type { ItineraryItemBlock, ListicleItineraryDraft, PayloadItineraryDoc } from '../../types'
import { getRelationshipId, normalizeDurationMinute, normalizePeriod, normalizeQuarterMinute } from '../utils/field-normalizers.utils'

export function payloadDocToDraft(doc: PayloadItineraryDoc, existingDraftId?: string): ListicleItineraryDraft {
  const items: ItineraryItemBlock[] = (doc.items || []).map((item, index) => ({
    id: item.id || `item_${Date.now()}_${index}`,
    blockType: item.blockType || 'itinerary-dining',
    item: getRelationshipId(item.item),
    timeHour: typeof item.timeHour === 'number' ? item.timeHour : 9,
    timeMinute: normalizeQuarterMinute(item.timeMinute),
    timePeriod: normalizePeriod(item.timePeriod),
    durationHours: typeof item.durationHours === 'number' ? item.durationHours : 1,
    durationMinutes: normalizeDurationMinute(item.durationMinutes),
    blurbMarkdown: '',
    blurbLexical: item.blurb,
    blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
  }))

  return {
    draftId: existingDraftId || `lit_payload_${doc.id}`,
    payloadId: doc.id,
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
    header: {
      customTitle: doc.header?.customTitle || '',
      introMarkdown: '',
      introLexical: doc.header?.intro,
      introJsonText: doc.header?.intro ? JSON.stringify(doc.header.intro, null, 2) : '',
      featuredImage: getRelationshipId(doc.header?.featuredImage),
    },
    items,
    seoSection: {
      seo: getRelationshipId(doc.seoSection?.seo),
    },
    status: doc.status || 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: doc.updatedAt || new Date().toISOString(),
  }
}
