import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createArticleType, deleteArticleType, fetchArticleTypes, updateArticleType } from '../api'
import type { ArticleType } from '@shared/types'

export default function ArticleTypesPage() {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDefinition, setEditDefinition] = useState('')
  const [newName, setNewName] = useState('')
  const [newDefinition, setNewDefinition] = useState('')
  const [selectedArticleType, setSelectedArticleType] = useState<ArticleType | null>(null)

  const { data: articleTypes = [], isLoading, error } = useQuery({
    queryKey: ['article-types'],
    queryFn: fetchArticleTypes,
  })

  const createMutation = useMutation({
    mutationFn: ({ name, definition }: { name: string; definition: string }) =>
      createArticleType(name, definition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-types'] })
      setNewName('')
      setNewDefinition('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name, definition }: { id: number; name: string; definition: string }) =>
      updateArticleType(id, name, definition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-types'] })
      setEditingId(null)
      setEditName('')
      setEditDefinition('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteArticleType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article-types'] })
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newDefinition.trim()) return
    createMutation.mutate({ name: newName.trim(), definition: newDefinition.trim() })
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId || !editName.trim() || !editDefinition.trim()) return
    updateMutation.mutate({ id: editingId, name: editName.trim(), definition: editDefinition.trim() })
  }

  const handleEdit = (articleType: ArticleType) => {
    setEditingId(articleType.id)
    setEditName(articleType.name)
    setEditDefinition(articleType.definition)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditDefinition('')
  }

  const handleViewGuidelines = (articleType: ArticleType) => {
    setSelectedArticleType(articleType)
  }

  const handleCloseGuidelines = () => {
    setSelectedArticleType(null)
  }

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this article type?')) {
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <header className="hero">
          <div>
            <p className="eyebrow">Article Types Management</p>
            <h1>Loading article types...</h1>
          </div>
        </header>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <header className="hero">
          <div>
            <p className="eyebrow">Article Types Management</p>
            <h1>Error loading article types</h1>
            <p className="lede">Please check the backend connection.</p>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Article Types Management</p>
          <h1>Manage Article Types</h1>
          <p className="lede">
            Add, edit, and delete article types used by the classification pipeline.
          </p>
        </div>
        <div className="badge-row">
          <div className="badge">{articleTypes.length} types</div>
          <Link to="/youtube2blog" className="nav-link">Back to Pipeline</Link>
          <Link to="/youtube2blog/articles" className="nav-link">Saved Articles</Link>
        </div>
      </header>

      <main className="layout">
        {/* Add new article type form */}
        <section className="panel">
          <div className="panel-header">
            <h2>Add New Article Type</h2>
            <p>Create a new article type for classification.</p>
          </div>
          <form className="panel-body" onSubmit={handleCreate}>
            <div className="form-group">
              <label htmlFor="new-name">Article Type Name</label>
              <input
                id="new-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., How-to Guides, Adventure Travel, Cooking Tips"
                autoComplete="off"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-definition">Description</label>
              <textarea
                id="new-definition"
                value={newDefinition}
                onChange={(e) => setNewDefinition(e.target.value)}
                placeholder="Describe what this article type represents and when it should be used..."
                rows={4}
                required
              />
            </div>
            <div className="button-row">
              <button type="submit" disabled={createMutation.isPending || !newName.trim() || !newDefinition.trim()}>
                {createMutation.isPending ? 'Creating...' : 'Add Article Type'}
              </button>
            </div>
            {createMutation.isError && (
              <div className="error-message">
                <p>Failed to create article type. It may already exist or there may be a connection issue.</p>
              </div>
            )}
            {createMutation.isSuccess && (
              <div className="success-message">
                <p>Article type created successfully!</p>
              </div>
            )}
          </form>
        </section>

        {/* Article types list */}
        <section className="panel">
          <div className="panel-header">
            <h2>Article Types ({articleTypes.length})</h2>
            <p>All available article types for pipeline classification.</p>
          </div>
          <div className="panel-body">
            {articleTypes.length === 0 ? (
              <p className="placeholder">No article types found. Add some above.</p>
            ) : (
              <div className="article-types-list">
                {articleTypes.map((articleType) => (
                  <div key={articleType.id} className="article-type-item">
                    {editingId === articleType.id ? (
                      // Edit form - mobile optimized
                      <form onSubmit={handleUpdate} className="edit-form">
                        <div className="form-group">
                          <label htmlFor={`edit-name-${articleType.id}`}>Name</label>
                          <input
                            id={`edit-name-${articleType.id}`}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Enter article type name"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`edit-definition-${articleType.id}`}>Definition</label>
                          <textarea
                            id={`edit-definition-${articleType.id}`}
                            value={editDefinition}
                            onChange={(e) => setEditDefinition(e.target.value)}
                            placeholder="Describe what this article type represents..."
                            rows={3}
                            required
                          />
                        </div>
                        <div className="button-row">
                          <button type="submit" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Updating...' : 'Save Changes'}
                          </button>
                          <button type="button" onClick={handleCancelEdit} className="cancel-btn">
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      // Display mode - mobile optimized
                      <>
                        <div className="article-type-content">
                          <h3>{articleType.name}</h3>
                          <p className="definition">{articleType.definition}</p>
                          <div className="meta">
                            <span>Created: {new Date(articleType.created_at).toLocaleDateString()}</span>
                            <span>Updated: {new Date(articleType.updated_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="article-type-actions">
                          <button
                            type="button"
                            onClick={() => handleViewGuidelines(articleType)}
                            className="view-btn"
                            aria-label={`View guidelines for ${articleType.name}`}
                          >
                            View Guidelines
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(articleType)}
                            className="edit-btn"
                            aria-label={`Edit ${articleType.name}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(articleType.id)}
                            disabled={deleteMutation.isPending}
                            className="delete-btn"
                            aria-label={`Delete ${articleType.name}`}
                          >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Guidelines Modal */}
      {selectedArticleType && (
        <div className="modal-overlay" onClick={handleCloseGuidelines}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedArticleType.name} Guidelines</h2>
              <button
                type="button"
                onClick={handleCloseGuidelines}
                className="close-btn"
                aria-label="Close guidelines"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="guideline-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedArticleType.guideline || 'No guidelines available.'}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}