import { useCallback, useEffect, useState } from 'react'
import type { StagedArticle } from '../types'
import { getAllStagedArticles } from '../features/editorial-stage-article/services/editorial-stage-storage.service'

function parseStagedArticles(storageKey: string): StagedArticle[] {
  return getAllStagedArticles(storageKey).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export function useStageList(storageKey: string) {
  const [stagedArticles, setStagedArticles] = useState<StagedArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadStagedArticles = useCallback(() => {
    const parsed = parseStagedArticles(storageKey)
    setStagedArticles(parsed)
    setIsLoading(false)
  }, [storageKey])

  useEffect(() => {
    loadStagedArticles()

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey) return
      loadStagedArticles()
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [loadStagedArticles, storageKey])

  return {
    stagedArticles,
    isLoading,
    setStagedArticles,
  }
}
