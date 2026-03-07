import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { StagedArticle } from '../../types'
import { isStagedArticleEditingLocked } from '../../utils/staged-article-sync'

type EditorialStageLayoutProps = {
  stagedArticle: StagedArticle
  stagePath: string
  hasMissingFeaturedImage: boolean
  isConverting: boolean
  onResetToOriginalBlocks: () => void
  onDelete: () => void
  onUpdateTitle: (title: string) => void
  mainContent: ReactNode
  sidebarContent: ReactNode
}

export function EditorialStageLayout({
  stagedArticle,
  stagePath,
  hasMissingFeaturedImage,
  isConverting,
  onResetToOriginalBlocks,
  onDelete,
  onUpdateTitle,
  mainContent,
  sidebarContent,
}: EditorialStageLayoutProps) {
  const isEditingLocked = isStagedArticleEditingLocked(stagedArticle)
  const isPublished = stagedArticle.payloadStatus === 'published'
  const isLinkedDraft = Boolean(stagedArticle.payloadArticleId) && !isPublished

  return (
    <div className="stage-article-page">
      <header className="stage-article-header">
        <div className="stage-article-header-left">
          <Link to={stagePath} className="stage-article-back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Stage List
          </Link>
          <div className="stage-article-header-meta">
            <p className="stage-article-eyebrow">
              {isPublished ? 'Published to Payload' : isLinkedDraft ? 'Draft synced to Payload' : 'Staging for Payload'}
            </p>
            {stagedArticle.originalType && (
              <span className="stage-article-type-badge">{stagedArticle.originalType}</span>
            )}
            {!isPublished && hasMissingFeaturedImage && (
              <span className="stage-article-badge missing">
                Missing featured image
              </span>
            )}
            {isConverting && (
              <span className="stage-article-badge converting">
                <span className="stage-article-badge-spinner" />
                Converting...
              </span>
            )}
            {stagedArticle.payloadArticleId && (
              <span className="stage-article-badge published">
                {isPublished ? 'Published' : 'Draft'} #{stagedArticle.payloadArticleId}
              </span>
            )}
          </div>
        </div>

        <div className="stage-article-actions-bar">
          {!isEditingLocked && (
            <button
              type="button"
              className="stage-article-icon-btn"
              onClick={onResetToOriginalBlocks}
              title="Reset to original blocks"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              Reset
            </button>
          )}
          <button
            className="stage-article-icon-btn danger"
            onClick={onDelete}
            title="Delete staged article"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete
          </button>
        </div>
      </header>

      <div className="stage-article-title-area">
        {!isEditingLocked ? (
          <input
            type="text"
            className="stage-article-title-input"
            value={stagedArticle.title}
            onChange={(event) => onUpdateTitle(event.target.value)}
            placeholder="Article title..."
          />
        ) : (
          <h1 className="stage-article-title">{stagedArticle.title || 'Untitled Article'}</h1>
        )}
      </div>

      <div className="stage-article-layout">
        <main className="stage-article-main">
          {mainContent}
        </main>
        {sidebarContent}
      </div>
    </div>
  )
}
