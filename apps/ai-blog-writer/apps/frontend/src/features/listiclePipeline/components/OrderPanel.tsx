import { useEffect, useState } from 'react'
import type { ListicleOrder } from '../types'

/**
 * The agreement, as the searches will actually run it.
 *
 * On screen because the alternative was believing a paragraph. The only real
 * run of this pipeline displayed a search order for twenty items and searched
 * for forty: the number had been read back out of a sentence, and there was
 * nowhere in the interface that would have shown the disagreement.
 *
 * So the count is shown as a number, it says where it came from, and it can be
 * corrected here. A correction makes a new revision rather than an edit in
 * place, which is what lets the results screen say which stored searches still
 * answer the question being asked.
 */

interface OrderPanelProps {
  order: ListicleOrder
  busy: boolean
  onCorrectCount: (target: number) => void
  onCorrectRequirements: (patch: { standard?: string; exclusions?: string }) => void
}

const SOURCE_NOTE: Record<string, string> = {
  answered: 'you said this',
  corrected: 'you corrected this',
  'corrected by operator': 'you corrected this',
  accepted: 'you agreed to the number suggested',
  seed: 'read off the title; the interview never settled it',
  default: 'nothing said how many, so this is a default',
}

export function OrderPanel({
  order,
  busy,
  onCorrectCount,
  onCorrectRequirements,
}: OrderPanelProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(order.target_count))
  const [editingRequirements, setEditingRequirements] = useState(false)
  const [standard, setStandard] = useState(order.standard)
  const [exclusions, setExclusions] = useState(order.exclusions)

  useEffect(() => {
    setDraft(String(order.target_count))
    setEditing(false)
  }, [order.target_count, order.revision])

  useEffect(() => {
    setStandard(order.standard)
    setExclusions(order.exclusions)
    setEditingRequirements(false)
  }, [order.standard, order.exclusions, order.revision])

  const conflictsByAngle = new Map(
    (order.angle_conflicts ?? []).map(conflict => [conflict.angle_id, conflict.why]),
  )

  const parsed = Number.parseInt(draft, 10)
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 200

  return (
    <section className="lp-order" aria-label="The agreed search order">
      <header className="lp-order-head">
        <p className="lp-order-title">
          The search order
          {order.revision > 1 && (
            <span className="lp-muted"> &middot; revision {order.revision}</span>
          )}
        </p>
        <p className="lp-order-line">
          <strong>{order.target_count}</strong> {order.kind || 'places'} in{' '}
          {order.place || 'the location'}
          <span className="lp-muted">
            {' '}
            &mdash; {SOURCE_NOTE[order.count_source] ?? order.count_source}
          </span>
        </p>
      </header>

      {/* An ambiguous answer is used so the run is not stuck, and never
          presented as settled. The number is on screen and one click away from
          being corrected, which is the difference between a guess and a guess
          you can see. */}
      {order.count_ambiguous && order.count_note && (
        <p className="lp-order-warning" role="status">
          {order.count_note}
        </p>
      )}

      {editing ? (
        <div className="lp-order-edit">
          <label htmlFor="lp-target-count">How many items?</label>
          <input
            id="lp-target-count"
            type="number"
            min={1}
            max={200}
            value={draft}
            disabled={busy}
            onChange={event => setDraft(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || !valid || parsed === order.target_count}
            onClick={() => onCorrectCount(parsed)}
          >
            Use this number
          </button>
          <button
            type="button"
            className="lp-secondary"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="lp-secondary lp-order-correct"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Correct the number
        </button>
      )}

      {/* A marker the interview answered twice. The value was resolved from
          the answers rather than by taking the last one, and the resolution is
          said out loud: keeping both is the safe reading, not the certain one,
          and the operator is the only one who knows which they meant. */}
      {order.answer_notes.map(note => (
        <p key={note} className="lp-order-warning" role="status">
          {note}
        </p>
      ))}

      {editingRequirements ? (
        <div className="lp-order-edit lp-order-edit-requirements">
          <label htmlFor="lp-standard">What earns a place</label>
          <textarea
            id="lp-standard"
            rows={3}
            value={standard}
            disabled={busy}
            onChange={event => setStandard(event.target.value)}
          />
          <label htmlFor="lp-exclusions">What is left out</label>
          <textarea
            id="lp-exclusions"
            rows={3}
            value={exclusions}
            disabled={busy}
            onChange={event => setExclusions(event.target.value)}
          />
          <button
            type="button"
            disabled={
              busy ||
              (standard === order.standard && exclusions === order.exclusions)
            }
            onClick={() => onCorrectRequirements({ standard, exclusions })}
          >
            Use these
          </button>
          <button
            type="button"
            className="lp-secondary"
            disabled={busy}
            onClick={() => setEditingRequirements(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <dl className="lp-order-requirements">
            {order.standard && (
              <>
                <dt>Earns a place</dt>
                <dd>{order.standard}</dd>
              </>
            )}
            {order.exclusions && (
              <>
                <dt>Left out</dt>
                <dd>{order.exclusions}</dd>
              </>
            )}
          </dl>
          {(order.standard || order.exclusions) && (
            <p className="lp-muted lp-order-note">
              Attached to every search, whichever angle finds the place.
            </p>
          )}
          <button
            type="button"
            className="lp-secondary lp-order-correct"
            disabled={busy}
            onClick={() => setEditingRequirements(true)}
          >
            Correct what earns a place, or what is left out
          </button>
        </>
      )}

      {/* Nobody looked is not the same as nothing found, and an order that
          stays quiet about the difference reads as cleared. */}
      {order.conflicts_checked === false && order.exclusions && (
        <p className="lp-muted lp-order-note">
          These searches have not been checked against what you left out.
        </p>
      )}

      <ol className="lp-order-angles">
        {order.angles.map(angle => (
          <li key={angle.angle_id} className="lp-order-angle">
            <span className="lp-order-angle-text">{angle.text}</span>
            <span className="lp-order-angle-tags">
              <span className="lp-picker-role">{angle.role}</span>
              <span className="lp-muted">asks for {angle.wanted}</span>
              {angle.edited && <span className="lp-order-edited">your wording</span>}
              {angle.custom && !angle.edited && (
                <span className="lp-order-edited">your angle</span>
              )}
            </span>
            {/* What this search bought last time, before this time is paid
                for. In run 33fca394 two of the seven searches returned no
                place the others missed, and the only place that was visible
                was a table drawn after the money was gone. Nothing acts on
                this: the operator knows the city, and two runs is a fact
                about two runs. */}
            {angle.last_time && (
              <span className="lp-muted lp-order-angle-history">
                {angle.last_time}
              </span>
            )}
            {/* This search looks like it will return places the same order
                bars. Run 33fca394 approved "Nikkei cevicherias" alongside a
                cut reading "no places where ceviche is not the primary
                offering"; 8 of that search's 10 results were barred by the
                order that bought it. The disagreement was visible here,
                before the money went. Said, not enforced: an operator who
                wants Nikkei places that genuinely lead with ceviche is asking
                for something coherent, and only they know that. */}
            {conflictsByAngle.get(angle.angle_id) && (
              <span className="lp-order-angle-conflict">
                Fights what you left out: {conflictsByAngle.get(angle.angle_id)}
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Said, and not fixed. Adding a search nobody approved is the behaviour
          this whole record exists to prevent. */}
      {order.capacity_warning && (
        <p className="lp-order-warning" role="status">
          {order.capacity_warning} Add an angle, or take the shorter list.
        </p>
      )}
    </section>
  )
}
