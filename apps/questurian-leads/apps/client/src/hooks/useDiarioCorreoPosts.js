import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { diarioCorreoPostsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function buildDiarioCorreoParams(filters) {
  const params = {};
  if (filters?.search) params.search = filters.search;
  if (filters?.diario_correo_feed_id) params.diario_correo_feed_id = filters.diario_correo_feed_id;
  if (filters?.approval_status) params.approval_status = filters.approval_status;
  if (filters?.country) params.country = filters.country;
  if (filters?.limit != null && filters.limit !== '') params.limit = filters.limit;
  if (filters?.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

export function useDiarioCorreoPostsList(filters) {
  return useQuery({
    queryKey: queryKeys.diarioCorreoPostsList(filters),
    queryFn: () => diarioCorreoPostsApi.getAll(buildDiarioCorreoParams(filters)),
    placeholderData: keepPreviousData,
  });
}

export function useInfiniteDiarioCorreoPostsList(filters, limit = 30) {
  return useInfiniteQuery({
    queryKey: queryKeys.diarioCorreoPostsInfinite({ ...filters, limit }),
    queryFn: ({ pageParam = 0 }) => diarioCorreoPostsApi.getAll(
      buildDiarioCorreoParams({ ...filters, limit, offset: pageParam })
    ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!Array.isArray(lastPage) || lastPage.length < limit) {
        return undefined;
      }
      return allPages.length * limit;
    },
  });
}
