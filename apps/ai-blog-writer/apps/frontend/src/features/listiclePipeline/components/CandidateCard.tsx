import { useEffect, useRef, useState } from 'react'
import { handOffWheel } from '../scrollHandoff'
import { LookupLinks } from './LookupLinks'
import { isTripAdvisorPlaceLink } from '../tripadvisor'
import type { PrepPatch, SaveState } from '../usePlaceResearch'
import type {
  ListicleCandidate,
  ListicleGoogleCheck,
  ListicleResearchCard,
} from '../types'

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
 * along the top edge fills as the required checks do, so a half-prepared board
 * reads at a glance.
 *
 * The checklist used to be component state: two boxes, neither saved, both
 * lost on reload, and a progress bar that counted an optional link as half the
 * work. It is now the run's stored preparation, and what it is for has
 * changed with it -- the checks are what has to be true before a place can be
 * researched, and the server decides that, not this component.
 */

export const STILL_OPEN = 'Still open'
/** What the identity tick says, beside the name Google actually holds. */
export const RIGHT_PLACE = 'Correct place and branch'

interface CandidateResearch {
  card: ListicleResearchCard
  saveState?: SaveState
  saveError?: string
  /** True only while THIS card's request is in flight. Another place being
   *  researched is a blocker, not this card being busy. */
  researching: boolean
  onPrep: (patch: PrepPatch) => void
  onResearch: () => void
  onOpenResearch: () => void
  /** Ask Google about this one place again. Offered only where it is the
   *  answer to something: a match the operator has said is wrong. */
  onRecheckGoogle?: () => void
  recheckingGoogle?: boolean
}

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
  /** Preparation, readiness and saved research for this place. Absent while
   *  the board is still being read, in which case the card shows the place and
   *  no checklist rather than a checklist that cannot be saved. */
  research?: CandidateResearch
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

/** How a finished request is summed up on the card.
 *
 *  Quantities, never a quality score: "4 findings" says how much material
 *  there is, and nothing on this card has judged whether any of it is good. */
function attemptLine(card: ListicleResearchCard): string {
  const attempt = card.last_attempt
  const profile = card.profile
  if (!attempt) {
    if (profile && profile.findings_total > 0) return 'Saved research available'
    return ''
  }
  switch (attempt.state) {
    case 'running':
      return 'Researching…'
    case 'completed': {
      const found = profile?.findings_this_topic ?? attempt.findings_added
      const open = attempt.open_questions.length
      return `${found} ${found === 1 ? 'finding' : 'findings'}${
        open ? ` · ${open} unresolved ${open === 1 ? 'question' : 'questions'}` : ''
      }`
    }
    case 'completed_empty':
      return 'No findings returned'
    case 'failed':
      return 'The request failed'
    case 'response_invalid':
      return 'The answer could not be read'
    case 'interrupted':
      return 'The request never came back'
    default:
      return attempt.state
  }
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
  research,
}: CandidateCardProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const prep = research?.card.prep
  const readiness = research?.card.readiness
  // A draft of the link box, so typing is not a save on every keystroke. It
  // follows the stored value whenever that changes underneath.
  const [tripAdvisor, setTripAdvisor] = useState(prep?.tripadvisor_url ?? '')
  const [note, setNote] = useState(prep?.status_note ?? '')
  const [keepReason, setKeepReason] = useState(prep?.exclusion_reason ?? '')
  const stored = prep?.tripadvisor_url ?? ''
  const storedNote = prep?.status_note ?? ''
  const storedReason = prep?.exclusion_reason ?? ''
  useEffect(() => setTripAdvisor(stored), [stored])
  useEffect(() => setNote(storedNote), [storedNote])
  useEffect(() => setKeepReason(storedReason), [storedReason])

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
  // Required checks only. The optional link is not part of it, so a place with
  // no TripAdvisor page is not held back by it and the bar does not imply that
  // something is unfinished.
  const blockers = readiness?.blockers ?? []
  const state = cardState(research?.card)
  const has = (code: string) => blockers.some(blocker => blocker.code === code)
  const prepBlockers = blockers.filter(blocker => blocker.where !== 'execution')
  const line = research ? attemptLine(research.card) : ''
  const saving = research?.saveState === 'saving'

  return (
    <li className={`lp-candidate lp-candidate-${state}`}>
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
            {readiness && (
              <StateMark
                state={state}
                done={readiness.required_done}
                total={readiness.required_total}
                findings={research?.card.profile?.findings_this_topic ?? 0}
              />
            )}
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
                warning. Discovery, read one place at a time -- not the same
                thing as the research below. */}
            <button
              type="button"
              className="lp-tool lp-tool-quiet"
              aria-label={`Discovery details for ${candidate.name}`}
              onClick={onDetails}
            >
              <NotesIcon />
              Discovery details
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

          {research && (
            <ResearchAction
              research={research}
              line={line}
              blockers={prepBlockers}
              name={candidate.name}
              saving={saving}
            />
          )}
        </div>

        {research && prep && readiness ? (
          <ul className="lp-candidate-checks" aria-label={`Checklist for ${candidate.name}`}>
            <li>
              <label className="lp-check">
                <input
                  type="checkbox"
                  className="lp-check-input"
                  checked={prep.identity_confirmed && !has('identity_stale')}
                  disabled={saving || has('identity_unresolved')}
                  onChange={event =>
                    research.onPrep({ identity_confirmed: event.target.checked })
                  }
                />
                <CheckBox />
                <span className="lp-check-text">{RIGHT_PLACE}</span>
              </label>
              {/* The tick is made about a named place, not about a checkbox. */}
              <p className="lp-check-note">
                {readiness.google_name ? (
                  <>
                    {readiness.google_name}
                    {readiness.google_address ? ` · ${readiness.google_address}` : ''}
                  </>
                ) : (
                  <span className="lp-check-google lp-check-google-warn">
                    Google has not resolved this to a place with an address.
                  </span>
                )}
              </p>
            </li>
            <li>
              <label className="lp-check">
                <input
                  type="checkbox"
                  className="lp-check-input"
                  checked={prep.open_confirmed && !has('open_stale')}
                  disabled={saving}
                  onChange={event =>
                    research.onPrep({ open_confirmed: event.target.checked })
                  }
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

            {/* Google will not say it is open. A tick cannot clear that; a
                sentence from the person deciding can. */}
            {(has('status_note_missing') || has('status_note_stale') || note) && (
              <li className="lp-check-link">
                <label className="lp-check-text" htmlFor={`note-${candidate.candidate_id}`}>
                  Why research should go ahead anyway
                </label>
                <textarea
                  id={`note-${candidate.candidate_id}`}
                  className="lp-link-input"
                  rows={2}
                  value={note}
                  placeholder="The owner confirmed by phone that it reopens on Monday."
                  onChange={event => setNote(event.target.value)}
                  onBlur={() =>
                    note !== storedNote && research.onPrep({ status_note: note })
                  }
                />
              </li>
            )}

            {/* A cut warning is resolved by a decision with a reason. The
                decision settles the warning; it does not make it untrue. */}
            {(candidate.barred || prep.exclusion_decision) && (
              <li className="lp-check-link">
                <label className="lp-check">
                  <input
                    type="checkbox"
                    className="lp-check-input"
                    checked={prep.exclusion_decision === 'keep'}
                    disabled={saving}
                    onChange={event =>
                      research.onPrep({
                        exclusion_decision: event.target.checked ? 'keep' : '',
                        exclusion_reason: keepReason,
                      })
                    }
                  />
                  <CheckBox />
                  <span className="lp-check-text">Keep it for this list</span>
                </label>
                {candidate.barred && (
                  <p className="lp-check-note lp-check-google-warn">{candidate.barred}</p>
                )}
                <input
                  type="text"
                  className="lp-link-input"
                  value={keepReason}
                  aria-label="Why this one is kept despite the warning"
                  placeholder="Why it stays"
                  onChange={event => setKeepReason(event.target.value)}
                  onBlur={() =>
                    keepReason !== storedReason &&
                    research.onPrep({
                      exclusion_decision: 'keep',
                      exclusion_reason: keepReason,
                    })
                  }
                />
              </li>
            )}

            {/* Nothing flagged this row, and nothing looked at it either. */}
            {(has('cut_unchecked') || has('cut_stale') || prep.cut_confirmed) && (
              <li>
                <label className="lp-check">
                  <input
                    type="checkbox"
                    className="lp-check-input"
                    checked={prep.cut_confirmed && !has('cut_stale')}
                    disabled={saving}
                    onChange={event =>
                      research.onPrep({ cut_confirmed: event.target.checked })
                    }
                  />
                  <CheckBox />
                  <span className="lp-check-text">
                    I checked this against what is left out
                  </span>
                </label>
              </li>
            )}

            {/* Optional, and kept apart so nothing implies the card is
                unfinished because a box nobody has to fill is empty. */}
            <li className="lp-check-link lp-check-optional-group">
              <p className="lp-eyebrow">Optional sources</p>
              <label className="lp-check-text" htmlFor={`ta-${candidate.candidate_id}`}>
                TripAdvisor link
              </label>
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
                onBlur={() =>
                  tripAdvisor !== stored &&
                  research.onPrep({ tripadvisor_url: tripAdvisor })
                }
              />
              {badLink && (
                <p className="lp-link-why" id={`ta-${candidate.candidate_id}-why`}>
                  That isn't a TripAdvisor page for a place. Paste the link to this
                  place's own TripAdvisor page, or clear the box — it is optional.
                </p>
              )}
              {linked && <p className="lp-muted">Saved. Nothing was fetched.</p>}
            </li>

            {research.saveState && (
              <li className="lp-check-status" role="status">
                {research.saveState === 'saving' && <span className="lp-muted">Saving…</span>}
                {research.saveState === 'saved' && <span className="lp-muted">Saved</span>}
                {research.saveState === 'error' && (
                  <span className="lp-link-why">
                    {research.saveError || 'That could not be saved.'}
                  </span>
                )}
              </li>
            )}
          </ul>
        ) : (
          <ul className="lp-candidate-checks" aria-label={`Checklist for ${candidate.name}`}>
            <li className="lp-muted">Reading what is prepared for this place…</li>
          </ul>
        )}
      </div>
    </li>
  )
}

/** The one control on this card that spends money, and everything standing
 *  between it and being pressed.
 *
 *  A disabled button with no explanation is a screen nobody can argue with, so
 *  what is missing is listed instead — and each line says which screen fixes
 *  it. */
function ResearchAction({
  research,
  line,
  blockers,
  name,
  saving,
}: {
  research: CandidateResearch
  line: string
  blockers: { code: string; message: string; where: string }[]
  name: string
  /** A tick is still on its way to the server. Until it lands, this card's
   *  readiness is the readiness of the version before it, and a request sent
   *  against that would be refused anyway -- having paid for the round trip. */
  saving: boolean
}) {
  const { card, researching, onResearch, onOpenResearch } = research
  const attempt = card.last_attempt
  const running = researching || attempt?.state === 'running'
  const ready = card.readiness.ready
  const hasResearch = Boolean(card.profile && card.profile.findings_total > 0)
  const otherTopics = card.profile?.other_topics ?? []

  return (
    <div className="lp-research-action">
      {line && (
        <p className={running ? 'lp-research-line lp-muted' : 'lp-research-line'}>
          {line}
          {attempt?.finished_at && !running && (
            <span className="lp-muted"> · {attempt.finished_at.slice(0, 10)}</span>
          )}
        </p>
      )}
      {/* Research paid for by another list. Reading it is free; researching
          this topic is still a decision. */}
      {otherTopics.length > 0 && (
        <p className="lp-muted">
          Saved research from {otherTopics.join(', ')}.
        </p>
      )}
      {attempt?.reason && !running && (
        <p className="lp-muted lp-research-reason">{attempt.reason}</p>
      )}
      <div className="lp-candidate-tools">
        <button
          type="button"
          className="lp-tool"
          disabled={!ready || running || saving}
          aria-label={`Research ${name}`}
          onClick={onResearch}
        >
          {running
            ? 'Researching…'
            : attempt && attempt.state !== 'running'
              ? 'Research again'
              : 'Research this place'}
        </button>
        {hasResearch && (
          <button
            type="button"
            className="lp-tool lp-tool-quiet"
            onClick={onOpenResearch}
          >
            {running ? 'Open research' : 'View research'}
          </button>
        )}
      </div>
      <p className="lp-muted lp-research-cost">
        One grounded request. No automatic retries.
      </p>
      {research.saveError && (
        <p className="lp-link-why" role="alert">
          {research.saveError}
        </p>
      )}
      {!ready && blockers.length > 0 && (
        <ul className="lp-research-blockers">
          {blockers.map(blocker => (
            <li key={blocker.code}>
              {blocker.message}
              {/* The one blocker with a fix that is not a removal: Google can
                  be asked again. Offered here rather than in the Google bar at
                  the top, because it is about this card and costs one lookup. */}
              {blocker.code === 'identity_mismatch' && research.onRecheckGoogle && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="lp-link-button"
                    disabled={research.recheckingGoogle}
                    onClick={research.onRecheckGoogle}
                  >
                    {research.recheckingGoogle
                      ? 'Asking Google…'
                      : 'check this one on Google again'}
                  </button>
                  <span className="lp-muted"> — one lookup.</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!ready &&
        card.readiness.blockers.some(one => one.where === 'execution') && (
          <p className="lp-muted">
            {card.readiness.blockers.find(one => one.where === 'execution')?.message}
          </p>
        )}
    </div>
  )
}

/** Where one place has got to, as one word.
 *
 *  Three states rather than a percentage, because they are three different
 *  things to do: something is still missing, nothing is missing and the button
 *  is live, or the work is done and this card can be left alone. A bar that
 *  creeps from 40% to 70% says none of that.
 */
export type CardState = 'open' | 'ready' | 'done'

export function cardState(card?: ListicleResearchCard): CardState {
  if (!card) return 'open'
  // Done means this list has material from this place. A request that ran and
  // found nothing is not done -- there is still a decision to make about it,
  // and the card should keep offering to help make it.
  if ((card.profile?.findings_this_topic ?? 0) > 0) return 'done'
  return card.readiness.ready ? 'ready' : 'open'
}

/** The mark in the corner: how many required checks are in, and what that
 *  adds up to.
 *
 *  One pip per required check, and the number of pips is itself information --
 *  a card with a duplicate to settle has more to do than one without, and it
 *  shows that before you read a word.
 */
function StateMark({
  state,
  done,
  total,
  findings,
}: {
  state: CardState
  done: number
  total: number
  findings: number
}) {
  const label =
    state === 'done'
      ? `${findings} ${findings === 1 ? 'finding' : 'findings'}`
      : state === 'ready'
        ? 'Ready to research'
        : `${done} of ${total} checked`
  return (
    <p className="lp-candidate-state">
      <span className="lp-candidate-pips" aria-hidden="true">
        {Array.from({ length: Math.max(total, 1) }, (_, index) => (
          <span
            key={index}
            className={
              state === 'done' || index < done
                ? 'lp-pip lp-pip-on'
                : 'lp-pip'
            }
          />
        ))}
      </span>
      <span className="lp-candidate-state-text">{label}</span>
    </p>
  )
}

/** The drawn square beside a check. Ticked by the input before it. */
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
