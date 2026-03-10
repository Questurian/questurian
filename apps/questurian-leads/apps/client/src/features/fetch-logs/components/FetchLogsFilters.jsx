export default function FetchLogsFilters({
  feeds,
  filters,
  onChange,
  onClear,
}) {
  return (
    <div className="filters card">
      <h3>Filters</h3>
      <div className="filters-grid">
        <div className="form-group">
          <label>Feed</label>
          <select
            value={filters.feed_id}
            onChange={(event) => onChange('feed_id', event.target.value)}
          >
            <option value="">All Feeds</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.source_name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select
            value={filters.status}
            onChange={(event) => onChange('status', event.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>
      <button className="button secondary" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
}
