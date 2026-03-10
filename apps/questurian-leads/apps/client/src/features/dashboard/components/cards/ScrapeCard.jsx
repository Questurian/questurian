import { getLanguageName } from '../../../../utils/contentLanguage';
import { SCRAPE_CONTENT_TYPE_LABELS } from '../../constants/dashboard.constants';
import { formatRelativeDate } from '../../utils/dashboardFormatters';

export default function ScrapeCard({ scrape }) {
  const label =
    SCRAPE_CONTENT_TYPE_LABELS[scrape.content_type] || scrape.content_type;
  const sourceName = scrape.source_name || 'Unknown';
  const isTranslated = scrape.translation_status === 'translated';
  const languageLabel =
    scrape.detected_language && scrape.detected_language !== 'en'
      ? getLanguageName(scrape.detected_language)
      : null;
  const displayTitle = scrape.title || 'Untitled';
  const itemDate = scrape.published_at || scrape.collected_at;

  return (
    <article
      className="lead-card lead-card-scrape"
      data-lead-label={label || 'Scrape'}
    >
      {scrape.image_url && (
        <div className="lead-image">
          <img src={scrape.image_url} alt="" loading="lazy" />
        </div>
      )}

      <header className="lead-header">
        <h3>
          {scrape.link ? (
            <a href={scrape.link} target="_blank" rel="noopener noreferrer">
              {displayTitle}
            </a>
          ) : (
            displayTitle
          )}
        </h3>
      </header>

      <div className="lead-badges">
        <span className="badge">{label}</span>
        <span className="badge">{sourceName}</span>
        {isTranslated && <span className="badge translation-badge">Translated</span>}
        {languageLabel && (
          <span
            className="badge language-badge"
            data-lang-code={scrape.detected_language.toUpperCase()}
          >
            <span className="language-full">{languageLabel}</span>
            <span className="language-abbrev">{scrape.detected_language.toUpperCase()}</span>
          </span>
        )}
      </div>

      {scrape.summary && (
        <div className="lead-content">
          <p>{scrape.summary}</p>
        </div>
      )}

      <div className="lead-meta">
        <span className="published-date">{formatRelativeDate(itemDate)}</span>
      </div>
    </article>
  );
}
