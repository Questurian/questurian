import { useState } from 'react'
import type { IntakeWorkOrder } from '../intake.types'

/**
 * The research plan, and the cut.
 *
 * This replaces choosing between three direction cards, which was a menu after
 * you had already ordered. Striking a question changes cost, focus and length.
 *
 * Load-bearing questions can be struck. The system says once what the piece can
 * no longer claim and then obeys — a decision that cannot be wrong is not a
 * decision. The one thing it refuses is leaving nothing load-bearing at all.
 */

interface WorkOrderScreenProps {
  workOrder: IntakeWorkOrder
  warnings: string[]
  busy: boolean
  onCut: (struckIds: string[], added: string[]) => void
  onReopen: () => void
  onResearch: () => void
}

export function WorkOrderScreen({
  workOrder,
  warnings,
  busy,
  onCut,
  onReopen,
  onResearch,
}: WorkOrderScreenProps) {
  const [struck, setStruck] = useState<string[]>([])
  const [added, setAdded] = useState('')

  const toggle = (id: string) =>
    setStruck(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id],
    )

  const remainingLoadBearing = workOrder.requirements.filter(
    item => item.kind === 'load_bearing' && !struck.includes(item.requirement_id),
  ).length

  return (
    <section className="p2b-intake" aria-label="The research plan">
      <p className="p2b-eyebrow">What we&rsquo;ll go and find out</p>

      <ul className="p2b-questions">
        {workOrder.requirements.map(item => {
          const isStruck = struck.includes(item.requirement_id)
          return (
            <li key={item.requirement_id} className={isStruck ? 'p2b-struck' : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={!isStruck}
                  disabled={busy}
                  onChange={() => toggle(item.requirement_id)}
                />
                <span className="p2b-question-text">{item.question}</span>
              </label>
              <span
                className={
                  item.kind === 'load_bearing' ? 'p2b-kind p2b-kind-core' : 'p2b-kind'
                }
              >
                {item.kind === 'load_bearing' ? 'the piece rests on this' : 'colour'}
              </span>
            </li>
          )
        })}
      </ul>

      <label className="p2b-field">
        <span className="p2b-label">Anything else worth finding out?</span>
        <input
          type="text"
          value={added}
          disabled={busy}
          onChange={event => setAdded(event.target.value)}
          placeholder="One more question, in your own words"
        />
      </label>

      {warnings.length > 0 && (
        // Said once, after the fact. Not a confirmation dialog, and not a
        // refusal: the cut already happened.
        <ul className="p2b-cut-warnings">
          {warnings.map(warning => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {remainingLoadBearing === 0 && (
        <p className="p2b-blocked">
          Keep at least one of the questions the piece rests on &mdash; without any of
          them there is nothing to write.
        </p>
      )}

      <div className="p2b-intake-actions">
        {struck.length || added.trim() ? (
          <button
            type="button"
            disabled={busy || remainingLoadBearing === 0}
            onClick={() => {
              onCut(struck, added.trim() ? [added.trim()] : [])
              setStruck([])
              setAdded('')
            }}
          >
            Apply changes
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onResearch}>
            Go and find this out
          </button>
        )}
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Back to the brief
        </button>
      </div>
    </section>
  )
}
