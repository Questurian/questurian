export default function InstagramFeedsHeader({
  isMutating,
  isRefreshing,
  onFetchAll,
  onToggleForm,
  showForm,
}) {
  return (
    <div className="page-header">
      <h1>Instagram Feeds</h1>
      <div className="page-header-actions">
        <button className="button success" onClick={onFetchAll} disabled={isMutating}>
          Fetch All
        </button>
        <button className="button" onClick={onToggleForm} disabled={isMutating}>
          {showForm ? 'Cancel' : 'Add Instagram Feed'}
        </button>
      </div>
      {isRefreshing && <span className="badge">Refreshing...</span>}
    </div>
  );
}
