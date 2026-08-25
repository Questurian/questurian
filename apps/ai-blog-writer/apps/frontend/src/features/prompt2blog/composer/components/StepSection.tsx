import { useEffect, useState, type ReactNode } from 'react'
import type { P2BStep } from '../step-model'

interface StepSectionProps {
  step: P2BStep
  /** Shown on a finished step when the model has no recap of its own. */
  fallbackSummary?: string
  children: ReactNode
}

const TOGGLE_LABELS: Record<P2BStep['state'], { open: string; closed: string }> = {
  done: { open: 'Hide this step', closed: 'Change this' },
  current: { open: 'Hide this step', closed: 'Show this step' },
  upcoming: { open: 'Hide this step', closed: 'Look ahead' }
}

/**
 * One numbered step: what it is called, why it exists, and its work.
 *
 * The current step is open; finished and upcoming ones are closed but never
 * disabled. Locking a step an operator has not reached punishes curiosity for
 * no safety gain — the controls inside already refuse work that is not ready,
 * and someone who wants to see what is coming should be able to look.
 */
export function StepSection({ step, fallbackSummary, children }: StepSectionProps) {
  // Null means "follow the step". A transition clears the override so the page
  // resumes opening whatever the operator is actually working on.
  const [override, setOverride] = useState<boolean | null>(null)
  useEffect(() => setOverride(null), [step.state])

  const isOpen = override ?? step.state === 'current'
  const summary = step.summary ?? fallbackSummary ?? null

  return (
    <section
      className={`p2b-step-section p2b-step-section--${step.state}${
        isOpen ? ' p2b-step-section--open' : ''
      }`}
      aria-labelledby={`p2b-step-heading-${step.id}`}
    >
      <div className="p2b-step-section-header">
        <span className="p2b-step-section-number" aria-hidden="true">
          {step.state === 'done' ? '✓' : step.number}
        </span>
        <div className="p2b-step-section-heading-text">
          <h2 id={`p2b-step-heading-${step.id}`}>
            Step {step.number}: {step.name}
          </h2>
          {isOpen ? (
            <>
              <p className="p2b-step-section-purpose">{step.purpose}</p>
              {step.state === 'current' && (
                <p className="p2b-step-section-next-action">
                  <strong>Do this next:</strong> {step.nextAction}
                </p>
              )}
            </>
          ) : (
            summary && <p className="p2b-step-section-summary">{summary}</p>
          )}
        </div>
        <button
          type="button"
          className="p2b-step-section-toggle"
          aria-expanded={isOpen}
          aria-controls={`p2b-step-body-${step.id}`}
          onClick={() => setOverride(!isOpen)}
        >
          {isOpen ? TOGGLE_LABELS[step.state].open : TOGGLE_LABELS[step.state].closed}
        </button>
      </div>
      <div
        id={`p2b-step-body-${step.id}`}
        className="p2b-step-section-body"
        hidden={!isOpen}
      >
        {children}
      </div>
    </section>
  )
}
