import {
  useCategories,
  useDiarioCorreoFeeds,
  useElComercioFeeds,
  useFeeds,
  useInfiniteDiarioCorreoPostsList,
  useInfiniteElComercioPostsList,
  useInfiniteInstagramPostsList,
  useInfiniteLeadsList,
  useInfiniteScrapes,
  useInfiniteYouTubePostsList,
  useInstagramFeeds,
  useSubreddits,
  useYouTubeFeeds,
} from '../../../hooks';
import {
  DASHBOARD_PAGE_SIZE,
  EL_COMERCIO_PAGE_SIZE,
  SCRAPES_PAGE_SIZE,
} from '../constants/dashboard.constants';

export function useDashboardQueries({
  categoryFilter,
  searchFilter,
}) {
  const leadsQuery = useInfiniteLeadsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const instagramPostsQuery = useInfiniteInstagramPostsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const youtubePostsQuery = useInfiniteYouTubePostsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const scrapesQuery = useInfiniteScrapes(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    SCRAPES_PAGE_SIZE,
  );

  const feedsQuery = useFeeds();
  const categoriesQuery = useCategories();
  const subredditsQuery = useSubreddits();
  const instagramFeedsQuery = useInstagramFeeds();

  const elComercioPostsQuery = useInfiniteElComercioPostsList(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    EL_COMERCIO_PAGE_SIZE,
  );

  const diarioCorreoPostsQuery = useInfiniteDiarioCorreoPostsList(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const elComercioFeedsQuery = useElComercioFeeds();
  const diarioCorreoFeedsQuery = useDiarioCorreoFeeds();
  const youtubeFeedsQuery = useYouTubeFeeds();

  return {
    categories: categoriesQuery.data || [],
    categoriesError: categoriesQuery.error,
    categoriesLoading: categoriesQuery.isLoading,
    diarioCorreoFeedError: diarioCorreoFeedsQuery.error,
    diarioCorreoFeeds: diarioCorreoFeedsQuery.data || [],
    diarioCorreoFeedsLoading: diarioCorreoFeedsQuery.isLoading,
    diarioCorreoPosts:
      diarioCorreoPostsQuery.data?.pages?.flat() ?? [],
    diarioCorreoPostsError: diarioCorreoPostsQuery.error,
    diarioCorreoPostsFetching:
      diarioCorreoPostsQuery.isFetching,
    diarioCorreoPostsFetchingNextPage:
      diarioCorreoPostsQuery.isFetchingNextPage,
    diarioCorreoPostsLoading: diarioCorreoPostsQuery.isLoading,
    elComercioFeedError: elComercioFeedsQuery.error,
    elComercioFeeds: elComercioFeedsQuery.data || [],
    elComercioFeedsLoading: elComercioFeedsQuery.isLoading,
    elComercioPosts:
      elComercioPostsQuery.data?.pages?.flat() ?? [],
    elComercioPostsError: elComercioPostsQuery.error,
    elComercioPostsFetching:
      elComercioPostsQuery.isFetching,
    elComercioPostsFetchingNextPage:
      elComercioPostsQuery.isFetchingNextPage,
    elComercioPostsLoading: elComercioPostsQuery.isLoading,
    feeds: feedsQuery.data || [],
    feedsError: feedsQuery.error,
    feedsLoading: feedsQuery.isLoading,
    instagramFeeds: instagramFeedsQuery.data || [],
    instagramFeedsError: instagramFeedsQuery.error,
    instagramFeedsLoading: instagramFeedsQuery.isLoading,
    instagramPosts: instagramPostsQuery.data?.pages?.flat() ?? [],
    instagramPostsError: instagramPostsQuery.error,
    instagramPostsFetching: instagramPostsQuery.isFetching,
    instagramPostsFetchingNextPage:
      instagramPostsQuery.isFetchingNextPage,
    instagramPostsLoading: instagramPostsQuery.isLoading,
    leads: leadsQuery.data?.pages?.flat() ?? [],
    leadsError: leadsQuery.error,
    leadsFetching: leadsQuery.isFetching,
    leadsFetchingNextPage: leadsQuery.isFetchingNextPage,
    leadsLoading: leadsQuery.isLoading,
    pagination: {
      diarioCorreoPosts: {
        fetchNextPage: diarioCorreoPostsQuery.fetchNextPage,
        hasNextPage: diarioCorreoPostsQuery.hasNextPage,
        isFetchingNextPage: diarioCorreoPostsQuery.isFetchingNextPage,
      },
      elComercioPosts: {
        fetchNextPage: elComercioPostsQuery.fetchNextPage,
        hasNextPage: elComercioPostsQuery.hasNextPage,
        isFetchingNextPage: elComercioPostsQuery.isFetchingNextPage,
      },
      instagramPosts: {
        fetchNextPage: instagramPostsQuery.fetchNextPage,
        hasNextPage: instagramPostsQuery.hasNextPage,
        isFetchingNextPage: instagramPostsQuery.isFetchingNextPage,
      },
      leads: {
        fetchNextPage: leadsQuery.fetchNextPage,
        hasNextPage: leadsQuery.hasNextPage,
        isFetchingNextPage: leadsQuery.isFetchingNextPage,
      },
      scrapes: {
        fetchNextPage: scrapesQuery.fetchNextPage,
        hasNextPage: scrapesQuery.hasNextPage,
        isFetchingNextPage: scrapesQuery.isFetchingNextPage,
      },
      youtubePosts: {
        fetchNextPage: youtubePostsQuery.fetchNextPage,
        hasNextPage: youtubePostsQuery.hasNextPage,
        isFetchingNextPage: youtubePostsQuery.isFetchingNextPage,
      },
    },
    scrapes:
      scrapesQuery.data?.pages?.flatMap((page) => page?.items ?? []) ?? [],
    scrapesError: scrapesQuery.error,
    scrapesFetching: scrapesQuery.isFetching,
    scrapesFetchingNextPage: scrapesQuery.isFetchingNextPage,
    scrapesLoading: scrapesQuery.isLoading,
    subreddits: subredditsQuery.data || [],
    subredditsError: subredditsQuery.error,
    subredditsLoading: subredditsQuery.isLoading,
    youtubeFeeds: youtubeFeedsQuery.data || [],
    youtubeFeedsError: youtubeFeedsQuery.error,
    youtubeFeedsLoading: youtubeFeedsQuery.isLoading,
    youtubePosts: youtubePostsQuery.data?.pages?.flat() ?? [],
    youtubePostsError: youtubePostsQuery.error,
    youtubePostsFetching: youtubePostsQuery.isFetching,
    youtubePostsFetchingNextPage:
      youtubePostsQuery.isFetchingNextPage,
    youtubePostsLoading: youtubePostsQuery.isLoading,
  };
}
