import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import type { SavedArticlesPageConfig, SavedBlogArticle } from '../types'
import { useLocalStagedDrafts } from '../hooks/useLocalStagedDrafts'
import { usePayloadPublicationStatuses } from '../hooks/usePayloadPublicationStatuses'
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
  const { token } = useAuth()

  const { localDrafts, discardLocalDraft } = useLocalStagedDrafts(config.storageKey)
  const [generatedDeleteTarget, setGeneratedDeleteTarget] = useState<TArticle | null>(null)

  const articlesQuery = useQuery({
    queryKey: [config.featureKey, 'articles'],
    queryFn: config.fetchArticles,
  })

  const articles = articlesQuery.data ?? EMPTY_ARTICLES
  const generatedRows = useMemo(
    () => articles.filter((article) => !(article.synced_to_payload && article.payload_article_id)),
    [articles],
  )
  const payloadRows = useMemo(
    () => articles.filter((article) => Boolean(article.synced_to_payload && article.payload_article_id)),
    [articles],
  )
  const payloadArticleIds = useMemo(
    () => (
      [...new Set(
        payloadRows
          .map((article) => article.payload_article_id)
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
      )].sort((a, b) => a - b)
    ),
    [payloadRows],
  )

  const { payloadStatusByArticleId, isFetching: isFetchingStatuses } = usePayloadPublicationStatuses({
    featureKey: config.featureKey,
    payloadArticleIds,
    token,
  })

  const localPayloadIds = useMemo(
    () => new Set(localDrafts.map((draft) => draft.payloadArticleId).filter((id): id is number => typeof id === 'number')),
    [localDrafts],
  )

  const localDraftRows = useMemo(() => (
    localDrafts.filter((draft) => !draft.payloadArticleId || !payloadArticleIds.includes(draft.payloadArticleId))
  ), [localDrafts, payloadArticleIds])

  const unresolvedSyncedStatusCount = useMemo(() => (
    payloadRows.filter((article) => {
      if (!article.synced_to_payload || !article.payload_article_id) return false
      return !payloadStatusByArticleId[article.payload_article_id]
    }).length
  ), [payloadRows, payloadStatusByArticleId])

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
      />

      <PayloadDocumentsTable
        rows={payloadRows}
        localDrafts={localDrafts}
        payloadStatusByArticleId={payloadStatusByArticleId}
        buildStageUrl={config.buildStageUrl}
        buildDraftUrl={config.buildDraftUrl}
        statusNoteClassName={config.classNames.statusNote}
        isFetchingStatuses={isFetchingStatuses}
        hasToken={Boolean(token)}
        payloadArticleIdCount={payloadArticleIds.length}
        unresolvedSyncedStatusCount={unresolvedSyncedStatusCount}
        localPayloadIdCount={localPayloadIds.size}
      />

      <GeneratedArticlesTable
        rows={generatedRows}
        localDrafts={localDrafts}
        buildStageUrl={config.buildStageUrl}
        buildDraftUrl={config.buildDraftUrl}
        onDelete={openGeneratedDeleteModal}
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
