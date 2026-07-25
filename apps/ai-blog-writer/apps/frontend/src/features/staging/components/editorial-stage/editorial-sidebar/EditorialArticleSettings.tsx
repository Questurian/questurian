import type { StagedArticle } from '../../../types'
import {
  EDITOR_MODEL_OPTIONS,
  resolveEditorModelName,
} from '../../../features/editorial-stage-article/constants'

type EditorialArticleSettingsProps = {
  stagedArticle: StagedArticle
  isEditingLocked: boolean
  onUpdate: (updates: Partial<StagedArticle>) => void
  onDeepExpand?: () => void
}

export function EditorialArticleSettings({
  stagedArticle,
  isEditingLocked,
  onUpdate,
  onDeepExpand,
}: EditorialArticleSettingsProps) {
  return (
    <>
      <div className="stage-article-sidebar-section">
        <label className="stage-article-label">Slug</label>
        <span className="stage-article-label-hint">
          URL-friendly identifier (e.g. medellin-digital-nomad-guide-2026)
        </span>
        <input
          type="text"
          value={stagedArticle.payloadSlug || ''}
          onChange={(event) => onUpdate({ payloadSlug: event.target.value })}
          className="stage-article-select"
          placeholder="auto-generated if blank"
          disabled={isEditingLocked}
        />
      </div>

      <div className="stage-article-sidebar-section">
        <label className="stage-article-label">AI Model</label>
        <select
          value={resolveEditorModelName(stagedArticle.editorModelName)}
          onChange={(event) => onUpdate({
            editorModelName: resolveEditorModelName(event.target.value),
          })}
          className="stage-article-select"
          disabled={isEditingLocked}
        >
          {EDITOR_MODEL_OPTIONS.map((modelOption) => (
            <option key={modelOption.value} value={modelOption.value}>
              {modelOption.label}
            </option>
          ))}
        </select>
      </div>

      {onDeepExpand && !isEditingLocked && (
        <div className="stage-article-sidebar-section">
          <label className="stage-article-label">AI Tools</label>
          <button
            type="button"
            onClick={onDeepExpand}
            className="stage-article-deep-expand-btn"
          >
            Deep Expand Article
          </button>
          <p className="stage-article-publish-checklist-more">
            Adds new sections and deeper content while keeping everything existing intact.
          </p>
        </div>
      )}

      <div className="stage-article-sidebar-section stage-article-info-box">
        <p><strong>Run ID:</strong> {stagedArticle.runId}</p>
        <p><strong>Created:</strong> {new Date(stagedArticle.createdAt).toLocaleDateString()}</p>
        <p><strong>Updated:</strong> {new Date(stagedArticle.updatedAt).toLocaleDateString()}</p>
      </div>
    </>
  )
}
