import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tagsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: () => tagsApi.getAll(),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => tagsApi.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.tags, (old) =>
        Array.isArray(old) ? [...old, created] : [created]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => tagsApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.tags, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => tagsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tags });
      const previous = queryClient.getQueryData(queryKeys.tags);

      queryClient.setQueryData(queryKeys.tags, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.tags, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
