import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchMediaAssets, fetchMediaSets } from '../../api/payload/payload.api'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import type { ImagePickerQuery } from './imagePicker.types'
import { filterAssetsWithMediaSet } from './mediaSet.utils'

const PAGE_SIZE = 48

type UseImagePickerDataParams = {
  isOpen: boolean
  token?: string
  query: ImagePickerQuery
  /** Trimmed by the hook; drives server-side whole-library search. */
  search: string
  /** Selected entity to keep visible even if it's off the current page. */
  selectedId: number | null
}

export type ImagePickerData = {
  /** Assets to render (already `requireMediaSet`-filtered when configured). Empty in mediaSets mode. */
  assets: MediaAsset[]
  /** Media sets to render. Empty in assets mode. */
  mediaSets: MediaSet[]
  /** A fetch is in flight (first page or load-more). */
  isLoading: boolean
  /** First page is loading and nothing is shown yet — hold the shell stable. */
  isBootstrapping: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  retry: () => void
}

function dedupAssets(prev: MediaAsset[], next: MediaAsset[]): MediaAsset[] {
  const seen = new Set(prev.map((a) => a.id))
  return [...prev, ...next.filter((a) => !seen.has(a.id))]
}

function dedupMediaSets(prev: MediaSet[], next: MediaSet[]): MediaSet[] {
  const seen = new Set(prev.map((m) => String(m.id)))
  return [...prev, ...next.filter((m) => !seen.has(String(m.id)))]
}

/**
 * Owns the Payload-tab data fetching for the Image Picker: infinite scroll,
 * server-side whole-library search, selected-asset hydration, and dedup, for
 * both browse units. The single standardized loading strategy that replaces
 * FeaturedImagePicker's pagination, staging's bespoke infinite scroll, and
 * CoverImagePicker's load-all (ADR 0020).
 */
export function useImagePickerData({
  isOpen,
  token,
  query,
  search,
  selectedId,
}: UseImagePickerDataParams): ImagePickerData {
  const [rawAssets, setRawAssets] = useState<MediaAsset[]>([])
  const [mediaSets, setMediaSets] = useState<MediaSet[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Monotonic request id so stale responses (after a query/search change) are dropped.
  const requestSeq = useRef(0)

  const { browseUnit, variant, requireMediaSet } = query
  const exactWidth = query.exactDimensions?.width
  const exactHeight = query.exactDimensions?.height
  const minWidth = query.minDimensions?.width
  const minHeight = query.minDimensions?.height
  const trimmedSearch = search.trim()

  // Primitive reset key — refetch from page 1 whenever any filter or the search changes.
  const resetKey = `${browseUnit}|${variant ?? ''}|${exactWidth ?? ''}x${exactHeight ?? ''}|${minWidth ?? ''}x${minHeight ?? ''}|${requireMediaSet ? 1 : 0}|${trimmedSearch}`

  const loadPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      if (!isOpen) return
      const seq = ++requestSeq.current
      setIsLoading(true)
      setError(null)

      try {
        if (browseUnit === 'mediaSets') {
          const res = await fetchMediaSets(token, {
            limit: PAGE_SIZE,
            page: targetPage,
            search: trimmedSearch || undefined,
          })
          if (seq !== requestSeq.current) return
          setMediaSets((prev) => (mode === 'replace' ? res.docs : dedupMediaSets(prev, res.docs)))
          setRawAssets([])
          setTotalPages(Math.max(res.totalPages || 1, 1))
        } else {
          const res = await fetchMediaAssets(token, {
            limit: PAGE_SIZE,
            page: targetPage,
            mimeType: 'image/',
            variant,
            width: exactWidth,
            height: exactHeight,
            minWidth,
            minHeight,
            search: trimmedSearch || undefined,
          })
          if (seq !== requestSeq.current) return
          setRawAssets((prev) => (mode === 'replace' ? res.docs : dedupAssets(prev, res.docs)))
          setMediaSets([])
          setTotalPages(Math.max(res.totalPages || 1, 1))
        }
      } catch (err) {
        if (seq !== requestSeq.current) return
        setError(err instanceof Error ? err.message : 'Failed to load images')
      } finally {
        if (seq === requestSeq.current) setIsLoading(false)
      }
    },
    [isOpen, token, browseUnit, variant, exactWidth, exactHeight, minWidth, minHeight, trimmedSearch],
  )

  // Reset + load page 1 whenever the picker opens or the query/search changes.
  useEffect(() => {
    if (!isOpen) {
      requestSeq.current += 1 // invalidate any in-flight response
      setRawAssets([])
      setMediaSets([])
      setPage(1)
      setTotalPages(1)
      setError(null)
      setIsLoading(false)
      return
    }
    setPage(1)
    void loadPage(1, 'replace')
    // loadPage already depends on every reset input; resetKey keeps the intent explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, isOpen, token])

  const hasMore = page < totalPages

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return
    const next = page + 1
    setPage(next)
    void loadPage(next, 'append')
  }, [isLoading, hasMore, page, loadPage])

  const retry = useCallback(() => {
    void loadPage(page, page === 1 ? 'replace' : 'append')
  }, [loadPage, page])

  // Hydrate the selected entity if it isn't on a loaded page, so it stays visible/selected.
  useEffect(() => {
    if (!isOpen || selectedId === null || !token) return

    const present =
      browseUnit === 'mediaSets'
        ? mediaSets.some((m) => String(m.id) === String(selectedId))
        : rawAssets.some((a) => a.id === selectedId)
    if (present) return

    let cancelled = false
    const hydrate = async () => {
      try {
        if (browseUnit === 'mediaSets') {
          const res = await fetchMediaSets(token, { limit: 1, id: selectedId })
          const doc = res.docs[0]
          if (!cancelled && doc) {
            setMediaSets((prev) =>
              prev.some((m) => String(m.id) === String(doc.id)) ? prev : [doc, ...prev],
            )
          }
        } else {
          const res = await fetchMediaAssets(token, { limit: 1, id: selectedId })
          const doc = res.docs[0]
          if (!cancelled && doc) {
            setRawAssets((prev) => (prev.some((a) => a.id === doc.id) ? prev : [doc, ...prev]))
          }
        }
      } catch {
        // Ignore hydration failures — the selection just won't be pre-highlighted.
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedId, browseUnit, token, rawAssets, mediaSets])

  const assets = useMemo(
    () => (requireMediaSet ? filterAssetsWithMediaSet(rawAssets) : rawAssets),
    [requireMediaSet, rawAssets],
  )

  const visibleCount = browseUnit === 'mediaSets' ? mediaSets.length : assets.length

  return {
    assets,
    mediaSets,
    isLoading,
    isBootstrapping: isLoading && visibleCount === 0 && page === 1,
    error,
    hasMore,
    loadMore,
    retry,
  }
}
