import { EDITOR_ASSIST_MODEL_OPTIONS } from '../../../staging/api'
import type { EditorAssistModelName } from '../../../staging/api'
import type { ListicleItineraryDraft } from '../../types'
import { isSeoCoreComplete } from '../validators/step.validators'

type BuilderSidebarProps = {
  completionPercent: number
  draft: ListicleItineraryDraft
  hasContinuousCoverage: boolean
  isSetupReady: boolean
  editorModelName: EditorAssistModelName
  onEditorModelChange: (modelName: string) => void
  isSaving: boolean
  stepIssues: string[]
  onSubmit: (targetStatus: 'draft' | 'published') => Promise<void>
}

export function BuilderSidebar({
  completionPercent,
  draft,
  hasContinuousCoverage,
  isSetupReady,
  editorModelName,
  onEditorModelChange,
  isSaving,
  stepIssues,
  onSubmit,
}: BuilderSidebarProps) {
  const seoCoreComplete = isSeoCoreComplete(draft)
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
          <li className={hasContinuousCoverage ? 'done' : ''}>Coverage: {hasContinuousCoverage ? 'Continuous' : 'Has gaps'}</li>
          <li className={seoCoreComplete ? 'done' : ''}>
            SEO core: {seoCoreComplete ? 'Complete' : 'Missing SEO title or meta description'}
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
          <button type="button" className="stl-btn" onClick={() => void onSubmit('draft')} disabled={isSaving}>
            Save Draft
          </button>
          <button type="button" className="stl-btn stl-btn-success" onClick={() => void onSubmit('published')} disabled={isSaving}>
            Publish
          </button>
        </div>
        <p className="stl-summary-note">Publishing requires continuous coverage from itinerary start with no gaps.</p>
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
