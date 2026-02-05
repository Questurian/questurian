import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchArticles, fetchArticleTypes } from '../api'

function getArticlePreview(markdown: string, maxLength: number = 300): string {
  if (!markdown) return ''
  // Remove the title heading if present
  const withoutTitle = markdown.replace(/^#\s+.+\n+/, '').trim()
  if (withoutTitle.length <= maxLength) return withoutTitle
  return withoutTitle.slice(0, maxLength).trim() + '...'
}

export default function ImagePipelinePage() {
  const [selectedArticleId, setSelectedArticleId] = useState<string>('')

  const articlesQuery = useQuery({
    queryKey: ['articles'],
    queryFn: fetchArticles,
  })

  const articleTypesQuery = useQuery({
    queryKey: ['article-types'],
    queryFn: fetchArticleTypes,
  })

  const articles = articlesQuery.data ?? []
  const articleTypes = articleTypesQuery.data ?? []
  const selectedArticle = articles.find((a) => a.run_id === selectedArticleId)
  const selectedArticleType = selectedArticle
    ? articleTypes.find((t) => t.name === selectedArticle.article_type)
    : null

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Questurian Studio</p>
          <h1>Image <span className="underline-text">Pipeline</span><span className="orange-dot">.</span></h1>
          <p className="lede">
            Generate images for your articles.
          </p>
        </div>
        <div className="badge-row">
          <div className="badge">Testing Feature</div>
          <Link to="/youtube2blog" className="nav-link">Back to Pipeline</Link>
          <Link to="/youtube2blog/articles" className="nav-link">Saved Articles</Link>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Select Article</h2>
            <p>Choose an article to process.</p>
          </div>
          <div className="panel-body">
            {articlesQuery.isLoading ? (
              <p className="placeholder">Loading articles...</p>
            ) : articlesQuery.isError ? (
              <p className="error">Failed to load articles. Is the backend running?</p>
            ) : articles.length === 0 ? (
              <div className="empty-state">
                <p>No articles available.</p>
                <p className="muted">Check back later after generating some articles.</p>
              </div>
            ) : (
              <div className="image-pipeline-form">
                <div className="form-group">
                  <label htmlFor="article-select">Article</label>
                  <select
                    id="article-select"
                    value={selectedArticleId}
                    onChange={(e) => setSelectedArticleId(e.target.value)}
                    className="article-select"
                  >
                    <option value="">-- Select an article --</option>
                    {articles.map((article) => (
                      <option key={article.run_id} value={article.run_id}>
                        {article.title || 'Untitled'} ({article.article_type || 'Unknown type'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </section>

        {selectedArticle && (
          <section className="panel">
            <div className="panel-header">
              <h2>Pipeline Input</h2>
            </div>
            <div className="panel-body">
              <div className="pipeline-input-card">
                <div className="input-field">
                  <span className="input-label">Title</span>
                  <span className="input-value title-value">{selectedArticle.title || 'Untitled'}</span>
                </div>

                <div className="input-field">
                  <span className="input-label">Article Type</span>
                  <span className="input-value">
                    <span className="article-type-badge">{selectedArticle.article_type || 'Unknown'}</span>
                  </span>
                  {selectedArticleType?.definition && (
                    <span className="input-description">{selectedArticleType.definition}</span>
                  )}
                </div>

                <div className="input-field">
                  <span className="input-label">Article</span>
                  <span className="input-value article-preview">
                    {getArticlePreview(selectedArticle.markdown)}
                  </span>
                  <span className="input-meta">{Math.round(selectedArticle.markdown_length / 1000)}k characters total</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
