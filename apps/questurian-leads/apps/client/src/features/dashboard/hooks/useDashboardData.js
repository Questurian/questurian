import { useMemo } from 'react';
import { useDashboardFilters } from './useDashboardFilters';
import { useDashboardLookups } from './useDashboardLookups';
import { useDashboardPagination } from './useDashboardPagination';
import { useDashboardQueries } from './useDashboardQueries';
import {
  buildDashboardCombinedItems,
  sortDashboardItems,
} from '../utils/dashboardAggregation';
import { buildDashboardStats } from '../utils/dashboardStats';

export function useDashboardData() {
  const filters = useDashboardFilters();
  const queries = useDashboardQueries(filters);
  const { lookups, subredditPicks } = useDashboardLookups(queries);

  const combinedItems = useMemo(
    () =>
      buildDashboardCombinedItems({
        diarioCorreoPosts: queries.diarioCorreoPosts,
        elComercioPosts: queries.elComercioPosts,
        instagramPosts: queries.instagramPosts,
        leads: queries.leads,
        scrapes: queries.scrapes,
        youtubePosts: queries.youtubePosts,
      }),
    [
      queries.diarioCorreoPosts,
      queries.elComercioPosts,
      queries.instagramPosts,
      queries.leads,
      queries.scrapes,
      queries.youtubePosts,
    ],
  );

  const sortedItems = useMemo(
    () => sortDashboardItems(combinedItems),
    [combinedItems],
  );

  const pagination = useDashboardPagination({
    categoryFilter: filters.categoryFilter,
    queries,
    searchFilter: filters.searchFilter,
    sortedItems,
  });

  const stats = useMemo(
    () =>
      buildDashboardStats({
        combinedItems,
        diarioCorreoFeeds: queries.diarioCorreoFeeds,
        diarioCorreoPosts: queries.diarioCorreoPosts,
        elComercioFeeds: queries.elComercioFeeds,
        elComercioPosts: queries.elComercioPosts,
        feeds: queries.feeds,
        instagramFeeds: queries.instagramFeeds,
        instagramPosts: queries.instagramPosts,
        leads: queries.leads,
        scrapes: queries.scrapes,
        youtubeFeeds: queries.youtubeFeeds,
        youtubePosts: queries.youtubePosts,
      }),
    [
      combinedItems,
      queries.diarioCorreoFeeds,
      queries.diarioCorreoPosts,
      queries.elComercioFeeds,
      queries.elComercioPosts,
      queries.feeds,
      queries.instagramFeeds,
      queries.instagramPosts,
      queries.leads,
      queries.scrapes,
      queries.youtubeFeeds,
      queries.youtubePosts,
    ],
  );

  return {
    categories: queries.categories,
    categoriesLoading: queries.categoriesLoading,
    categoryFilter: filters.categoryFilter,
    emptyMessage: pagination.emptyMessage,
    error: pagination.error,
    hasMoreItems: pagination.hasMoreItems,
    isFetching: pagination.isFetching,
    isLoading: pagination.isLoading,
    isLoadingMore: pagination.isLoadingMore,
    loadMoreItems: pagination.loadMoreItems,
    lookups,
    searchFilter: filters.searchFilter,
    setCategoryFilter: filters.setCategoryFilter,
    setSearchFilter: filters.setSearchFilter,
    showTranslated: true,
    subredditPicks,
    subredditsError: queries.subredditsError,
    subredditsLoading: queries.subredditsLoading,
    stats,
    totalCount: pagination.totalCount,
    visibleCount: pagination.visibleCount,
    visibleItems: pagination.visibleItems,
  };
}
