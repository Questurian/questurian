import { useEffect, useState } from 'react'
import { BedDouble, Plus, Sparkles, Trash2 } from 'lucide-react'
import { listHotels } from '../dayWork/api'
import { dayStays, defaultNightCount } from '../draft'
import type { HotelList } from '../dayWork/types'
import type { SetupAction } from '../setupReducer'
import { stayIssues, stayLabel } from '../stays'
import type { StayDraft, TripDraft } from '../types'

/**
 * Where you're staying: one or more stays, each over a run of nights.
 *
 * A stay is either a hotel Location Manager already holds for the trip's city,
 * or a request for the place selection to recommend one. Night N is the night
 * after day N, so the first day ends where night 1 is spent and the next day
 * starts there. The last day ends in a departure unless a stay covers it.
 *
 * Changing a stay reopens no layout. Days whose start or end it moves show
 * that they changed, and nothing else does.
 */

export interface StaysPanelProps {
  trip: TripDraft
  dayCount: number
  dispatch: (action: SetupAction) => void
}

const hotelCache = new Map<string, HotelList>()

/** Location Manager's hotels, asked for only once a stay needs them. */
function useHotels(city: string, wanted: boolean): { list: HotelList | null; loading: boolean } {
  const [list, setList] = useState<HotelList | null>(() => hotelCache.get(city) ?? null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!wanted) return
    if (!city.trim()) {
      setList({ available: true, error: '', hotels: [] })
      return
    }
    const cached = hotelCache.get(city)
    if (cached) {
      setList(cached)
      return
    }
    let live = true
    setLoading(true)
    listHotels(city)
      .then(found => {
        if (found?.available && Array.isArray(found.hotels)) hotelCache.set(city, found)
        if (live) setList(found)
      })
      .catch(caught => {
        if (live) {
          setList({
            available: false,
            error: caught instanceof Error ? caught.message : 'Hotels could not be listed.',
            hotels: [],
          })
        }
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [city, wanted])
  return { list, loading }
}

function NightSelect({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="ip-stay-night" htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={event => onChange(Number(event.target.value))}>
        {Array.from({ length: max }, (_, index) => index + 1).map(night => (
          <option key={night} value={night}>
            {night}
          </option>
        ))}
      </select>
    </label>
  )
}

export function StaysPanel({ trip, dayCount, dispatch }: StaysPanelProps) {
  const stays = trip.stays ?? []
  const { list, loading } = useHotels(
    trip.baseCity,
    stays.some(stay => stay.mode === 'location_manager'),
  )
  const maxNight = Math.max(dayCount, 1)
  const issues = stayIssues(stays, dayCount)
  const uncovered = Array.from({ length: defaultNightCount(dayCount) }, (_, index) => index + 1).filter(
    night => !stays.some(stay => stay.firstNight <= night && night <= stay.lastNight),
  )

  return (
    <section className="ip-stays" aria-labelledby="ip-stays-heading">
      <div className="ip-stays-head">
        <h2 id="ip-stays-heading">
          <BedDouble size={16} aria-hidden /> Where you’re staying
        </h2>
        <p className="ip-helper">
          Night 1 is the night after day 1. The last day ends with departure unless a stay
          covers it. Changing a stay does not reopen any layout.
        </p>
      </div>

      {stays.length === 0 ? (
        <p className="ip-helper">No stay yet. Days are planned without a hotel until you add one.</p>
      ) : (
        <ul className="ip-stay-list">
          {stays.map(stay => {
            const id = `ip-stay-${stay.id}`
            const patch = (value: Partial<StayDraft>) =>
              dispatch({ type: 'patchStay', stayId: stay.id, patch: value })
            const lmDown = stay.mode === 'location_manager' && list !== null && !list.available
            return (
              <li key={stay.id} className="ip-stay">
                <div className="ip-stay-modes" role="radiogroup" aria-label="How this stay is chosen">
                  <label>
                    <input
                      type="radio"
                      name={`${id}-mode`}
                      checked={stay.mode === 'location_manager'}
                      onChange={() => patch({ mode: 'location_manager' })}
                    />
                    Pick a hotel
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`${id}-mode`}
                      checked={stay.mode === 'recommend'}
                      onChange={() => patch({ mode: 'recommend', locationId: null, name: '', area: '' })}
                    />
                    Let AI recommend
                  </label>
                </div>

                {stay.mode === 'location_manager' ? (
                  lmDown ? (
                    <div className="ip-stay-fields">
                      <p className="ip-helper">
                        Location Manager could not be reached, so type the hotel in. It will
                        not be linked to a Location Manager record.
                      </p>
                      <label htmlFor={`${id}-name`}>Hotel</label>
                      <input
                        id={`${id}-name`}
                        value={stay.name}
                        onChange={event => patch({ name: event.target.value, locationId: null })}
                      />
                      <label htmlFor={`${id}-area`}>Area</label>
                      <input
                        id={`${id}-area`}
                        value={stay.area}
                        onChange={event => patch({ area: event.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="ip-stay-fields">
                      <label htmlFor={`${id}-hotel`}>Hotel in {trip.baseCity || 'the city'}</label>
                      <select
                        id={`${id}-hotel`}
                        value={stay.locationId ?? ''}
                        disabled={loading}
                        onChange={event => {
                          const chosen = list?.hotels.find(
                            hotel => hotel.id === Number(event.target.value),
                          )
                          patch(
                            chosen
                              ? { locationId: chosen.id, name: chosen.name, area: chosen.area }
                              : { locationId: null, name: '', area: '' },
                          )
                        }}
                      >
                        <option value="">
                          {loading
                            ? 'Loading hotels…'
                            : list && list.hotels.length === 0
                              ? 'No hotels in Location Manager for this city'
                              : 'Choose a hotel'}
                        </option>
                        {(list?.hotels ?? []).map(hotel => (
                          <option key={hotel.id} value={hotel.id}>
                            {hotel.name}
                            {hotel.area ? ` — ${hotel.area}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                ) : (
                  <div className="ip-stay-fields">
                    <label htmlFor={`${id}-note`}>What kind of stay? (optional)</label>
                    <input
                      id={`${id}-note`}
                      value={stay.note}
                      placeholder="Boutique, walkable to Barranco…"
                      onChange={event => patch({ note: event.target.value })}
                    />
                    <p className="ip-helper">
                      <Sparkles size={12} aria-hidden /> Chosen with the first day that needs it,
                      then reused. A suggestion, never a booking.
                    </p>
                  </div>
                )}

                <div className="ip-stay-nights">
                  <NightSelect
                    id={`${id}-first`}
                    label="From night"
                    value={stay.firstNight}
                    max={maxNight}
                    onChange={value =>
                      patch({ firstNight: value, lastNight: Math.max(value, stay.lastNight) })
                    }
                  />
                  <NightSelect
                    id={`${id}-last`}
                    label="to night"
                    value={stay.lastNight}
                    max={maxNight}
                    onChange={value =>
                      patch({ lastNight: value, firstNight: Math.min(value, stay.firstNight) })
                    }
                  />
                  <button
                    type="button"
                    className="ip-button-quiet ip-button-small"
                    onClick={() => dispatch({ type: 'removeStay', stayId: stay.id })}
                  >
                    <Trash2 size={13} aria-hidden /> Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="ip-step-actions">
        <button
          type="button"
          className="ip-button-quiet"
          onClick={() => dispatch({ type: 'addStay', mode: 'location_manager' })}
        >
          <Plus size={14} aria-hidden /> Pick a hotel
        </button>
        <button
          type="button"
          className="ip-button-quiet"
          onClick={() => dispatch({ type: 'addStay', mode: 'recommend' })}
        >
          <Sparkles size={14} aria-hidden /> Let AI recommend one
        </button>
      </div>

      {stays.length > 0 ? (
        <ul className="ip-stay-days" aria-label="What each day starts from and ends at">
          {Array.from({ length: dayCount }, (_, index) => {
            const number = index + 1
            const { start, end } = dayStays(stays, number)
            const last = number === dayCount
            return (
              <li key={number}>
                <strong>Day {number}:</strong>{' '}
                {start ? `from ${stayLabel(start)}` : 'no starting stay'}
                {' → '}
                {end ? stayLabel(end) : last ? 'departure' : 'no stay that night'}
              </li>
            )
          })}
        </ul>
      ) : null}

      {issues.length > 0 || (stays.length > 0 && uncovered.length > 0) ? (
        <ul className="ip-stay-issues">
          {issues.map(issue => (
            <li key={issue}>{issue}</li>
          ))}
          {stays.length > 0 && uncovered.length > 0 ? (
            <li>
              No stay for night{uncovered.length === 1 ? '' : 's'} {uncovered.join(', ')}.
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}
