import { useMemo } from 'react';
import {
  useElComercioFeeds,
  useInfiniteElComercioPostsList,
} from '../../../../hooks';
import { EL_COMERCIO_POSTS_PAGE_SIZE } from '../constants/elComercioPosts.constants';

export function useElComercioPostsPageData(filters) {
  const {
    data,
    isLoading: postsLoading,
    isFetching: postsFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error: postsError,
  } = useInfiniteElComercioPostsList(filters, EL_COMERCIO_POSTS_PAGE_SIZE);
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useElComercioFeeds();

  const posts = data?.pages.flat() ?? [];
  const feedNames = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.display_name])),
    [feeds],
  );

  return {
    error: postsError || feedsError,
    feedNames,
    feeds,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: postsLoading || feedsLoading,
    isRefreshing: postsFetching && !postsLoading && !isFetchingNextPage,
    posts,
  };
}
