import { useCallback, useEffect, useState } from 'react'
import type { StagedArticle } from '../types'

function parseStagedArticles(storageKey: string): StagedArticle[] {
  const stored = localStorage.getItem(storageKey)
  if (!stored) return []

  try {
    const parsed: StagedArticle[] = JSON.parse(stored)
    return parsed.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  } catch {
    return []
  }
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
