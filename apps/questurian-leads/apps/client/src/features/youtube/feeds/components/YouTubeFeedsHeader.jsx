export default function YouTubeFeedsHeader({
  fetchAllPending,
  isMutating,
  isRefreshing,
  maxResults,
  onFetchAll,
  onMaxResultsChange,
  onToggleForm,
  showForm,
}) {
  return (
    <div className="page-header">
      <h1>YouTube Feeds</h1>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <label>
          Max results
          <input
            type="number"
            min="1"
            max="50"
            value={maxResults}
            onChange={(event) => onMaxResultsChange(event.target.value)}
            style={{ width: '80px', marginLeft: '8px' }}
          />
        </label>
        <button className="button success" onClick={onFetchAll} disabled={isMutating}>
          {fetchAllPending ? 'Fetching All...' : 'Fetch All'}
        </button>
        <button className="button" onClick={onToggleForm} disabled={isMutating}>
          {showForm ? 'Cancel' : 'Add YouTube Feed'}
        </button>
      </div>
      {isRefreshing && <span className="badge">Refreshing...</span>}
    </div>
  );
}
