import { Link } from 'react-router-dom'
import type { StagedArticle } from '../../staging/types'
import { formatDate, shortRunId } from '../utils/articles-format.utils'

export type LocalDraftsTableProps = {
  rows: StagedArticle[]
  buildDraftUrl: (stagedId: string) => string
  onDiscard: (stagedId: string) => void
}

export function LocalDraftsTable({ rows, buildDraftUrl, onDiscard }: LocalDraftsTableProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>Local Drafts ({rows.length})</h2>
      </div>
      <div className="panel-body">
        {rows.length === 0 ? (
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
                {rows.map((draft) => {
                  const source = draft.payloadArticleId
                    ? `Payload #${draft.payloadArticleId}`
                    : `Run ${shortRunId(draft.runId)}`

                  return (
                    <tr key={draft.id}>
                      <td>{draft.title || 'Untitled'}</td>
                      <td><span className="stl-status stl-status-local">Local Draft</span></td>
                      <td>{source}</td>
                      <td>{formatDate(draft.updatedAt)}</td>
                      <td>
                        <div className="stl-table-actions">
                          <Link className="stl-link" to={buildDraftUrl(draft.id)}>
                            Resume
                          </Link>
                          <button
                            type="button"
                            className="stl-btn stl-btn-danger stl-btn-xs"
                            onClick={() => onDiscard(draft.id)}
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
  )
}
