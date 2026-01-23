import { useState } from 'react';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function Tags() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const dialog = useDialog();

  const {
    data: tags = [],
    isLoading,
    isFetching,
    error,
  } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const isMutating = createTag.isPending || updateTag.isPending || deleteTag.isPending;

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await updateTag.mutateAsync({ id: editingId, data: formData });
      } else {
        await createTag.mutateAsync(formData);
      }
      setFormData({ name: '' });
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this tag?');
    if (!confirmed) return;
    try {
      await deleteTag.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function handleEdit(tag) {
    setEditingId(tag.id);
    setFormData({ name: tag.name });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '' });
  }

  if (isLoading) return <div className="loading">Loading tags...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tags</h1>
        <button className="button" onClick={() => setShowForm(!showForm)} disabled={isMutating}>
          {showForm ? 'Cancel' : 'Add Tag'}
        </button>
        {isFetching && <span className="badge">Refreshing...</span>}
      </div>

      {error && <div className="error">{error.message}</div>}

      {showForm && (
        <form className="form card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Tag' : 'New Tag'}</h3>
          <div className="form-group">
            <label>Tag Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="e.g., Remote, Python, Senior"
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

      <div className="tags-grid">
        {tags.map((tag) => (
          <div key={tag.id} className="tag-card">
            <span className="tag-name">{tag.name}</span>
            <div className="tag-actions">
              <button className="button-sm" onClick={() => handleEdit(tag)}>
                Edit
              </button>
              <button className="button-sm danger" onClick={() => handleDelete(tag.id)} disabled={isMutating}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {tags.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>No tags yet. Create your first tag to organize feeds!</p>
        </div>
      )}
    </div>
  );
}
