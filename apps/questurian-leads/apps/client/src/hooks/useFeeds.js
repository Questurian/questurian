import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useFeeds() {
  return useQuery({
    queryKey: queryKeys.feeds,
    queryFn: () => feedsApi.getAll(),
  });
}

export function useCreateFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => feedsApi.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.feeds, (old) =>
        Array.isArray(old) ? [...old, created] : [created]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useUpdateFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => feedsApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.feeds, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useDeleteFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => feedsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feeds });
      const previous = queryClient.getQueryData(queryKeys.feeds);

      queryClient.setQueryData(queryKeys.feeds, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.feeds, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useToggleFeedActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feed) => {
      if (feed.is_active === 1) {
        return feedsApi.deactivate(feed.id);
      }
      return feedsApi.activate(feed.id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.feeds, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feedId) => feedsApi.fetch(feedId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeds });
      queryClient.invalidateQueries({ queryKey: ['fetchLogs'] });
      queryClient.invalidateQueries({ queryKey: ['leads', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchAllFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => feedsApi.fetchAll(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeds });
      queryClient.invalidateQueries({ queryKey: ['fetchLogs'] });
      queryClient.invalidateQueries({ queryKey: ['leads', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
