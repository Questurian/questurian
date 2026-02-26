import { DEFAULT_EDITOR_ASSIST_MODEL } from '../staging/api/ai/models'
import type { ListicleItineraryDraft } from './types'

const STORAGE_KEY = 'listicle_itineraries_staged_v2_media'

export function listDrafts(): ListicleItineraryDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
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
    step1_complete: false,
    in_update_mode: false,
    header: {
      customTitle: '',
      introMarkdown: '',
      introJsonText: '',
      featuredImage: null,
    },
    items: [],
    seoSection: {
      seo: null,
    },
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: new Date().toISOString(),
  }
}
