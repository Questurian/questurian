import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { clockOf, durationOf } from './clock'
import type { DayResult, DaySlotView, ResultTransfer } from '../../dayWork/types'

/**
 * A returned day, read as a day.
 *
 * The place leads each stop, and the job the layout gave it ("Signature
 * lunch") sits above it in small type — the job is context, the place is the
 * answer. Under the place: its paragraph, why it is in the day, and its
 * practical notes. The journey to the next stop sits between the two, so the
 * route reads as part of the day rather than as a separate list.
 *
 * Evidence opens beside the stop it supports, with the exact address it was
 * chosen at, and it is marked unchecked: a resolving claim graph proves the
 * references connect, not that the page says what the claim says.
 *
 * Nothing here renders HTML from the packet. Every string goes through a React
 * text node, and an external link is http(s) only with `noopener`.
 */

const MODE_WORDS: Record<string, string> = {
  walk: 'walk',
  public_transport: 'public transport',
  taxi: 'taxi',
  car: 'car',
  train: 'train',
  bus: 'bus',
  unspecified: 'journey',
}

export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function Link({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <ExternalLink size={11} aria-hidden />
    </a>
  )
}

export function legWords(leg: ResultTransfer): string {
  const time =
    leg.minutesMin !== null && leg.minutesMax !== null
      ? leg.minutesMin === leg.minutesMax
        ? `${leg.minutesMax} min`
        : `${leg.minutesMin}–${leg.minutesMax} min`
      : leg.minutesMax !== null
        ? `up to ${leg.minutesMax} min`
        : 'time unknown'
  const basis =
    leg.basis === 'sourced'
      ? 'from a source'
      : leg.basis === 'planning_estimate'
        ? 'a planning estimate, not a routed time'
        : 'not established'
  return `${MODE_WORDS[leg.mode] ?? leg.mode} · ${time} · ${basis}`
}

export function endpointLabel(ref: string, labels: Map<string, string>): string {
  if (ref === 'base_start' || ref === 'base_end' || ref === 'base') return 'the base'
  return labels.get(ref) ?? ref
}

export interface DayArticleProps {
  result: DayResult
  slots: DaySlotView[]
  /** Why each stop is in the day, by slot id: the agreed role, else the layout's purpose. */
  roles: Map<string, string>
  /** Blocking items per slot label, shown under the stop they are about. */
  openByLabel?: Map<string, number>
  /** Shown between the title block and the stops — status, open issues. */
  afterHead?: ReactNode
  /** Extra line under the introduction. */
  subline?: ReactNode
}

export function DayArticle({ result, slots, roles, openByLabel, afterHead, subline }: DayArticleProps) {
  const labels = new Map(slots.map(slot => [slot.id, slot.label]))
  const kinds = new Map(slots.map(slot => [slot.id, slot.kind]))
  const claims = new Map(result.claims.map(claim => [claim.id, claim]))
  const sources = new Map(result.sources.map(source => [source.id, source]))
  const compact = Boolean(result.wireVersion)

  // Journeys are named by stop; a venue name reads better than a job title.
  const names = new Map(labels)
  for (const stop of result.stops) {
    if (stop.status === 'selected' && stop.name) names.set(stop.slotId, stop.name)
  }

  const legOut = new Map<string, ResultTransfer>()
  for (const leg of result.transfers) {
    if (!legOut.has(leg.from)) legOut.set(leg.from, leg)
  }
  const restAfter = new Map(result.restWindows.map(rest => [rest.afterSlotId, rest]))
  const firstLeg = legOut.get('base_start')

  return (
    <article className="ip-article">
      <div className="ip-result-head">
        <h4 className="ip-result-title">{result.title}</h4>
        <p className="ip-result-intro">{result.dayIntro}</p>
        {subline ?? (result.scheduleLabel ? <p className="ip-helper">{result.scheduleLabel}</p> : null)}
      </div>
      {afterHead}

      {firstLeg ? (
        <p className="ip-leg">
          From the base to {endpointLabel(firstLeg.to, names)}: {legWords(firstLeg)}.
          {firstLeg.note ? ` ${firstLeg.note}` : ''}
        </p>
      ) : null}

      <ol className="ip-agenda">
        {result.stops.map(stop => {
          const rest = restAfter.get(stop.slotId)
          const leg = stop.status === 'selected' ? legOut.get(stop.slotId) : undefined
          const label = labels.get(stop.slotId) ?? stop.slotId
          const kind = kinds.get(stop.slotId)
          const venue = kind === 'place' || kind === 'experience'
          const role = roles.get(stop.slotId)
          const open = openByLabel?.get(label) ?? 0
          const stopClaims = stop.claimIds
            .map(claimId => claims.get(claimId))
            .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim))
          const selected = stop.status === 'selected'
          return (
            <li key={stop.slotId} className={selected ? undefined : 'ip-agenda-missing'}>
              <div className="ip-agenda-head">
                <span className="ip-agenda-time">
                  {clockOf(stop.startMinutes)}
                  {stop.durationMinutes ? (
                    <>
                      <br />
                      {durationOf(stop.durationMinutes)}
                    </>
                  ) : null}
                </span>
                <div className="ip-agenda-heading">
                  <p className="ip-agenda-slot">
                    {label}
                    {stop.area ? ` · ${stop.area}` : ''}
                    {stop.status === 'unresolved' ? ' · not resolved' : ''}
                    {stop.status === 'omitted_optional' ? ' · dropped' : ''}
                  </p>
                  <h5 className="ip-agenda-name">{selected ? stop.name ?? label : label}</h5>
                </div>
                {open > 0 ? (
                  <span className="ip-badge ip-badge-error">
                    {open} open issue{open === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>

              <div className="ip-agenda-body">
                {selected ? (
                  <>
                    {stop.readerCopy ? <p className="ip-agenda-copy">{stop.readerCopy}</p> : null}
                    {role || stop.selectionReason ? (
                      <p className="ip-agenda-why">
                        <span>Why it&rsquo;s here</span>
                        {stop.selectionReason || role}
                      </p>
                    ) : null}
                    {stop.whatToDo.length > 0 ? (
                      <ul className="ip-agenda-list">
                        {stop.whatToDo.map(entry => (
                          <li key={entry}>{entry}</li>
                        ))}
                      </ul>
                    ) : null}
                    {stop.practicalNotes.length > 0 ? (
                      <ul className="ip-agenda-list ip-practical">
                        {stop.practicalNotes.map(note => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                    {venue && (stop.addressOrMeetingPoint || stopClaims.length > 0) ? (
                      <details className="ip-disclosure ip-disclosure-quiet">
                        <summary>
                          Address and sources{' '}
                          <span className="ip-disclosure-note">
                            {stopClaims.length} claim{stopClaims.length === 1 ? '' : 's'} · unchecked
                          </span>
                        </summary>
                        {stop.addressOrMeetingPoint ? (
                          <p className="ip-agenda-meta">
                            Chosen at: {stop.addressOrMeetingPoint}
                            {safeHref(stop.mapsUrl) ? (
                              <>
                                {' · '}
                                <Link href={safeHref(stop.mapsUrl)}>
                                  {compact ? 'map search' : 'map'}
                                </Link>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        <ul className="ip-evidence">
                          {stopClaims.map(claim => (
                            <li key={claim.id}>
                              <p className="ip-evidence-claim">{claim.text}</p>
                              <p className="ip-evidence-cite">
                                {claim.sourceIds.length === 0
                                  ? 'No usable page was given for this.'
                                  : claim.sourceIds.map(sourceId => {
                                      const source = sources.get(sourceId)
                                      if (!source) return null
                                      return (
                                        <span key={sourceId}>
                                          <Link href={safeHref(source.url)}>
                                            {source.title || source.publisher || source.url}
                                          </Link>{' '}
                                        </span>
                                      )
                                    })}
                              </p>
                            </li>
                          ))}
                        </ul>
                        <p className="ip-helper">
                          Check that each page is about this branch, at this address.
                        </p>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className="ip-agenda-unresolved">
                    {stop.unresolvedReason ??
                      'Nothing was returned for this stop and no reason was given.'}
                  </p>
                )}
              </div>

              {rest ? (
                <p className="ip-rest">
                  {durationOf(rest.minutes)} unallocated —{' '}
                  {rest.locationPolicy === 'return_to_base'
                    ? 'back at the base'
                    : rest.locationPolicy === 'named_location'
                      ? 'at a named place'
                      : rest.locationPolicy === 'stay_nearby'
                        ? 'nearby'
                        : 'location not stated'}
                  . {rest.description}
                </p>
              ) : null}

              {leg ? (
                <p className="ip-leg">
                  To {endpointLabel(leg.to, names)}: {legWords(leg)}.
                  {leg.note ? ` ${leg.note}` : ''}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </article>
  )
}
