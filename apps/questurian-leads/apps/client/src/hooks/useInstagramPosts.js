import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { instagramPostsApi, translationApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function buildInstagramParams(filters) {
  const params = {};
  if (filters?.search) params.search = filters.search;
  if (filters?.category) params.category = filters.category;
  if (filters?.tag) params.tag = filters.tag;
  if (filters?.country) params.country = filters.country;
  if (filters?.instagram_feed_id) params.instagram_feed_id = filters.instagram_feed_id;
  if (filters?.limit != null && filters.limit !== '') params.limit = filters.limit;
  if (filters?.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

export function useInstagramPostsList(filters) {
  return useQuery({
    queryKey: queryKeys.instagramPostsList(filters),
    queryFn: () => instagramPostsApi.getAll(buildInstagramParams(filters)),
    placeholderData: keepPreviousData,
  });
}

export function useInfiniteInstagramPostsList(filters, limit = 30) {
  return useInfiniteQuery({
    queryKey: queryKeys.instagramPostsInfinite({ ...filters, limit }),
    queryFn: ({ pageParam = 0 }) => instagramPostsApi.getAll(
      buildInstagramParams({ ...filters, limit, offset: pageParam })
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

export function useDeleteInstagramPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => instagramPostsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['instagramPosts', 'list'] });
      await queryClient.cancelQueries({ queryKey: ['instagramPosts', 'infinite'] });
      const previous = queryClient.getQueriesData({ queryKey: ['instagramPosts', 'list'] });
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['instagramPosts', 'infinite'] });

      queryClient.setQueriesData({ queryKey: ['instagramPosts', 'list'] }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );
      queryClient.setQueriesData({ queryKey: ['instagramPosts', 'infinite'] }, (old) => {
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
      if (!context?.previous) return;
      context.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      if (context?.previousInfinite) {
        context.previousInfinite.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['instagramPosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['instagramPosts', 'infinite'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useTranslateInstagramPosts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filters) => translationApi.translateInstagramPosts(filters || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagramPosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['instagramPosts', 'infinite'] });
    },
  });
}
