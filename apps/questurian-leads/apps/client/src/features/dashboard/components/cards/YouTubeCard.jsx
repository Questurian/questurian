import { formatRelativeDate } from '../../utils/dashboardFormatters';

export default function YouTubeCard({ categoryFilter, lookups, post }) {
  const categoryName =
    lookups.categoryNames.get(
      lookups.youtubeFeedCategoryIds.get(post.youtube_feed_id),
    ) ||
    categoryFilter ||
    'Unknown';
  const channelLabel =
    lookups.youtubeFeedNames.get(post.youtube_feed_id) || 'Unknown Channel';
  const itemDate = post.published_at || post.collected_at;

  return (
    <article className="lead-card lead-card-youtube">
      {post.thumbnail_url && (
        <div className="lead-image">
          <img src={post.thumbnail_url} alt="" loading="lazy" />
        </div>
      )}

      <header className="lead-header">
        <h3>
          {post.video_url ? (
            <a href={post.video_url} target="_blank" rel="noopener noreferrer">
              {post.title}
            </a>
          ) : (
            post.title
          )}
        </h3>
      </header>

      <div className="lead-badges">
        <span className="badge">{categoryName}</span>
        <span className="badge">{channelLabel}</span>
      </div>

      <div className="lead-meta">
        <span className="published-date">{formatRelativeDate(itemDate)}</span>
      </div>

      <div className="transcript-actions">
        {post.video_url ? (
          <a
            className="button secondary button-sm"
            href={post.video_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in YouTube
          </a>
        ) : (
          <span className="badge">No YouTube URL</span>
        )}
      </div>
    </article>
  );
}
