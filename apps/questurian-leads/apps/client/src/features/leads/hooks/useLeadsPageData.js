import { useMemo } from 'react';
import { useCategories, useFeeds, useLeadsList, useTags } from '../../../hooks';

export function useLeadsPageData(filters) {
  const {
    data: leads = [],
    isLoading: leadsLoading,
    isFetching: leadsFetching,
    error: leadsError,
  } = useLeadsList(filters);
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
    data: tags = [],
    isLoading: tagsLoading,
    error: tagsError,
  } = useTags();

  const feedNames = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.source_name])),
    [feeds],
  );

  return {
    categories,
    error: leadsError || feedsError || categoriesError || tagsError,
    feedNames,
    feeds,
    isLoading: leadsLoading || feedsLoading || categoriesLoading || tagsLoading,
    isRefreshing: leadsFetching && !leadsLoading,
    leads,
    tags,
  };
}
