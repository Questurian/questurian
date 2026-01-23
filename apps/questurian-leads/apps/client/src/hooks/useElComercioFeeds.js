import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { elComercioFeedsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useElComercioFeeds() {
  return useQuery({
    queryKey: queryKeys.elComercioFeeds,
    queryFn: () => elComercioFeedsApi.getAll(),
  });
}

export function useFetchElComercioFeed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => elComercioFeedsApi.fetch(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.elComercioFeeds });
      queryClient.invalidateQueries({ queryKey: ['elComercioPosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['elComercioPosts', 'infinite'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapes });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useFetchAllElComercioFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => elComercioFeedsApi.fetchAll(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.elComercioFeeds });
      queryClient.invalidateQueries({ queryKey: ['elComercioPosts', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['elComercioPosts', 'infinite'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapes });
      queryClient.invalidateQueries({ queryKey: ['approval'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
