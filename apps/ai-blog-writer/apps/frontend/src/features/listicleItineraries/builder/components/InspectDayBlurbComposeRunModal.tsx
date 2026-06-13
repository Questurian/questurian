import { useMemo } from 'react'
import type { ComposeDayBlurbsResponse, ComposeIntroStepEvent } from '../../../staging/api'

type InspectDayBlurbComposeRunModalProps = {
  isOpen: boolean
  onClose: () => void
  /** The last day-blurb composer run (in-memory only); null until a run completes. */
  report: ComposeDayBlurbsResponse | null
}

function statusBadgeClass(status: ComposeIntroStepEvent['status']): string {
  if (status === 'ok') return 'stl-inspect-badge stl-inspect-badge--ok'
  if (status === 'failed') return 'stl-inspect-badge stl-inspect-badge--failed'
  return 'stl-inspect-badge stl-inspect-badge--warning'
}

function formatDetails(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}

/**
 * Day-blurb composer Report: the step timeline of the last "Write stop blurbs"
 * run (ADR 0019). Like the Autobuild and Intro reports it is synchronous, so
 * problem steps open pre-expanded. For a multi-day "write all" run the page
 * merges every day's steps into one timeline. Not saved with the draft.
 */
export function InspectDayBlurbComposeRunModal({ isOpen, onClose, report }: InspectDayBlurbComposeRunModalProps) {
  const steps = useMemo<ComposeIntroStepEvent[]>(() => report?.steps ?? [], [report])
  const issueCount = steps.filter((step) => step.status !== 'ok').length

  if (!isOpen) return null

  return (
    <div
      className="stl-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="stl-picker-modal stl-inspect-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Inspect stop-blurb composer run"
      >
        <div className="stl-picker-modal__header">
          <h3>
            Inspect stop-blurb composer run
            {report ? <span className="stl-inspect-target"> — {report.model_used}</span> : null}
          </h3>
          <button
            type="button"
            className="stl-picker-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="stl-inspect-body">
          {!report || steps.length === 0 ? (
            <p className="stl-inspect-empty">
              No blurb run captured yet. Use “Write stop blurbs” first.
            </p>
          ) : (
            <>
              {issueCount > 0 ? (
                <p className="stl-inspect-run-summary stl-inspect-run-summary--issues">
                  {issueCount} step{issueCount === 1 ? '' : 's'} need{issueCount === 1 ? 's' : ''} attention.
                </p>
              ) : (
                <p className="stl-inspect-run-summary">All steps completed cleanly.</p>
              )}
              <ol className="stl-inspect-steps">
                {steps.map((step, index) => (
                  <li key={`${step.name}-${index}`} className="stl-inspect-step">
                    <details open={step.status !== 'ok'}>
                      <summary>
                        <span className="stl-inspect-step-index">{index + 1}</span>
                        <span className="stl-inspect-step-name">{step.label}</span>
                        <span className={statusBadgeClass(step.status)}>{step.status}</span>
                        <span className="stl-inspect-step-duration">{step.duration_ms}ms</span>
                        {step.model ? (
                          <span className="stl-inspect-step-model">{step.model}</span>
                        ) : null}
                      </summary>
                      {step.details && Object.keys(step.details).length > 0 ? (
                        <section className="stl-inspect-section">
                          <h4>Details</h4>
                          <pre className="stl-inspect-pre stl-inspect-pre--details">
                            {formatDetails(step.details)}
                          </pre>
                        </section>
                      ) : null}
                      {step.prompt ? (
                        <section className="stl-inspect-section">
                          <h4>Prompt sent</h4>
                          <pre className="stl-inspect-pre">{step.prompt}</pre>
                        </section>
                      ) : null}
                      {step.output ? (
                        <section className="stl-inspect-section">
                          <h4>Output</h4>
                          <pre className="stl-inspect-pre">{step.output}</pre>
                        </section>
                      ) : null}
                    </details>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <div className="stl-picker-modal__footer">
          <p className="stl-inspect-footer-note">
            This report covers the last stop-blurb run only and is not saved with the draft.
          </p>
        </div>
      </div>
    </div>
  )
}
