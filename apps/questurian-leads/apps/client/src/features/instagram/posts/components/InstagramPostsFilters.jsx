export default function InstagramPostsFilters({
  categories,
  feeds,
  filters,
  onChange,
  onClear,
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
            onChange={(event) => onChange('search', event.target.value)}
            placeholder="Search in captions, usernames..."
          />
        </div>
        <div className="form-group">
          <label>Category</label>
          <select
            value={filters.category}
            onChange={(event) => onChange('category', event.target.value)}
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
            onChange={(event) => onChange('tag', event.target.value)}
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
          <label>Instagram Feed</label>
          <select
            value={filters.instagram_feed_id}
            onChange={(event) => onChange('instagram_feed_id', event.target.value)}
          >
            <option value="">All Feeds</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.display_name}
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
