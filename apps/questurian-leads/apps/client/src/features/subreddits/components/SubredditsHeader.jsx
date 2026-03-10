export default function SubredditsHeader({
  isMutating,
  isRefreshing,
  onToggleForm,
  showForm,
}) {
  return (
    <div className="page-header">
      <h1>Subreddits</h1>
      <button className="button" onClick={onToggleForm} disabled={isMutating}>
        {showForm ? 'Cancel' : 'Add Subreddit'}
      </button>
      {isRefreshing && <span className="badge">Refreshing...</span>}
    </div>
  );
}
