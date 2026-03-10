import { useMemo } from 'react';
import { RANDOM_SUBREDDIT_COUNT } from '../constants/dashboard.constants';

export function useDashboardLookups(queries) {
  const feedNames = useMemo(
    () => new Map(queries.feeds.map((feed) => [feed.id, feed.source_name])),
    [queries.feeds],
  );
  const feedCategoryIds = useMemo(
    () => new Map(queries.feeds.map((feed) => [feed.id, feed.category_id])),
    [queries.feeds],
  );
  const instagramFeedNames = useMemo(
    () =>
      new Map(
        queries.instagramFeeds.map((feed) => [feed.id, feed.display_name]),
      ),
    [queries.instagramFeeds],
  );
  const instagramFeedCategoryIds = useMemo(
    () =>
      new Map(
        queries.instagramFeeds.map((feed) => [feed.id, feed.category_id]),
      ),
    [queries.instagramFeeds],
  );
  const elComercioFeedNames = useMemo(
    () =>
      new Map(
        queries.elComercioFeeds.map((feed) => [feed.id, feed.display_name]),
      ),
    [queries.elComercioFeeds],
  );
  const elComercioFeedCategoryIds = useMemo(
    () =>
      new Map(
        queries.elComercioFeeds.map((feed) => [feed.id, feed.category_id]),
      ),
    [queries.elComercioFeeds],
  );
  const diarioCorreoFeedNames = useMemo(
    () =>
      new Map(
        queries.diarioCorreoFeeds.map((feed) => [feed.id, feed.display_name]),
      ),
    [queries.diarioCorreoFeeds],
  );
  const diarioCorreoFeedCategoryIds = useMemo(
    () =>
      new Map(
        queries.diarioCorreoFeeds.map((feed) => [feed.id, feed.category_id]),
      ),
    [queries.diarioCorreoFeeds],
  );
  const youtubeFeedNames = useMemo(
    () =>
      new Map(
        queries.youtubeFeeds.map((feed) => [feed.id, feed.display_name]),
      ),
    [queries.youtubeFeeds],
  );
  const youtubeFeedCategoryIds = useMemo(
    () =>
      new Map(
        queries.youtubeFeeds.map((feed) => [feed.id, feed.category_id]),
      ),
    [queries.youtubeFeeds],
  );
  const categoryNames = useMemo(
    () =>
      new Map(queries.categories.map((category) => [category.id, category.name])),
    [queries.categories],
  );

  const subredditPicks = useMemo(() => {
    if (!Array.isArray(queries.subreddits) || queries.subreddits.length === 0) {
      return [];
    }

    const shuffled = [...queries.subreddits].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, RANDOM_SUBREDDIT_COUNT);
  }, [queries.subreddits]);

  return {
    lookups: {
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
    },
    subredditPicks,
  };
}
