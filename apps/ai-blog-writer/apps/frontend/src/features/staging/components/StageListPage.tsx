import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useStageList } from '../hooks/useStageList'
import { removeStagedArticle } from '../features/editorial-stage-article/services/editorial-stage-storage.service'
import type { StagedArticle } from '../types'
import {
  getStagedArticleMissingFields,
  getStagedArticleStatusBadge,
} from '../utils/staged-article-status'
import '../../youtube2blog/styles/stage.css'

type StageListPageProps = {
  storageKey: string
  articlesPath: string
  stageArticlePath: string
  showEditorialBlocking?: boolean
}

function renderStatusBadge(article: StagedArticle, showEditorialBlocking: boolean) {
  const badge = getStagedArticleStatusBadge(article, { showEditorialBlocking })
  return <span className={`stage-list-badge ${badge.className}`}>{badge.label}</span>
}

export default function StageListPage({
  storageKey,
  articlesPath,
  stageArticlePath,
  showEditorialBlocking = false,
}: StageListPageProps) {
  const { stagedArticles, isLoading, setStagedArticles } = useStageList(storageKey)

  const readyCount = stagedArticles.filter(
    (article) =>
      !article.publishedToPayload
      && article.lexicalConverted
      && article.locationId
      && article.featuredImageId
      && !(showEditorialBlocking && article.editorialBlocks?.length)
  ).length

  const handleDelete = async (id: string, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!confirm('Delete this staged article?')) return

    await removeStagedArticle(storageKey, id)
    setStagedArticles((current) => current.filter((article) => article.id !== id))
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
            {stagedArticles.filter((article) => article.payloadStatus === 'published').length}
          </span>
          <span className="stage-stat-label">Published</span>
        </div>
        <div className="stage-stat-item">
          <span className="stage-stat-value">{readyCount}</span>
          <span className="stage-stat-label">Ready</span>
        </div>
      </div>

      {stagedArticles.length === 0 ? (
        <div className="stage-empty-state">
          <p>No staged articles yet.</p>
          <p className="stage-hint">
            Go to <Link to={articlesPath}>Saved Articles</Link> and click "Stage for Payload" to add articles here.
          </p>
        </div>
      ) : (
        <div className="stage-list">
          {stagedArticles.map((article) => {
            const missing = getStagedArticleMissingFields(article, { showEditorialBlocking })

            return (
              <Link
                key={article.id}
                to={`${stageArticlePath}?stagedId=${article.id}`}
                className={`stage-list-item ${article.payloadStatus === 'published' ? 'published' : ''}`}
              >
                <div className="stage-list-content">
                  <div className="stage-list-header">
                    <h3>{article.title || 'Untitled'}</h3>
                    {renderStatusBadge(article, showEditorialBlocking)}
                  </div>

                  <div className="stage-list-meta">
                    <span>Run: {article.runId.slice(0, 8)}...</span>
                    <span>•</span>
                    <span>{article.content.length} chars</span>
                    <span>•</span>
                    <span>Updated {new Date(article.updatedAt).toLocaleDateString()}</span>
                  </div>

                  {missing.length > 0 && article.payloadStatus !== 'published' && !article.payloadArticleId && (
                    <div className="stage-list-missing">
                      Missing: {missing.join(', ')}
                    </div>
                  )}
                </div>

                <button
                  className="stage-list-delete"
                  onClick={(event) => handleDelete(article.id, event)}
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
        <Link to={articlesPath} className="stage-btn">
          ← Back to Saved Articles
        </Link>
      </div>
    </div>
  )
}
