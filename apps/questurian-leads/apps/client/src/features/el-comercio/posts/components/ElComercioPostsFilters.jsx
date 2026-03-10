export default function ElComercioPostsFilters({
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
          <label>Search</label>
          <input
            type="text"
            value={filters.search}
            onChange={(event) => onChange('search', event.target.value)}
            placeholder="Search in titles, excerpts..."
          />
        </div>
        <div className="form-group">
          <label>Feed</label>
          <select
            value={filters.el_comercio_feed_id}
            onChange={(event) => onChange('el_comercio_feed_id', event.target.value)}
          >
            <option value="">All Feeds</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Approval Status</label>
          <select
            value={filters.approval_status}
            onChange={(event) => onChange('approval_status', event.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      <button className="button secondary" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
}
