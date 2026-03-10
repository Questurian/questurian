import { buildLeadResultModel } from '../utils/leadsPresentation';

export default function LeadResultCard({
  feedName,
  isMutating,
  lead,
  onDelete,
  showTranslated,
}) {
  const viewModel = buildLeadResultModel({
    feedName,
    lead,
    showTranslated,
  });

  return (
    <div className="lead-card">
      {viewModel.imageUrl && (
        <div className="lead-image">
          <img src={viewModel.imageUrl} alt={viewModel.displayTitle} loading="lazy" />
        </div>
      )}

      <div className="lead-header">
        <h3>
          <a href={viewModel.link} target="_blank" rel="noopener noreferrer">
            {viewModel.displayTitle}
          </a>
        </h3>
        <button
          className="button-sm danger"
          onClick={() => onDelete(viewModel.id)}
          disabled={isMutating}
        >
          Delete
        </button>
      </div>

      <div className="lead-badges">
        <span className={`badge ${viewModel.feedBadgeClass}`}>
          {viewModel.feedName}
        </span>
        {viewModel.isTranslated && (
          <span className="badge translation-badge">Translated</span>
        )}
        {viewModel.languageLabel && (
          <span
            className="badge language-badge"
            data-lang-code={viewModel.languageCode}
          >
            <span className="language-full">{viewModel.languageLabel}</span>
            <span className="language-abbrev">{viewModel.languageCode}</span>
          </span>
        )}
      </div>

      <div className="lead-meta">
        {viewModel.author && <span>By {viewModel.author}</span>}
        {viewModel.publishedLabel && <span>{viewModel.publishedLabel}</span>}
      </div>

      {viewModel.summary && <p className="lead-summary">{viewModel.summary}</p>}

      <div className="lead-footer">
        <small>Collected: {viewModel.collectedLabel}</small>
        {viewModel.hasTranslationHint && (
          <small className="translation-hint">English translation available</small>
        )}
      </div>
    </div>
  );
}
