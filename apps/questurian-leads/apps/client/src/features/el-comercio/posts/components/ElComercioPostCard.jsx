import { buildElComercioPostViewModel } from '../utils/elComercioPostPresentation';

export default function ElComercioPostCard({
  feedNames,
  isMutating,
  onDelete,
  post,
}) {
  const viewModel = buildElComercioPostViewModel(post, feedNames);

  return (
    <div className="lead-card">
      <div className="lead-header">
        <div>
          <h3>
            <a href={viewModel.url} target="_blank" rel="noopener noreferrer">
              {viewModel.displayTitle}
            </a>
            {viewModel.isTranslated && (
              <span className="badge translation-badge">Translated</span>
            )}
            {viewModel.detected_language && (
              <span className="badge language-badge">
                {viewModel.detected_language}
              </span>
            )}
            <span className={`badge ${viewModel.approvalBadgeClass}`}>
              {viewModel.approval_status || 'pending'}
            </span>
          </h3>
          <div className="lead-meta">
            <span className="badge">{viewModel.feedName}</span>
            <span className="badge secondary">{viewModel.section}</span>
            <span>Published: {viewModel.publishedAtLabel}</span>
          </div>
        </div>
        <button
          className="button-sm danger"
          onClick={() => onDelete(viewModel.id)}
          disabled={isMutating}
        >
          Delete
        </button>
      </div>

      {viewModel.image_url && (
        <div className="lead-image">
          <img src={viewModel.image_url} alt={viewModel.displayTitle} />
        </div>
      )}

      {viewModel.displayExcerpt && (
        <div className="lead-content">
          <p>{viewModel.displayExcerpt}</p>
        </div>
      )}

      <div className="lead-footer">
        <small>Source: {viewModel.source}</small>
        <small>Collected: {viewModel.collectedAtLabel}</small>
        {viewModel.translatedAtLabel && (
          <small>Translated: {viewModel.translatedAtLabel}</small>
        )}
      </div>
    </div>
  );
}
