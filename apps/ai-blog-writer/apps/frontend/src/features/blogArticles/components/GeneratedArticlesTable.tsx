import { Link } from 'react-router-dom'
import type { StagedArticle } from '../../staging/types'
import { findLocalDraftForGeneratedArticle } from '../utils/articles-status.utils'
import { formatDate } from '../utils/articles-format.utils'
import type { SavedBlogArticle } from '../types'

export type GeneratedArticlesTableProps<TArticle extends SavedBlogArticle> = {
  rows: TArticle[]
  localDrafts: StagedArticle[]
  buildStageUrl: (article: TArticle) => string
  buildDraftUrl: (stagedId: string) => string
  onDelete: (article: TArticle) => void
  onClearAll: () => void
  isClearingAll: boolean
}

export function GeneratedArticlesTable<TArticle extends SavedBlogArticle>({
  rows,
  localDrafts,
  buildStageUrl,
  buildDraftUrl,
  onDelete,
  onClearAll,
  isClearingAll,
}: GeneratedArticlesTableProps<TArticle>) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>Generated ({rows.length})</h2>
        {rows.length > 0 ? (
          <button
            type="button"
            className="stl-btn stl-btn-danger stl-btn-xs"
            onClick={onClearAll}
            disabled={isClearingAll}
          >
            {isClearingAll ? 'Clearing...' : 'Clear All'}
          </button>
        ) : null}
      </div>
      <div className="panel-body">
        {rows.length === 0 ? (
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
                {rows.map((article) => {
                  const localDraft = findLocalDraftForGeneratedArticle(localDrafts, article)

                  return (
                    <tr key={article.run_id}>
                      <td>{article.title || 'Untitled Article'}</td>
                      <td>{article.article_type || '-'}</td>
                      <td>{formatDate(article.updated_at)}</td>
                      <td>
                        <div className="stl-table-actions">
                          {localDraft ? (
                            <Link to={buildDraftUrl(localDraft.id)} className="stl-link">
                              Resume
                            </Link>
                          ) : (
                            <Link to={buildStageUrl(article)} className="stl-link">
                              Create Local Draft
                            </Link>
                          )}
                          <button
                            type="button"
                            className="stl-btn stl-btn-danger stl-btn-xs"
                            onClick={() => onDelete(article)}
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
  )
}
