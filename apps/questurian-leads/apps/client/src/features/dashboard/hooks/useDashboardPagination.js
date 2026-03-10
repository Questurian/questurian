import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DASHBOARD_PAGE_SIZE,
  DEFAULT_EMPTY_MESSAGE,
  FILTERED_EMPTY_MESSAGE,
} from '../constants/dashboard.constants';

export function useDashboardPagination({
  categoryFilter,
  queries,
  searchFilter,
  sortedItems,
}) {
  const [visibleCount, setVisibleCount] = useState(DASHBOARD_PAGE_SIZE);

  const totalCount = sortedItems.length;
  const isLoading =
    queries.leadsLoading ||
    queries.instagramPostsLoading ||
    queries.feedsLoading ||
    queries.instagramFeedsLoading ||
    queries.categoriesLoading ||
    queries.elComercioPostsLoading ||
    queries.elComercioFeedsLoading ||
    queries.diarioCorreoPostsLoading ||
    queries.diarioCorreoFeedsLoading ||
    queries.youtubePostsLoading ||
    queries.youtubeFeedsLoading ||
    queries.scrapesLoading;

  const isFetching =
    (queries.leadsFetching && !queries.leadsFetchingNextPage) ||
    (queries.instagramPostsFetching && !queries.instagramPostsFetchingNextPage) ||
    (queries.diarioCorreoPostsFetching &&
      !queries.diarioCorreoPostsFetchingNextPage) ||
    (queries.youtubePostsFetching && !queries.youtubePostsFetchingNextPage) ||
    (queries.elComercioPostsFetching &&
      !queries.elComercioPostsFetchingNextPage) ||
    (queries.scrapesFetching && !queries.scrapesFetchingNextPage);

  const isLoadingMore =
    queries.leadsFetchingNextPage ||
    queries.instagramPostsFetchingNextPage ||
    queries.diarioCorreoPostsFetchingNextPage ||
    queries.youtubePostsFetchingNextPage ||
    queries.elComercioPostsFetchingNextPage ||
    queries.scrapesFetchingNextPage;

  const hasMoreItems =
    queries.pagination.leads.hasNextPage ||
    queries.pagination.instagramPosts.hasNextPage ||
    queries.pagination.diarioCorreoPosts.hasNextPage ||
    queries.pagination.youtubePosts.hasNextPage ||
    queries.pagination.elComercioPosts.hasNextPage ||
    queries.pagination.scrapes.hasNextPage;

  const error =
    queries.leadsError ||
    queries.instagramPostsError ||
    queries.feedsError ||
    queries.instagramFeedsError ||
    queries.categoriesError ||
    queries.elComercioPostsError ||
    queries.elComercioFeedError ||
    queries.diarioCorreoPostsError ||
    queries.diarioCorreoFeedError ||
    queries.youtubePostsError ||
    queries.youtubeFeedsError ||
    queries.scrapesError;

  useEffect(() => {
    setVisibleCount(DASHBOARD_PAGE_SIZE);
  }, [categoryFilter, searchFilter]);

  const loadMoreItems = useCallback(() => {
    setVisibleCount((previous) => previous + DASHBOARD_PAGE_SIZE);

    Object.values(queries.pagination).forEach((entry) => {
      if (entry.hasNextPage && !entry.isFetchingNextPage) {
        entry.fetchNextPage();
      }
    });
  }, [queries.pagination]);

  const visibleItems = useMemo(
    () => sortedItems.slice(0, visibleCount),
    [sortedItems, visibleCount],
  );

  return {
    emptyMessage:
      categoryFilter || searchFilter
        ? FILTERED_EMPTY_MESSAGE
        : DEFAULT_EMPTY_MESSAGE,
    error,
    hasMoreItems,
    isFetching,
    isLoading,
    isLoadingMore,
    loadMoreItems,
    totalCount,
    visibleCount,
    visibleItems,
  };
}
