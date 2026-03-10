import { useMemo } from 'react';
import {
  useFetchLogsList,
  useFeeds,
} from '../../../hooks';

export function useFetchLogsPageData(filters) {
  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useFeeds();
  const {
    data: logs = [],
    isLoading: logsLoading,
    isFetching: logsFetching,
    error: logsError,
  } = useFetchLogsList(filters);

  const feedNames = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed.source_name])),
    [feeds],
  );

  return {
    error: feedsError || logsError,
    feedNames,
    feeds,
    isLoading: feedsLoading || logsLoading,
    isRefreshing: logsFetching && !logsLoading,
    logs,
  };
}
