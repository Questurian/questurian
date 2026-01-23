import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { leadsApi, translationApi } from '../api';
import { queryKeys } from '../api/queryKeys';

function buildLeadParams(filters) {
  const params = {};
  if (filters?.search) params.search = filters.search;
  if (filters?.category) params.category = filters.category;
  if (filters?.tag) params.tag = filters.tag;
  if (filters?.country) params.country = filters.country;
  if (filters?.feed_id) params.feed_id = filters.feed_id;
  if (filters?.sort) params.sort = filters.sort;
  if (filters?.limit != null && filters.limit !== '') params.limit = filters.limit;
  if (filters?.offset != null && filters.offset !== '') params.offset = filters.offset;
  return params;
}

export function useLeadsList(filters) {
  return useQuery({
    queryKey: queryKeys.leadsList(filters),
    queryFn: () => leadsApi.getAll(buildLeadParams(filters)),
    placeholderData: keepPreviousData,
  });
}

export function useInfiniteLeadsList(filters, limit = 30) {
  return useInfiniteQuery({
    queryKey: queryKeys.leadsInfinite({ ...filters, limit }),
    queryFn: ({ pageParam = 0 }) => leadsApi.getAll(
      buildLeadParams({ ...filters, limit, offset: pageParam })
    ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!Array.isArray(lastPage) || lastPage.length < limit) {
        return undefined;
      }
      return allPages.length * limit;
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => leadsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['leads', 'list'] });
      await queryClient.cancelQueries({ queryKey: ['leads', 'infinite'] });
      const previous = queryClient.getQueriesData({ queryKey: ['leads', 'list'] });
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['leads', 'infinite'] });

      queryClient.setQueriesData({ queryKey: ['leads', 'list'] }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );
      queryClient.setQueriesData({ queryKey: ['leads', 'infinite'] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            Array.isArray(page) ? page.filter((item) => item.id !== id) : page
          ),
        };
      });

      return { previous, previousInfinite };
    },
    onError: (_err, _id, context) => {
      if (!context?.previous) return;
      context.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      if (context?.previousInfinite) {
        context.previousInfinite.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['leads', 'infinite'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useTranslateLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filters) => translationApi.translateLeads(filters || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['leads', 'infinite'] });
    },
  });
}

export function useDetectLeadLanguages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (force = false) => translationApi.detectMissingLanguages(force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['leads', 'infinite'] });
    },
  });
}
