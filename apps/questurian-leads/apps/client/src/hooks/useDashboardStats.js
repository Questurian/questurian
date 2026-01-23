import { useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, feedsApi, leadsApi, tagsApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useDashboardStats() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: async () => {
      const [categories, feeds, tags, leads] = await Promise.all([
        queryClient.ensureQueryData({
          queryKey: queryKeys.categories,
          queryFn: () => categoriesApi.getAll(),
        }),
        queryClient.ensureQueryData({
          queryKey: queryKeys.feeds,
          queryFn: () => feedsApi.getAll(),
        }),
        queryClient.ensureQueryData({
          queryKey: queryKeys.tags,
          queryFn: () => tagsApi.getAll(),
        }),
        leadsApi.getAll({ limit: 1 }),
      ]);

      return {
        categories: categories.length,
        feeds: feeds.length,
        activeFeeds: feeds.filter((feed) => feed.is_active === 1).length,
        tags: tags.length,
        leads: leads.length,
      };
    },
  });
}
