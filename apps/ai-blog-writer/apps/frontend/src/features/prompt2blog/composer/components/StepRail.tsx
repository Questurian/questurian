import type { P2BStep } from '../step-model'

interface StepRailProps {
  steps: readonly P2BStep[]
}

const STATE_LABELS: Record<P2BStep['state'], string> = {
  done: 'Done',
  current: 'You are here',
  upcoming: 'Not yet'
}

/**
 * Where the operator is in the five steps, and what is left.
 *
 * Read-only on purpose. The rail reports position; it never moves the operator,
 * because every real transition belongs to the control that performs the work.
 * A rail that could jump ahead of the state would be a second, disagreeing
 * source of truth about the same run.
 */
export function StepRail({ steps }: StepRailProps) {
  const current = steps.find((step) => step.state === 'current')

  return (
    <section className="p2b-step-rail" aria-label="Article steps">
      <ol className="p2b-step-rail-list">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`p2b-step-rail-item p2b-step-rail-item--${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="p2b-step-rail-number" aria-hidden="true">
              {step.state === 'done' ? '✓' : step.number}
            </span>
            <span className="p2b-step-rail-text">
              <span className="p2b-step-rail-name">{step.name}</span>
              <span className="p2b-step-rail-state">{STATE_LABELS[step.state]}</span>
              {step.summary && (
                <span className="p2b-step-rail-summary">{step.summary}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {current && (
        <p className="p2b-step-rail-purpose">
          <strong>Step {current.number}: {current.name}.</strong> {current.purpose}
        </p>
      )}
    </section>
  )
}
