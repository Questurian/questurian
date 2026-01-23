import { useState } from 'react';
import { useCategories, useCreateSubreddit, useDeleteSubreddit, useSubreddits, useUpdateSubreddit } from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function Subreddits() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    category_id: '',
    subreddit: '',
    display_name: '',
    description: '',
  });
  const dialog = useDialog();

  const {
    data: subreddits = [],
    isLoading: subredditsLoading,
    isFetching: subredditsFetching,
    error: subredditsError,
  } = useSubreddits();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();

  const createSubreddit = useCreateSubreddit();
  const updateSubreddit = useUpdateSubreddit();
  const deleteSubreddit = useDeleteSubreddit();

  const isLoading = subredditsLoading || categoriesLoading;
  const error = subredditsError || categoriesError;
  const isMutating =
    createSubreddit.isPending || updateSubreddit.isPending || deleteSubreddit.isPending;

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await updateSubreddit.mutateAsync({ id: editingId, data: formData });
      } else {
        await createSubreddit.mutateAsync(formData);
      }
      handleCancel();
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this subreddit?');
    if (!confirmed) return;
    try {
      await deleteSubreddit.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function handleEdit(subreddit) {
    setEditingId(subreddit.id);
    setFormData({
      category_id: subreddit.category_id,
      subreddit: subreddit.subreddit,
      display_name: subreddit.display_name,
      description: subreddit.description || '',
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      category_id: '',
      subreddit: '',
      display_name: '',
      description: '',
    });
  }

  function getCategoryName(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Unknown';
  }

  function getSubredditLink(subreddit) {
    return `https://reddit.com/r/${subreddit}`;
  }

  function truncateText(text, maxLength = 80) {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  }

  function formatDate(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  if (isLoading) return <div className="loading">Loading subreddits...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Subreddits</h1>
        <button className="button" onClick={() => setShowForm(!showForm)} disabled={isMutating}>
          {showForm ? 'Cancel' : 'Add Subreddit'}
        </button>
        {subredditsFetching && <span className="badge">Refreshing...</span>}
      </div>

      {error && <div className="error">{error.message}</div>}

      {showForm && (
        <form className="form card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Subreddit' : 'New Subreddit'}</h3>
          <div className="form-group">
            <label>Category *</label>
            <select
              value={formData.category_id}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, category_id: value ? parseInt(value) : '' });
              }}
              required
            >
              <option value="">Select a category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Subreddit or URL *</label>
            <input
              type="text"
              value={formData.subreddit}
              onChange={(e) => setFormData({ ...formData, subreddit: e.target.value })}
              placeholder="r/python or https://reddit.com/r/python"
              required
            />
          </div>
          <div className="form-group">
            <label>Display Name *</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="e.g., Python Community"
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              rows="3"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
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
              <th>Subreddit</th>
              <th>Display Name</th>
              <th>Category</th>
              <th>Description</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subreddits.map((subreddit) => (
              <tr key={subreddit.id}>
                <td>{subreddit.id}</td>
                <td>
                  <a href={getSubredditLink(subreddit.subreddit)} target="_blank" rel="noopener noreferrer">
                    r/{subreddit.subreddit}
                  </a>
                </td>
                <td><strong>{subreddit.display_name}</strong></td>
                <td>
                  <span className="badge">{getCategoryName(subreddit.category_id)}</span>
                </td>
                <td>{truncateText(subreddit.description)}</td>
                <td>{formatDate(subreddit.created_at)}</td>
                <td className="actions">
                  <button className="button-sm" onClick={() => handleEdit(subreddit)}>
                    Edit
                  </button>
                  <button className="button-sm danger" onClick={() => handleDelete(subreddit.id)} disabled={isMutating}>
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
