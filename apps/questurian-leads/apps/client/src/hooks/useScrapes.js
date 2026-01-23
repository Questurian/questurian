import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { scrapesApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function buildScrapesParams(filters) {
  const params = {};
  if (filters?.search) params.search = filters.search;
  if (filters?.content_type) params.content_type = filters.content_type;
  if (filters?.approval_status) params.approval_status = filters.approval_status;
  if (filters?.country) params.country = filters.country;
  if (filters?.limit != null && filters.limit !== '') params.limit = filters.limit;
  if (filters?.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

export function useScrapesList(filters) {
  return useQuery({
    queryKey: queryKeys.scrapesList(filters),
    queryFn: () => scrapesApi.getAll(buildScrapesParams(filters)),
    placeholderData: keepPreviousData,
  });
}

export function useInfiniteScrapes(filters, limit = 30) {
  return useInfiniteQuery({
    queryKey: queryKeys.scrapesInfinite({ ...filters, limit }),
    queryFn: ({ pageParam = 0 }) => scrapesApi.getAll(
      buildScrapesParams({ ...filters, limit, offset: pageParam }),
    ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const items = lastPage?.items;
      if (!Array.isArray(items) || items.length < limit) {
        return undefined;
      }
      const totalCount = lastPage?.total_count ?? 0;
      const nextOffset = allPages.length * limit;
      return nextOffset >= totalCount ? undefined : nextOffset;
    },
  });
}
