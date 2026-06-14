import { useCallback, useState } from 'react'
import type { PexelsOrientation } from '../external/external-images.types'

export type ProviderSearchController<P> = {
  query: string
  setQuery: (value: string) => void
  orientation: PexelsOrientation | ''
  setOrientation: (value: PexelsOrientation | '') => void
  results: P[]
  isSearching: boolean
  error: string | null
  run: () => Promise<void>
  reset: () => void
}

/**
 * One Unsplash/Pexels search controller. The shell instantiates it once per
 * provider. Replaces the per-provider query/orientation/results/error state that
 * was duplicated across all three legacy pickers.
 */
export function useProviderImageSearch<P>(
  searchFn: (
    query: string,
    params?: { perPage?: number; orientation?: PexelsOrientation },
  ) => Promise<{ photos: P[] }>,
  perPage = 18,
): ProviderSearchController<P> {
  const [query, setQuery] = useState('')
  const [orientation, setOrientation] = useState<PexelsOrientation | ''>('')
  const [results, setResults] = useState<P[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!query.trim()) return
    setIsSearching(true)
    setError(null)
    try {
      const res = await searchFn(query, { perPage, orientation: orientation || undefined })
      setResults(res.photos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [query, orientation, perPage, searchFn])

  const reset = useCallback(() => {
    setResults([])
    setError(null)
    setIsSearching(false)
  }, [])

  return { query, setQuery, orientation, setOrientation, results, isSearching, error, run, reset }
}
