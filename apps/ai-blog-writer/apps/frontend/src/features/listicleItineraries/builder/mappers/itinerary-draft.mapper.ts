import { DEFAULT_EDITOR_ASSIST_MODEL } from '../../../staging/api/ai/models'
import { getSchemaPublisherConfig } from '../../../shared/seo/services/schema-publisher-config.service'
import { createEmptySeoSection, normalizeSeoSection } from '../services/seo-section.service'
import {
  isRelatedItemCollection,
  isTourAgencyPriceTier,
  type ItineraryItemBlock,
  type ListicleItineraryDraft,
  type PayloadItineraryDoc,
  type TourAgencyKeyLocationRow,
  type TourAgencyStartingPoint,
} from '../../types'
import { buildPayloadItineraryMetadataPatch } from '../services/payload-itinerary-metadata.service'
import { getRelationshipId } from '../utils/field-normalizers.utils'
import { getRelationshipIds, isMediaMode } from '../utils/item-media.utils'

const schemaPublisherConfig = getSchemaPublisherConfig()

type PayloadKeyLocationRows = NonNullable<PayloadItineraryDoc['items']>[number]['keyLocations']

function normalizePayloadStartingPoint(
  value: NonNullable<PayloadItineraryDoc['items']>[number]['startingPoint'],
): TourAgencyStartingPoint {
  if (!value || typeof value !== 'object') {
    return {
      label: '',
      latitude: '',
      longitude: '',
    }
  }

  return {
    label: typeof value.label === 'string' ? value.label.trim() : '',
    latitude: typeof value.latitude === 'number' ? String(value.latitude) : '',
    longitude: typeof value.longitude === 'number' ? String(value.longitude) : '',
  }
}

function normalizePayloadKeyLocations(
  value: PayloadKeyLocationRows,
  itemId: string,
): TourAgencyKeyLocationRow[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((row, index) => {
    const relatedItem = row?.relatedItem
    const relatedItemValue = relatedItem && typeof relatedItem === 'object' ? relatedItem.value : undefined

    return {
      id: row?.id || `${itemId}_key_location_${index}`,
      source: row?.source === 'manual' ? 'manual' : 'existing',
      relatedCollection: relatedItem && typeof relatedItem === 'object' && isRelatedItemCollection(relatedItem.relationTo)
        ? relatedItem.relationTo
        : null,
      relatedItem: typeof relatedItemValue === 'number'
        ? relatedItemValue
        : relatedItemValue && typeof relatedItemValue === 'object' && typeof relatedItemValue.id === 'number'
          ? relatedItemValue.id
          : null,
      title: row?.title?.trim() || '',
      latitude: typeof row?.latitude === 'number' ? String(row.latitude) : '',
      longitude: typeof row?.longitude === 'number' ? String(row.longitude) : '',
    }
  })
}

export function payloadDocToDraft(doc: PayloadItineraryDoc, existingDraftId?: string): ListicleItineraryDraft {
  const items: ItineraryItemBlock[] = (doc.items || []).map((item, index) => {
    const itemId = item.id || `item_${Date.now()}_${index}`

    return {
      id: itemId,
      blockType: item.blockType || 'itinerary-dining',
      item: getRelationshipId(item.item),
      mediaMode: isMediaMode(item.mediaMode) ? item.mediaMode : 'photos',
      selectedPhotos: getRelationshipIds(item.selectedPhotos),
      selectedInstagramPost: getRelationshipId(item.selectedInstagramPost),
      title: item.title?.trim() || '',
      operator: item.operator?.trim() || '',
      price: isTourAgencyPriceTier(item.price) ? item.price : '',
      url: item.url?.trim() || '',
      tourDuration:
        typeof item.tourDuration === 'number'
        && Number.isInteger(item.tourDuration)
        && item.tourDuration >= 1
        && item.tourDuration <= 24
          ? item.tourDuration
          : 1,
      startingPoint: normalizePayloadStartingPoint(item.startingPoint),
      keyLocations: normalizePayloadKeyLocations(item.keyLocations, itemId),
      image: getRelationshipId(item.image),
      instagramPost: getRelationshipId(item.instagramPost),
      blurbMarkdown: '',
      blurbLexical: item.blurb,
      blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
    }
  })

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
    sharedNeighborhoods: getRelationshipIds(doc.sharedNeighborhoods),
    step1_complete: Boolean(doc.step1_complete),
    in_update_mode: Boolean(doc.in_update_mode),
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
