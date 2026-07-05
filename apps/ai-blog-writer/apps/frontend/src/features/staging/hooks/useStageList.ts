import { useCallback, useEffect, useState } from 'react'
import type { StagedArticle } from '../types'
import { getAllStagedArticles } from '../features/editorial-stage-article/services/editorial-stage-storage.service'

async function parseStagedArticles(storageKey: string): Promise<StagedArticle[]> {
  const drafts = await getAllStagedArticles(storageKey)
  return drafts.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export function useStageList(storageKey: string) {
  const [stagedArticles, setStagedArticles] = useState<StagedArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStagedArticles = useCallback(async () => {
    try {
      setError(null)
      const parsed = await parseStagedArticles(storageKey)
      setStagedArticles(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staged drafts')
    } finally {
      setIsLoading(false)
    }
  }, [storageKey])

  useEffect(() => {
    void loadStagedArticles()

    // Reload when another tab focuses back; drafts now live server-side so a
    // cross-tab `storage` event no longer fires for them, but focus keeps the
    // list fresh after edits made elsewhere.
    const handleFocus = () => {
      void loadStagedArticles()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadStagedArticles, storageKey])

  return {
    stagedArticles,
    isLoading,
    error,
    setStagedArticles,
  }
}
