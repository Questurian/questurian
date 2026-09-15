import { Check } from 'lucide-react'
import type { Stage } from '../types'

/**
 * Where you are, and the way back.
 *
 * Going back never discards anything, so earlier stages stay reachable at all
 * times. A later stage is reachable only once its prerequisite holds, and the
 * button says why it does not rather than sitting there inert.
 */

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'trip', label: 'Trip details' },
  { id: 'days', label: 'Shape days' },
  { id: 'review', label: 'Approve layouts' },
  { id: 'workspace', label: 'Day workspace' },
]

export interface StageNavProps {
  stage: Stage
  reachable: Record<Stage, boolean>
  blockedReason: Record<Stage, string | null>
  onGo: (stage: Stage) => void
}

export function StageNav({ stage, reachable, blockedReason, onGo }: StageNavProps) {
  const currentIndex = STAGES.findIndex(entry => entry.id === stage)

  return (
    <nav className="ip-stage-nav" aria-label="Setup stages">
      <ol>
        {STAGES.map((entry, index) => {
          const isCurrent = entry.id === stage
          const done = index < currentIndex && reachable[entry.id]
          const open = reachable[entry.id]
          return (
            // The reason lives on the item, not the button: a disabled button
            // cannot be hovered for a tooltip in every browser, and a `title`
            // on the control itself risks shadowing its own label.
            <li key={entry.id} title={open ? undefined : (blockedReason[entry.id] ?? undefined)}>
              <button
                type="button"
                className={`ip-stage-step${isCurrent ? ' ip-stage-step-on' : ''}${done ? ' ip-stage-step-done' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
                disabled={!open}
                onClick={() => onGo(entry.id)}
              >
                <span className="ip-stage-step-index" aria-hidden>
                  {done ? <Check size={13} /> : index + 1}
                </span>
                <span>{entry.label}</span>
              </button>
              {!open && blockedReason[entry.id] ? (
                <span className="ip-sr-only">{blockedReason[entry.id]}</span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
