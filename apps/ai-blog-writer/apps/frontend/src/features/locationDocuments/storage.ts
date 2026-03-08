import type { LocationDocumentDraft } from './types'
import { createEmptyLocationDraft } from './schema'

const STORAGE_KEY = 'location_documents_staged_v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStoredDraft(value: unknown, index: number): LocationDocumentDraft | null {
  if (!isRecord(value)) return null

  const emptyDraft = createEmptyLocationDraft()
  const nowIso = new Date().toISOString()
  const fallbackDraftId = `location_doc_migrated_${Date.now()}_${index}`

  return {
    ...emptyDraft,
    ...value,
    draftId: typeof value.draftId === 'string' && value.draftId.trim() ? value.draftId : fallbackDraftId,
    payloadId: typeof value.payloadId === 'number' ? value.payloadId : undefined,
    aiSourceNotes: typeof value.aiSourceNotes === 'string' ? value.aiSourceNotes : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso,
    guide: isRecord(value.guide)
      ? ({
          ...emptyDraft.guide,
          ...value.guide,
        } as LocationDocumentDraft['guide'])
      : emptyDraft.guide,
  }
}

export function listDrafts(): LocationDocumentDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((draft, index) => normalizeStoredDraft(draft, index))
      .filter((draft): draft is LocationDocumentDraft => Boolean(draft))
  } catch {
    return []
  }
}

export function saveDraft(draft: LocationDocumentDraft): void {
  const all = listDrafts()
  const nextDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
  }
  const index = all.findIndex((item) => item.draftId === draft.draftId)

  if (index >= 0) {
    all[index] = nextDraft
  } else {
    all.push(nextDraft)
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function removeDraft(draftId: string): void {
  const next = listDrafts().filter((item) => item.draftId !== draftId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function findDraftByDraftId(draftId: string): LocationDocumentDraft | null {
  return listDrafts().find((item) => item.draftId === draftId) || null
}

export function findDraftByPayloadId(payloadId: number): LocationDocumentDraft | null {
  return listDrafts().find((item) => item.payloadId === payloadId) || null
}

export const listLocationDrafts = listDrafts
export const saveLocationDraft = saveDraft
export const removeLocationDraft = removeDraft
export const findLocationDraftByDraftId = findDraftByDraftId
export const findLocationDraftByPayloadId = findDraftByPayloadId
export function createNewLocationDraft(): LocationDocumentDraft {
  return createEmptyLocationDraft()
}
