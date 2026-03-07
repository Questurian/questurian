import { DEFAULT_EDITOR_ASSIST_MODEL } from '../staging/api/ai/models'
import { createEmptySeoSection, normalizeSeoSection } from './builder/services/seo-section.service'
import type { ListicleItineraryDraft } from './types'
import { DEFAULT_TRIP_INTENT, normalizeTripIntent } from '../trip-intent'

const STORAGE_KEY = 'listicle_itineraries_staged_v3_inline_seo'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

function normalizeStoredDraft(value: unknown, index: number): ListicleItineraryDraft | null {
  if (!isRecord(value)) return null

  const nowIso = new Date().toISOString()
  const fallbackDraftId = `lit_migrated_${Date.now()}_${index}`
  const header = isRecord(value.header) ? value.header : {}

  return {
    draftId: typeof value.draftId === 'string' && value.draftId.trim() ? value.draftId : fallbackDraftId,
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
    items: Array.isArray(value.items) ? value.items as ListicleItineraryDraft['items'] : [],
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
