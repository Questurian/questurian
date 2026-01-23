import { useState } from 'react';
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function Categories() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const dialog = useDialog();

  const {
    data: categories = [],
    isLoading,
    isFetching,
    error,
  } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const isMutating =
    createCategory.isPending || updateCategory.isPending || deleteCategory.isPending;

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await updateCategory.mutateAsync({ id: editingId, data: formData });
      } else {
        await createCategory.mutateAsync(formData);
      }
      setFormData({ name: '' });
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this category?');
    if (!confirmed) return;
    try {
      await deleteCategory.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function handleEdit(category) {
    setEditingId(category.id);
    setFormData({ name: category.name });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '' });
  }

  if (isLoading) return <div className="loading">Loading categories...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Categories</h1>
        <button className="button" onClick={() => setShowForm(!showForm)} disabled={isMutating}>
          {showForm ? 'Cancel' : 'Add Category'}
        </button>
        {isFetching && <span className="badge">Refreshing...</span>}
      </div>

      {error && <div className="error">{error.message}</div>}

      {showForm && (
        <form className="form card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Category' : 'New Category'}</h3>
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ name: e.target.value })}
              required
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
              <th>Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.id}</td>
                <td><strong>{category.name}</strong></td>
                <td className="actions">
                  <button className="button-sm" onClick={() => handleEdit(category)}>
                    Edit
                  </button>
                  <button className="button-sm danger" onClick={() => handleDelete(category.id)} disabled={isMutating}>
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
