import { useEffect, useMemo, useState } from 'react'
import type { ListicleStepEvent, ListicleStepEventName } from '../../../staging/api'

type InspectListicleRunModalProps = {
  isOpen: boolean
  onClose: () => void
  targetLabel: string
  steps: ListicleStepEvent[] | undefined
  isRunning: boolean
  autoCloseOnCompletion: boolean
}

const STEP_LABELS: Record<ListicleStepEventName, string> = {
  critical_fields_evaluated: 'Critical Fields evaluated',
  evidence_profile_completed: 'Evidence Profile completed',
  research_profile_completed: 'Research Profile completed',
  writer_brief_completed: 'Writer Brief curated',
  writer_called: 'Writer called',
  validated: 'Validated',
  retry_called: 'Retry called',
  finalized: 'Finalized',
}

const REVEAL_DELAY_MS = 350
const AUTO_CLOSE_DELAY_MS = 1500

function statusBadgeClass(status: ListicleStepEvent['status']): string {
  if (status === 'ok') return 'stl-inspect-badge stl-inspect-badge--ok'
  if (status === 'failed') return 'stl-inspect-badge stl-inspect-badge--failed'
  return 'stl-inspect-badge stl-inspect-badge--skipped'
}

function formatDetails(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}

export function InspectListicleRunModal({
  isOpen,
  onClose,
  targetLabel,
  steps,
  isRunning,
  autoCloseOnCompletion,
}: InspectListicleRunModalProps) {
  const [revealCount, setRevealCount] = useState(0)
  const [pinned, setPinned] = useState(false)

  const stepsList = useMemo<ListicleStepEvent[]>(() => steps ?? [], [steps])
  const totalSteps = stepsList.length
  const allRevealed = revealCount >= totalSteps && totalSteps > 0
  const finalizeStep = stepsList.find((s) => s.name === 'finalized')
  const runCompleted = !isRunning && Boolean(finalizeStep)

  useEffect(() => {
    if (!isOpen) {
      setRevealCount(0)
      return
    }
    if (totalSteps === 0) {
      setRevealCount(0)
      return
    }
    if (revealCount >= totalSteps) return
    const handle = window.setTimeout(() => {
      setRevealCount((current) => Math.min(current + 1, totalSteps))
    }, REVEAL_DELAY_MS)
    return () => window.clearTimeout(handle)
  }, [isOpen, revealCount, totalSteps])

  useEffect(() => {
    if (!isOpen) {
      setPinned(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || pinned) return
    if (!autoCloseOnCompletion) return
    if (!runCompleted || !allRevealed) return
    const handle = window.setTimeout(onClose, AUTO_CLOSE_DELAY_MS)
    return () => window.clearTimeout(handle)
  }, [isOpen, pinned, autoCloseOnCompletion, runCompleted, allRevealed, onClose])

  if (!isOpen) return null

  const visibleSteps = stepsList.slice(0, revealCount)

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
        aria-label={`Inspect AI run for ${targetLabel}`}
      >
        <div className="stl-picker-modal__header">
          <h3>
            Inspect run — <span className="stl-inspect-target">{targetLabel}</span>
          </h3>
          <div className="stl-inspect-header-actions">
            {autoCloseOnCompletion ? (
              <label className="stl-inspect-pin-toggle">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(event) => setPinned(event.target.checked)}
                />
                <span>Keep open</span>
              </label>
            ) : null}
            <button
              type="button"
              className="stl-picker-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="stl-inspect-body">
          {totalSteps === 0 ? (
            <p className="stl-inspect-empty">
              {isRunning
                ? 'Waiting for the first step to complete...'
                : 'No run captured for this target yet. Trigger Auto Write first.'}
            </p>
          ) : (
            <ol className="stl-inspect-steps">
              {visibleSteps.map((step, index) => {
                const isLast = index === visibleSteps.length - 1
                return (
                  <li key={`${step.name}-${index}`} className="stl-inspect-step">
                    <details open={isLast}>
                      <summary>
                        <span className="stl-inspect-step-index">{index + 1}</span>
                        <span className="stl-inspect-step-name">{STEP_LABELS[step.name]}</span>
                        <span className={statusBadgeClass(step.status)}>{step.status}</span>
                        <span className="stl-inspect-step-duration">{step.duration_ms}ms</span>
                        {step.model ? (
                          <span className="stl-inspect-step-model">{step.model}</span>
                        ) : null}
                      </summary>
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
                      {step.details && Object.keys(step.details).length > 0 ? (
                        <section className="stl-inspect-section">
                          <h4>Details</h4>
                          <pre className="stl-inspect-pre stl-inspect-pre--details">
                            {formatDetails(step.details)}
                          </pre>
                        </section>
                      ) : null}
                    </details>
                  </li>
                )
              })}
              {revealCount < totalSteps ? (
                <li className="stl-inspect-step stl-inspect-step--pending">
                  <span className="stl-inspect-spinner" aria-hidden="true" />
                  <span>Revealing next step...</span>
                </li>
              ) : null}
              {isRunning && allRevealed ? (
                <li className="stl-inspect-step stl-inspect-step--pending">
                  <span className="stl-inspect-spinner" aria-hidden="true" />
                  <span>Waiting for backend to finish...</span>
                </li>
              ) : null}
            </ol>
          )}
        </div>

        <div className="stl-picker-modal__footer">
          {runCompleted && allRevealed ? (
            <p className="stl-inspect-footer-note">
              {autoCloseOnCompletion && !pinned
                ? 'Run completed. Auto-closing in a moment...'
                : 'Run completed. Close when you are done reviewing.'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
