import { useState } from 'react';
import {
  useCategories,
  useCreateFeed,
  useDeleteFeed,
  useFeeds,
  useCountries,
  useFetchAllFeeds,
  useFetchFeed,
  useUpdateFeed,
} from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function Feeds() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fetchStatus, setFetchStatus] = useState(null);
  const [activeFetchId, setActiveFetchId] = useState(null);
  const [formData, setFormData] = useState({
    category_id: '',
    url: '',
    source_name: '',
    website: '',
    country: '',
  });
  const dialog = useDialog();

  const {
    data: feeds = [],
    isLoading: feedsLoading,
    isFetching: feedsFetching,
    error: feedsError,
  } = useFeeds();
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

  const createFeed = useCreateFeed();
  const updateFeed = useUpdateFeed();
  const deleteFeed = useDeleteFeed();
  const fetchFeed = useFetchFeed();
  const fetchAllFeeds = useFetchAllFeeds();

  const error = feedsError || categoriesError || countriesError;
  const isLoading = feedsLoading || categoriesLoading || countriesLoading;
  const isMutating =
    createFeed.isPending ||
    updateFeed.isPending ||
    deleteFeed.isPending ||
    fetchFeed.isPending ||
    fetchAllFeeds.isPending;

  function updateFetchStatus(tone, message) {
    setFetchStatus({
      tone,
      message,
      timestamp: new Date().toLocaleTimeString(),
    });
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

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this feed?');
    if (!confirmed) return;
    try {
      await deleteFeed.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }


  async function handleFetch(feedId) {
    const feedName = feeds.find(feed => feed.id === feedId)?.source_name || `Feed ${feedId}`;
    setActiveFetchId(feedId);
    updateFetchStatus('warning', `Fetching ${feedName}...`);
    try {
      const result = await fetchFeed.mutateAsync(feedId);
      const hasErrors = result.status === 'FAILED';
      const tone = hasErrors ? 'warning' : 'success';
      updateFetchStatus(
        tone,
        `${feedName} fetch ${hasErrors ? 'finished with errors' : 'completed'}.`,
      );
      await dialog.alert(
        `Fetch completed!\nStatus: ${result.status}\nLeads collected: ${result.lead_count}${result.error_message ? '\nErrors: ' + result.error_message : ''}`,
        {
          title: hasErrors ? 'Fetch completed with errors' : 'Fetch completed',
          tone,
        },
      );
    } catch (err) {
      updateFetchStatus('danger', `${feedName} fetch failed.`);
      await dialog.alert(`Error: ${err.message}`, { title: 'Fetch failed', tone: 'danger' });
    } finally {
      setActiveFetchId(null);
    }
  }

  async function handleFetchAll() {
    const confirmed = await dialog.confirm('Fetch all active feeds? This may take a while.');
    if (!confirmed) return;
    updateFetchStatus('warning', 'Fetching all active feeds...');
    try {
      const results = await fetchAllFeeds.mutateAsync();
      const summary = results.map(r => `${r.feed_id}: ${r.lead_count} leads`).join('\n');
      const failures = results.filter(result => result.status === 'FAILED').length;
      const totalLeads = results.reduce((total, result) => total + (result.lead_count || 0), 0);
      const tone = failures > 0 ? 'warning' : 'success';
      updateFetchStatus(
        tone,
        `Fetch complete for ${results.length} feeds. ${totalLeads} leads collected${failures ? `, ${failures} failed` : ''}.`,
      );
      await dialog.alert(`Fetched ${results.length} feeds:\n${summary}`, {
        title: failures ? 'Fetch completed with errors' : 'Fetch completed',
        tone,
      });
    } catch (err) {
      updateFetchStatus('danger', 'Fetch all feeds failed.');
      await dialog.alert(`Error: ${err.message}`, { title: 'Fetch failed', tone: 'danger' });
    }
  }

  function handleEdit(feed) {
    setEditingId(feed.id);
    setFormData({
      category_id: feed.category_id,
      url: feed.url,
      source_name: feed.source_name,
      website: feed.website || '',
      country: feed.country || '',
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      category_id: '',
      url: '',
      source_name: '',
      website: '',
      country: '',
    });
  }

  function getCategoryName(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Unknown';
  }

  if (isLoading) return <div className="loading">Loading feeds...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Feeds</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="button success" onClick={handleFetchAll} disabled={isMutating}>
            {fetchAllFeeds.isPending ? 'Fetching All...' : 'Fetch All'}
          </button>
          <button className="button" onClick={() => setShowForm(!showForm)} disabled={isMutating}>
            {showForm ? 'Cancel' : 'Add Feed'}
          </button>
        </div>
        {feedsFetching && <span className="badge">Refreshing...</span>}
      </div>

      {fetchStatus && (
        <div className="fetch-status" data-tone={fetchStatus.tone} role="status" aria-live="polite">
          <span>{fetchStatus.message}</span>
          <span className="fetch-status-time">{fetchStatus.timestamp}</span>
        </div>
      )}

      {error && <div className="error">{error.message}</div>}

      {showForm && (
        <form className="form card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Feed' : 'New Feed'}</h3>
          <div className="form-group">
            <label>Category *</label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
              required
            >
              <option value="">Select a category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Article URL *</label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Source Name *</label>
            <input
              type="text"
              value={formData.source_name}
              onChange={(e) => setFormData({ ...formData, source_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Website</label>
            <input
              type="text"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            />
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
              <th>Source</th>
              <th>Category</th>
              <th>Country</th>
              <th>URL</th>
              <th>Tags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => (
              <tr key={feed.id}>
                <td>{feed.id}</td>
                <td><strong>{feed.source_name}</strong></td>
                <td>
                  <span className="badge">{getCategoryName(feed.category_id)}</span>
                </td>
                <td>{feed.country || '-'}</td>
                <td>
                  <a href={feed.url} target="_blank" rel="noopener noreferrer" className="link-small">
                    {feed.url.substring(0, 40)}...
                  </a>
                </td>
                <td>
                  {feed.tags && feed.tags.length > 0 ? (
                    <div className="tags">
                      {feed.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  ) : '-'}
                </td>
                <td className="actions">
                  <button className="button-sm success" onClick={() => handleFetch(feed.id)} disabled={isMutating}>
                    {fetchFeed.isPending && activeFetchId === feed.id ? 'Fetching...' : 'Fetch'}
                  </button>
                  <button className="button-sm" onClick={() => handleEdit(feed)}>
                    Edit
                  </button>
                  <button className="button-sm danger" onClick={() => handleDelete(feed.id)} disabled={isMutating}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
