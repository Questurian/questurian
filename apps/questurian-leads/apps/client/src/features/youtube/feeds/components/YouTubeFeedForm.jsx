import YouTubeChannelLookup from './YouTubeChannelLookup';

export default function YouTubeFeedForm({
  categories,
  countries,
  editingId,
  formData,
  isMutating,
  lookup,
  onCancel,
  onChange,
  onSubmit,
}) {
  return (
    <form className="form card" onSubmit={onSubmit}>
      <h3>{editingId ? 'Edit YouTube Feed' : 'New YouTube Feed'}</h3>

      <YouTubeChannelLookup
        isMutating={isMutating}
        lookupQuery={lookup.lookupQuery}
        lookupResult={lookup.lookupResult}
        onLookup={lookup.handleLookupChannel}
        onLookupQueryChange={lookup.setLookupQuery}
        searchPending={lookup.isPending}
      />

      <div className="form-group">
        <label>Channel ID *</label>
        <input
          type="text"
          value={formData.channel_id}
          onChange={(event) => onChange('channel_id', event.target.value)}
          placeholder="e.g., UC..."
          required
        />
      </div>
      <div className="form-group">
        <label>Display Name *</label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(event) => onChange('display_name', event.target.value)}
          placeholder="e.g., Channel Name"
          required
        />
      </div>
      <div className="form-group">
        <label>Channel URL</label>
        <input
          type="text"
          value={formData.channel_url}
          onChange={(event) => onChange('channel_url', event.target.value)}
          placeholder="https://www.youtube.com/channel/..."
        />
      </div>
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
