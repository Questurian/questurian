import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { youtubePostsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function buildYouTubeParams(filters) {
  const params = {};
  if (filters?.search) params.search = filters.search;
  if (filters?.category) params.category = filters.category;
  if (filters?.country) params.country = filters.country;
  if (filters?.youtube_feed_id) params.youtube_feed_id = filters.youtube_feed_id;
  if (filters?.limit != null && filters.limit !== '') params.limit = filters.limit;
  if (filters?.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

export function useYouTubePostsList(filters) {
  return useQuery({
    queryKey: queryKeys.youtubePostsList(filters),
    queryFn: () => youtubePostsApi.getAll(buildYouTubeParams(filters)),
    placeholderData: keepPreviousData,
  });
}

export function useInfiniteYouTubePostsList(filters, limit = 30) {
  return useInfiniteQuery({
    queryKey: queryKeys.youtubePostsInfinite({ ...filters, limit }),
    queryFn: ({ pageParam = 0 }) => youtubePostsApi.getAll(
      buildYouTubeParams({ ...filters, limit, offset: pageParam })
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

export function useDeleteYouTubePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => youtubePostsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['youtubePosts', 'list'] });
      await queryClient.cancelQueries({ queryKey: ['youtubePosts', 'infinite'] });
      const previous = queryClient.getQueriesData({ queryKey: ['youtubePosts', 'list'] });
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['youtubePosts', 'infinite'] });

      queryClient.setQueriesData({ queryKey: ['youtubePosts', 'list'] }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );
      queryClient.setQueriesData({ queryKey: ['youtubePosts', 'infinite'] }, (old) => {
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
      queryClient.invalidateQueries({ queryKey: ['youtubePosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['youtubePosts', 'infinite'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useYouTubeTranscript(postId) {
  return useQuery({
    queryKey: ['youtubeTranscript', postId],
    queryFn: () => youtubePostsApi.getTranscript(postId),
    enabled: !!postId,
  });
}

export function useExtractYouTubeTranscript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId) => youtubePostsApi.extractTranscript(postId),
    onSuccess: (data, postId) => {
      queryClient.setQueryData(['youtubeTranscript', postId], data);
      queryClient.invalidateQueries({ queryKey: ['youtubePosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['youtubePosts', 'infinite'] });
    },
  });
}
