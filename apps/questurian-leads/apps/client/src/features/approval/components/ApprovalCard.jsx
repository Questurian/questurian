import {
  buildApprovalItemViewModel,
  formatApprovalDateTime,
} from '../utils/approvalPresentation';

export default function ApprovalCard({
  isMutating,
  item,
  onApprove,
  onReject,
}) {
  const viewModel = buildApprovalItemViewModel(item);

  return (
    <div className="approval-card">
      {viewModel.imageUrl && (
        <div className="approval-image">
          <img src={viewModel.imageUrl} alt={viewModel.title} />
        </div>
      )}

      <div className="approval-header">
        <span
          className={`badge type-badge ${viewModel.content_type === 'instagram_post' ? 'instagram' : ''}`}
        >
          {viewModel.contentTypeLabel}
        </span>
        <span className="source-badge">{viewModel.source_name}</span>
      </div>

      <h3>
        {viewModel.title}
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
      </h3>

      {viewModel.summary && <p className="summary">{viewModel.summary}</p>}

      <div className="approval-meta">
        <small>
          {viewModel.displayDateLabel}:{' '}
          {formatApprovalDateTime(viewModel.displayDate)}
        </small>
        {viewModel.published_at && viewModel.collected_at && (
          <small>Collected: {formatApprovalDateTime(viewModel.collected_at)}</small>
        )}
        {viewModel.link && (
          <a href={viewModel.link} target="_blank" rel="noopener noreferrer">
            View Original →
          </a>
        )}
      </div>

      <div className="approval-actions">
        <button
          className="button primary"
          onClick={() => onApprove(viewModel)}
          disabled={isMutating}
        >
          ✓ Approve
        </button>
        <button
          className="button danger"
          onClick={() => onReject(viewModel)}
          disabled={isMutating}
        >
          ✕ Reject
        </button>
      </div>
    </div>
  );
}
