import { EDITOR_ASSIST_MODEL_OPTIONS } from '../../../staging/api'
import type { EditorAssistModelName } from '../../../staging/api'
import type { SingleTypeListicleDraft } from '../../types'
import { isSeoCoreComplete } from '../validators/submit.validators'

type BuilderSidebarProps = {
  draft: SingleTypeListicleDraft
  completionPercent: number
  isSetupReady: boolean
  hasTargetCount: boolean
  stepIssues: string[]
  editorModelName: EditorAssistModelName
  onEditorModelChange: (modelName: string) => void
  isSaving: boolean
  onSaveLocalDraft: () => Promise<void>
  onSyncToPayload: () => Promise<void>
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
  onSaveLocalDraft,
  onSyncToPayload,
}: BuilderSidebarProps) {
  const hasTargetSelected = draft.targetItemCount > 0
  const targetDelta = draft.targetItemCount - draft.items.length
  const seoComplete = isSeoCoreComplete(draft)
  const isStep1Locked = draft.step1_complete && !draft.in_update_mode
  const isStep2Locked = draft.step2_complete && !draft.step2_in_update_mode
  const isStep3Locked = draft.step3_complete && !draft.step3_in_update_mode

  return (
    <aside className="stl-builder-sidebar">
      <section className="stl-summary-card">
        <h3>Build Progress</h3>
        <div className="stl-progress-track" aria-hidden="true">
          <span className="stl-progress-bar" style={{ width: `${completionPercent}%` }} />
        </div>
        <p className="stl-summary-percent">{completionPercent}% ready</p>
        <ul className="stl-summary-list">
          <li className={isStep1Locked ? 'done' : ''}>
            Setup: {isStep1Locked ? 'Locked' : draft.in_update_mode ? 'Editing' : isSetupReady ? 'Ready to continue' : 'Incomplete'}
          </li>
          <li className={isStep2Locked ? 'done' : ''}>
            Step 2: {isStep2Locked ? 'Locked' : draft.step2_in_update_mode ? 'Editing' : isStep1Locked ? 'Ready' : 'Blocked'}
          </li>
          <li className={isStep3Locked ? 'done' : ''}>
            Step 3: {isStep3Locked ? 'Locked' : draft.step3_in_update_mode ? 'Editing' : isStep2Locked ? 'Ready' : 'Blocked'}
          </li>
          <li className={hasTargetCount ? 'done' : ''}>
            Target match: {hasTargetCount
              ? 'Met'
              : !hasTargetSelected
                ? 'Not set'
                : targetDelta > 0
                  ? `Need ${targetDelta} more`
                  : 'Above target'}
          </li>
          <li className={seoComplete ? 'done' : ''}>
            SEO core: {seoComplete ? 'Complete' : 'Missing SEO title or meta description'}
          </li>
        </ul>
      </section>

      <section className="stl-summary-card stl-summary-card--quick-actions">
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
          <button type="button" className="stl-btn" onClick={() => void onSaveLocalDraft()} disabled={isSaving}>
            Save Local Draft
          </button>
          <button type="button" className="stl-btn stl-btn-success" onClick={() => void onSyncToPayload()} disabled={isSaving}>
            {isSaving ? 'Syncing...' : 'Sync to Payload'}
          </button>
        </div>
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
