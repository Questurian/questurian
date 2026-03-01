import { EDITOR_ASSIST_MODEL_OPTIONS } from '../../../staging/api'
import type { EditorAssistModelName } from '../../../staging/api'
import type { SingleTypeListicleDraft } from '../../types'

type BuilderSidebarProps = {
  draft: SingleTypeListicleDraft
  completionPercent: number
  isSetupReady: boolean
  hasTargetCount: boolean
  stepIssues: string[]
  editorModelName: EditorAssistModelName
  onEditorModelChange: (modelName: string) => void
  isSaving: boolean
  onSaveDraft: () => Promise<void>
  onPublish: () => Promise<void>
}

export function BuilderSidebar({
  draft,
  completionPercent,
  isSetupReady,
  hasTargetCount,
  stepIssues,
  editorModelName,
  onEditorModelChange,
  isSaving,
  onSaveDraft,
  onPublish,
}: BuilderSidebarProps) {
  const hasTargetSelected = draft.targetItemCount > 0
  const targetDelta = draft.targetItemCount - draft.items.length

  return (
    <aside className="stl-builder-sidebar">
      <section className="stl-summary-card">
        <h3>Build Progress</h3>
        <div className="stl-progress-track" aria-hidden="true">
          <span className="stl-progress-bar" style={{ width: `${completionPercent}%` }} />
        </div>
        <p className="stl-summary-percent">{completionPercent}% ready</p>
        <ul className="stl-summary-list">
          <li className={draft.step1_complete ? 'done' : ''}>
            Setup: {draft.step1_complete ? 'Locked' : isSetupReady ? 'Ready to continue' : 'Incomplete'}
          </li>
          <li className={draft.items.length > 0 ? 'done' : ''}>Items: {draft.items.length} added</li>
          <li className={hasTargetCount ? 'done' : ''}>
            Target match: {hasTargetCount
              ? 'Met'
              : !hasTargetSelected
                ? 'Not set'
                : targetDelta > 0
                  ? `Need ${targetDelta} more`
                  : 'Above target'}
          </li>
          <li className={draft.seoSection.seo ? 'done' : ''}>
            SEO relation: {draft.seoSection.seo ? `#${draft.seoSection.seo}` : 'Not selected'}
          </li>
        </ul>
      </section>

      <section className="stl-summary-card">
        <h3>Quick Actions</h3>
        <label className="stl-field">
          <span>AI Model</span>
          <select value={editorModelName} onChange={(event) => onEditorModelChange(event.target.value)}>
            {EDITOR_ASSIST_MODEL_OPTIONS.map((modelOption) => (
              <option key={modelOption.value} value={modelOption.value}>
                {modelOption.label}
              </option>
            ))}
          </select>
        </label>
        <div className="stl-summary-actions">
          <button type="button" className="stl-btn" onClick={() => void onSaveDraft()} disabled={isSaving}>
            Save Draft
          </button>
          <button type="button" className="stl-btn stl-btn-success" onClick={() => void onPublish()} disabled={isSaving}>
            Publish
          </button>
        </div>
        <p className="stl-summary-note">
          {hasTargetSelected
            ? <>Publishing requires exactly <strong>{draft.targetItemCount}</strong> items.</>
            : 'Choose a target list size in Step 1 before publishing.'}
        </p>
        {stepIssues.length > 0 ? (
          <div className="stl-summary-warning">
            <strong>Setup needs attention:</strong>
            <p>{stepIssues[0]}</p>
          </div>
        ) : null}
      </section>
    </aside>
  )
}
