import { getLanguageName } from '../../../../utils/contentLanguage';
import { formatRelativeDate } from '../../utils/dashboardFormatters';

export default function LeadCard({
  categoryFilter,
  lead,
  lookups,
  showTranslated,
}) {
  const displayTitle =
    showTranslated && lead.title_translated ? lead.title_translated : lead.title;
  const isTranslated = lead.translation_status === 'translated';
  const languageLabel =
    lead.detected_language && lead.detected_language !== 'en'
      ? getLanguageName(lead.detected_language)
      : null;
  const categoryName =
    lookups.categoryNames.get(lookups.feedCategoryIds.get(lead.feed_id)) ||
    categoryFilter ||
    'Unknown';
  const itemDate = lead.published || lead.collected_at;

  return (
    <article className="lead-card lead-card-article">
      {lead.image_url && (
        <div className="lead-image">
          <img src={lead.image_url} alt="" loading="lazy" />
        </div>
      )}

      <header className="lead-header">
        <h3>
          {lead.link ? (
            <a href={lead.link} target="_blank" rel="noopener noreferrer">
              {displayTitle}
            </a>
          ) : (
            displayTitle
          )}
        </h3>
      </header>

      <div className="lead-badges">
        <span className="badge">{categoryName}</span>
        <span className="badge">{lookups.feedNames.get(lead.feed_id) || 'Unknown Feed'}</span>
        {isTranslated && <span className="badge translation-badge">Translated</span>}
        {languageLabel && (
          <span
            className="badge language-badge"
            data-lang-code={lead.detected_language.toUpperCase()}
          >
            <span className="language-full">{languageLabel}</span>
            <span className="language-abbrev">{lead.detected_language.toUpperCase()}</span>
          </span>
        )}
      </div>

      <div className="lead-meta">
        {lead.author && <span>By {lead.author}</span>}
        <span className="published-date">{formatRelativeDate(itemDate)}</span>
      </div>

      {!showTranslated && lead.title_translated && (
        <footer className="lead-footer">
          <small className="translation-hint">English translation available</small>
        </footer>
      )}
    </article>
  );
}
