import { getLanguageName } from '../../../../utils/contentLanguage';
import { formatRelativeDate } from '../../utils/dashboardFormatters';

export default function DiarioCorreoCard({
  categoryFilter,
  lookups,
  post,
  showTranslated,
}) {
  const displayTitle =
    showTranslated && post.title_translated ? post.title_translated : post.title;
  const displayExcerpt =
    showTranslated && post.excerpt_translated
      ? post.excerpt_translated
      : post.excerpt;
  const isTranslated = post.translation_status === 'translated';
  const languageLabel =
    post.detected_language && post.detected_language !== 'en'
      ? getLanguageName(post.detected_language)
      : null;
  const categoryName =
    lookups.categoryNames.get(
      lookups.diarioCorreoFeedCategoryIds.get(post.diario_correo_feed_id),
    ) ||
    categoryFilter ||
    'Unknown';
  const itemDate = post.published_at || post.collected_at;

  return (
    <article className="lead-card lead-card-diario-correo">
      {post.image_url && (
        <div className="lead-image">
          <img src={post.image_url} alt="" loading="lazy" />
        </div>
      )}

      <header className="lead-header">
        <h3>
          {post.url ? (
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              {displayTitle}
            </a>
          ) : (
            displayTitle
          )}
        </h3>
      </header>

      <div className="lead-badges">
        <span className="badge">{categoryName}</span>
        <span className="badge">
          {lookups.diarioCorreoFeedNames.get(post.diario_correo_feed_id) || 'Unknown Feed'}
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

      {displayExcerpt && (
        <div className="lead-content">
          <p>{displayExcerpt}</p>
        </div>
      )}

      <div className="lead-meta">
        <span className="published-date">{formatRelativeDate(itemDate)}</span>
      </div>

      {!showTranslated && post.title_translated && (
        <footer className="lead-footer">
          <small className="translation-hint">English translation available</small>
        </footer>
      )}
    </article>
  );
}
