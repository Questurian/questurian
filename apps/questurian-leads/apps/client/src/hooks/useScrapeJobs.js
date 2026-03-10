import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { scrapeJobsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function isActiveJob(job) {
  return job && ['queued', 'running'].includes(job.status);
}

function useInvalidateOnCompletedJob(job, keysToInvalidate) {
  const queryClient = useQueryClient();
  const lastCompletedRef = useRef('');

  useEffect(() => {
    if (!job || isActiveJob(job) || !job.finished_at) {
      return;
    }

    const token = `${job.id}:${job.finished_at}`;
    if (lastCompletedRef.current === token) {
      return;
    }
    lastCompletedRef.current = token;

    keysToInvalidate.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  }, [job, keysToInvalidate, queryClient]);
}

export function useCurrentScrapeJob(sourceType) {
  return useQuery({
    queryKey: queryKeys.scrapeJobsCurrent(sourceType),
    queryFn: () => scrapeJobsApi.getCurrent(sourceType ? { source_type: sourceType } : {}),
    enabled: sourceType !== undefined,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      isActiveJob(query.state.data) ? 5000 : 30000,
    refetchIntervalInBackground: true,
    staleTime: 2000,
  });
}

export function useScrapeJobs(params = {}) {
  return useQuery({
    queryKey: queryKeys.scrapeJobsList(params),
    queryFn: () => scrapeJobsApi.getAll(params),
    placeholderData: keepPreviousData,
    staleTime: 10000,
  });
}

export function useScrapeJob(jobId) {
  return useQuery({
    queryKey: queryKeys.scrapeJob(jobId),
    queryFn: () => scrapeJobsApi.getById(jobId),
    enabled: Boolean(jobId),
  });
}

export function useElComercioCurrentScrapeJob() {
  const query = useCurrentScrapeJob('el_comercio');
  useInvalidateOnCompletedJob(query.data, [
    queryKeys.elComercioFeeds,
    queryKeys.elComercioPosts,
    queryKeys.scrapes,
    ['approval'],
    queryKeys.dashboardStats,
  ]);
  return query;
}

export function useDiarioCurrentScrapeJob() {
  const query = useCurrentScrapeJob('diario_correo');
  useInvalidateOnCompletedJob(query.data, [
    queryKeys.diarioCorreoFeeds,
    queryKeys.diarioCorreoPosts,
    queryKeys.scrapes,
    ['approval'],
    queryKeys.dashboardStats,
  ]);
  return query;
}
