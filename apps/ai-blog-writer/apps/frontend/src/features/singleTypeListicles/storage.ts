import { DEFAULT_EDITOR_ASSIST_MODEL } from '../staging/api/ai/models'
import type { SingleTypeListicleDraft } from './types'

const STORAGE_KEY = 'single_type_listicles_staged'

export function listDrafts(): SingleTypeListicleDraft[] {
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

export function saveDraft(draft: SingleTypeListicleDraft): void {
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

export function findDraftByPayloadId(payloadId: number): SingleTypeListicleDraft | null {
  const all = listDrafts()
  return all.find((item) => item.payloadId === payloadId) || null
}

export function findDraftByDraftId(draftId: string): SingleTypeListicleDraft | null {
  const all = listDrafts()
  return all.find((item) => item.draftId === draftId) || null
}

export function createEmptyDraft(): SingleTypeListicleDraft {
  return {
    draftId: `stl_${Date.now()}`,
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    title: '',
    location: '',
    locationRef: null,
    listicleType: '',
    targetItemCount: 6,
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
    articleType: 'single-type-listicle',
    updatedAt: new Date().toISOString(),
  }
}
