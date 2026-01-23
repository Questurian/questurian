import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { youtubeFeedsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useYouTubeFeeds() {
  return useQuery({
    queryKey: queryKeys.youtubeFeeds,
    queryFn: () => youtubeFeedsApi.getAll(),
  });
}

export function useCreateYouTubeFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => youtubeFeedsApi.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.youtubeFeeds, (old) =>
        Array.isArray(old) ? [...old, created] : [created]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useUpdateYouTubeFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => youtubeFeedsApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.youtubeFeeds, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useDeleteYouTubeFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => youtubeFeedsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.youtubeFeeds });
      const previous = queryClient.getQueryData(queryKeys.youtubeFeeds);

      queryClient.setQueryData(queryKeys.youtubeFeeds, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.youtubeFeeds, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useToggleYouTubeFeedActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feed) => {
      if (feed.is_active === 1) {
        return youtubeFeedsApi.update(feed.id, { is_active: 0 });
      }
      return youtubeFeedsApi.update(feed.id, { is_active: 1 });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.youtubeFeeds, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchYouTubeFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ feedId, maxResults }) =>
      youtubeFeedsApi.fetch(feedId, maxResults ? { max_results: maxResults } : {}),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeeds });
      queryClient.invalidateQueries({ queryKey: ['youtubePosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchAllYouTubeFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (maxResults) =>
      youtubeFeedsApi.fetchAll(maxResults ? { max_results: maxResults } : {}),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeeds });
      queryClient.invalidateQueries({ queryKey: ['youtubePosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useSearchYouTubeChannel() {
  return useMutation({
    mutationFn: ({ query, maxResults }) =>
      youtubeFeedsApi.searchChannel(
        maxResults ? { query, max_results: maxResults } : { query }
      ),
  });
}
