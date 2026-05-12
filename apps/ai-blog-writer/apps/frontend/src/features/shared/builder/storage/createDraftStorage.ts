type BaseDraft = {
  draftId: string
  payloadId?: number
  updatedAt: string
}

export type DraftStorage<TDraft extends BaseDraft> = {
  listDrafts: () => TDraft[]
  saveDraft: (draft: TDraft) => void
  removeDraft: (draftId: string) => void
  findDraftByPayloadId: (payloadId: number) => TDraft | null
  findDraftByDraftId: (draftId: string) => TDraft | null
}

export type CreateDraftStorageOptions<TDraft extends BaseDraft> = {
  storageKey: string
  normalizeStoredDraft: (value: unknown, index: number) => TDraft | null
}

export function createDraftStorage<TDraft extends BaseDraft>({
  storageKey,
  normalizeStoredDraft,
}: CreateDraftStorageOptions<TDraft>): DraftStorage<TDraft> {
  function parseDraftArray(): unknown[] {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function listDrafts(): TDraft[] {
    return parseDraftArray()
      .map((draft, index) => normalizeStoredDraft(draft, index))
      .filter((draft): draft is TDraft => Boolean(draft))
  }

  function saveDraft(draft: TDraft): void {
    const all = listDrafts()
    const index = all.findIndex((item) => item.draftId === draft.draftId)
    const next = { ...draft, updatedAt: new Date().toISOString() } as TDraft

    if (index >= 0) {
      all[index] = next
    } else {
      all.push(next)
    }

    localStorage.setItem(storageKey, JSON.stringify(all))
  }

  function removeDraft(draftId: string): void {
    const all = listDrafts()
    const next = all.filter((item) => item.draftId !== draftId)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  function findDraftByPayloadId(payloadId: number): TDraft | null {
    return listDrafts().find((item) => item.payloadId === payloadId) || null
  }

  function findDraftByDraftId(draftId: string): TDraft | null {
    return listDrafts().find((item) => item.draftId === draftId) || null
  }

  return { listDrafts, saveDraft, removeDraft, findDraftByPayloadId, findDraftByDraftId }
}
