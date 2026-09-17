import { useState } from 'react'
import { BedDouble, Check, Search } from 'lucide-react'
import type { HotelOption } from '../dayWork/types'

/**
 * Location Manager's hotels as pictures, not a list of names.
 *
 * A chosen hotel folds to one card with a Change button, so a stay row stays
 * short. Open, the grid can be narrowed by typing a name or an area. A hotel
 * with no picture, or one whose picture fails to load, shows a plain tile
 * rather than a broken image.
 */

export interface HotelPickerProps {
  id: string
  city: string
  hotels: HotelOption[]
  loading: boolean
  selectedId: number | null
  /** What the stay already says, for a hotel no longer in the list. */
  selectedName: string
  selectedArea: string
  onPick: (hotel: HotelOption | null) => void
}

function Photo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="ip-hotel-photo ip-hotel-photo-empty" aria-hidden>
        <BedDouble size={22} />
      </span>
    )
  }
  return (
    <img
      className="ip-hotel-photo"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function HotelPicker({
  id,
  city,
  hotels,
  loading,
  selectedId,
  selectedName,
  selectedArea,
  onPick,
}: HotelPickerProps) {
  const [open, setOpen] = useState(selectedId === null && !selectedName)
  const [query, setQuery] = useState('')
  const selected = hotels.find(hotel => hotel.id === selectedId) ?? null

  if (!open && (selected || selectedName)) {
    return (
      <div className="ip-hotel-chosen">
        <Photo src={selected?.image ?? ''} alt="" />
        <div className="ip-hotel-chosen-text">
          <span className="ip-hotel-name">{selected?.name ?? selectedName}</span>
          <span className="ip-hotel-area">{selected?.area ?? selectedArea}</span>
        </div>
        <button type="button" className="ip-button-quiet ip-button-small" onClick={() => setOpen(true)}>
          Change hotel
        </button>
      </div>
    )
  }

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? hotels.filter(
        hotel =>
          hotel.name.toLowerCase().includes(needle) || hotel.area.toLowerCase().includes(needle),
      )
    : hotels

  return (
    <div className="ip-hotel-picker">
      <div className="ip-hotel-search">
        <Search size={14} aria-hidden />
        <label className="ip-sr-only" htmlFor={`${id}-search`}>
          Find a hotel in {city || 'the city'}
        </label>
        <input
          id={`${id}-search`}
          value={query}
          placeholder={`Find a hotel in ${city || 'the city'} by name or area`}
          onChange={event => setQuery(event.target.value)}
        />
        {selected || selectedName ? (
          <button type="button" className="ip-button-quiet ip-button-small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="ip-helper">Loading hotels…</p>
      ) : hotels.length === 0 ? (
        <p className="ip-helper">Location Manager has no hotels for this city.</p>
      ) : shown.length === 0 ? (
        <p className="ip-helper">No hotel matches “{query}”.</p>
      ) : (
        <ul className="ip-hotel-grid" role="list" aria-label={`Hotels in ${city || 'the city'}`}>
          {shown.map(hotel => {
            const on = hotel.id === selectedId
            return (
              <li key={hotel.id}>
                <button
                  type="button"
                  className={on ? 'ip-hotel-card ip-hotel-card-on' : 'ip-hotel-card'}
                  aria-pressed={on}
                  onClick={() => {
                    onPick(hotel)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <Photo src={hotel.image} alt="" />
                  <span className="ip-hotel-name">{hotel.name}</span>
                  <span className="ip-hotel-area">
                    {hotel.area}
                    {hotel.type ? ` · ${hotel.type}` : ''}
                  </span>
                  {on ? (
                    <span className="ip-hotel-tick" aria-hidden>
                      <Check size={12} />
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
