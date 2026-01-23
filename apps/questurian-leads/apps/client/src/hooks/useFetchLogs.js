import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { fetchLogsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function buildLogParams(filters) {
  const params = {};
  if (filters?.feed_id) params.feed_id = filters.feed_id;
  if (filters?.status) params.status = filters.status;
  return params;
}

export function useFetchLogsList(filters) {
  return useQuery({
    queryKey: queryKeys.fetchLogsList(filters),
    queryFn: () => fetchLogsApi.getAll(buildLogParams(filters)),
    placeholderData: keepPreviousData,
  });
}

export function useDeleteFetchLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => fetchLogsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['fetchLogs', 'list'] });
      const previous = queryClient.getQueriesData({ queryKey: ['fetchLogs', 'list'] });

      queryClient.setQueriesData({ queryKey: ['fetchLogs', 'list'] }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (!context?.previous) return;
      context.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['fetchLogs', 'list'] });
    },
  });
}
