import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diarioCorreoFeedsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useDiarioCorreoFeeds() {
  return useQuery({
    queryKey: queryKeys.diarioCorreoFeeds,
    queryFn: () => diarioCorreoFeedsApi.getAll(),
  });
}

export function useFetchDiarioCorreoFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => diarioCorreoFeedsApi.fetch(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diarioCorreoFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.diarioCorreoPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapes });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchAllDiarioCorreoFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => diarioCorreoFeedsApi.fetchAll(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diarioCorreoFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.diarioCorreoPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapes });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
