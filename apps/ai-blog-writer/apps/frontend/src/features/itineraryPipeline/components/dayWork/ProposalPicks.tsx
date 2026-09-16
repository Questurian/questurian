import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { journeyWords, safeHref } from './proposalText'
import type {
  DaySelection,
  DaySlotView,
  SelectionJourney,
  SelectionPick,
} from '../../dayWork/types'

/**
 * A day's places, in order, one reason each — the proposal as it reads.
 *
 * Used for a saved proposal and for an answer waiting to be saved, so the
 * editor judges both the same way. Details (address, map, sources) are one
 * click away and never in front: the proposal leads, the evidence follows.
 * Journey estimates sit between the stops they join, labelled as estimates.
 */

export function Link({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <ExternalLink size={11} aria-hidden />
    </a>
  )
}

export interface ProposalPicksProps {
  selection: DaySelection
  slots: DaySlotView[]
  /** Controls under each place, for a saved proposal. */
  actions?: (pick: SelectionPick) => ReactNode
  /** Something shown under a pick, such as a swap form. */
  below?: (pick: SelectionPick) => ReactNode
}

function legBetween(journeys: SelectionJourney[], from: string, to: string) {
  return journeys.find(leg => leg.from === from && leg.to === to) ?? null
}

export function ProposalPicks({ selection, slots, actions, below }: ProposalPicksProps) {
  const bySlot = new Map(slots.map(slot => [slot.id, slot]))
  const picks = selection.picks
  const first = picks[0]?.slotId
  const last = picks[picks.length - 1]?.slotId
  const leaving = first ? legBetween(selection.journeys, 'stay_start', first) : null
  const returning = last ? legBetween(selection.journeys, last, 'stay_end') : null

  return (
    <ol className="ip-picks">
      {leaving ? <li className="ip-leg">{journeyWords(leaving)} from the stay</li> : null}
      {picks.map((pick, index) => {
        const slot = bySlot.get(pick.slotId)
        const label = slot?.label ?? pick.slotId
        const next = picks[index + 1]
        const leg = next ? legBetween(selection.journeys, pick.slotId, next.slotId) : null
        const venue = slot?.kind === 'place' || slot?.kind === 'experience'
        const tone =
          pick.status === 'unresolved'
            ? 'ip-pick ip-pick-open'
            : pick.status === 'omitted_optional'
              ? 'ip-pick ip-pick-omitted'
              : 'ip-pick'
        return (
          <li key={pick.slotId} className="ip-pick-row">
            <article className={tone} aria-label={`${label}: ${pick.name ?? pick.status}`}>
              <p className="ip-pick-head">
                <span className="ip-pick-label">{label}</span>
                <span className="ip-pick-name">
                  {pick.status === 'unresolved'
                    ? 'Still open'
                    : pick.status === 'omitted_optional'
                      ? 'Left out (optional)'
                      : pick.name || (venue ? 'Unnamed' : '')}
                </span>
                {pick.chosenBy === 'editor' ? <span className="ip-pick-tag">your pick</span> : null}
              </p>
              {pick.reason ? <p className="ip-pick-reason">{pick.reason}</p> : null}
              {pick.note ? <p className="ip-pick-note">{pick.note}</p> : null}
              {pick.status === 'selected' && venue ? (
                <details className="ip-pick-details">
                  <summary>View details</summary>
                  <dl>
                    {pick.area ? (
                      <div>
                        <dt>Area</dt>
                        <dd>{pick.area}</dd>
                      </div>
                    ) : null}
                    {pick.address ? (
                      <div>
                        <dt>Address</dt>
                        <dd>{pick.address}</dd>
                      </div>
                    ) : null}
                    {pick.category ? (
                      <div>
                        <dt>Category</dt>
                        <dd>{pick.category}</dd>
                      </div>
                    ) : null}
                    {safeHref(pick.mapsUrl) ? (
                      <div>
                        <dt>Map</dt>
                        <dd>
                          <Link href={safeHref(pick.mapsUrl)}>Search the map</Link>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {pick.sources.length > 0 ? (
                    <ul className="ip-pick-sources">
                      {pick.sources.map(source => (
                        <li key={source.url}>
                          <Link href={safeHref(source.url)}>{source.title || source.url}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ip-helper">
                      {pick.chosenBy === 'editor' ? 'Your own pick; no sources.' : 'No sources given.'}
                    </p>
                  )}
                </details>
              ) : null}
              {actions ? <div className="ip-pick-actions">{actions(pick)}</div> : null}
              {below ? below(pick) : null}
            </article>
            {leg ? <p className="ip-leg">{journeyWords(leg)}</p> : null}
          </li>
        )
      })}
      {returning ? <li className="ip-leg">{journeyWords(returning)} back to the stay</li> : null}
    </ol>
  )
}
