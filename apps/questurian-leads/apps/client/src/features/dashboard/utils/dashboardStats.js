export function buildDashboardStats({
  combinedItems,
  diarioCorreoFeeds,
  diarioCorreoPosts,
  elComercioFeeds,
  elComercioPosts,
  feeds,
  instagramFeeds,
  instagramPosts,
  leads,
  scrapes,
  youtubeFeeds,
  youtubePosts,
}) {
  const articleCount =
    leads.length +
    elComercioPosts.length +
    diarioCorreoPosts.length +
    scrapes.length;

  return {
    articles: articleCount,
    instagram: instagramPosts.length,
    sources:
      feeds.length +
      instagramFeeds.length +
      elComercioFeeds.length +
      diarioCorreoFeeds.length +
      youtubeFeeds.length,
    total: combinedItems.length,
    youtube: youtubePosts.length,
  };
}
