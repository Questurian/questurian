import { useCallback, useEffect, useMemo, useState } from 'react';
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
  DEFAULT_EMPTY_MESSAGE,
  EL_COMERCIO_PAGE_SIZE,
  FILTERED_EMPTY_MESSAGE,
  RANDOM_SUBREDDIT_COUNT,
  SCRAPES_PAGE_SIZE,
} from '../constants/dashboard.constants';
import { getItemDate } from '../utils/dashboardItems';

export function useDashboardData() {
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(DASHBOARD_PAGE_SIZE);
  const showTranslated = true;

  const {
    data: leadsData,
    isLoading: leadsLoading,
    isFetching: leadsFetching,
    isFetchingNextPage: leadsFetchingNextPage,
    fetchNextPage: fetchNextLeads,
    hasNextPage: hasMoreLeads,
    error: leadsError,
  } = useInfiniteLeadsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const {
    data: instagramPostsData,
    isLoading: postsLoading,
    isFetching: postsFetching,
    isFetchingNextPage: postsFetchingNextPage,
    fetchNextPage: fetchNextInstagramPosts,
    hasNextPage: hasMoreInstagramPosts,
    error: postsError,
  } = useInfiniteInstagramPostsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const {
    data: youtubePostsData,
    isLoading: youtubePostsLoading,
    isFetching: youtubePostsFetching,
    isFetchingNextPage: youtubePostsFetchingNextPage,
    fetchNextPage: fetchNextYouTubePosts,
    hasNextPage: hasMoreYouTubePosts,
    error: youtubePostsError,
  } = useInfiniteYouTubePostsList(
    {
      category: categoryFilter,
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const {
    data: scrapesData,
    isLoading: scrapesLoading,
    isFetching: scrapesFetching,
    isFetchingNextPage: scrapesFetchingNextPage,
    fetchNextPage: fetchNextScrapes,
    hasNextPage: hasMoreScrapes,
    error: scrapesError,
  } = useInfiniteScrapes(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    SCRAPES_PAGE_SIZE,
  );

  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useFeeds();

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();

  const {
    data: subreddits = [],
    isLoading: subredditsLoading,
    error: subredditsError,
  } = useSubreddits();

  const {
    data: instagramFeeds = [],
    isLoading: instagramFeedsLoading,
    error: instagramFeedsError,
  } = useInstagramFeeds();

  const {
    data: elComercioPostsData,
    isLoading: elComercioPostsLoading,
    isFetching: elComercioPostsFetching,
    isFetchingNextPage: elComercioPostsFetchingNextPage,
    fetchNextPage: fetchNextElComercioPosts,
    hasNextPage: hasMoreElComercioPosts,
    error: elComercioPostsError,
  } = useInfiniteElComercioPostsList(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    EL_COMERCIO_PAGE_SIZE,
  );

  const {
    data: diarioCorreoPostsData,
    isLoading: diarioCorreoPostsLoading,
    isFetching: diarioCorreoPostsFetching,
    isFetchingNextPage: diarioCorreoPostsFetchingNextPage,
    fetchNextPage: fetchNextDiarioCorreoPosts,
    hasNextPage: hasMoreDiarioCorreoPosts,
    error: diarioCorreoPostsError,
  } = useInfiniteDiarioCorreoPostsList(
    {
      approval_status: 'approved',
      search: searchFilter,
    },
    DASHBOARD_PAGE_SIZE,
  );

  const {
    data: elComercioFeeds = [],
    isLoading: elComercioFeedsLoading,
    error: elComercioFeedsError,
  } = useElComercioFeeds();

  const {
    data: diarioCorreoFeeds = [],
    isLoading: diarioCorreoFeedsLoading,
    error: diarioCorreoFeedsError,
  } = useDiarioCorreoFeeds();

  const {
    data: youtubeFeeds = [],
    isLoading: youtubeFeedsLoading,
    error: youtubeFeedsError,
  } = useYouTubeFeeds();

  const leads = leadsData?.pages?.flat() ?? [];
  const instagramPosts = instagramPostsData?.pages?.flat() ?? [];
  const youtubePosts = youtubePostsData?.pages?.flat() ?? [];
  const diarioCorreoPosts = diarioCorreoPostsData?.pages?.flat() ?? [];
  const elComercioPosts = elComercioPostsData?.pages?.flat() ?? [];
  const scrapes = scrapesData?.pages?.flatMap((page) => page?.items ?? []) ?? [];

  const feedNames = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.source_name])),
    [feeds],
  );
  const feedCategoryIds = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.category_id])),
    [feeds],
  );
  const instagramFeedNames = useMemo(
    () => new Map(instagramFeeds.map((feed) => [feed.id, feed.display_name])),
    [instagramFeeds],
  );
  const instagramFeedCategoryIds = useMemo(
    () => new Map(instagramFeeds.map((feed) => [feed.id, feed.category_id])),
    [instagramFeeds],
  );
  const elComercioFeedNames = useMemo(
    () => new Map(elComercioFeeds.map((feed) => [feed.id, feed.display_name])),
    [elComercioFeeds],
  );
  const elComercioFeedCategoryIds = useMemo(
    () => new Map(elComercioFeeds.map((feed) => [feed.id, feed.category_id])),
    [elComercioFeeds],
  );
  const diarioCorreoFeedNames = useMemo(
    () => new Map(diarioCorreoFeeds.map((feed) => [feed.id, feed.display_name])),
    [diarioCorreoFeeds],
  );
  const diarioCorreoFeedCategoryIds = useMemo(
    () => new Map(diarioCorreoFeeds.map((feed) => [feed.id, feed.category_id])),
    [diarioCorreoFeeds],
  );
  const youtubeFeedNames = useMemo(
    () => new Map(youtubeFeeds.map((feed) => [feed.id, feed.display_name])),
    [youtubeFeeds],
  );
  const youtubeFeedCategoryIds = useMemo(
    () => new Map(youtubeFeeds.map((feed) => [feed.id, feed.category_id])),
    [youtubeFeeds],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const subredditPicks = useMemo(() => {
    if (!Array.isArray(subreddits) || subreddits.length === 0) return [];

    const shuffled = [...subreddits].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, RANDOM_SUBREDDIT_COUNT);
  }, [subreddits]);

  const combinedItems = useMemo(() => {
    const leadItems = leads.map((lead) => ({ type: 'lead', data: lead }));
    const instagramItems = instagramPosts.map((post) => ({
      type: 'instagram',
      data: post,
    }));
    const elComercioItems = elComercioPosts.map((post) => ({
      type: 'el_comercio',
      data: post,
    }));
    const diarioCorreoItems = diarioCorreoPosts.map((post) => ({
      type: 'diario_correo',
      data: post,
    }));
    const youtubeItems = youtubePosts.map((post) => ({
      type: 'youtube',
      data: post,
    }));
    const scrapeItems = scrapes.map((scrape) => ({
      type: 'scrape',
      data: scrape,
    }));

    return [
      ...leadItems,
      ...instagramItems,
      ...elComercioItems,
      ...diarioCorreoItems,
      ...youtubeItems,
      ...scrapeItems,
    ];
  }, [
    diarioCorreoPosts,
    elComercioPosts,
    instagramPosts,
    leads,
    scrapes,
    youtubePosts,
  ]);

  const sortedItems = useMemo(() => (
    [...combinedItems].sort((a, b) => {
      const aDate = getItemDate(a);
      const bDate = getItemDate(b);
      const aTimestamp = aDate ? aDate.getTime() : 0;
      const bTimestamp = bDate ? bDate.getTime() : 0;

      return bTimestamp - aTimestamp;
    })
  ), [combinedItems]);

  const stats = useMemo(() => {
    const articleCount =
      leads.length +
      elComercioPosts.length +
      diarioCorreoPosts.length +
      scrapes.length;

    return {
      total: combinedItems.length,
      articles: articleCount,
      instagram: instagramPosts.length,
      youtube: youtubePosts.length,
      sources:
        feeds.length +
        instagramFeeds.length +
        elComercioFeeds.length +
        diarioCorreoFeeds.length +
        youtubeFeeds.length,
    };
  }, [
    combinedItems.length,
    diarioCorreoFeeds.length,
    diarioCorreoPosts.length,
    elComercioFeeds.length,
    elComercioPosts.length,
    feeds.length,
    instagramFeeds.length,
    instagramPosts.length,
    leads.length,
    scrapes.length,
    youtubeFeeds.length,
    youtubePosts.length,
  ]);

  const totalCount = combinedItems.length;
  const isLoading =
    leadsLoading ||
    postsLoading ||
    feedsLoading ||
    instagramFeedsLoading ||
    categoriesLoading ||
    elComercioPostsLoading ||
    elComercioFeedsLoading ||
    diarioCorreoPostsLoading ||
    diarioCorreoFeedsLoading ||
    youtubePostsLoading ||
    youtubeFeedsLoading ||
    scrapesLoading;

  const isFetching =
    (leadsFetching && !leadsFetchingNextPage) ||
    (postsFetching && !postsFetchingNextPage) ||
    (diarioCorreoPostsFetching && !diarioCorreoPostsFetchingNextPage) ||
    (youtubePostsFetching && !youtubePostsFetchingNextPage) ||
    (elComercioPostsFetching && !elComercioPostsFetchingNextPage) ||
    (scrapesFetching && !scrapesFetchingNextPage);

  const isLoadingMore =
    leadsFetchingNextPage ||
    postsFetchingNextPage ||
    diarioCorreoPostsFetchingNextPage ||
    youtubePostsFetchingNextPage ||
    elComercioPostsFetchingNextPage ||
    scrapesFetchingNextPage;

  const hasMoreItems =
    hasMoreLeads ||
    hasMoreInstagramPosts ||
    hasMoreDiarioCorreoPosts ||
    hasMoreYouTubePosts ||
    hasMoreElComercioPosts ||
    hasMoreScrapes;

  const error =
    leadsError ||
    postsError ||
    feedsError ||
    instagramFeedsError ||
    categoriesError ||
    elComercioPostsError ||
    elComercioFeedsError ||
    diarioCorreoPostsError ||
    diarioCorreoFeedsError ||
    youtubePostsError ||
    youtubeFeedsError ||
    scrapesError;

  useEffect(() => {
    setVisibleCount(DASHBOARD_PAGE_SIZE);
  }, [categoryFilter, searchFilter]);

  const loadMoreItems = useCallback(() => {
    setVisibleCount((previous) => previous + DASHBOARD_PAGE_SIZE);

    if (hasMoreLeads && !leadsFetchingNextPage) {
      fetchNextLeads();
    }
    if (hasMoreInstagramPosts && !postsFetchingNextPage) {
      fetchNextInstagramPosts();
    }
    if (hasMoreYouTubePosts && !youtubePostsFetchingNextPage) {
      fetchNextYouTubePosts();
    }
    if (hasMoreDiarioCorreoPosts && !diarioCorreoPostsFetchingNextPage) {
      fetchNextDiarioCorreoPosts();
    }
    if (hasMoreElComercioPosts && !elComercioPostsFetchingNextPage) {
      fetchNextElComercioPosts();
    }
    if (hasMoreScrapes && !scrapesFetchingNextPage) {
      fetchNextScrapes();
    }
  }, [
    diarioCorreoPostsFetchingNextPage,
    elComercioPostsFetchingNextPage,
    fetchNextDiarioCorreoPosts,
    fetchNextElComercioPosts,
    fetchNextInstagramPosts,
    fetchNextLeads,
    fetchNextScrapes,
    fetchNextYouTubePosts,
    hasMoreDiarioCorreoPosts,
    hasMoreElComercioPosts,
    hasMoreInstagramPosts,
    hasMoreLeads,
    hasMoreScrapes,
    hasMoreYouTubePosts,
    leadsFetchingNextPage,
    postsFetchingNextPage,
    scrapesFetchingNextPage,
    youtubePostsFetchingNextPage,
  ]);

  const visibleItems = useMemo(
    () => sortedItems.slice(0, visibleCount),
    [sortedItems, visibleCount],
  );

  const lookups = useMemo(() => ({
    categoryNames,
    diarioCorreoFeedCategoryIds,
    diarioCorreoFeedNames,
    elComercioFeedCategoryIds,
    elComercioFeedNames,
    feedCategoryIds,
    feedNames,
    instagramFeedCategoryIds,
    instagramFeedNames,
    youtubeFeedCategoryIds,
    youtubeFeedNames,
  }), [
    categoryNames,
    diarioCorreoFeedCategoryIds,
    diarioCorreoFeedNames,
    elComercioFeedCategoryIds,
    elComercioFeedNames,
    feedCategoryIds,
    feedNames,
    instagramFeedCategoryIds,
    instagramFeedNames,
    youtubeFeedCategoryIds,
    youtubeFeedNames,
  ]);

  const emptyMessage =
    categoryFilter || searchFilter
      ? FILTERED_EMPTY_MESSAGE
      : DEFAULT_EMPTY_MESSAGE;

  return {
    categories,
    categoryFilter,
    categoriesLoading,
    emptyMessage,
    error,
    isFetching,
    isLoading,
    isLoadingMore,
    hasMoreItems,
    loadMoreItems,
    lookups,
    searchFilter,
    setCategoryFilter,
    setSearchFilter,
    showTranslated,
    subredditPicks,
    subredditsError,
    subredditsLoading,
    stats,
    totalCount,
    visibleCount,
    visibleItems,
  };
}
