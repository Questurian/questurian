export function buildFeedFormData(feed) {
  return {
    category_id: feed.category_id,
    url: feed.url,
    source_name: feed.source_name,
    website: feed.website || '',
    country: feed.country || '',
  };
}

export function getFeedName(feeds, feedId) {
  return feeds.find((feed) => feed.id === feedId)?.source_name || `Feed ${feedId}`;
}

export function formatFeedUrl(url, maxLength = 40) {
  return `${url.substring(0, maxLength)}...`;
}

export function formatFetchAllSummary(results) {
  return results.map((result) => `${result.feed_id}: ${result.lead_count} leads`).join('\n');
}
