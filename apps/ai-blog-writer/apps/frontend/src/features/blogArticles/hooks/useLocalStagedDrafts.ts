import { useCallback, useEffect, useState } from 'react'
import type { StagedArticle } from '../../staging/types'
import {
  clearAllStagedArticles,
  getAllStagedArticles,
  removeStagedArticle,
} from '../../staging/features/editorial-stage-article/services/editorial-stage-storage.service'
import { migrateLocalDraftsToServer } from '../../staging/features/editorial-stage-article/services/migrate-local-drafts.service'

async function loadLocalDrafts(storageKey: string): Promise<StagedArticle[]> {
  const drafts = await getAllStagedArticles(storageKey)
  return drafts.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export type UseLocalStagedDraftsResult = {
  localDrafts: StagedArticle[]
  isLoading: boolean
  error: string | null
  refresh: () => void
  discardLocalDraft: (stagedId: string) => Promise<void>
  clearAllLocalDrafts: () => Promise<void>
}

/**
 * Owns the locally-staged drafts list for a given storage key. Drafts are now
 * persisted server-side; on first mount any legacy localStorage drafts are
 * migrated up, and the list is refreshed on window focus so edits made elsewhere
 * (another tab/device) surface here.
 */
export function useLocalStagedDrafts(storageKey: string): UseLocalStagedDraftsResult {
  const [localDrafts, setLocalDrafts] = useState<StagedArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const drafts = await loadLocalDrafts(storageKey)
      setLocalDrafts(drafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts')
    } finally {
      setIsLoading(false)
    }
  }, [storageKey])

  useEffect(() => {
    let isCancelled = false

    const bootstrap = async () => {
      await migrateLocalDraftsToServer(storageKey)
      if (!isCancelled) await refresh()
    }

    void bootstrap()

    const handleFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      isCancelled = true
      window.removeEventListener('focus', handleFocus)
    }
  }, [storageKey, refresh])

  const discardLocalDraft = useCallback(
    async (stagedId: string) => {
      const confirmed = window.confirm('Discard this local draft? This cannot be undone.')
      if (!confirmed) return
      await removeStagedArticle(storageKey, stagedId)
      await refresh()
    },
    [storageKey, refresh],
  )

  const clearAllLocalDrafts = useCallback(async () => {
    await clearAllStagedArticles(storageKey)
    await refresh()
  }, [storageKey, refresh])

  return { localDrafts, isLoading, error, refresh: () => void refresh(), discardLocalDraft, clearAllLocalDrafts }
}
