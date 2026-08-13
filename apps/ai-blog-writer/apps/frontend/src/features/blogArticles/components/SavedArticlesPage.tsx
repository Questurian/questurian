import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { fetchPayloadArticles } from '../../staging'
import type { SavedArticlesPageConfig, SavedBlogArticle } from '../types'
import { useLocalStagedDrafts } from '../hooks/useLocalStagedDrafts'
import { LocalDraftsTable } from './LocalDraftsTable'
import { PayloadDocumentsTable } from './PayloadDocumentsTable'
import { GeneratedArticlesTable } from './GeneratedArticlesTable'

const EMPTY_ARTICLES: never[] = []

export default function SavedArticlesPage<TArticle extends SavedBlogArticle>({
  config,
}: {
  config: SavedArticlesPageConfig<TArticle>
}) {
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()

  const { localDrafts, discardLocalDraft, clearAllLocalDrafts } = useLocalStagedDrafts(config.storageKey)
  const [generatedDeleteTarget, setGeneratedDeleteTarget] = useState<TArticle | null>(null)

  const articlesQuery = useQuery({
    queryKey: [config.featureKey, 'articles'],
    queryFn: config.fetchArticles,
  })

  const articles = articlesQuery.data ?? EMPTY_ARTICLES

  // The Payload Documents table is driven by Payload itself (source of truth),
  // not by the backend's local sync bookkeeping — one combined list across all
  // blog-writer pipelines.
  const payloadDocsQuery = useQuery({
    queryKey: ['payload-articles', user?.id ?? 'anonymous'],
    enabled: isAuthenticated,
    queryFn: () => fetchPayloadArticles(),
  })
  const payloadDocs = payloadDocsQuery.data ?? EMPTY_ARTICLES

  const payloadDocIds = useMemo(
    () => new Set(payloadDocs.map((doc) => doc.id)),
    [payloadDocs],
  )
  const payloadDocRunIds = useMemo(
    () => new Set(payloadDocs.map((doc) => doc.sourceRunId).filter(Boolean)),
    [payloadDocs],
  )

  // Generated keeps only runs with no Payload counterpart — matched via local
  // sync bookkeeping when present, or via the doc's stamped sourceRunId.
  const generatedRows = useMemo(
    () => articles.filter((article) => {
      if (article.synced_to_payload && article.payload_article_id) return false
      if (article.payload_article_id && payloadDocIds.has(article.payload_article_id)) return false
      return !payloadDocRunIds.has(article.run_id)
    }),
    [articles, payloadDocIds, payloadDocRunIds],
  )

  const localDraftRows = useMemo(() => (
    localDrafts.filter((draft) => !draft.payloadArticleId || !payloadDocIds.has(draft.payloadArticleId))
  ), [localDrafts, payloadDocIds])

  const deleteGeneratedArticleMutation = useMutation({
    mutationFn: (runId: string) => config.deleteArticle(runId),
    onSuccess: async () => {
      setGeneratedDeleteTarget(null)
      await queryClient.invalidateQueries({ queryKey: [config.featureKey, 'articles'] })
    },
  })

  const openGeneratedDeleteModal = (article: TArticle) => {
    setGeneratedDeleteTarget(article)
    deleteGeneratedArticleMutation.reset()
  }

  const closeGeneratedDeleteModal = () => {
    if (deleteGeneratedArticleMutation.isPending) return
    setGeneratedDeleteTarget(null)
    deleteGeneratedArticleMutation.reset()
  }

  const confirmDeleteGeneratedArticle = () => {
    if (!generatedDeleteTarget) return
    deleteGeneratedArticleMutation.mutate(generatedDeleteTarget.run_id)
  }

  const clearAllGeneratedMutation = useMutation({
    mutationFn: async (runIds: string[]) => {
      await Promise.all(runIds.map((runId) => config.deleteArticle(runId)))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [config.featureKey, 'articles'] })
    },
  })

  const handleClearAllLocalDrafts = () => {
    if (localDraftRows.length === 0) return
    const confirmed = window.confirm(
      `Discard all ${localDraftRows.length} local draft${localDraftRows.length === 1 ? '' : 's'}? This cannot be undone.`,
    )
    if (!confirmed) return
    clearAllLocalDrafts()
  }

  const handleClearAllGenerated = () => {
    if (generatedRows.length === 0 || clearAllGeneratedMutation.isPending) return
    const confirmed = window.confirm(
      `Delete all ${generatedRows.length} generated article${generatedRows.length === 1 ? '' : 's'}? This cannot be undone.`,
    )
    if (!confirmed) return
    clearAllGeneratedMutation.mutate(generatedRows.map((article) => article.run_id))
  }

  const pageContent = articlesQuery.isLoading ? (
    <section className="stl-panel">
      <p className="stl-placeholder">Loading payload documents...</p>
    </section>
  ) : articlesQuery.isError ? (
    <section className="stl-panel">
      <p className="stl-error">Failed to load payload documents. Is backend running?</p>
    </section>
  ) : (
    <main className={config.classNames.savedLayout}>
      <LocalDraftsTable
        rows={localDraftRows}
        buildDraftUrl={config.buildDraftUrl}
        onDiscard={discardLocalDraft}
        onClearAll={handleClearAllLocalDrafts}
      />

      <PayloadDocumentsTable
        docs={payloadDocs}
        localDrafts={localDrafts}
        buildDraftUrl={config.buildDraftUrl}
        isLoading={payloadDocsQuery.isLoading}
        loadErrorMessage={
          payloadDocsQuery.isError
            ? (payloadDocsQuery.error instanceof Error ? payloadDocsQuery.error.message : 'Unknown error')
            : null
        }
        isSignedIn={isAuthenticated}
      />

      <GeneratedArticlesTable
        rows={generatedRows}
        localDrafts={localDrafts}
        buildStageUrl={config.buildStageUrl}
        buildDraftUrl={config.buildDraftUrl}
        onDelete={openGeneratedDeleteModal}
        onClearAll={handleClearAllGenerated}
        isClearingAll={clearAllGeneratedMutation.isPending}
      />
    </main>
  )

  return (
    <div className="stl-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Saved Articles</h1>
          <p className="stl-lede">
            Local drafts and Payload publication status in one place.
          </p>
        </div>
        <div className="stl-hero-actions">
          {config.heroActions.map((action) => (
            <Link
              key={`${action.to}:${action.label}`}
              to={action.to}
              className={`stl-btn stl-btn-${action.variant ?? 'secondary'}`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </header>
      {pageContent}
      {generatedDeleteTarget ? (
        <div className="stl-modal-overlay" role="presentation" onClick={closeGeneratedDeleteModal}>
          <div
            className="stl-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${config.featureKey}-delete-generated-title`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={`${config.featureKey}-delete-generated-title`}>Delete Generated Article?</h3>
            <p>
              Are you sure you want to delete{' '}
              <strong>{generatedDeleteTarget.title || 'this generated article'}</strong>?
            </p>
            <p>This cannot be undone.</p>
            {deleteGeneratedArticleMutation.isError ? (
              <p className="stl-error">Failed to delete article. Please try again.</p>
            ) : null}
            <div className="stl-table-actions">
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={closeGeneratedDeleteModal}
                disabled={deleteGeneratedArticleMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="stl-btn stl-btn-danger"
                onClick={confirmDeleteGeneratedArticle}
                disabled={deleteGeneratedArticleMutation.isPending}
              >
                {deleteGeneratedArticleMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
