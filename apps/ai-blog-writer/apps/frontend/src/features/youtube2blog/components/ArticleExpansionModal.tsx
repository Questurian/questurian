import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { ExpansionPhase, ListicleDetection } from '../types/youtube2blog.types'
import { removeTitleFromArticle } from '../utils/article.utils'

type ArticleExpansionModalProps = {
  isOpen: boolean
  phase: ExpansionPhase
  expandedArticle: string | null
  expansionPlan: string | null
  error: string | null
  originalArticle: string
  articleType: string
  title: string
  listicleDetection: ListicleDetection | null
  onAccept: (expandedArticle: string) => void
  onClose: () => void
  onProceed: (article: string, articleType: string, title: string, rewriteItems: string[] | null) => void
}

export function ArticleExpansionModal({
  isOpen,
  phase,
  expandedArticle,
  expansionPlan,
  error,
  originalArticle,
  articleType,
  title,
  listicleDetection,
  onAccept,
  onClose,
  onProceed,
}: ArticleExpansionModalProps) {
  const [items, setItems] = useState<string[]>([])

  // Populate item list when we enter the personalizing phase
  useEffect(() => {
    if (phase === 'personalizing' && listicleDetection) {
      setItems(listicleDetection.detected_items.filter(Boolean))
    }
  }, [phase, listicleDetection])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isRunning = phase === 'analyzing' || phase === 'expanding' || phase === 'rewriting'

  // --- item list helpers ---
  const moveUp = (i: number) => {
    if (i === 0) return
    setItems((prev) => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  const moveDown = (i: number) => {
    setItems((prev) => {
      if (i === prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i))

  const updateItem = (i: number, value: string) =>
    setItems((prev) => prev.map((item, idx) => (idx === i ? value : item)))

  const addItem = () => {
    setItems((prev) => [...prev, ''])
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.listicle-item-input')
      inputs[inputs.length - 1]?.focus()
    }, 30)
  }

  const handleProceed = (skip: boolean) => {
    if (skip) {
      onProceed(originalArticle, articleType, title, null)
      return
    }
    const validItems = items.map((s) => s.trim()).filter(Boolean)
    onProceed(originalArticle, articleType, title, validItems)
  }

  return (
    <div
      className="expansion-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="expansion-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Deep Expand Article"
      >
        <header className="expansion-modal-header">
          <div className="expansion-modal-header-text">
            <h2>Deep Expand</h2>
            <span className="expansion-modal-subtitle">
              {phase === 'personalizing'
                ? 'Curate the list — the article will be fully rewritten around your selections'
                : phase === 'rewriting'
                  ? 'Rewriting article with your curated list'
                  : 'Adds new sections and deeper content while preserving everything existing'}
            </span>
          </div>
          <button type="button" className="expansion-close-btn" onClick={onClose}>
            ×
          </button>
        </header>

        {/* Detecting */}
        {phase === 'detecting' && (
          <div className="expansion-modal-running">
            <div className="expansion-spinner" />
            <p className="expansion-status-label">Checking article type...</p>
          </div>
        )}

        {/* Personalizing — item list editor */}
        {phase === 'personalizing' && listicleDetection && (
          <div className="expansion-personalize">
            <div className="expansion-listicle-banner">
              <span className="expansion-listicle-tag">
                {listicleDetection.list_type ?? 'listicle'}
              </span>
              <span className="expansion-listicle-topic">
                {listicleDetection.list_topic || title}
              </span>
            </div>

            <div className="expansion-personalize-body">
              <p className="listicle-editor-hint">
                Edit, remove, reorder, or add items below. The article will be <strong>fully rewritten</strong> around exactly this list.
              </p>

              <div className="listicle-item-list">
                {items.map((item, i) => (
                  <div key={i} className="listicle-item-row">
                    <span className="listicle-item-num">{i + 1}</span>
                    <input
                      className="listicle-item-input"
                      type="text"
                      value={item}
                      onChange={(e) => updateItem(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addItem()
                      }}
                      placeholder="Item name..."
                    />
                    <div className="listicle-item-actions">
                      <button
                        type="button"
                        className="listicle-action-btn"
                        onClick={() => moveUp(i)}
                        disabled={i === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="listicle-action-btn"
                        onClick={() => moveDown(i)}
                        disabled={i === items.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="listicle-action-btn listicle-action-btn--remove"
                        onClick={() => removeItem(i)}
                        title="Remove item"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" className="listicle-add-btn" onClick={addItem}>
                + Add item
              </button>
            </div>

            <footer className="expansion-modal-footer">
              <span className="listicle-item-count">
                {items.filter((s) => s.trim()).length} items
              </span>
              <button
                type="button"
                className="expansion-btn-dismiss"
                onClick={() => handleProceed(true)}
              >
                Skip — just expand
              </button>
              <button
                type="button"
                className="expansion-btn-accept"
                disabled={items.filter((s) => s.trim()).length === 0}
                onClick={() => handleProceed(false)}
              >
                Rewrite article
              </button>
            </footer>
          </div>
        )}

        {/* Running */}
        {isRunning && (
          <div className="expansion-modal-running">
            <div className="expansion-spinner" />
            <p className="expansion-status-label">
              {phase === 'rewriting'
                ? 'Rewriting the article around your curated list...'
                : phase === 'analyzing'
                  ? 'Analyzing what could make this article more complete...'
                  : 'Writing new sections and deeper dives...'}
            </p>
            {phase !== 'rewriting' && (
              <div className="expansion-steps">
                <div
                  className={`expansion-step ${phase === 'analyzing' ? 'expansion-step--active' : 'expansion-step--done'}`}
                >
                  <span className="expansion-step-num">1</span>
                  <span>Gap analysis</span>
                </div>
                <div
                  className={`expansion-step ${phase === 'expanding' ? 'expansion-step--active' : 'expansion-step--pending'}`}
                >
                  <span className="expansion-step-num">2</span>
                  <span>Expand article</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="expansion-modal-error">
            <p className="expansion-error-message">
              {error ?? 'Something went wrong. Please try again.'}
            </p>
            <button type="button" className="expansion-btn-dismiss" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {/* Completed — Side by Side */}
        {phase === 'completed' && expandedArticle && (
          <>
            <div className="expansion-modal-compare">
              {expansionPlan && (
                <div className="expansion-plan-banner">
                  <strong>What changed:</strong> {expansionPlan}
                </div>
              )}
              <div className="expansion-compare-columns">
                <div className="expansion-column">
                  <div className="expansion-column-label">Original</div>
                  <div className="expansion-article-scroll">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {removeTitleFromArticle(originalArticle)}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="expansion-column expansion-column--new">
                  <div className="expansion-column-label expansion-column-label--new">
                    Rewritten
                  </div>
                  <div className="expansion-article-scroll">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {removeTitleFromArticle(expandedArticle)}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

            <footer className="expansion-modal-footer">
              <button type="button" className="expansion-btn-dismiss" onClick={onClose}>
                Dismiss
              </button>
              <button
                type="button"
                className="expansion-btn-accept"
                onClick={() => onAccept(expandedArticle)}
              >
                Replace Article
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
