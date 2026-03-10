export default function InstagramFeedForm({
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
      <h3>{editingId ? 'Edit Instagram Feed' : 'New Instagram Feed'}</h3>
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
        <label>Instagram Username *</label>
        <input
          type="text"
          value={formData.username}
          onChange={(event) => onChange('username', event.target.value)}
          placeholder="e.g., openai"
          required
        />
      </div>
      <div className="form-group">
        <label>Display Name *</label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(event) => onChange('display_name', event.target.value)}
          placeholder="e.g., OpenAI Official"
          required
        />
      </div>
      <div className="form-group">
        <label>Profile URL</label>
        <input
          type="text"
          value={formData.profile_url}
          onChange={(event) => onChange('profile_url', event.target.value)}
          placeholder="https://instagram.com/username"
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
