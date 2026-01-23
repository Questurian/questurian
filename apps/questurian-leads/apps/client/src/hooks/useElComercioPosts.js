import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { elComercioPostsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function buildElComercioParams(filters) {
  const params = {};
  if (filters?.search) params.search = filters.search;
  if (filters?.el_comercio_feed_id) params.el_comercio_feed_id = filters.el_comercio_feed_id;
  if (filters?.approval_status) params.approval_status = filters.approval_status;
  if (filters?.country) params.country = filters.country;
  if (filters?.limit != null && filters.limit !== '') params.limit = filters.limit;
  if (filters?.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

export function useElComercioPostsList(filters) {
  return useQuery({
    queryKey: queryKeys.elComercioPostsList(filters),
    queryFn: () => elComercioPostsApi.getAll(buildElComercioParams(filters)),
    placeholderData: keepPreviousData,
  });
}

export function useInfiniteElComercioPostsList(filters, limit = 30) {
  return useInfiniteQuery({
    queryKey: queryKeys.elComercioPostsInfinite({ ...filters, limit }),
    queryFn: ({ pageParam = 0 }) => elComercioPostsApi.getAll(
      buildElComercioParams({ ...filters, limit, offset: pageParam })
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

export function useDeleteElComercioPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => elComercioPostsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['elComercioPosts', 'list'] });
      await queryClient.cancelQueries({ queryKey: ['elComercioPosts', 'infinite'] });
      const previous = queryClient.getQueriesData({ queryKey: ['elComercioPosts', 'list'] });
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['elComercioPosts', 'infinite'] });

      queryClient.setQueriesData({ queryKey: ['elComercioPosts', 'list'] }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );
      queryClient.setQueriesData({ queryKey: ['elComercioPosts', 'infinite'] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            Array.isArray(page) ? page.filter((item) => item.id !== id) : page
          ),
        };
      });

      return { previous, previousInfinite };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousInfinite) {
        context.previousInfinite.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['elComercioPosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['elComercioPosts', 'infinite'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
