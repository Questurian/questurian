import { instagramPostImageUrl } from '../../../../api';
import { getLanguageName } from '../../../../utils/contentLanguage';
import {
  formatNumber,
  formatRelativeDate,
} from '../../utils/dashboardFormatters';

export default function InstagramCard({
  categoryFilter,
  lookups,
  post,
  showTranslated,
}) {
  const displayCaption =
    showTranslated && post.caption_translated
      ? post.caption_translated
      : post.caption;
  const isTranslated = post.translation_status === 'translated';
  const languageLabel =
    post.detected_language && post.detected_language !== 'en'
      ? getLanguageName(post.detected_language)
      : null;
  const mediaUrl = post.media_url || post.thumbnail_url;
  const showVideo = post.media_type === 'video' && post.media_url;
  const imageUrl = mediaUrl ? instagramPostImageUrl(post.id) : null;
  const posterUrl = post.thumbnail_url ? instagramPostImageUrl(post.id) : null;
  const usernameLabel = post.username ? `@${post.username}` : 'Instagram post';
  const categoryName =
    lookups.categoryNames.get(
      lookups.instagramFeedCategoryIds.get(post.instagram_feed_id),
    ) ||
    categoryFilter ||
    'Unknown';
  const itemDate = post.posted_at || post.collected_at;

  return (
    <article className="lead-card lead-card-instagram">
      <header className="lead-header">
        <h3>
          {post.permalink ? (
            <a href={post.permalink} target="_blank" rel="noopener noreferrer">
              {usernameLabel}
            </a>
          ) : (
            usernameLabel
          )}
        </h3>
      </header>

      <div className="lead-badges">
        <span className="badge">{categoryName}</span>
        <span className="badge">
          {lookups.instagramFeedNames.get(post.instagram_feed_id) || 'Unknown Feed'}
        </span>
        {isTranslated && <span className="badge translation-badge">Translated</span>}
        {languageLabel && (
          <span
            className="badge language-badge"
            data-lang-code={post.detected_language.toUpperCase()}
          >
            <span className="language-full">{languageLabel}</span>
            <span className="language-abbrev">{post.detected_language.toUpperCase()}</span>
          </span>
        )}
      </div>

      <div className="instagram-content">
        {imageUrl && (
          <div className="instagram-media">
            {showVideo ? (
              <video controls poster={posterUrl || undefined}>
                <source src={post.media_url} type="video/mp4" />
              </video>
            ) : (
              <img src={imageUrl} alt="Instagram post" loading="lazy" />
            )}
          </div>
        )}

        <div className="instagram-caption-section">
          {displayCaption && (
            <p className="instagram-caption">{displayCaption}</p>
          )}

          <div className="instagram-stats">
            <span>{formatNumber(post.like_count)} likes</span>
            <span>{formatNumber(post.comment_count)} comments</span>
            {post.view_count && <span>{formatNumber(post.view_count)} views</span>}
            {post.media_type && <span className="media-type-badge">{post.media_type}</span>}
          </div>

          <div className="lead-meta">
            <span className="published-date">{formatRelativeDate(itemDate)}</span>
          </div>
        </div>
      </div>

      {!showTranslated && post.caption_translated && (
        <footer className="lead-footer">
          <small className="translation-hint">English translation available</small>
        </footer>
      )}
    </article>
  );
}
