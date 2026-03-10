import type { LocationDocumentDraft } from './types'
import { createEmptyLocationDraft, sanitizeLocationDraftShape } from './schema'

const STORAGE_KEY = 'location_documents_staged_v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStoredDraft(value: unknown, index: number): LocationDocumentDraft | null {
  if (!isRecord(value)) return null

  const fallbackDraftId = `location_doc_migrated_${Date.now()}_${index}`
  const sanitized = sanitizeLocationDraftShape(value)

  return {
    ...sanitized,
    draftId: typeof value.draftId === 'string' && value.draftId.trim() ? value.draftId : fallbackDraftId,
    payloadId: typeof value.payloadId === 'number' && Number.isFinite(value.payloadId)
      ? value.payloadId
      : undefined,
    aiSourceNotes: typeof value.aiSourceNotes === 'string' ? value.aiSourceNotes : '',
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.trim()
      ? value.updatedAt
      : new Date().toISOString(),
  }
}

function getDraftTimestamp(value?: string): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function dedupeDrafts(drafts: LocationDocumentDraft[]): LocationDocumentDraft[] {
  const sorted = [...drafts].sort((left, right) => getDraftTimestamp(right.updatedAt) - getDraftTimestamp(left.updatedAt))
  const seenPayloadIds = new Set<number>()
  const deduped: LocationDocumentDraft[] = []

  for (const draft of sorted) {
    if (typeof draft.payloadId === 'number' && Number.isFinite(draft.payloadId)) {
      if (seenPayloadIds.has(draft.payloadId)) {
        continue
      }

      seenPayloadIds.add(draft.payloadId)
    }

    deduped.push(draft)
  }

  return deduped
}

function writeDrafts(drafts: LocationDocumentDraft[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeDrafts(drafts)))
}

export function listDrafts(): LocationDocumentDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const drafts = parsed
      .map((draft, index) => normalizeStoredDraft(draft, index))
      .filter((draft): draft is LocationDocumentDraft => Boolean(draft))
    const dedupedDrafts = dedupeDrafts(drafts)

    if (dedupedDrafts.length !== drafts.length) {
      writeDrafts(dedupedDrafts)
    }

    return dedupedDrafts
  } catch {
    return []
  }
}

export function saveDraft(draft: LocationDocumentDraft): void {
  const all = listDrafts()
  const sanitizedDraft = sanitizeLocationDraftShape(draft)
  const nextDraft = {
    ...sanitizedDraft,
    updatedAt: new Date().toISOString(),
  }
  const nextDrafts = all.filter((item) => item.draftId !== draft.draftId)
    .filter((item) => {
      if (typeof nextDraft.payloadId !== 'number' || !Number.isFinite(nextDraft.payloadId)) {
        return true
      }

      return item.payloadId !== nextDraft.payloadId
    })

  nextDrafts.push(nextDraft)
  writeDrafts(nextDrafts)
}

export function removeDraft(draftId: string): void {
  const next = listDrafts().filter((item) => item.draftId !== draftId)
  writeDrafts(next)
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
