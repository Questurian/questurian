import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { handOffWheel } from '../scrollHandoff'
import { LookupLinks } from './LookupLinks'
import { isTripAdvisorPlaceLink } from '../tripadvisor'
import type { ListicleCandidate, ListicleGoogleCheck } from '../types'

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
 * The checklist is "Still open", ticked by hand, and an optional TripAdvisor
 * link that ticks itself when the link is a real TripAdvisor place page. It
 * lives only in this screen: nothing is saved, and nothing is approved by it.
 */

/** What each place is checked for. "Still open" is ticked by hand; the
 *  TripAdvisor item ticks itself when a real TripAdvisor place link is pasted,
 *  and is optional -- plenty of places have no page. */
export const STILL_OPEN = 'Still open'
const CHECK_COUNT = 2

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
  /** What Google said, once the place has been checked. */
  google?: ListicleGoogleCheck
  /** Take it off the list for the operator's own reasons. The page asks
   *  "are you sure?" first. */
  onRemove?: () => void
  /** Take it off because Google lists it as something that is not a
   *  restaurant or bar. No question: it obviously has to go. */
  onRemoveNotAVenue?: () => void
}

/** What Google said about whether the place is open, in words, and how
 *  seriously to take it. Google's "open" is evidence, not proof -- it lags --
 *  so it sits under the box a person ticks rather than ticking it. */
export function googleStatus(google?: ListicleGoogleCheck): { text: string; tone: string } | null {
  if (!google) return null
  if (google.status === 'failed') {
    return { text: "Google check didn't go through. Check again.", tone: 'muted' }
  }
  if (google.status === 'not_found') return { text: 'Not found on Google', tone: 'warn' }
  switch (google.business_status) {
    case 'CLOSED_PERMANENTLY':
      // Put back by the operator: Google is overruled, so say nothing.
      if (google.closed_dismissed) return null
      return { text: 'Google says permanently closed', tone: 'bad' }
    case 'CLOSED_TEMPORARILY':
      return { text: 'Google says temporarily closed', tone: 'warn' }
    case 'OPERATIONAL':
      return { text: 'Google says open', tone: 'good' }
    default:
      return { text: 'Google gives no opening status', tone: 'muted' }
  }
}

function priceSigns(level?: number | null): string {
  if (level === null || level === undefined) return ''
  return level === 0 ? 'Free' : '$'.repeat(Math.min(4, Math.max(1, level)))
}

export function CandidateCard({
  candidate,
  place,
  duplicates,
  onDetails,
  onReviewDuplicates,
  google,
  onRemove,
  onRemoveNotAVenue,
}: CandidateCardProps) {
  const [open, setOpen] = useState(false)
  const [tripAdvisor, setTripAdvisor] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  // A box scrolled to its end gives the rest of the wheel to the page, so
  // reading down the board is one movement and not a stop at every card.
  useEffect(() => {
    const box = scroller.current
    return box ? handOffWheel(box) : undefined
  }, [])

  const status = googleStatus(google)
  const found = google?.status === 'found' ? google : undefined
  const closedForGood =
    found?.business_status === 'CLOSED_PERMANENTLY' && !found.closed_dismissed
  // Google resolved it to something nobody can sit down in -- a store, a
  // street, an office. Said because a name alone let a fish market onto a
  // bar list once.
  const notAVenue = found && found.is_venue === false && !found.venue_dismissed
  const linked = isTripAdvisorPlaceLink(tripAdvisor)
  // Typed but not a TripAdvisor place page. Said only once there is
  // something in the box, so an empty optional field is not an error.
  const badLink = tripAdvisor.trim() !== '' && !linked
  const progress = (Number(open) + Number(linked)) / CHECK_COUNT
  // Done means every required item: TripAdvisor is optional, so a place
  // with no page is not held back by it.
  const complete = open

  return (
    <li
      className={complete ? 'lp-candidate lp-candidate-complete' : 'lp-candidate'}
      style={{ '--lp-progress': progress } as CSSProperties}
    >
      <span className="lp-candidate-progress" aria-hidden="true" />
      <div className="lp-candidate-scroll" ref={scroller}>
        <div className="lp-candidate-main">
          {/* In the corner, apart from the lookups: removing is a decision
              about the place, not a way of looking it up. */}
          {onRemove && (
            <button
              type="button"
              className="lp-tool lp-tool-remove"
              aria-label={`Remove ${candidate.name}`}
              onClick={onRemove}
            >
              Remove
            </button>
          )}
          <header className="lp-candidate-head">
            <h3 className="lp-candidate-name">
              {candidate.name}
              {closedForGood && <span className="lp-candidate-closed">Permanently closed</span>}
            </h3>
            <p className="lp-candidate-where">
              {candidate.district && <span>{candidate.district}</span>}
              {candidate.overlap > 1 && (
                <span className="lp-candidate-overlap">
                  Found by {candidate.overlap} searches
                </span>
              )}
            </p>
            {found && (found.rating || found.price_level !== null && found.price_level !== undefined) && (
              <p className="lp-candidate-google" aria-label="On Google">
                {found.rating ? (
                  <span className="lp-candidate-rating">
                    <span aria-hidden="true">★</span> {found.rating.toFixed(1)}
                    {found.rating_count ? (
                      <span className="lp-muted">
                        {' '}
                        ({found.rating_count.toLocaleString()} reviews)
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {priceSigns(found.price_level) && (
                  <span className="lp-candidate-price">{priceSigns(found.price_level)}</span>
                )}
              </p>
            )}
            {notAVenue && (
              <div className="lp-candidate-notvenue">
                <span>
                  Google lists this as{' '}
                  {(found.types ?? [])[0]?.replace(/_/g, ' ') || 'something else'}, not a
                  restaurant or bar.
                </span>
                {onRemoveNotAVenue && (
                  <button
                    type="button"
                    className="lp-notvenue-remove"
                    aria-label={`Remove ${candidate.name}: not a restaurant or bar`}
                    onClick={onRemoveNotAVenue}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </header>

          <div className="lp-candidate-tools">
            <LookupLinks candidate={candidate} place={place} placeId={found?.place_id} />
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
          <li>
            <label className="lp-check">
              <input
                type="checkbox"
                className="lp-check-input"
                checked={open}
                onChange={() => setOpen(value => !value)}
              />
              <CheckBox />
              <span className="lp-check-text">{STILL_OPEN}</span>
              {status && (
                <span className={`lp-check-google lp-check-google-${status.tone}`}>
                  {status.text}
                </span>
              )}
            </label>
          </li>
          <li className="lp-check-link">
            {/* Not a checkbox. The tick is the link being right, so it cannot
                be ticked without one -- and anything but a TripAdvisor place
                page leaves it unticked and says why. */}
            <div className={linked ? 'lp-check lp-check-auto lp-check-done' : 'lp-check lp-check-auto'}>
              <CheckBox />
              <label className="lp-check-text" htmlFor={`ta-${candidate.candidate_id}`}>
                TripAdvisor link
              </label>
              <span className="lp-check-optional">Optional</span>
            </div>
            <input
              id={`ta-${candidate.candidate_id}`}
              type="url"
              inputMode="url"
              className="lp-link-input"
              placeholder="Paste this place's TripAdvisor page"
              value={tripAdvisor}
              aria-invalid={badLink}
              aria-describedby={badLink ? `ta-${candidate.candidate_id}-why` : undefined}
              onChange={event => setTripAdvisor(event.target.value)}
            />
            {badLink && (
              <p className="lp-link-why" id={`ta-${candidate.candidate_id}-why`}>
                That isn't a TripAdvisor page for a place. Paste the link to this
                place's own TripAdvisor page.
              </p>
            )}
          </li>
        </ul>
      </div>
    </li>
  )
}

/** The drawn square beside a check. Ticked by the input before it for "Still
 *  open", and by the row's done class for the TripAdvisor link. */
function CheckBox() {
  return (
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
