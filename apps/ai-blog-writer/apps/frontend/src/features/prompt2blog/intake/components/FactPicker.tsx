import { useEffect, useState } from 'react'
import { readSelection, reviseSelection } from '../intake.api'
import type { SelectableClaim, SelectionReview } from '../intake.types'

/**
 * Which facts the article is written from.
 *
 * Run 9e66bf84 found 105 facts and nothing ever decided which of them the
 * article needed. The outline placed 102 of them and one 200-word section was
 * handed 56 — three and a half words per fact, at which density there is no
 * sentence you can write except a list. The article read like a database
 * because it was one.
 *
 * A model has merged the repeats and put these in order. Where the line falls
 * is a starting point, from how long the article is meant to be. This screen
 * exists so a person moves it.
 *
 * The human step is the point and not a fallback. A model dropping a fact the
 * article needed is a silent loss discovered by reading a worse article; a
 * person dropping it is a decision they made and can undo. Repair may not add
 * a fact the draft did not have, so a cut fact really is gone from this
 * article — which is exactly why the last word is not a model's.
 *
 * Nothing here deletes. A fact left out stays in the dossier, stays checkable,
 * and still answers whatever question it answered. Not a gate: skippable by
 * doing nothing.
 */

interface FactPickerProps {
  runId: string
  onChanged: () => void
}

function Fact({
  claim,
  busy,
  onMark,
}: {
  claim: SelectableClaim
  busy: boolean
  onMark: (body: { rescue?: string; drop?: string; clear?: string }) => void
}) {
  const overridden = claim.rescued || claim.dropped
  return (
    <li
      className={`p2b-fact${claim.selected ? '' : ' p2b-fact-cut'}`}
      data-testid={`fact-${claim.claim_id}`}
    >
      <span className="p2b-fact-rank">{claim.rank}</span>
      <div className="p2b-fact-body">
        <p className="p2b-fact-text">{claim.text}</p>
        {claim.why && <p className="p2b-fact-why">{claim.why}</p>}
        {claim.merged_in.length > 0 && (
          /* Said rather than hidden: the operator should be able to see that
             three findings became this one, and what the other two said. */
          <p className="p2b-fact-merged">
            Also said by {claim.merged_in.length}{' '}
            {claim.merged_in.length === 1 ? 'other finding' : 'other findings'}:{' '}
            {claim.merged_in.join(' · ')}
          </p>
        )}
      </div>
      <div className="p2b-fact-actions">
        {overridden ? (
          <button
            type="button"
            className="p2b-secondary"
            disabled={busy}
            onClick={() => onMark({ clear: claim.claim_id })}
          >
            {claim.rescued ? 'Kept by hand — undo' : 'Cut by hand — undo'}
          </button>
        ) : claim.selected ? (
          <button
            type="button"
            className="p2b-secondary"
            disabled={busy}
            onClick={() => onMark({ drop: claim.claim_id })}
          >
            Leave it out
          </button>
        ) : (
          <button
            type="button"
            className="p2b-secondary"
            disabled={busy}
            onClick={() => onMark({ rescue: claim.claim_id })}
          >
            Keep it anyway
          </button>
        )}
      </div>
    </li>
  )
}

export function FactPicker({ runId, onChanged }: FactPickerProps) {
  const [review, setReview] = useState<SelectionReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    void readSelection(runId)
      .then(next => live && setReview(next))
      .catch(() => live && setReview(null))
    return () => {
      live = false
    }
  }, [runId])

  async function send(body: {
    keep_count?: number
    rescue?: string
    drop?: string
    clear?: string
  }) {
    setBusy(true)
    setError('')
    try {
      setReview(await reviseSelection(runId, body))
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  if (!review?.available || review.claims.length === 0) {
    return null
  }

  const kept = review.claims.filter(claim => claim.selected).length
  const total = review.claims.length

  return (
    <section className="p2b-facts" aria-label="Which facts the article uses">
      <p className="p2b-eyebrow">What the article will be written from</p>

      <p className="p2b-facts-summary">
        {kept} of {total} findings, most useful first.{' '}
        {review.target_word_count
          ? `About ${review.target_word_count} words of article.`
          : null}
      </p>

      {review.note && (
        /* When a pass fell over, say so. An order nobody ranked is the order
           research happened to return, and cutting by it is not a decision. */
        <p className="p2b-facts-note">{review.note}</p>
      )}

      <label className="p2b-field p2b-facts-line">
        <span className="p2b-label">How many to keep</span>
        <input
          type="range"
          min={1}
          max={total}
          value={review.keep_count}
          disabled={busy}
          aria-label="How many findings to keep"
          onChange={event => void send({ keep_count: Number(event.target.value) })}
        />
        <span className="p2b-facts-count">{review.keep_count}</span>
      </label>

      {error && <p className="p2b-blocked">{error}</p>}

      <ul className="p2b-fact-list">
        {(open ? review.claims : review.claims.filter(claim => claim.selected)).map(
          claim => (
            <Fact
              key={claim.claim_id}
              claim={claim}
              busy={busy}
              onMark={body => void send(body)}
            />
          ),
        )}
      </ul>

      <button type="button" className="p2b-secondary" onClick={() => setOpen(!open)}>
        {open
          ? 'Hide what is being left out'
          : `Show the ${total - kept} being left out`}
      </button>
    </section>
  )
}
