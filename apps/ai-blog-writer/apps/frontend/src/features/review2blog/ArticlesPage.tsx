import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getReview2BlogArticles, type Review2BlogSavedArticle } from './api'
import './styles.css'

function formatDate(value: string): string {
  if (!value) return 'Unknown'
  try {
    const date = new Date(value)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function groupByLocation(articles: Review2BlogSavedArticle[]) {
  const groups = new Map<
    string,
    {
      key: string
      locationName: string
      locationKey: string
      items: Review2BlogSavedArticle[]
    }
  >()

  articles.forEach((article) => {
    const locationKey = article.location_key?.trim() || 'unlinked'
    const existing = groups.get(locationKey)
    if (existing) {
      existing.items.push(article)
      return
    }

    groups.set(locationKey, {
      key: locationKey,
      locationKey,
      locationName: article.location_name?.trim() || 'Unknown location',
      items: [article],
    })
  })

  return Array.from(groups.values())
}

function SavedBlurbCard({ article }: { article: Review2BlogSavedArticle }) {
  const reviewUrl = `/review2blog?runId=${encodeURIComponent(article.run_id)}`

  return (
    <div className="article-card">
      <div className="article-card-header">
        <div className="article-card-info">
          <h3>{article.listicle_title || article.title || 'Untitled blurb'}</h3>
          <div className="article-card-meta">
            <span className="article-type-badge">review2blog</span>
            {article.blurb_length ? <span className="article-date">{article.blurb_length}</span> : null}
            <span className="article-date">{formatDate(article.updated_at)}</span>
            <span className="article-length">{Math.round(article.markdown_length / 1000)}k chars</span>
          </div>
        </div>
        <div className="article-card-actions">
          <Link to={reviewUrl} className="nav-link">
            Open in Review2Blog
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function Review2BlogArticlesPage() {
  const articlesQuery = useQuery({
    queryKey: ['review2blog', 'articles'],
    queryFn: () => getReview2BlogArticles(),
  })

  const articles = articlesQuery.data ?? []
  const groups = groupByLocation(articles)

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Questurian Studio</p>
          <h1>
            Saved <span className="underline-text">Blurbs</span>
            <span className="orange-dot">.</span>
          </h1>
          <p className="lede">
            View every saved Review2Blog run, grouped by location so one place can hold multiple
            listicle blurbs.
          </p>
        </div>
        <div className="badge-row">
          <Link to="/review2blog" className="nav-link">
            Back to Pipeline
          </Link>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Saved Locations ({groups.length})</h2>
          </div>
          <div className="panel-body">
            {articlesQuery.isLoading ? (
              <p className="placeholder">Loading saved blurbs...</p>
            ) : articlesQuery.isError ? (
              <p className="error">Failed to load saved blurbs. Is the backend running?</p>
            ) : groups.length === 0 ? (
              <div className="empty-state">
                <p>No saved blurbs yet.</p>
                <p className="muted">Run Review2Blog to generate your first saved blurb.</p>
              </div>
            ) : (
              <div className="r2b-saved-groups">
                {groups.map((group) => (
                  <article key={group.key} className="r2b-saved-group">
                    <div className="article-card-header">
                      <div className="article-card-info">
                        <h3>{group.locationName}</h3>
                        <div className="article-card-meta">
                          <span className="article-date">{group.locationKey}</span>
                          <span className="article-length">{group.items.length} blurbs</span>
                        </div>
                      </div>
                    </div>
                    <div className="articles-list">
                      {group.items.map((article) => (
                        <SavedBlurbCard key={article.run_id} article={article} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
