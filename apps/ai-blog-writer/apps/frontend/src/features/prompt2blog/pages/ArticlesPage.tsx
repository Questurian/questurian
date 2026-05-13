import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { getArticleById } from '../../staging/api'
import type { StagedArticle } from '../../staging/types'
import {
  getAllStagedArticles,
  removeStagedArticle,
} from '../../staging/features/editorial-stage-article/services/editorial-stage-storage.service'
import { deleteArticle, fetchArticles, type Prompt2BlogSavedArticle } from '../api'
import {
  findLocalDraftForGeneratedArticle,
  resolveGeneratedArticleStatus,
  statusMeta,
  type PayloadPublicationStatus,
} from '../utils/articles-status.utils'
import '../articles.css'

const STAGED_ARTICLES_KEY = 'prompt2blog_staged_articles_v2'

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

function shortRunId(runId: string): string {
  if (!runId) return 'n/a'
  return `${runId.slice(0, 8)}...`
}

function buildStageUrl(article: Prompt2BlogSavedArticle): string {
  return `/prompt2blog/stage-article?${new URLSearchParams({
    runId: article.run_id,
    title: article.title || 'Untitled',
    type: article.article_type || '',
  }).toString()}`
}

function loadLocalDrafts(): StagedArticle[] {
  return getAllStagedArticles(STAGED_ARTICLES_KEY).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export default function ArticlesPage() {
  const queryClient = useQueryClient()
  const { token } = useAuth()
  const [localDrafts, setLocalDrafts] = useState<StagedArticle[]>(() => loadLocalDrafts())
  const [lastKnownPayloadStatusByArticleId, setLastKnownPayloadStatusByArticleId] = useState<Record<number, PayloadPublicationStatus>>({})
  const [generatedDeleteTarget, setGeneratedDeleteTarget] = useState<Prompt2BlogSavedArticle | null>(null)

  useEffect(() => {
    const refreshLocalDrafts = () => {
      setLocalDrafts(loadLocalDrafts())
    }

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === STAGED_ARTICLES_KEY) {
        refreshLocalDrafts()
      }
    }

    refreshLocalDrafts()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', refreshLocalDrafts)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', refreshLocalDrafts)
    }
  }, [])

  const articlesQuery = useQuery({
    queryKey: ['prompt2blog', 'articles'],
    queryFn: fetchArticles,
  })

  const articles = articlesQuery.data ?? []
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

  const payloadStatusesQuery = useQuery({
    queryKey: ['prompt2blog', 'payload-statuses', payloadArticleIds.join(','), token || 'no-token'],
    enabled: Boolean(token) && payloadArticleIds.length > 0,
    queryFn: async (): Promise<Record<number, PayloadPublicationStatus | undefined>> => {
      const entries = await Promise.all(
        payloadArticleIds.map(async (payloadArticleId) => {
          try {
            const doc = await getArticleById(payloadArticleId, token as string)
            const status: PayloadPublicationStatus = doc.status === 'published' ? 'published' : 'draft'
            return [payloadArticleId, status] as const
          } catch {
            return [payloadArticleId, undefined] as const
          }
        }),
      )

      return Object.fromEntries(entries)
    },
  })

  const livePayloadStatusByArticleId = payloadStatusesQuery.data ?? {}
  const payloadStatusByArticleId = useMemo(() => {
    const merged: Record<number, PayloadPublicationStatus> = { ...lastKnownPayloadStatusByArticleId }
    for (const [idKey, status] of Object.entries(livePayloadStatusByArticleId)) {
      if (!status) continue
      merged[Number(idKey)] = status
    }
    return merged
  }, [lastKnownPayloadStatusByArticleId, livePayloadStatusByArticleId])

  useEffect(() => {
    if (!payloadStatusesQuery.data) return
    setLastKnownPayloadStatusByArticleId((previous) => {
      const merged = { ...previous }
      let changed = false
      for (const [idKey, status] of Object.entries(payloadStatusesQuery.data)) {
        if (!status) continue
        const id = Number(idKey)
        if (merged[id] !== status) {
          merged[id] = status
          changed = true
        }
      }
      return changed ? merged : previous
    })
  }, [payloadStatusesQuery.data])

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

  const discardLocalDraft = (stagedId: string) => {
    const confirmed = window.confirm('Discard this local draft? This cannot be undone.')
    if (!confirmed) return
    removeStagedArticle(STAGED_ARTICLES_KEY, stagedId)
    setLocalDrafts(loadLocalDrafts())
  }

  const deleteGeneratedArticleMutation = useMutation({
    mutationFn: (runId: string) => deleteArticle(runId),
    onSuccess: async () => {
      setGeneratedDeleteTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['prompt2blog', 'articles'] })
    },
  })

  const openGeneratedDeleteModal = (article: Prompt2BlogSavedArticle) => {
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
    <main className="p2b-saved-layout">
      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Local Drafts ({localDraftRows.length})</h2>
        </div>
        <div className="panel-body">
          {localDraftRows.length === 0 ? (
            <div className="stl-empty">
              <p>No local drafts saved.</p>
              <p>Use "Create Local Draft" to start editing before sync.</p>
            </div>
          ) : (
            <div className="stl-table-wrap">
              <table className="stl-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {localDraftRows.map((draft) => {
                    const source = draft.payloadArticleId ? `Payload #${draft.payloadArticleId}` : `Run ${shortRunId(draft.runId)}`

                    return (
                      <tr key={draft.id}>
                        <td>{draft.title || 'Untitled'}</td>
                        <td><span className="stl-status stl-status-local">Local Draft</span></td>
                        <td>{source}</td>
                        <td>{formatDate(draft.updatedAt)}</td>
                        <td>
                          <div className="stl-table-actions">
                            <Link
                              className="stl-link"
                              to={`/prompt2blog/stage-article?stagedId=${encodeURIComponent(draft.id)}`}
                            >
                              Resume
                            </Link>
                            <button
                              type="button"
                              className="stl-btn stl-btn-danger stl-btn-xs"
                              onClick={() => discardLocalDraft(draft.id)}
                            >
                              Discard
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Payload Documents ({payloadRows.length})</h2>
        </div>
        <div className="panel-body">
          {payloadRows.length === 0 ? (
            <div className="stl-empty">
              <p>No synced payload documents yet.</p>
              <p>Create a local draft from Generated, then sync to Payload.</p>
            </div>
          ) : (
            <div className="stl-table-wrap">
              <table className="stl-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payloadRows.map((article) => {
                    const status = resolveGeneratedArticleStatus({
                      article,
                      payloadStatusByArticleId,
                    })
                    const meta = statusMeta(status)
                    const localDraft = findLocalDraftForGeneratedArticle(localDrafts, article)

                    return (
                      <tr key={article.run_id}>
                        <td>{article.title || 'Untitled Article'}</td>
                        <td>{article.article_type || '-'}</td>
                        <td>
                          <span className={`stl-status stl-status-${meta.className}`}>{meta.label}</span>
                          {localDraft ? <span className="stl-status stl-status-local">Local Edits</span> : null}
                        </td>
                        <td>{formatDate(article.updated_at)}</td>
                        <td>
                          <div className="stl-table-actions">
                            {localDraft ? (
                              <Link
                                to={`/prompt2blog/stage-article?stagedId=${encodeURIComponent(localDraft.id)}`}
                                className="stl-link"
                              >
                                Resume
                              </Link>
                            ) : (
                              <span className="p2b-status-note">Synced to Payload</span>
                            )}
                            {article.payload_article_id ? (
                              <Link
                                to={buildStageUrl(article)}
                                className="stl-link"
                              >
                                Open Editor
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {payloadStatusesQuery.isFetching ? <p className="stl-placeholder">Refreshing Payload statuses...</p> : null}
          {!token && payloadArticleIds.length > 0 ? (
            <p className="stl-placeholder">Payload status lookup unavailable without auth token.</p>
          ) : null}
          {token && unresolvedSyncedStatusCount > 0 ? (
            <p className="stl-placeholder">Some synced statuses could not refresh. Showing last known status or Draft.</p>
          ) : null}
          {localPayloadIds.size > 0 ? (
            <p className="stl-placeholder">Rows with unsynced browser changes are marked "Local Edits".</p>
          ) : null}
        </div>
      </section>

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Generated ({generatedRows.length})</h2>
        </div>
        <div className="panel-body">
          {generatedRows.length === 0 ? (
            <div className="stl-empty">
              <p>No generated-only runs.</p>
              <p>Every generated run here already has a synced Payload document.</p>
            </div>
          ) : (
            <div className="stl-table-wrap">
              <table className="stl-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {generatedRows.map((article) => {
                    const localDraft = findLocalDraftForGeneratedArticle(localDrafts, article)

                    return (
                      <tr key={article.run_id}>
                        <td>{article.title || 'Untitled Article'}</td>
                        <td>{article.article_type || '-'}</td>
                        <td>{formatDate(article.updated_at)}</td>
                        <td>
                          <div className="stl-table-actions">
                            {localDraft ? (
                              <Link
                                to={`/prompt2blog/stage-article?stagedId=${encodeURIComponent(localDraft.id)}`}
                                className="stl-link"
                              >
                                Resume
                              </Link>
                            ) : (
                              <Link
                                to={buildStageUrl(article)}
                                className="stl-link"
                              >
                                Create Local Draft
                              </Link>
                            )}
                            <button
                              type="button"
                              className="stl-btn stl-btn-danger stl-btn-xs"
                              onClick={() => openGeneratedDeleteModal(article)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
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
          <Link to="/prompt2blog" className="stl-btn stl-btn-secondary">Back to Pipeline</Link>
        </div>
      </header>
      {pageContent}
      {generatedDeleteTarget ? (
        <div className="stl-modal-overlay" role="presentation" onClick={closeGeneratedDeleteModal}>
          <div
            className="stl-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt2blog-delete-generated-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="prompt2blog-delete-generated-title">Delete Generated Article?</h3>
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
