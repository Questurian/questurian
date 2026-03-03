import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchArticles, type SavedArticle } from '../api'
import payloadLogoUrl from '../../../assets/payload-logo.svg?url'

function formatDate(dateString: string): string {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateString
  }
}

function ArticleCard({ article }: { article: SavedArticle }) {
  const [expanded] = useState(false)

  // Build stage URL with article data
  const stageUrl = `/youtube2blog/stage-article?${new URLSearchParams({
    runId: article.run_id,
    title: article.title || 'Untitled',
    type: article.article_type || '',
  }).toString()}`

  return (
    <div className="article-card">
      <div className="article-card-header">
        <div className="article-card-info">
          {article.article_type && (
            <div className="article-card-type-row">
              <span className="article-type-badge">{article.article_type}</span>
            </div>
          )}
          <h3>{article.title || 'Untitled Article'}</h3>
          <div className="article-card-meta">
            <span className="article-date">{formatDate(article.updated_at)}</span>
          </div>
        </div>
        <div className="article-card-actions">
          <Link
            to={stageUrl}
            className="payload-action-btn article-payload-btn"
          >
            <img
              src={payloadLogoUrl}
              alt=""
              aria-hidden="true"
              className="payload-action-btn-icon"
            />
            Stage for Payload
          </Link>
        </div>
      </div>
      {expanded && (
        <div className="article-card-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.markdown}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default function ArticlesPage() {
  const articlesQuery = useQuery({
    queryKey: ['articles'],
    queryFn: fetchArticles,
  })

  const articles = articlesQuery.data ?? []

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Questurian Studio</p>
          <h1>Saved <span className="underline-text">Articles</span><span className="orange-dot">.</span></h1>
          <p className="lede">
            View all your previously generated articles.
          </p>
        </div>
        <div className="badge-row">
          <Link to="/youtube2blog" className="nav-link">Back to Pipeline</Link>
          <Link to="/youtube2blog/article-types" className="nav-link">Article Types</Link>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <h2>All Articles ({articles.length})</h2>
          </div>
          <div className="panel-body">
            {articlesQuery.isLoading ? (
              <p className="placeholder">Loading articles...</p>
            ) : articlesQuery.isError ? (
              <p className="error">Failed to load articles. Is the backend running?</p>
            ) : articles.length === 0 ? (
              <div className="empty-state">
                <p>No articles yet.</p>
                <p className="muted">Paste a YouTube URL to generate your first article.</p>
              </div>
            ) : (
              <div className="articles-list">
                {articles.map((article) => (
                  <ArticleCard key={article.run_id} article={article} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
