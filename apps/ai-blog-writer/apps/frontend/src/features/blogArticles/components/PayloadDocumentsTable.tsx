import { Link } from 'react-router-dom'
import type { StagedArticle } from '../../staging/types'
import {
  findLocalDraftForGeneratedArticle,
  resolveGeneratedArticleStatus,
  statusMeta,
  type PayloadPublicationStatus,
} from '../utils/articles-status.utils'
import { formatDate } from '../utils/articles-format.utils'
import type { SavedBlogArticle } from '../types'

export type PayloadDocumentsTableProps<TArticle extends SavedBlogArticle> = {
  rows: TArticle[]
  localDrafts: StagedArticle[]
  payloadStatusByArticleId: Record<number, PayloadPublicationStatus>
  buildStageUrl: (article: TArticle) => string
  buildDraftUrl: (stagedId: string) => string
  statusNoteClassName: string
  isFetchingStatuses: boolean
  hasToken: boolean
  payloadArticleIdCount: number
  unresolvedSyncedStatusCount: number
  localPayloadIdCount: number
}

export function PayloadDocumentsTable<TArticle extends SavedBlogArticle>({
  rows,
  localDrafts,
  payloadStatusByArticleId,
  buildStageUrl,
  buildDraftUrl,
  statusNoteClassName,
  isFetchingStatuses,
  hasToken,
  payloadArticleIdCount,
  unresolvedSyncedStatusCount,
  localPayloadIdCount,
}: PayloadDocumentsTableProps<TArticle>) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>Payload Documents ({rows.length})</h2>
      </div>
      <div className="panel-body">
        {rows.length === 0 ? (
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
                {rows.map((article) => {
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
                            <Link to={buildDraftUrl(localDraft.id)} className="stl-link">
                              Resume
                            </Link>
                          ) : (
                            <span className={statusNoteClassName}>Synced to Payload</span>
                          )}
                          {article.payload_article_id ? (
                            <Link to={buildStageUrl(article)} className="stl-link">
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
        {isFetchingStatuses ? <p className="stl-placeholder">Refreshing Payload statuses...</p> : null}
        {!hasToken && payloadArticleIdCount > 0 ? (
          <p className="stl-placeholder">Payload status lookup unavailable without auth token.</p>
        ) : null}
        {hasToken && unresolvedSyncedStatusCount > 0 ? (
          <p className="stl-placeholder">Some synced statuses could not refresh. Showing last known status or Draft.</p>
        ) : null}
        {localPayloadIdCount > 0 ? (
          <p className="stl-placeholder">Rows with unsynced browser changes are marked "Local Edits".</p>
        ) : null}
      </div>
    </section>
  )
}
