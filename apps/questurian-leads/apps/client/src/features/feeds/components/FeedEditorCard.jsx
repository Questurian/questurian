export default function FeedEditorCard({
  categories,
  countries,
  editingId,
  formData,
  isMutating,
  onCancel,
  onChange,
  onSubmit,
}) {
  return (
    <form className="form card" onSubmit={onSubmit}>
      <h3>{editingId ? 'Edit Feed' : 'New Feed'}</h3>
      <div className="form-group">
        <label>Category *</label>
        <select
          value={formData.category_id}
          onChange={(event) =>
            onChange(
              'category_id',
              event.target.value === '' ? '' : parseInt(event.target.value, 10),
            )
          }
          required
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Article URL *</label>
        <input
          type="url"
          value={formData.url}
          onChange={(event) => onChange('url', event.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label>Source Name *</label>
        <input
          type="text"
          value={formData.source_name}
          onChange={(event) => onChange('source_name', event.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label>Website</label>
        <input
          type="text"
          value={formData.website}
          onChange={(event) => onChange('website', event.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Country *</label>
        <select
          value={formData.country}
          onChange={(event) => onChange('country', event.target.value)}
          required
        >
          <option value="">Select a country</option>
          {countries.map((country) => (
            <option key={country.id} value={country.name}>
              {country.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-actions">
        <button type="submit" className="button" disabled={isMutating}>
          {editingId ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={isMutating}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
