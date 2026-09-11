import { useEffect, useRef, useState } from 'react'
import type { ListicleCandidate } from '../types'
import { LookupLinks } from './LookupLinks'

/**
 * "Might be the same place", settled by a person.
 *
 * The pipeline flags two rows that look like one venue and deliberately does
 * not merge them: it cannot tell a second branch from a second spelling. So
 * the question comes here. For each flagged place the operator says same or
 * different, and when anything is the same they choose which one stays.
 *
 * Nothing is pre-chosen. A default here would be a decision the operator did
 * not make, applied to forty places.
 *
 * Removing is not deleting. The places that do not stay go to the bottom of
 * the board, where "Put back" returns them -- so a wrong call costs a click,
 * and there is no separate undo to understand.
 */

type Verdict = 'same' | 'different'

interface DuplicateReviewProps {
  candidate: ListicleCandidate
  /** The flagged places still open against this one. */
  others: ListicleCandidate[]
  place: string
  saving: boolean
  error: string | null
  onSave: (answer: {
    candidate_id: string
    same: string[]
    different: string[]
    keep: string
  }) => Promise<boolean>
  onClose: () => void
}

function firstSaid(candidate: ListicleCandidate): string {
  return candidate.sightings.find(sighting => sighting.evidence)?.evidence ?? candidate.evidence
}

function PlaceSummary({ candidate, place }: { candidate: ListicleCandidate; place: string }) {
  const said = firstSaid(candidate)
  return (
    <div className="lp-dupe-place">
      <p className="lp-dupe-name">{candidate.name}</p>
      <p className="lp-dupe-where">
        {candidate.district || 'No district given'}
        {candidate.overlap > 1 && (
          <span className="lp-candidate-overlap">Found by {candidate.overlap} searches</span>
        )}
      </p>
      {said && <p className="lp-dupe-said">{said}</p>}
      <div className="lp-candidate-tools">
        <LookupLinks candidate={candidate} place={place} />
      </div>
    </div>
  )
}

export function DuplicateReview({
  candidate,
  others,
  place,
  saving,
  error,
  onSave,
  onClose,
}: DuplicateReviewProps) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [keep, setKeep] = useState('')
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const same = others.filter(other => verdicts[other.candidate_id] === 'same')
  const different = others.filter(other => verdicts[other.candidate_id] === 'different')
  const group = [candidate, ...same]
  // A keeper that was flipped to "different" is no longer in the group it
  // was keeping, and must not be sent as if it were.
  const keeper = group.find(member => member.candidate_id === keep)
  const decided = same.length + different.length > 0
  const ready = decided && (same.length === 0 || Boolean(keeper))

  const choose = (id: string, verdict: Verdict) =>
    setVerdicts(current => ({ ...current, [id]: verdict }))

  const save = async () => {
    const saved = await onSave({
      candidate_id: candidate.candidate_id,
      same: same.map(other => other.candidate_id),
      different: different.map(other => other.candidate_id),
      keep: keeper?.candidate_id ?? '',
    })
    if (saved) onClose()
  }

  const saveLabel = !decided
    ? 'Save'
    : same.length > 0
      ? keeper
        ? `Keep ${keeper.name}, remove ${group.length - 1}`
        : 'Choose which one stays'
      : `Save: ${different.length === 1 ? 'a different place' : `${different.length} different places`}`

  return (
    <div
      className="lp-modal-overlay"
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <div
        className="lp-modal lp-dupe-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Is ${candidate.name} a duplicate?`}
      >
        <header className="lp-modal-head">
          <div>
            <h3 className="lp-modal-title">Is this the same place?</h3>
            <p className="lp-muted lp-modal-sub">
              Look them up if you are not sure. Anything you leave unanswered stays
              flagged.
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="lp-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <section className="lp-dupe-anchor" aria-label="The place you opened">
          <PlaceSummary candidate={candidate} place={place} />
        </section>

        <ul className="lp-dupe-list" aria-label="Places it might be the same as">
          {others.map(other => {
            const verdict = verdicts[other.candidate_id]
            return (
              <li
                key={other.candidate_id}
                className={verdict ? `lp-dupe-row lp-dupe-row-${verdict}` : 'lp-dupe-row'}
              >
                <PlaceSummary candidate={other} place={place} />
                <div
                  className="lp-dupe-choice"
                  role="group"
                  aria-label={`Is ${other.name} the same place?`}
                >
                  <button
                    type="button"
                    aria-pressed={verdict === 'same'}
                    onClick={() => choose(other.candidate_id, 'same')}
                  >
                    Same place
                  </button>
                  <button
                    type="button"
                    aria-pressed={verdict === 'different'}
                    onClick={() => choose(other.candidate_id, 'different')}
                  >
                    Different place
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        {same.length > 0 && (
          <fieldset className="lp-dupe-keep">
            <legend>Which one stays on the list?</legend>
            {group.map(member => (
              <label key={member.candidate_id} className="lp-dupe-keep-option">
                <input
                  type="radio"
                  name="lp-dupe-keep"
                  checked={keep === member.candidate_id}
                  onChange={() => setKeep(member.candidate_id)}
                />
                <span>
                  {member.name}
                  <span className="lp-muted">
                    {' '}
                    {member.district ? `(${member.district})` : '(no district given)'}
                  </span>
                </span>
              </label>
            ))}
            <p className="lp-dupe-note">
              The others come off the board. Nothing is deleted: they wait under
              “Removed places” at the bottom of the list, and Put back returns them.
            </p>
          </fieldset>
        )}

        {error && (
          <p className="lp-error lp-dupe-error" role="alert">
            {error}
          </p>
        )}

        <div className="lp-actions lp-dupe-actions">
          <button type="button" className="lp-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={!ready || saving}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
