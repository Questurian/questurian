import { useState } from 'react';
import {
  useCategories,
  useCreateYouTubeFeed,
  useDeleteYouTubeFeed,
  useFetchAllYouTubeFeeds,
  useFetchYouTubeFeed,
  useSearchYouTubeChannel,
  useCountries,
  useUpdateYouTubeFeed,
  useYouTubeFeeds,
} from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function YouTubeFeeds() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [maxResults, setMaxResults] = useState(5);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [formData, setFormData] = useState({
    category_id: '',
    channel_id: '',
    display_name: '',
    channel_url: '',
    country: '',
  });
  const dialog = useDialog();

  const {
    data: feeds = [],
    isLoading: feedsLoading,
    isFetching: feedsFetching,
    error: feedsError,
  } = useYouTubeFeeds();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();
  const {
    data: countries = [],
    isLoading: countriesLoading,
    error: countriesError,
  } = useCountries();

  const createFeed = useCreateYouTubeFeed();
  const updateFeed = useUpdateYouTubeFeed();
  const deleteFeed = useDeleteYouTubeFeed();
  const fetchFeed = useFetchYouTubeFeed();
  const fetchAllFeeds = useFetchAllYouTubeFeeds();
  const searchChannel = useSearchYouTubeChannel();

  const error = feedsError || categoriesError || countriesError;
  const isLoading = feedsLoading || categoriesLoading || countriesLoading;
  const isMutating =
    createFeed.isPending ||
    updateFeed.isPending ||
    deleteFeed.isPending ||
    fetchFeed.isPending ||
    fetchAllFeeds.isPending ||
    searchChannel.isPending;

  function getSafeMaxResults() {
    const parsed = Number.parseInt(maxResults, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return 5;
    }
    return parsed;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await updateFeed.mutateAsync({ id: editingId, data: formData });
      } else {
        await createFeed.mutateAsync(formData);
      }
      handleCancel();
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleLookupChannel() {
    const query = lookupQuery.trim();
    if (!query) {
      await dialog.alert('Enter a channel name to search.');
      return;
    }
    try {
      const results = await searchChannel.mutateAsync({ query, maxResults: 5 });
      if (!results?.length) {
        setLookupResult(null);
        await dialog.alert('No channels found. Try a different name.');
        return;
      }
      const match = results[0];
      setLookupResult(match);
      setFormData((prev) => ({
        ...prev,
        channel_id: match.channel_id,
        display_name: match.display_name,
        channel_url: match.channel_url || '',
      }));
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this YouTube feed?');
    if (!confirmed) return;
    try {
      await deleteFeed.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }


  async function handleFetch(feedId) {
    try {
      const result = await fetchFeed.mutateAsync({
        feedId,
        maxResults: getSafeMaxResults(),
      });
      await dialog.alert(
        `Fetch completed!\nStatus: ${result.status}\nVideos collected: ${result.post_count}${
          result.error_message ? '\nErrors: ' + result.error_message : ''
        }`,
      );
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleFetchAll() {
    const confirmed = await dialog.confirm('Fetch all active YouTube feeds? This may take a while.');
    if (!confirmed) return;
    try {
      const results = await fetchAllFeeds.mutateAsync(getSafeMaxResults());
      const summary = results
        .map((result) => `${result.display_name || result.channel_id}: ${result.post_count} videos`)
        .join('\n');
      await dialog.alert(`Fetched ${results.length} YouTube feeds:\n${summary}`);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function handleEdit(feed) {
    setEditingId(feed.id);
    setFormData({
      category_id: feed.category_id,
      channel_id: feed.channel_id,
      display_name: feed.display_name,
      channel_url: feed.channel_url || '',
      country: feed.country || '',
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setLookupQuery('');
    setLookupResult(null);
    setFormData({
      category_id: '',
      channel_id: '',
      display_name: '',
      channel_url: '',
      country: '',
    });
  }

  function getCategoryName(categoryId) {
    const category = categories.find((cat) => cat.id === categoryId);
    return category ? category.name : 'Unknown';
  }

  if (isLoading) return <div className="loading">Loading YouTube feeds...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>YouTube Feeds</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label>
            Max results
            <input
              type="number"
              min="1"
              max="50"
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
              style={{ width: '80px', marginLeft: '8px' }}
            />
          </label>
          <button className="button success" onClick={handleFetchAll} disabled={isMutating}>
            Fetch All
          </button>
          <button className="button" onClick={() => setShowForm(!showForm)} disabled={isMutating}>
            {showForm ? 'Cancel' : 'Add YouTube Feed'}
          </button>
        </div>
        {feedsFetching && <span className="badge">Refreshing...</span>}
      </div>

      {error && <div className="error">{error.message}</div>}

      {showForm && (
        <form className="form card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit YouTube Feed' : 'New YouTube Feed'}</h3>
          <div className="form-group">
            <label>Find Channel</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                placeholder="Search by channel name"
              />
              <button
                type="button"
                className="button secondary"
                onClick={handleLookupChannel}
                disabled={isMutating}
              >
                {searchChannel.isPending ? 'Searching...' : 'Search'}
              </button>
            </div>
            {lookupResult && (
              <small>
                Found {lookupResult.display_name} ({lookupResult.channel_id})
              </small>
            )}
          </div>
          <div className="form-group">
            <label>Channel ID *</label>
            <input
              type="text"
              value={formData.channel_id}
              onChange={(e) => setFormData({ ...formData, channel_id: e.target.value })}
              placeholder="e.g., UC..."
              required
            />
          </div>
          <div className="form-group">
            <label>Display Name *</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="e.g., Channel Name"
              required
            />
          </div>
          <div className="form-group">
            <label>Channel URL</label>
            <input
              type="text"
              value={formData.channel_url}
              onChange={(e) => setFormData({ ...formData, channel_url: e.target.value })}
              placeholder="https://www.youtube.com/channel/..."
            />
          </div>
          <div className="form-group">
            <label>Category *</label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
              required
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Country *</label>
            <select
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              required
            >
              <option value="">Select a country</option>
              {countries.map((country) => (
                <option key={country.id} value={country.name}>{country.name}</option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="button" disabled={isMutating}>
              {editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" className="button secondary" onClick={handleCancel} disabled={isMutating}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Channel</th>
              <th>Category</th>
              <th>Country</th>
              <th>Last Fetched</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => (
              <tr key={feed.id}>
                <td>{feed.id}</td>
                <td>
                  <div>
                    <strong>{feed.display_name}</strong>
                    <div>{feed.channel_id}</div>
                    {feed.channel_url && (
                      <a href={feed.channel_url} target="_blank" rel="noopener noreferrer">
                        Channel Link
                      </a>
                    )}
                  </div>
                </td>
                <td>{getCategoryName(feed.category_id)}</td>
                <td>{feed.country || '-'}</td>
                <td>{feed.last_fetched ? new Date(feed.last_fetched).toLocaleString() : 'Never'}</td>
                <td>
                  <div className="action-buttons">
                    <button className="button-sm success" onClick={() => handleFetch(feed.id)} disabled={isMutating}>
                      Fetch
                    </button>
                    <button className="button-sm" onClick={() => handleEdit(feed)} disabled={isMutating}>
                      Edit
                    </button>
                    <button className="button-sm danger" onClick={() => handleDelete(feed.id)} disabled={isMutating}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
