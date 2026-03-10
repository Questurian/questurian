export default function SubredditForm({
  categories,
  editingId,
  formData,
  isMutating,
  onCancel,
  onChange,
  onSubmit,
}) {
  return (
    <form className="form card" onSubmit={onSubmit}>
      <h3>{editingId ? 'Edit Subreddit' : 'New Subreddit'}</h3>
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
        <label>Subreddit or URL *</label>
        <input
          type="text"
          value={formData.subreddit}
          onChange={(event) => onChange('subreddit', event.target.value)}
          placeholder="r/python or https://reddit.com/r/python"
          required
        />
      </div>
      <div className="form-group">
        <label>Display Name *</label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(event) => onChange('display_name', event.target.value)}
          placeholder="e.g., Python Community"
          required
        />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          rows="3"
          value={formData.description}
          onChange={(event) => onChange('description', event.target.value)}
          placeholder="Optional description"
        />
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
