import { instagramPostImageUrl } from '../../../../api';

export function formatInstagramMetric(value) {
  if (value == null) return 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value;
}

export function buildInstagramPostViewModel(post, feedNames) {
  const mediaUrl = post.media_url || post.thumbnail_url;
  const imageUrl = mediaUrl ? instagramPostImageUrl(post.id) : null;
  const posterUrl = post.thumbnail_url ? instagramPostImageUrl(post.id) : null;

  return {
    ...post,
    collectedAtLabel: new Date(post.collected_at).toLocaleString(),
    displayCaption: post.caption_translated || post.caption,
    feedName: feedNames.get(post.instagram_feed_id) || 'Unknown',
    imageUrl,
    isTranslated: post.translation_status === 'translated',
    postedAtLabel: post.posted_at
      ? new Date(post.posted_at).toLocaleDateString()
      : 'Unknown',
    posterUrl,
    showVideo: post.media_type === 'video' && Boolean(post.media_url),
  };
}
