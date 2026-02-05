import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { StagedArticle } from './StageArticlePage'
import '../styles/stage.css'

const STORAGE_KEY = 'youtube2blog_staged_articles'

export default function StagePage() {
  const [stagedArticles, setStagedArticles] = useState<StagedArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadStaged = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: StagedArticle[] = JSON.parse(stored)
        // Sort by updatedAt desc
        parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        setStagedArticles(parsed)
      }
      setIsLoading(false)
    }
    
    loadStaged()
    
    // Reload when storage changes
    const handleStorage = () => loadStaged()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this staged article?')) return
    
    const updated = stagedArticles.filter(s => s.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setStagedArticles(updated)
  }

  const getStatusBadge = (article: StagedArticle) => {
    if (article.publishedToPayload) {
      return <span className="stage-list-badge published">✓ Published</span>
    }
    if (article.lexicalConverted && article.locationId && article.featuredImageId) {
      return <span className="stage-list-badge ready">Ready to Publish</span>
    }
    if (article.lexicalConverted) {
      return <span className="stage-list-badge partial">Lexical Ready</span>
    }
    return <span className="stage-list-badge draft">Draft</span>
  }

  const getMissingFields = (article: StagedArticle) => {
    const missing = []
    if (!article.locationId) missing.push('location')
    if (!article.featuredImageId) missing.push('featured image')
    return missing
  }

  if (isLoading) {
    return (
      <div className="stage-page">
        <div className="stage-loading">
          <div className="stage-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stage-page">
      <header className="stage-header">
        <h1>Staged Articles</h1>
        <p className="stage-subtitle">
          Articles ready to be published to Payload CMS
        </p>
      </header>

      <div className="stage-stats-bar">
        <div className="stage-stat-item">
          <span className="stage-stat-value">{stagedArticles.length}</span>
          <span className="stage-stat-label">Total</span>
        </div>
        <div className="stage-stat-item">
          <span className="stage-stat-value">
            {stagedArticles.filter(s => s.publishedToPayload).length}
          </span>
          <span className="stage-stat-label">Published</span>
        </div>
        <div className="stage-stat-item">
          <span className="stage-stat-value">
            {stagedArticles.filter(s => !s.publishedToPayload && s.lexicalConverted && s.locationId && s.featuredImageId).length}
          </span>
          <span className="stage-stat-label">Ready</span>
        </div>
      </div>

      {stagedArticles.length === 0 ? (
        <div className="stage-empty-state">
          <p>No staged articles yet.</p>
          <p className="stage-hint">
            Go to <Link to="/youtube2blog/articles">Saved Articles</Link> and click "Stage for Payload" to add articles here.
          </p>
        </div>
      ) : (
        <div className="stage-list">
          {stagedArticles.map(article => {
            const missing = getMissingFields(article)
            
            return (
              <Link
                key={article.id}
                to={`/youtube2blog/stage-article?stagedId=${article.id}`}
                className={`stage-list-item ${article.publishedToPayload ? 'published' : ''}`}
              >
                <div className="stage-list-content">
                  <div className="stage-list-header">
                    <h3>{article.title || 'Untitled'}</h3>
                    {getStatusBadge(article)}
                  </div>
                  
                  <div className="stage-list-meta">
                    <span>Run: {article.runId.slice(0, 8)}...</span>
                    <span>•</span>
                    <span>{article.content.length} chars</span>
                    <span>•</span>
                    <span>Updated {new Date(article.updatedAt).toLocaleDateString()}</span>
                  </div>
                  
                  {missing.length > 0 && !article.publishedToPayload && (
                    <div className="stage-list-missing">
                      Missing: {missing.join(', ')}
                    </div>
                  )}
                </div>
                
                <button
                  className="stage-list-delete"
                  onClick={(e) => handleDelete(article.id, e)}
                  title="Delete"
                >
                  ×
                </button>
              </Link>
            )
          })}
        </div>
      )}

      <div className="stage-footer">
        <Link to="/youtube2blog/articles" className="stage-btn">
          ← Back to Saved Articles
        </Link>
      </div>
    </div>
  )
}
