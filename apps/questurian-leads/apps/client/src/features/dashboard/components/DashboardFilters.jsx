export default function DashboardFilters({
  categories,
  categoryFilter,
  isCategoriesLoading,
  onCategoryChange,
  onSearchChange,
  searchFilter,
}) {
  return (
    <section className="filters">
      <h3>Filter Content</h3>
      <div className="filters-grid">
        <div className="form-group">
          <label htmlFor="search-filter">Search</label>
          <input
            id="search-filter"
            type="text"
            value={searchFilter}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search titles, summaries, captions..."
          />
        </div>
        <div className="form-group">
          <label htmlFor="category-filter">Category</label>
          <select
            id="category-filter"
            value={categoryFilter}
            onChange={(event) => onCategoryChange(event.target.value)}
            disabled={isCategoriesLoading}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
