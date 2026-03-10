import { EMPTY_INSTAGRAM_FEED_FORM } from '../constants/instagramFeeds.constants';

export function buildInstagramFeedFormData(feed) {
  return {
    ...EMPTY_INSTAGRAM_FEED_FORM,
    category_id: feed.category_id,
    username: feed.username,
    display_name: feed.display_name,
    profile_url: feed.profile_url || '',
    country: feed.country || '',
  };
}

export function getInstagramFeedProfileUrl(feed) {
  return feed.profile_url || `https://instagram.com/${feed.username}`;
}

export function formatInstagramFetchAllSummary(results) {
  return results
    .map(
      (result) =>
        `@${result.username || result.instagram_feed_id}: ${result.post_count} posts`,
    )
    .join('\n');
}
