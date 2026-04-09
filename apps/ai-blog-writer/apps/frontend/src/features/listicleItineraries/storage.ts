import { DEFAULT_EDITOR_ASSIST_MODEL } from '../staging/api/ai/models'
import { createEmptySeoSection, normalizeSeoSection } from './builder/services/seo-section.service'
import {
  isRelatedItemCollection,
  isTourAgencyPriceTier,
  type ItineraryItemBlock,
  type ListicleItineraryDraft,
  type TourAgencyKeyLocationRow,
  type TourAgencyStartingPoint,
} from './types'
import { DEFAULT_TRIP_INTENT, normalizeTripIntent } from '../trip-intent'
import { normalizeLocationIds } from '../locationScope/scope'

const STORAGE_KEY = 'listicle_itineraries_staged_v6_tour_agency_normalized_fields'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

function normalizeStoredDraft(value: unknown, index: number): ListicleItineraryDraft | null {
  if (!isRecord(value)) return null

  const nowIso = new Date().toISOString()
  const fallbackDraftId = `lit_migrated_${Date.now()}_${index}`
  const header = isRecord(value.header) ? value.header : {}
  const normalizedDraftId =
    typeof value.draftId === 'string' && value.draftId.trim() ? value.draftId : fallbackDraftId

  const normalizeStoredKeyLocation = (
    rowValue: unknown,
    itemId: string,
    rowIndex: number,
  ): TourAgencyKeyLocationRow | null => {
    if (!isRecord(rowValue)) return null

    const relatedItemValue = isRecord(rowValue.relatedItem) ? rowValue.relatedItem : {}
    const rawRelatedItem = rowValue.relatedItem

    return {
      id: typeof rowValue.id === 'string' && rowValue.id.trim()
        ? rowValue.id
        : `${itemId}_key_location_${rowIndex}`,
      source: rowValue.source === 'manual' ? 'manual' : 'existing',
      relatedCollection: isRelatedItemCollection(rowValue.relatedCollection)
        ? rowValue.relatedCollection
        : isRelatedItemCollection(relatedItemValue.relationTo)
        ? relatedItemValue.relationTo
        : null,
      relatedItem: typeof rawRelatedItem === 'number'
        ? rawRelatedItem
        : typeof relatedItemValue.value === 'number'
        ? relatedItemValue.value
        : isRecord(relatedItemValue.value) && typeof relatedItemValue.value.id === 'number'
          ? relatedItemValue.value.id
          : null,
      title: typeof rowValue.title === 'string' ? rowValue.title : '',
      latitude:
        typeof rowValue.latitude === 'string'
          ? rowValue.latitude
          : typeof rowValue.latitude === 'number'
            ? String(rowValue.latitude)
            : '',
      longitude:
        typeof rowValue.longitude === 'string'
          ? rowValue.longitude
          : typeof rowValue.longitude === 'number'
            ? String(rowValue.longitude)
            : '',
    }
  }

  const normalizeStoredStartingPoint = (startingPointValue: unknown): TourAgencyStartingPoint => {
    if (!isRecord(startingPointValue)) {
      return {
        label: '',
        latitude: '',
        longitude: '',
      }
    }

    return {
      label: typeof startingPointValue.label === 'string' ? startingPointValue.label : '',
      latitude:
        typeof startingPointValue.latitude === 'string'
          ? startingPointValue.latitude
          : typeof startingPointValue.latitude === 'number'
            ? String(startingPointValue.latitude)
            : '',
      longitude:
        typeof startingPointValue.longitude === 'string'
          ? startingPointValue.longitude
          : typeof startingPointValue.longitude === 'number'
            ? String(startingPointValue.longitude)
            : '',
    }
  }

  const normalizeStoredItem = (itemValue: unknown, itemIndex: number): ItineraryItemBlock | null => {
    if (!isRecord(itemValue)) return null

    const itemId = typeof itemValue.id === 'string' && itemValue.id.trim()
      ? itemValue.id
      : `${normalizedDraftId}_item_${itemIndex}`

    return {
      id: itemId,
      blockType:
        itemValue.blockType === 'itinerary-accommodations'
        || itemValue.blockType === 'itinerary-attractions'
        || itemValue.blockType === 'itinerary-nightlife'
        || itemValue.blockType === 'itinerary-key-location'
        || itemValue.blockType === 'itinerary-tour-agency'
          ? itemValue.blockType
          : 'itinerary-dining',
      item: typeof itemValue.item === 'number' ? itemValue.item : null,
      mediaMode:
        itemValue.mediaMode === 'instagram'
        || itemValue.mediaMode === 'both'
          ? itemValue.mediaMode
          : 'photos',
      selectedPhotos: Array.isArray(itemValue.selectedPhotos)
        ? itemValue.selectedPhotos.filter((entry): entry is number => typeof entry === 'number')
        : [],
      selectedInstagramPost: typeof itemValue.selectedInstagramPost === 'number'
        ? itemValue.selectedInstagramPost
        : null,
      timeHour: typeof itemValue.timeHour === 'number' ? itemValue.timeHour : 9,
      timeMinute:
        itemValue.timeMinute === '15'
        || itemValue.timeMinute === '30'
        || itemValue.timeMinute === '45'
          ? itemValue.timeMinute
          : '00',
      timePeriod: itemValue.timePeriod === 'PM' ? 'PM' : 'AM',
      durationHours: typeof itemValue.durationHours === 'number' ? itemValue.durationHours : 1,
      durationMinutes:
        itemValue.durationMinutes === '15'
        || itemValue.durationMinutes === '30'
        || itemValue.durationMinutes === '45'
          ? itemValue.durationMinutes
          : '0',
      title: typeof itemValue.title === 'string' ? itemValue.title : '',
      operator: typeof itemValue.operator === 'string' ? itemValue.operator : '',
      price: isTourAgencyPriceTier(itemValue.price) ? itemValue.price : '',
      url: typeof itemValue.url === 'string' ? itemValue.url : '',
      tourDuration:
        typeof itemValue.tourDuration === 'number'
        && Number.isInteger(itemValue.tourDuration)
        && itemValue.tourDuration >= 1
        && itemValue.tourDuration <= 24
          ? itemValue.tourDuration
          : 1,
      startingPoint: normalizeStoredStartingPoint(itemValue.startingPoint),
      keyLocations: Array.isArray(itemValue.keyLocations)
        ? itemValue.keyLocations
            .map((row, rowIndex) => normalizeStoredKeyLocation(row, itemId, rowIndex))
            .filter((row): row is TourAgencyKeyLocationRow => Boolean(row))
        : [],
      image: typeof itemValue.image === 'number' ? itemValue.image : null,
      instagramPost: typeof itemValue.instagramPost === 'number' ? itemValue.instagramPost : null,
      blurbMarkdown: typeof itemValue.blurbMarkdown === 'string' ? itemValue.blurbMarkdown : '',
      blurbLexical: isRecord(itemValue.blurbLexical) ? itemValue.blurbLexical : undefined,
      blurbJsonText: typeof itemValue.blurbJsonText === 'string' ? itemValue.blurbJsonText : '',
    }
  }

  return {
    draftId: normalizedDraftId,
    payloadId: typeof value.payloadId === 'number' ? value.payloadId : undefined,
    payloadStatus: value.payloadStatus === 'published' ? 'published' : value.payloadStatus === 'draft' ? 'draft' : undefined,
    payloadSlug: typeof value.payloadSlug === 'string' && value.payloadSlug.trim() ? value.payloadSlug : undefined,
    payloadPublishedAt: typeof value.payloadPublishedAt === 'string' && value.payloadPublishedAt.trim() ? value.payloadPublishedAt : undefined,
    payloadUpdatedAt: typeof value.payloadUpdatedAt === 'string' && value.payloadUpdatedAt.trim() ? value.payloadUpdatedAt : undefined,
    payloadAuthorName: typeof value.payloadAuthorName === 'string' && value.payloadAuthorName.trim() ? value.payloadAuthorName : undefined,
    editorModelName: typeof value.editorModelName === 'string'
      ? value.editorModelName as ListicleItineraryDraft['editorModelName']
      : DEFAULT_EDITOR_ASSIST_MODEL,
    title: typeof value.title === 'string' ? value.title : '',
    location: typeof value.location === 'string' ? value.location : '',
    locationRef: typeof value.locationRef === 'number' ? value.locationRef : null,
    sharedNeighborhoods: normalizeLocationIds(value.sharedNeighborhoods),
    dayAudience:
      value.dayAudience === 'anyday'
      || value.dayAudience === 'weekday'
      || value.dayAudience === 'weekend'
        ? value.dayAudience
        : '',
    itineraryStartHour: typeof value.itineraryStartHour === 'number' ? value.itineraryStartHour : 9,
    itineraryStartMinute:
      value.itineraryStartMinute === '00'
      || value.itineraryStartMinute === '15'
      || value.itineraryStartMinute === '30'
      || value.itineraryStartMinute === '45'
        ? value.itineraryStartMinute
        : '00',
    itineraryStartPeriod: value.itineraryStartPeriod === 'PM' ? 'PM' : 'AM',
    itineraryEndHour: typeof value.itineraryEndHour === 'number' ? value.itineraryEndHour : 6,
    itineraryEndMinute:
      value.itineraryEndMinute === '00'
      || value.itineraryEndMinute === '15'
      || value.itineraryEndMinute === '30'
      || value.itineraryEndMinute === '45'
        ? value.itineraryEndMinute
        : '00',
    itineraryEndPeriod: value.itineraryEndPeriod === 'AM' ? 'AM' : 'PM',
    tripIntent: normalizeTripIntent(value.tripIntent),
    step1_complete: Boolean(value.step1_complete),
    in_update_mode: Boolean(value.in_update_mode),
    step2_complete: Boolean(value.step2_complete),
    step2_in_update_mode: Boolean(value.step2_in_update_mode),
    step3_complete: Boolean(value.step3_complete),
    step3_in_update_mode: Boolean(value.step3_in_update_mode),
    header: {
      introMarkdown: typeof header.introMarkdown === 'string' ? header.introMarkdown : '',
      introLexical: isRecord(header.introLexical) ? header.introLexical : undefined,
      introJsonText: typeof header.introJsonText === 'string' ? header.introJsonText : '',
      featuredImage: typeof header.featuredImage === 'number' ? header.featuredImage : null,
    },
    items: Array.isArray(value.items)
      ? value.items
          .map((item, itemIndex) => normalizeStoredItem(item, itemIndex))
          .filter((item): item is ItineraryItemBlock => Boolean(item))
      : [],
    seoSection: normalizeSeoSection(value.seoSection ?? createEmptySeoSection()),
    status: value.status === 'published' ? 'published' : 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso,
  }
}

export function listDrafts(): ListicleItineraryDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((draft, index) => normalizeStoredDraft(draft, index))
      .filter((draft): draft is ListicleItineraryDraft => Boolean(draft))
  } catch {
    return []
  }
}

export function saveDraft(draft: ListicleItineraryDraft): void {
  const all = listDrafts()
  const index = all.findIndex((item) => item.draftId === draft.draftId)
  const next = {
    ...draft,
    updatedAt: new Date().toISOString(),
  }

  if (index >= 0) {
    all[index] = next
  } else {
    all.push(next)
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function removeDraft(draftId: string): void {
  const all = listDrafts()
  const next = all.filter((item) => item.draftId !== draftId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function findDraftByPayloadId(payloadId: number): ListicleItineraryDraft | null {
  const all = listDrafts()
  return all.find((item) => item.payloadId === payloadId) || null
}

export function findDraftByDraftId(draftId: string): ListicleItineraryDraft | null {
  const all = listDrafts()
  return all.find((item) => item.draftId === draftId) || null
}

export function createEmptyDraft(): ListicleItineraryDraft {
  return {
    draftId: `lit_${Date.now()}`,
    payloadStatus: undefined,
    payloadSlug: undefined,
    payloadPublishedAt: undefined,
    payloadUpdatedAt: undefined,
    payloadAuthorName: undefined,
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    title: '',
    location: '',
    locationRef: null,
    sharedNeighborhoods: [],
    dayAudience: '',
    itineraryStartHour: 9,
    itineraryStartMinute: '00',
    itineraryStartPeriod: 'AM',
    itineraryEndHour: 6,
    itineraryEndMinute: '00',
    itineraryEndPeriod: 'PM',
    tripIntent: [...DEFAULT_TRIP_INTENT],
    step1_complete: false,
    in_update_mode: false,
    step2_complete: false,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: {
      introMarkdown: '',
      introJsonText: '',
      featuredImage: null,
    },
    items: [],
    seoSection: createEmptySeoSection(),
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: new Date().toISOString(),
  }
}
