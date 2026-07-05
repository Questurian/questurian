import { Link } from 'react-router-dom'
import type { PayloadArticleDoc } from '../../staging/api'
import { buildPayloadAdminArticleUrl } from '../../staging/api'
import type { StagedArticle } from '../../staging/types'
import { statusMeta } from '../utils/articles-status.utils'
import { formatDate } from '../utils/articles-format.utils'
import { buildPayloadArticleEditUrl } from '../utils/payload-article-links'

export type PayloadDocumentsTableProps = {
  docs: PayloadArticleDoc[]
  localDrafts: StagedArticle[]
  buildDraftUrl: (stagedId: string) => string
  isLoading: boolean
  loadErrorMessage: string | null
  hasToken: boolean
}

function findLocalDraftForPayloadDoc(
  localDrafts: StagedArticle[],
  doc: PayloadArticleDoc,
): StagedArticle | undefined {
  const byPayloadId = localDrafts.find((candidate) => candidate.payloadArticleId === doc.id)
  if (byPayloadId) return byPayloadId
  if (!doc.sourceRunId) return undefined
  return localDrafts.find((candidate) => candidate.runId === doc.sourceRunId)
}

export function PayloadDocumentsTable({
  docs,
  localDrafts,
  buildDraftUrl,
  isLoading,
  loadErrorMessage,
  hasToken,
}: PayloadDocumentsTableProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>Payload Documents ({docs.length})</h2>
      </div>
      <div className="panel-body">
        {!hasToken ? (
          <div className="stl-empty">
            <p>Sign in to load articles from Payload.</p>
          </div>
        ) : isLoading ? (
          <p className="stl-placeholder">Loading articles from Payload...</p>
        ) : loadErrorMessage ? (
          <p className="stl-error">Failed to load articles from Payload: {loadErrorMessage}</p>
        ) : docs.length === 0 ? (
          <div className="stl-empty">
            <p>No articles in Payload yet.</p>
            <p>Create a local draft from Generated, then sync to Payload.</p>
          </div>
        ) : (
          <div className="stl-table-wrap">
            <table className="stl-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const meta = statusMeta(doc.status === 'published' ? 'published' : 'draft')
                  const localDraft = findLocalDraftForPayloadDoc(localDrafts, doc)

                  return (
                    <tr key={doc.id}>
                      <td>{doc.title || 'Untitled Article'}</td>
                      <td>{doc.sourceFeature || '-'}</td>
                      <td>
                        <span className={`stl-status stl-status-${meta.className}`}>{meta.label}</span>
                        {localDraft ? <span className="stl-status stl-status-local">Local Edits</span> : null}
                      </td>
                      <td>{formatDate(doc.updatedAt ?? '')}</td>
                      <td>
                        <div className="stl-table-actions">
                          {localDraft ? (
                            <Link to={buildDraftUrl(localDraft.id)} className="stl-link">
                              Resume
                            </Link>
                          ) : (
                            <Link to={buildPayloadArticleEditUrl(doc.id)} className="stl-link">
                              Edit
                            </Link>
                          )}
                          <a
                            href={buildPayloadAdminArticleUrl(doc.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="stl-link"
                          >
                            Payload Admin
                          </a>
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
  )
}
