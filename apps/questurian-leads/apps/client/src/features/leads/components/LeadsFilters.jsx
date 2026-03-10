export default function LeadsFilters({
  categories,
  feeds,
  filters,
  onClear,
  onFilterChange,
  tags,
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
            onChange={(event) => onFilterChange('search', event.target.value)}
            placeholder="Search in title, summary, content..."
          />
        </div>
        <div className="form-group">
          <label>Category</label>
          <select
            value={filters.category}
            onChange={(event) => onFilterChange('category', event.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Tag</label>
          <select
            value={filters.tag}
            onChange={(event) => onFilterChange('tag', event.target.value)}
          >
            <option value="">All Tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Feed</label>
          <select
            value={filters.feed_id}
            onChange={(event) => onFilterChange('feed_id', event.target.value)}
          >
            <option value="">All Feeds</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.source_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="button secondary" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
}
