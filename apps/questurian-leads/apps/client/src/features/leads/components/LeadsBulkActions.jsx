export default function LeadsBulkActions({
  detectPending,
  onDetectLanguages,
  onTranslate,
  translatePending,
}) {
  return (
    <div className="translation-controls card">
      <div className="translation-header">
        <h3>Translation</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="button secondary"
            onClick={onDetectLanguages}
            disabled={detectPending}
          >
            {detectPending ? 'Detecting...' : 'Detect Languages'}
          </button>
          <button
            className="button primary"
            onClick={onTranslate}
            disabled={translatePending}
          >
            {translatePending ? 'Translating...' : 'Translate Pending Leads'}
          </button>
        </div>
      </div>
    </div>
  );
}
