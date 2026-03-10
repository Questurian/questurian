export default function FeedsHeader({
  fetchAllPending,
  isMutating,
  isRefreshing,
  onFetchAll,
  onToggleForm,
  showForm,
}) {
  return (
    <div className="page-header">
      <h1>Feeds</h1>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="button success" onClick={onFetchAll} disabled={isMutating}>
          {fetchAllPending ? 'Fetching All...' : 'Fetch All'}
        </button>
        <button className="button" onClick={onToggleForm} disabled={isMutating}>
          {showForm ? 'Cancel' : 'Add Feed'}
        </button>
      </div>
      {isRefreshing && <span className="badge">Refreshing...</span>}
    </div>
  );
}
