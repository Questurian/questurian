import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { batchFetchApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useBatchFetchCurrent() {
  return useQuery({
    queryKey: queryKeys.batchFetchCurrent,
    queryFn: () => batchFetchApi.getCurrent(),
    placeholderData: keepPreviousData,
    refetchInterval: (data) =>
      data && ['queued', 'running'].includes(data.status) ? 5000 : 30000,
    refetchIntervalInBackground: true,
    staleTime: 2000,
  });
}

export function useBatchFetchJobs(params = {}) {
  return useQuery({
    queryKey: queryKeys.batchFetchJobsList(params),
    queryFn: () => batchFetchApi.getAll(params),
    placeholderData: keepPreviousData,
    staleTime: 10000,
  });
}

export function useBatchFetchJob(jobId) {
  return useQuery({
    queryKey: queryKeys.batchFetchJob(jobId),
    queryFn: () => batchFetchApi.getById(jobId),
    enabled: Boolean(jobId),
  });
}

export function useStartBatchFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params = {}) => batchFetchApi.start(params),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batchFetchCurrent });
      queryClient.invalidateQueries({ queryKey: queryKeys.batchFetchJobs });
    },
  });
}
