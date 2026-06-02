import { useCallback, useEffect, useState } from 'react'
import type { StagedArticle } from '../../staging/types'
import {
  getAllStagedArticles,
  removeStagedArticle,
} from '../../staging/features/editorial-stage-article/services/editorial-stage-storage.service'

function loadLocalDrafts(storageKey: string): StagedArticle[] {
  return getAllStagedArticles(storageKey).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export type UseLocalStagedDraftsResult = {
  localDrafts: StagedArticle[]
  refresh: () => void
  discardLocalDraft: (stagedId: string) => void
}

/**
 * Owns the locally-staged drafts list for a given storage key, keeping it in sync
 * with `localStorage` mutations from other tabs (`storage` event) and window focus.
 */
export function useLocalStagedDrafts(storageKey: string): UseLocalStagedDraftsResult {
  const [localDrafts, setLocalDrafts] = useState<StagedArticle[]>(() => loadLocalDrafts(storageKey))

  const refresh = useCallback(() => {
    setLocalDrafts(loadLocalDrafts(storageKey))
  }, [storageKey])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === storageKey) {
        refresh()
      }
    }

    refresh()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', refresh)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', refresh)
    }
  }, [storageKey, refresh])

  const discardLocalDraft = useCallback(
    (stagedId: string) => {
      const confirmed = window.confirm('Discard this local draft? This cannot be undone.')
      if (!confirmed) return
      removeStagedArticle(storageKey, stagedId)
      setLocalDrafts(loadLocalDrafts(storageKey))
    },
    [storageKey],
  )

  return { localDrafts, refresh, discardLocalDraft }
}
