import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instagramFeedsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useInstagramFeeds() {
  return useQuery({
    queryKey: queryKeys.instagramFeeds,
    queryFn: () => instagramFeedsApi.getAll(),
  });
}

export function useCreateInstagramFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => instagramFeedsApi.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.instagramFeeds, (old) =>
        Array.isArray(old) ? [...old, created] : [created]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useUpdateInstagramFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => instagramFeedsApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.instagramFeeds, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useDeleteInstagramFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => instagramFeedsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instagramFeeds });
      const previous = queryClient.getQueryData(queryKeys.instagramFeeds);

      queryClient.setQueryData(queryKeys.instagramFeeds, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.instagramFeeds, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useToggleInstagramFeedActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feed) => {
      if (feed.is_active === 1) {
        return instagramFeedsApi.deactivate(feed.id);
      }
      return instagramFeedsApi.activate(feed.id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.instagramFeeds, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchInstagramFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feedId) => instagramFeedsApi.fetch(feedId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramFeeds });
      queryClient.invalidateQueries({ queryKey: ['instagramPosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchAllInstagramFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => instagramFeedsApi.fetchAll(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramFeeds });
      queryClient.invalidateQueries({ queryKey: ['instagramPosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
