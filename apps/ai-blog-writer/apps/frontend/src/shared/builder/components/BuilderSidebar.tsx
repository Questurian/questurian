import type { ReactNode } from 'react'
import { EDITOR_ASSIST_MODEL_OPTIONS, type EditorAssistModelName } from '../../api/ai/models'
import payloadLogoUrl from '../../../assets/payload-logo.svg?url'

type DraftLike = {
  payloadId?: number
  payloadStatus?: string
  payloadSlug?: string
  status?: string
  step1_complete: boolean
  in_update_mode: boolean
  step2_complete: boolean
  step2_in_update_mode: boolean
  step3_complete: boolean
  step3_in_update_mode: boolean
}

export type BuilderSidebarProps = {
  draft: DraftLike
  completionPercent: number
  isSetupReady: boolean
  stepIssues: string[]
  seoCoreComplete: boolean

  /** Sync-issue message when step 3 has unsaved changes (e.g. "Stops have unsaved changes."). */
  stepThreeSyncIssueLabel: string

  /** Optional extra row rendered between Step 3 and SEO core in the progress checklist. */
  extraChecklistRow?: ReactNode

  /** When true, shows the Published/Draft badge + live-note in the synced Article Status panel. */
  showPublishedBadge?: boolean

  editorModelName: EditorAssistModelName
  onEditorModelChange: (modelName: string) => void
  isSaving: boolean

  /** Caller renders the auto-write button itself (custom job-queue content vs plain). */
  renderAutoWriteButton: () => ReactNode
  /** Optional status note rendered below the auto-write button (live polite region). */
  autoWriteStatusNote?: string | null

  saveLocalDraftLabel?: string
  syncLabel?: string

  onSaveLocalDraft: () => Promise<void>
  onSyncToPayload: () => Promise<void>
}

export function BuilderSidebar({
  draft,
  completionPercent,
  isSetupReady,
  stepIssues,
  seoCoreComplete,
  stepThreeSyncIssueLabel,
  extraChecklistRow,
  showPublishedBadge = false,
  editorModelName,
  onEditorModelChange,
  isSaving,
  renderAutoWriteButton,
  autoWriteStatusNote,
  saveLocalDraftLabel = 'Save Local Draft',
  syncLabel,
  onSaveLocalDraft,
  onSyncToPayload,
}: BuilderSidebarProps) {
  const isStep1Locked = draft.step1_complete && !draft.in_update_mode
  const isStep2Locked = draft.step2_complete && !draft.step2_in_update_mode
  const isStep3Locked = draft.step3_complete && !draft.step3_in_update_mode
  const isSynced = Boolean(draft.payloadId)
  const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'
  const resolvedSyncLabel = syncLabel
    ?? (showPublishedBadge && isPublishedPayload ? 'Update Published Payload' : 'Sync to Payload')

  const syncIssues: string[] = []
  if (isSynced) {
    if (!draft.payloadSlug?.trim()) syncIssues.push('Slug is required.')
    if (!isStep1Locked) syncIssues.push('Setup has unsaved changes.')
    if (!isStep2Locked) syncIssues.push('Header/image has unsaved changes.')
    if (!isStep3Locked) syncIssues.push(stepThreeSyncIssueLabel)
    if (!seoCoreComplete) syncIssues.push('SEO title and meta description required.')
  }

  return (
    <aside className="stl-builder-sidebar">
      {isSynced ? (
        <section className="stl-summary-card">
          {showPublishedBadge ? (
            <>
              <div className="stl-summary-heading-row">
                <h3>Article Status</h3>
                <span className={`stl-status stl-status-${isPublishedPayload ? 'published' : 'draft'}`}>
                  {isPublishedPayload ? 'Published' : 'Draft'}
                </span>
              </div>
              {isPublishedPayload ? (
                <div className="stl-published-banner" role="status">
                  <span className="stl-status stl-status-published">Published</span>
                  <span>
                    This Payload document is published. Future syncs from this builder will update the live published itinerary.
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <h3>Article Status</h3>
          )}
          {syncIssues.length > 0 ? (
            <ul className="stl-summary-list">
              {syncIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          ) : (
            <p className="stl-summary-note">All fields complete.</p>
          )}
        </section>
      ) : (
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
            {extraChecklistRow}
            <li className={seoCoreComplete ? 'done' : ''}>
              SEO core: {seoCoreComplete ? 'Complete' : 'Missing SEO title or meta description'}
            </li>
          </ul>
        </section>
      )}

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
          {renderAutoWriteButton()}
          {autoWriteStatusNote ? (
            <p className="stl-ai-job-note" role="status" aria-live="polite">
              {autoWriteStatusNote}
            </p>
          ) : null}
          <button type="button" className="stl-btn" onClick={() => void onSaveLocalDraft()} disabled={isSaving}>
            {saveLocalDraftLabel}
          </button>
          <button type="button" className="stl-btn stl-btn-success payload-action-btn" onClick={() => void onSyncToPayload()} disabled={isSaving}>
            <img src={payloadLogoUrl} alt="" aria-hidden="true" className="payload-action-btn-icon" />
            {isSaving ? 'Syncing...' : resolvedSyncLabel}
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
