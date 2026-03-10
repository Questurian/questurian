export default function YouTubeChannelLookup({
  isMutating,
  lookupQuery,
  lookupResult,
  onLookup,
  onLookupQueryChange,
  searchPending,
}) {
  return (
    <div className="form-group">
      <label>Find Channel</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={lookupQuery}
          onChange={(event) => onLookupQueryChange(event.target.value)}
          placeholder="Search by channel name"
        />
        <button
          type="button"
          className="button secondary"
          onClick={onLookup}
          disabled={isMutating}
        >
          {searchPending ? 'Searching...' : 'Search'}
        </button>
      </div>
      {lookupResult && (
        <small>
          Found {lookupResult.display_name} ({lookupResult.channel_id})
        </small>
      )}
    </div>
  );
}
