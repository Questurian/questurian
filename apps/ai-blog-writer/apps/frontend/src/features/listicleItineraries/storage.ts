import { DEFAULT_EDITOR_ASSIST_MODEL, resolveEditorAssistModelName } from '../../shared/api/ai/models'
import { createDraftStorage } from '../../shared/builder/storage/createDraftStorage'
import { createEmptySeoSection, normalizeSeoSection } from './builder/services/seo-section.service'
import { DEFAULT_DAY_SHELL_ID, BUILT_IN_DAY_SHELLS } from './builder/constants/day-shells.constants'
import {
  createEmptyDaySlice,
  DEFAULT_LIST_TONE,
  isRelatedItemCollection,
  isTourAgencyPriceTier,
  resolveItineraryAngleForBlockType,
  resolveListTone,
  type ItineraryBlockType,
  type ItineraryItemBlock,
  type ItineraryDaySlice,
  type DayShellTemplate,
  type DayShellSlot,
  type ListicleItineraryDraft,
  type ShellSlotDaypart,
  type TourAgencyKeyLocationRow,
  type TourAgencyStartingPoint,
  type TravelerProfile,
  type TravelerProfileBudget,
} from './types'
import { normalizeLocationIds } from '../../shared/locationScope/ids'

const STORAGE_KEY = 'listicle_itineraries_staged_v7_multiday'
const DAY_SHELL_IDS = new Set<string>(BUILT_IN_DAY_SHELLS.map((shell) => shell.id))
const DAYPARTS = new Set<ShellSlotDaypart>(['morning', 'late_morning', 'lunch', 'afternoon', 'dinner', 'evening', 'nightlife'])
const SHELL_COLLECTIONS = new Set(['dining', 'accommodations', 'attractions', 'nightlife'])

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const TRAVELER_PROFILE_BUDGETS = new Set<TravelerProfileBudget>(['$', '$$', '$$$', '$$$$'])

function normalizeTravelerProfile(value: unknown): TravelerProfile | undefined {
  if (!isRecord(value)) return undefined
  const stringList = (raw: unknown): string[] => (
    Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : []
  )
  return {
    travelerTypes: stringList(value.travelerTypes),
    motivations: stringList(value.motivations),
    interests: stringList(value.interests),
    budget: typeof value.budget === 'string' && TRAVELER_PROFILE_BUDGETS.has(value.budget as TravelerProfileBudget)
      ? value.budget as TravelerProfileBudget
      : '',
    accommodations: stringList(value.accommodations),
    practicalNeeds: stringList(value.practicalNeeds),
    notes: typeof value.notes === 'string' ? value.notes : '',
    composedBrief: typeof value.composedBrief === 'string' ? value.composedBrief : '',
  }
}

function normalizeStoredDraft(value: unknown, index: number): ListicleItineraryDraft | null {
  if (!isRecord(value)) return null

  const nowIso = new Date().toISOString()
  const fallbackDraftId = `lit_migrated_${Date.now()}_${index}`
  const header = isRecord(value.header) ? value.header : {}
  const normalizedDraftId =
    typeof value.draftId === 'string' && value.draftId.trim() ? value.draftId : fallbackDraftId

  const normalizeDayShellSelections = (days: ItineraryDaySlice[]) => {
    const rawSelections = Array.isArray(value.dayShellSelections) ? value.dayShellSelections : []
    const customShellIds = new Set(normalizeCustomDayShells(value.customDayShells).map((shell) => shell.id))
    return days.map((day) => {
      const raw = rawSelections.find((entry) => (
        isRecord(entry)
        && typeof entry.dayId === 'string'
        && entry.dayId === day.id
      ))
      const shellId = isRecord(raw)
        && typeof raw.shellId === 'string'
        && (DAY_SHELL_IDS.has(raw.shellId) || customShellIds.has(raw.shellId))
        ? raw.shellId
        : DEFAULT_DAY_SHELL_ID
      return { dayId: day.id, shellId }
    })
  }

  const normalizeCustomSlot = (slotValue: unknown, slotIndex: number): DayShellSlot | null => {
    if (!isRecord(slotValue)) return null
    if (!DAYPARTS.has(slotValue.daypart as ShellSlotDaypart)) return null
    const acceptableCollections = Array.isArray(slotValue.acceptableCollections)
      ? slotValue.acceptableCollections.filter((entry): entry is DayShellSlot['acceptableCollections'][number] => (
          typeof entry === 'string' && SHELL_COLLECTIONS.has(entry)
        ))
      : []
    const preferredCollections = Array.isArray(slotValue.preferredCollections)
      ? slotValue.preferredCollections.filter((entry): entry is DayShellSlot['preferredCollections'][number] => (
          typeof entry === 'string' && SHELL_COLLECTIONS.has(entry)
        ))
      : acceptableCollections
    if (acceptableCollections.length < 1 || preferredCollections.length < 1) return null
    return {
      id: typeof slotValue.id === 'string' && slotValue.id.trim() ? slotValue.id : `custom_slot_${slotIndex}`,
      label: typeof slotValue.label === 'string' && slotValue.label.trim() ? slotValue.label : `Custom slot ${slotIndex + 1}`,
      daypart: slotValue.daypart as ShellSlotDaypart,
      acceptableCollections,
      preferredCollections,
      intentTags: Array.isArray(slotValue.intentTags)
        ? slotValue.intentTags.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        : [],
      avoidTags: Array.isArray(slotValue.avoidTags)
        ? slotValue.avoidTags.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        : undefined,
    }
  }

  function normalizeCustomDayShells(shellsValue: unknown): DayShellTemplate[] {
    if (!Array.isArray(shellsValue)) return []
    return shellsValue
      .map((shellValue, shellIndex): DayShellTemplate | null => {
        if (!isRecord(shellValue)) return null
        const rawId = typeof shellValue.id === 'string' ? shellValue.id.trim() : ''
        const slots = Array.isArray(shellValue.slots)
          ? shellValue.slots
              .map((slotValue, slotIndex) => normalizeCustomSlot(slotValue, slotIndex))
              .filter((slot): slot is DayShellSlot => Boolean(slot))
          : []
        if (!rawId || DAY_SHELL_IDS.has(rawId) || slots.length < 1) return null
        return {
          id: rawId,
          name: typeof shellValue.name === 'string' && shellValue.name.trim()
            ? shellValue.name.trim()
            : `Custom Shell ${shellIndex + 1}`,
          description: typeof shellValue.description === 'string' ? shellValue.description.trim() : '',
          slots,
        }
      })
      .filter((shell): shell is DayShellTemplate => Boolean(shell))
  }

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

    const blockType: ItineraryBlockType =
      itemValue.blockType === 'itinerary-accommodations'
      || itemValue.blockType === 'itinerary-where-staying'
      || itemValue.blockType === 'itinerary-attractions'
      || itemValue.blockType === 'itinerary-nightlife'
      || itemValue.blockType === 'itinerary-key-location'
      || itemValue.blockType === 'itinerary-tour-agency'
        ? itemValue.blockType
        : 'itinerary-dining'

    return {
      id: itemId,
      blockType,
      item: typeof itemValue.item === 'number' ? itemValue.item : null,
      tours: Array.isArray(itemValue.tours)
        ? itemValue.tours.filter((entry): entry is number => typeof entry === 'number')
        : [],
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
      angle: resolveItineraryAngleForBlockType(blockType, itemValue.angle),
      blurbMarkdown: typeof itemValue.blurbMarkdown === 'string' ? itemValue.blurbMarkdown : '',
      blurbLexical: isRecord(itemValue.blurbLexical) ? itemValue.blurbLexical : undefined,
      blurbJsonText: typeof itemValue.blurbJsonText === 'string' ? itemValue.blurbJsonText : '',
      selectionReason: typeof itemValue.selectionReason === 'string' ? itemValue.selectionReason : '',
      shellSlotId: typeof itemValue.shellSlotId === 'string' ? itemValue.shellSlotId : undefined,
      shellSlotLabel: typeof itemValue.shellSlotLabel === 'string' ? itemValue.shellSlotLabel : undefined,
      shellSlotDaypart:
        itemValue.shellSlotDaypart === 'morning'
        || itemValue.shellSlotDaypart === 'late_morning'
        || itemValue.shellSlotDaypart === 'lunch'
        || itemValue.shellSlotDaypart === 'afternoon'
        || itemValue.shellSlotDaypart === 'dinner'
        || itemValue.shellSlotDaypart === 'evening'
        || itemValue.shellSlotDaypart === 'nightlife'
          ? itemValue.shellSlotDaypart
          : undefined,
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
    hasLocalChanges: Boolean(value.hasLocalChanges),
    editorModelName: resolveEditorAssistModelName(
      typeof value.editorModelName === 'string' ? value.editorModelName : undefined,
    ),
    listTone: resolveListTone(value.listTone),
    generationBrief: typeof value.generationBrief === 'string' ? value.generationBrief : undefined,
    travelerProfile: normalizeTravelerProfile(value.travelerProfile),
    includeLodging: value.includeLodging !== false,
    planOverview: typeof value.planOverview === 'string' ? value.planOverview : undefined,
    customDayShells: normalizeCustomDayShells(value.customDayShells),
    title: typeof value.title === 'string' ? value.title : '',
    location: typeof value.location === 'string' ? value.location : '',
    locationRef: typeof value.locationRef === 'number' ? value.locationRef : null,
    sharedNeighborhoods: normalizeLocationIds(value.sharedNeighborhoods),
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
    ...(() => {
      if (Array.isArray(value.days) && value.days.length > 0) {
        const days: ItineraryDaySlice[] = value.days.map((dayVal: unknown, dayIndex: number) => {
          if (!isRecord(dayVal)) {
            return {
              ...createEmptyDaySlice(),
              id: `day_${normalizedDraftId}_${dayIndex}`,
            }
          }
          const rawWhere = Array.isArray(dayVal.whereStaying) ? dayVal.whereStaying : []
          const rawItems = Array.isArray(dayVal.items) ? dayVal.items : []
          const mappedWhere = rawWhere
            .map((item, itemIndex) => normalizeStoredItem(item, itemIndex))
            .filter((item): item is ItineraryItemBlock => Boolean(item))
          const mappedItems = rawItems
            .map((item, itemIndex) => normalizeStoredItem(item, itemIndex))
            .filter((item): item is ItineraryItemBlock => Boolean(item))
          const lodgingFromItems = mappedItems.filter((item) => item.blockType === 'itinerary-where-staying')
          const stops = mappedItems.filter((item) => item.blockType !== 'itinerary-where-staying')
          const dayId = typeof dayVal.id === 'string' && dayVal.id.trim()
            ? dayVal.id
            : `day_${normalizedDraftId}_${dayIndex}`
          return {
            id: dayId,
            whereStaying: [...mappedWhere, ...lodgingFromItems],
            items: stops,
          }
        })
        const dc = typeof value.dayCount === 'number'
          ? Math.min(7, Math.max(1, value.dayCount))
          : Math.min(7, Math.max(1, days.length))
        const slicedDays = days.slice(0, dc)
        return {
          dayCount: dc,
          days: slicedDays,
          dayShellSelections: normalizeDayShellSelections(slicedDays),
        }
      }
      const rawWhere = Array.isArray(value.whereStaying) ? value.whereStaying : []
      const rawItems = Array.isArray(value.items) ? value.items : []
      const mappedWhere = rawWhere
        .map((item, itemIndex) => normalizeStoredItem(item, itemIndex))
        .filter((item): item is ItineraryItemBlock => Boolean(item))
      const mappedItems = rawItems
        .map((item, itemIndex) => normalizeStoredItem(item, itemIndex))
        .filter((item): item is ItineraryItemBlock => Boolean(item))
      const lodgingFromItems = mappedItems.filter((item) => item.blockType === 'itinerary-where-staying')
      const stops = mappedItems.filter((item) => item.blockType !== 'itinerary-where-staying')
      return {
        dayCount: 1,
        days: [
          {
            id: `day_${normalizedDraftId}_0`,
            whereStaying: [...mappedWhere, ...lodgingFromItems],
            items: stops,
          },
        ],
        dayShellSelections: [{ dayId: `day_${normalizedDraftId}_0`, shellId: DEFAULT_DAY_SHELL_ID }],
      }
    })(),
    seoSection: normalizeSeoSection(value.seoSection ?? createEmptySeoSection()),
    status: value.status === 'published' ? 'published' : 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso,
  }
}

const storage = createDraftStorage<ListicleItineraryDraft>({
  storageKey: STORAGE_KEY,
  normalizeStoredDraft,
})

export const listDrafts = storage.listDrafts
export const removeDraft = storage.removeDraft
export const clearDrafts = storage.clearDrafts
export const findDraftByPayloadId = storage.findDraftByPayloadId
export const findDraftByDraftId = storage.findDraftByDraftId

export function saveDraft(draft: ListicleItineraryDraft): void {
  const persistableDraft = { ...draft }
  delete persistableDraft.payloadSyncBaseline
  storage.saveDraft(persistableDraft)
}

export function createEmptyDraft(): ListicleItineraryDraft {
  const day = createEmptyDaySlice()
  return {
    draftId: `lit_${Date.now()}`,
    payloadStatus: undefined,
    payloadSlug: undefined,
    payloadPublishedAt: undefined,
    payloadUpdatedAt: undefined,
    payloadAuthorName: undefined,
    hasLocalChanges: false,
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    listTone: DEFAULT_LIST_TONE,
    includeLodging: true,
    customDayShells: [],
    title: '',
    location: '',
    locationRef: null,
    sharedNeighborhoods: [],
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
    dayCount: 1,
    days: [day],
    dayShellSelections: [{ dayId: day.id, shellId: DEFAULT_DAY_SHELL_ID }],
    seoSection: createEmptySeoSection(),
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: new Date().toISOString(),
  }
}
