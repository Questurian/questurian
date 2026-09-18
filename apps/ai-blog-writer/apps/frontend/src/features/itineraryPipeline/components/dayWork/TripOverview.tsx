import { useState } from 'react'
import { ClipboardCopy } from 'lucide-react'
import { readHandoff } from '../../dayWork/api'
import { stayWords } from './proposalText'
import type { WorkspaceView } from '../../dayWork/types'
import type { TripDraft } from '../../types'

/**
 * The whole trip at a glance: each day's angle and its chosen places.
 *
 * Read-only. Choosing a day opens it below. The handoff copies the chosen
 * places and their context for whatever writes the article later; it starts
 * nothing.
 */

export interface TripOverviewProps {
  trip: TripDraft
  overview: WorkspaceView | null
  workspaceId: string | null
  activeDayId: string
  onOpenDay: (dayId: string) => void
  announce: (message: string) => void
}

export function TripOverview({
  trip,
  overview,
  workspaceId,
  activeDayId,
  onOpenDay,
  announce,
}: TripOverviewProps) {
  const [copying, setCopying] = useState(false)
  const days = overview?.days ?? []
  const proposed = days.filter(day => day.picks.length > 0).length

  async function copyHandoff() {
    if (!workspaceId) return
    setCopying(true)
    try {
      const packet = await readHandoff(workspaceId)
      await navigator.clipboard.writeText(JSON.stringify(packet, null, 2))
      announce('The chosen places and their context are on your clipboard.')
    } catch {
      announce('The handoff could not be copied.')
    } finally {
      setCopying(false)
    }
  }

  if (days.length === 0) return null

  return (
    <section className="ip-trip-overview" aria-labelledby="ip-trip-overview-heading">
      <div className="ip-trip-overview-head">
        <h2 id="ip-trip-overview-heading">{trip.titleSeed || 'This trip'}</h2>
        <span className="ip-helper">
          {proposed} of {days.length} day{days.length === 1 ? '' : 's'} have places
        </span>
        {proposed > 0 ? (
          <button
            type="button"
            className="ip-button-quiet ip-button-small"
            onClick={copyHandoff}
            disabled={copying}
          >
            <ClipboardCopy size={13} aria-hidden /> Copy for writing
          </button>
        ) : null}
      </div>
      <ol className="ip-trip-days">
        {days.map(day => {
          const stay = stayWords(day.stay)
          const chosen = day.picks.filter(pick => pick.status === 'selected' && pick.name)
          const open = day.picks.filter(pick => pick.status === 'unresolved').length
          return (
            <li key={day.day_id} className={day.day_id === activeDayId ? 'ip-trip-day ip-trip-day-active' : 'ip-trip-day'}>
              <button type="button" className="ip-trip-day-button" onClick={() => onOpenDay(day.day_id)}>
                <span className="ip-trip-day-name">
                  Day {day.day_number}
                  {day.day_label && day.day_label !== `Day ${day.day_number}` ? ` · ${day.day_label}` : ''}
                </span>
                <span className="ip-trip-day-line">
                  {day.trip_fit || day.overview || (chosen.length ? '' : 'No places yet')}
                </span>
                {chosen.length > 0 ? (
                  <span className="ip-trip-day-places">
                    {chosen.map(pick => pick.name).join(' · ')}
                    {open > 0 ? ` · ${open} open` : ''}
                  </span>
                ) : null}
                {stay ? <span className="ip-trip-day-stay">{stay}</span> : null}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
