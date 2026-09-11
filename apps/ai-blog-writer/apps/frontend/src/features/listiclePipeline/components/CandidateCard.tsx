import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { handOffWheel } from '../scrollHandoff'
import { LookupLinks } from './LookupLinks'
import type { ListicleCandidate } from '../types'

/**
 * One place, as a full-width box in a single column.
 *
 * Every box is the same size so forty of them read as a board rather than a
 * ragged list. Whatever does not fit scrolls inside the box, with the
 * scrollbar hidden -- a long duplicate warning should not make one box taller
 * than its neighbours -- and a box scrolled to its end hands the wheel back to
 * the page (see scrollHandoff.ts).
 *
 * Built for someone checking places by hand, with each kind of thing looking
 * like what it is: the name large, the lookups as real buttons, the warning as
 * a caution, and the checklist as a form on its own side of the box. The line
 * along the top edge fills as the checklist does, so a half-checked board
 * reads at a glance.
 *
 * The checklist is the shape of the next step and not yet its content: the
 * items are placeholders, and a tick lives only in this screen. Nothing is
 * saved and nothing is approved by ticking.
 */

/** Placeholder items. What goes on the list is still to be decided. */
export const CANDIDATE_CHECKLIST = ['Still open', 'Good fit for the list', 'Worth the trip']

interface CandidateCardProps {
  candidate: ListicleCandidate
  /** The city the list is about, added to every lookup so "Barbarian" finds
   *  the bar in Lima and not the film. */
  place: string
  /** The rows this one might be the same place as, already named. */
  duplicates: string[]
  onDetails: () => void
  /** Opens the duplicate check. Absent for a stored result too old to name
   *  its duplicates by id, whose warning stays a plain note. */
  onReviewDuplicates?: () => void
}

export function CandidateCard({
  candidate,
  place,
  duplicates,
  onDetails,
  onReviewDuplicates,
}: CandidateCardProps) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set())
  const scroller = useRef<HTMLDivElement>(null)

  // A box scrolled to its end gives the rest of the wheel to the page, so
  // reading down the board is one movement and not a stop at every card.
  useEffect(() => {
    const box = scroller.current
    return box ? handOffWheel(box) : undefined
  }, [])

  const toggle = (item: string) =>
    setTicked(current => {
      const next = new Set(current)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })

  const progress = ticked.size / CANDIDATE_CHECKLIST.length
  const complete = ticked.size === CANDIDATE_CHECKLIST.length

  return (
    <li
      className={complete ? 'lp-candidate lp-candidate-complete' : 'lp-candidate'}
      style={{ '--lp-progress': progress } as CSSProperties}
    >
      <span className="lp-candidate-progress" aria-hidden="true" />
      <div className="lp-candidate-scroll" ref={scroller}>
        <div className="lp-candidate-main">
          <header className="lp-candidate-head">
            <h3 className="lp-candidate-name">{candidate.name}</h3>
            <p className="lp-candidate-where">
              {candidate.district && <span>{candidate.district}</span>}
              {candidate.overlap > 1 && (
                <span className="lp-candidate-overlap">
                  Found by {candidate.overlap} searches
                </span>
              )}
            </p>
          </header>

          <div className="lp-candidate-tools">
            <LookupLinks candidate={candidate} place={place} />
            {/* The descriptions, the search behind each one and any cut
                warning. Research, read one place at a time. */}
            <button
              type="button"
              className="lp-tool lp-tool-quiet"
              aria-label={`Details for ${candidate.name}`}
              onClick={onDetails}
            >
              <NotesIcon />
              Details
            </button>
          </div>

          {/* Shown rather than resolved. This step cannot tell a second
              branch from a second spelling, and folding them together loses a
              venue with nothing on screen to notice. */}
          {duplicates.length > 0 &&
            (onReviewDuplicates ? (
              <button
                type="button"
                className="lp-candidate-duplicate lp-candidate-duplicate-action"
                onClick={onReviewDuplicates}
              >
                <span>Might be the same place as {duplicates.join(', ')}.</span>
                <span className="lp-candidate-duplicate-cta">Sort it out</span>
              </button>
            ) : (
              <p className="lp-candidate-duplicate">
                Might be the same place as {duplicates.join(', ')}.
              </p>
            ))}
        </div>

        <ul className="lp-candidate-checks" aria-label={`Checklist for ${candidate.name}`}>
          {CANDIDATE_CHECKLIST.map(item => (
            <li key={item}>
              <label className="lp-check">
                <input
                  type="checkbox"
                  className="lp-check-input"
                  checked={ticked.has(item)}
                  onChange={() => toggle(item)}
                />
                <span className="lp-check-box" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="lp-check-text">{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.8 6h4.4M5.8 8.6h4.4M5.8 11.2h2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
