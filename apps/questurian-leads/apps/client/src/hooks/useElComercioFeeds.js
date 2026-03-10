import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { elComercioFeedsApi } from '../api';
import { queryKeys } from '../api/queryKeys';
import { useElComercioCurrentScrapeJob } from './useScrapeJobs';

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
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapeJobsCurrent('el_comercio') });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapeJobs });
    },
  });
}

export function useFetchAllElComercioFeeds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => elComercioFeedsApi.fetchAll(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.elComercioFeeds });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapeJobsCurrent('el_comercio') });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapeJobs });
    },
  });
}

export { useElComercioCurrentScrapeJob };
