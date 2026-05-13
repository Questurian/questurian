import { DEFAULT_EDITOR_ASSIST_MODEL } from '../../../../shared/api/ai/models'
import { getSchemaPublisherConfig } from '../../../../shared/seo/services/schema-publisher-config.service'
import { createEmptySeoSection, normalizeSeoSection } from '../services/seo-section.service'
import {
  isRelatedItemCollection,
  isTourAgencyPriceTier,
  type ItineraryDaySlice,
  type ItineraryItemBlock,
  type ListicleItineraryDraft,
  type PayloadItineraryDoc,
  type TourAgencyKeyLocationRow,
  type TourAgencyStartingPoint,
} from '../../types'
import { buildPayloadItineraryMetadataPatch } from '../services/payload-itinerary-metadata.service'
import { getRelationshipId } from '../utils/field-normalizers.utils'
import { getRelationshipIds, isMediaMode } from '../../../../shared/builder/utils/item-media.utils'
import { lexicalRichTextToMarkdown } from '../../../../shared/builder/utils/lexical-json.utils'
import { buildItineraryDraftSyncSignature } from '../utils/itinerary-draft-sync-signature'

const schemaPublisherConfig = getSchemaPublisherConfig()

type PayloadBlockRow = NonNullable<PayloadItineraryDoc['items']>[number]
type PayloadKeyLocationRows = PayloadBlockRow['keyLocations']

function normalizePayloadStartingPoint(
  value: PayloadBlockRow['startingPoint'],
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

function mapPayloadBlockRowToItem(item: PayloadBlockRow, index: number): ItineraryItemBlock {
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
    blurbMarkdown: item.blurb ? lexicalRichTextToMarkdown(item.blurb) : '',
    blurbLexical: item.blurb,
    blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
  }
}

function mapPayloadDayRowToSlice(
  doc: PayloadItineraryDoc,
  row: NonNullable<PayloadItineraryDoc['itineraryDays']>[number],
  dayIndex: number,
): ItineraryDaySlice {
  const rawItems = row.items || []
  const rawWhereStaying = row.whereStaying || []
  const lodgingFromItems = rawItems.filter((r) => r.blockType === 'itinerary-where-staying')
  const stopsOnly = rawItems.filter((r) => r.blockType !== 'itinerary-where-staying')
  const whereStayingRows = [...rawWhereStaying, ...lodgingFromItems]
  const base = dayIndex * 1000
  const whereStaying = whereStayingRows.map((r, i) => mapPayloadBlockRowToItem(r, base + i))
  const items = stopsOnly.map((r, i) => mapPayloadBlockRowToItem(r, base + 500 + i))
  const rowId = row && typeof row === 'object' && 'id' in row && typeof row.id === 'string' && row.id.trim()
    ? row.id
    : `day_${doc.id ?? 'new'}_${dayIndex}`
  return {
    id: rowId,
    whereStaying,
    items,
  }
}

function mapLegacyTopLevelToDays(doc: PayloadItineraryDoc): ItineraryDaySlice[] {
  const rawItems = doc.items || []
  const rawWhereStaying = doc.whereStaying || []
  const lodgingFromItems = rawItems.filter((row) => row.blockType === 'itinerary-where-staying')
  const stopsOnly = rawItems.filter((row) => row.blockType !== 'itinerary-where-staying')
  const whereStayingRows = [...rawWhereStaying, ...lodgingFromItems]
  const whereStaying = whereStayingRows.map((row, index) => mapPayloadBlockRowToItem(row, index))
  const items = stopsOnly.map((row, index) => mapPayloadBlockRowToItem(row, index))
  return [
    {
      id: `day_${doc.id ?? 'legacy'}`,
      whereStaying,
      items,
    },
  ]
}

function mapDocToDaysAndCount(doc: PayloadItineraryDoc): {
  dayCount: number
  days: ItineraryDaySlice[]
} {
  const rows = doc.itineraryDays
  if (Array.isArray(rows) && rows.length > 0) {
    const days = rows.map((row, dayIndex) => mapPayloadDayRowToSlice(doc, row, dayIndex))
    return {
      dayCount: Math.min(7, Math.max(1, days.length)),
      days,
    }
  }
  return {
    dayCount: 1,
    days: mapLegacyTopLevelToDays(doc),
  }
}

export function payloadDocToDraft(doc: PayloadItineraryDoc, existingDraftId?: string): ListicleItineraryDraft {
  const { dayCount, days } = mapDocToDaysAndCount(doc)

  const hasStep2Content = Boolean(
    (doc.header?.intro && typeof doc.header.intro === 'object')
    || getRelationshipId(doc.header?.featuredImage),
  )
  const hasStep3Content = days.some((d) => d.whereStaying.length > 0 || d.items.length > 0)
  const normalizedSeoSection = normalizeSeoSection(doc.seoSection || createEmptySeoSection())

  const draft: ListicleItineraryDraft = {
    draftId: existingDraftId || `lit_payload_${doc.id}`,
    ...buildPayloadItineraryMetadataPatch({
      doc,
      fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
    }),
    hasLocalChanges: false,
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
      introMarkdown: doc.header?.intro ? lexicalRichTextToMarkdown(doc.header.intro) : '',
      introLexical: doc.header?.intro,
      introJsonText: doc.header?.intro ? JSON.stringify(doc.header.intro, null, 2) : '',
      featuredImage: getRelationshipId(doc.header?.featuredImage),
    },
    dayCount,
    days,
    seoSection: normalizedSeoSection,
    status: doc.status || 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: doc.updatedAt || new Date().toISOString(),
  }

  return {
    ...draft,
    payloadSyncBaseline: buildItineraryDraftSyncSignature(draft),
  }
}
