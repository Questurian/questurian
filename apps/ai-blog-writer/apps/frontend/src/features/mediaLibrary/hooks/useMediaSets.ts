import { useQuery } from '@tanstack/react-query'
import {
  fetchAuditMediaSets,
  fetchMediaSets,
  fetchOrphanMediaAssets,
} from '../../../shared/api/payload/payload.api'
import type { BrowseFilters } from '../types'

export function useBrowseMediaSets(
  filters: BrowseFilters,
  page: number,
) {
  return useQuery({
    queryKey: ['media-library', 'browse', filters, page],
    queryFn: () =>
      fetchMediaSets({
        limit: 24,
        page,
        search: filters.search || undefined,
        status: filters.status || undefined,
        locationId: filters.locationId ?? undefined,
      }),
    placeholderData: (prev) => prev,
  })
}

export function useAuditMediaSets(page: number) {
  return useQuery({
    queryKey: ['media-library', 'audit', page],
    queryFn: () => fetchAuditMediaSets({ limit: 50, page }),
    placeholderData: (prev) => prev,
  })
}

export function useOrphanMediaAssets(page: number) {
  return useQuery({
    queryKey: ['media-library', 'orphans', page],
    queryFn: () => fetchOrphanMediaAssets({ limit: 50, page }),
    placeholderData: (prev) => prev,
  })
}
