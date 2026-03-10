import {
  DEFAULT_YOUTUBE_FETCH_RESULTS,
  EMPTY_YOUTUBE_FEED_FORM,
} from '../constants/youtubeFeeds.constants';

export function buildYouTubeFeedFormData(feed) {
  return {
    ...EMPTY_YOUTUBE_FEED_FORM,
    category_id: feed.category_id,
    channel_id: feed.channel_id,
    display_name: feed.display_name,
    channel_url: feed.channel_url || '',
    country: feed.country || '',
  };
}

export function formatYouTubeFetchAllSummary(results) {
  return results
    .map(
      (result) =>
        `${result.display_name || result.channel_id}: ${result.post_count} videos`,
    )
    .join('\n');
}

export function formatYouTubeLastFetched(value) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function getSafeYouTubeMaxResults(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_YOUTUBE_FETCH_RESULTS;
  }
  return parsed;
}
