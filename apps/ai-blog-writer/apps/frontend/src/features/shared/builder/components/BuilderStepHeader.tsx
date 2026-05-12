import type { ReactNode } from 'react'

export type BuilderStepHeaderProps = {
  stepLabel: string
  title: string
  isSynced: boolean
  isStepComplete: boolean
  isInUpdateMode: boolean
  /** Optional. Defaults to true. When false, the "Continue" button is hidden even if the step isn't complete. */
  canContinue?: boolean
  onContinue: () => void
  onUpdate: () => void
  onSave: () => void
  onCancelUpdate: () => void
  updateLabel: string
  saveLabel: string
  /** Optional. Extra action(s) rendered before the workflow buttons. */
  leadingActions?: ReactNode
}

export function BuilderStepHeader({
  stepLabel,
  title,
  isSynced,
  isStepComplete,
  isInUpdateMode,
  canContinue = true,
  onContinue,
  onUpdate,
  onSave,
  onCancelUpdate,
  updateLabel,
  saveLabel,
  leadingActions,
}: BuilderStepHeaderProps) {
  return (
    <div className="stl-panel-header">
      <h2>
        {!isSynced ? <span className="stl-kicker">{stepLabel}</span> : null} {title}
      </h2>
      {!isSynced ? (
        <div className="stl-inline-actions">
          {leadingActions}
          {!isStepComplete && canContinue ? (
            <button type="button" className="stl-btn" onClick={onContinue}>
              Continue
            </button>
          ) : null}
          {isStepComplete && !isInUpdateMode ? (
            <button type="button" className="stl-btn stl-btn-secondary" onClick={onUpdate}>
              {updateLabel}
            </button>
          ) : null}
          {isInUpdateMode ? (
            <>
              <button type="button" className="stl-btn" onClick={onSave}>
                {saveLabel}
              </button>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={onCancelUpdate}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
