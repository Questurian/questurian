import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subredditsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useSubreddits() {
  return useQuery({
    queryKey: queryKeys.subreddits,
    queryFn: () => subredditsApi.getAll(),
  });
}

export function useCreateSubreddit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => subredditsApi.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.subreddits, (old) =>
        Array.isArray(old) ? [...old, created] : [created]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subreddits });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useUpdateSubreddit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => subredditsApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.subreddits, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subreddits });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useDeleteSubreddit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => subredditsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.subreddits });
      const previous = queryClient.getQueryData(queryKeys.subreddits);

      queryClient.setQueryData(queryKeys.subreddits, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.subreddits, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subreddits });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
