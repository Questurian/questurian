import { useMemo } from 'react';
import {
  useCategories,
  useInstagramFeeds,
  useInstagramPostsList,
  useTags,
} from '../../../../hooks';

export function useInstagramPostsPageData(filters) {
  const {
    data: posts = [],
    isLoading: postsLoading,
    isFetching: postsFetching,
    error: postsError,
  } = useInstagramPostsList(filters);
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useInstagramFeeds();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();
  const {
    data: tags = [],
    isLoading: tagsLoading,
    error: tagsError,
  } = useTags();

  const feedNames = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.display_name])),
    [feeds],
  );

  return {
    categories,
    error: postsError || feedsError || categoriesError || tagsError,
    feedNames,
    feeds,
    isLoading: postsLoading || feedsLoading || categoriesLoading || tagsLoading,
    isRefreshing: postsFetching && !postsLoading,
    posts,
    tags,
  };
}
