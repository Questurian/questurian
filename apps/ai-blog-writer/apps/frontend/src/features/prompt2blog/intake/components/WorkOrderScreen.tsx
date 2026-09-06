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

  // The projection describes the plan as recorded, not the boxes ticked since.
  // That is not stale: while anything is struck the primary action is Apply
  // changes, which re-records it. It only gates the research button, and by
  // then it is current.
  const projection = workOrder.budget_projection
  const pending = struck.length > 0 || added.trim().length > 0
  const tooLarge = projection ? !projection.can_finish : false

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
              {item.precision === 'approximate' && (
                /* Said out loud so a loosened target is a visible choice. A
                   question that only needs the size of a thing will not block
                   the run for want of a figure nobody publishes. */
                <span className="p2b-kind">roughly is enough</span>
              )}
              {item.bundled_note && !isStruck && (
                <p className="p2b-question-note">{item.bundled_note}</p>
              )}
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

      {projection && (
        /* The number was always computed and written to the run. It was never
           put in front of the person doing the cutting, so a plan that could
           not finish was approved and then died in research. */
        <p className={tooLarge ? 'p2b-blocked' : 'p2b-cost'}>{projection.note}</p>
      )}

      {remainingLoadBearing === 0 && (
        <p className="p2b-blocked">
          Keep at least one of the questions the piece rests on &mdash; without any of
          them there is nothing to write.
        </p>
      )}

      <div className="p2b-intake-actions">
        {pending ? (
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
          // A plan that cannot reach the writer has no research worth buying.
          // The server refuses it too; this is so the refusal is not a
          // surprise arriving after the button was pressed.
          <button type="button" disabled={busy || tooLarge} onClick={onResearch}>
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
