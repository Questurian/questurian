import { useEffect, useRef } from 'react'
import type { ListicleCandidate, ListicleSighting } from '../types'

/**
 * Everything the SEARCHES said about one place, opened on request.
 *
 * Discovery, not research. What is here is what a search reported on the way
 * to finding this place -- a sentence written to justify returning it, never
 * checked and never attributed. The research viewer is the other thing, and
 * the two are named apart on purpose: one is a lead, the other is evidence
 * somebody paid for and a person has judged.
 *
 * Kept off the card on purpose. The card is for scanning forty places and
 * seeing which ones keep coming up; the descriptions, the search that found
 * each one and the cut warnings are research, read one place at a time when a
 * place is being looked into. On the card they buried the list under its own
 * footnotes.
 */

interface CandidateDetailsProps {
  candidate: ListicleCandidate
  /** Whether a cut exists and only part of the pool was checked against it,
   *  in which case an unjudged place has to say so. */
  partialCutReview: boolean
  onClose: () => void
}

export function CandidateDetails({
  candidate,
  partialCutReview,
  onClose,
}: CandidateDetailsProps) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // One entry per search that returned this place. A place found once has no
  // sightings list on older stored results, and its single description is the
  // same thing said once.
  const said: ListicleSighting[] =
    candidate.sightings.length > 0
      ? candidate.sightings
      : candidate.evidence
        ? [
            {
              angle: candidate.found_by[0] ?? '',
              name: candidate.name,
              district: candidate.district,
              evidence: candidate.evidence,
            },
          ]
        : []

  return (
    <div
      className="lp-modal-overlay"
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <div
        className="lp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Discovery details for ${candidate.name}`}
      >
        <header className="lp-modal-head">
          <div>
            <h3 className="lp-modal-title">{candidate.name}</h3>
            {candidate.district && (
              <p className="lp-muted lp-modal-sub">{candidate.district}</p>
            )}
          </div>
          <button
            ref={closeButton}
            type="button"
            className="lp-modal-close"
            aria-label="Close discovery details"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {/* Flagged, never removed. Both levels read as "look at this", not
            as a verdict: which places get flagged is stable across runs, but
            whether one comes back `clear` or `arguable` is not -- the same 43
            candidates produced 13/13/11 flags over three calls with the split
            moving each time. The reason is the substance. */}
        {candidate.barred && (
          <p
            className={
              candidate.barred_confidence === 'clear'
                ? 'lp-candidate-barred'
                : 'lp-candidate-barred lp-candidate-barred-arguable'
            }
          >
            {candidate.barred_confidence === 'clear'
              ? 'Looks like something you left out'
              : 'Might be something you left out'}
            : {candidate.barred}
          </p>
        )}
        {partialCutReview && candidate.cut_reviewed === false && (
          <p className="lp-candidate-unchecked">Not checked against what you left out.</p>
        )}

        <p className="lp-eyebrow lp-modal-section">
          Found by {candidate.overlap} {candidate.overlap === 1 ? 'search' : 'searches'}
        </p>
        {said.length > 0 ? (
          <ul className="lp-modal-sightings">
            {said.map((sighting, index) => (
              <li key={sighting.sighting_id ?? index}>
                <p className="lp-modal-angle">{sighting.angle}</p>
                <p className="lp-modal-evidence">
                  {sighting.name !== candidate.name && (
                    <span className="lp-muted">Listed as {sighting.name}. </span>
                  )}
                  {sighting.evidence || (
                    <span className="lp-muted">No description came back.</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="lp-modal-sightings">
            {candidate.found_by.map(angle => (
              <li key={angle}>
                <p className="lp-modal-angle">{angle}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
