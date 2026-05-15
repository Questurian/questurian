import { useQuery } from '@tanstack/react-query'
import {
  fetchAuditMediaSets,
  fetchMediaSets,
  fetchOrphanMediaAssets,
} from '../../../shared/api/payload/payload.api'
import type { BrowseFilters } from '../types'

export function useBrowseMediaSets(
  token: string | undefined,
  filters: BrowseFilters,
  page: number,
) {
  return useQuery({
    queryKey: ['media-library', 'browse', filters, page],
    queryFn: () =>
      fetchMediaSets(token, {
        limit: 24,
        page,
        search: filters.search || undefined,
        status: filters.status || undefined,
        locationId: filters.locationId ?? undefined,
      }),
    enabled: !!token,
    placeholderData: (prev) => prev,
  })
}

export function useAuditMediaSets(token: string | undefined, page: number) {
  return useQuery({
    queryKey: ['media-library', 'audit', page],
    queryFn: () => fetchAuditMediaSets(token, { limit: 50, page }),
    enabled: !!token,
    placeholderData: (prev) => prev,
  })
}

export function useOrphanMediaAssets(token: string | undefined, page: number) {
  return useQuery({
    queryKey: ['media-library', 'orphans', page],
    queryFn: () => fetchOrphanMediaAssets(token, { limit: 50, page }),
    enabled: !!token,
    placeholderData: (prev) => prev,
  })
}
