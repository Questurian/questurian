import { useState } from 'react';
import { useCountries, useCreateCountry, useDeleteCountry, useUpdateCountry } from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function Countries() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const dialog = useDialog();

  const {
    data: countries = [],
    isLoading,
    isFetching,
    error,
  } = useCountries();
  const createCountry = useCreateCountry();
  const updateCountry = useUpdateCountry();
  const deleteCountry = useDeleteCountry();

  const isMutating =
    createCountry.isPending || updateCountry.isPending || deleteCountry.isPending;

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await updateCountry.mutateAsync({ id: editingId, data: formData });
      } else {
        await createCountry.mutateAsync(formData);
      }
      setFormData({ name: '' });
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this country?');
    if (!confirmed) return;
    try {
      await deleteCountry.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function handleEdit(country) {
    setEditingId(country.id);
    setFormData({ name: country.name });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '' });
  }

  if (isLoading) return <div className="loading">Loading countries...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Countries</h1>
        <button className="button" onClick={() => setShowForm(!showForm)} disabled={isMutating}>
          {showForm ? 'Cancel' : 'Add Country'}
        </button>
        {isFetching && <span className="badge">Refreshing...</span>}
      </div>

      {error && <div className="error">{error.message}</div>}

      {showForm && (
        <form className="form card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Country' : 'New Country'}</h3>
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
            {countries.map((country) => (
              <tr key={country.id}>
                <td>{country.id}</td>
                <td><strong>{country.name}</strong></td>
                <td className="actions">
                  <button className="button-sm" onClick={() => handleEdit(country)}>
                    Edit
                  </button>
                  <button className="button-sm danger" onClick={() => handleDelete(country.id)} disabled={isMutating}>
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
