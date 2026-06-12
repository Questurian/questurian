import { useEffect, useRef, useState } from 'react'
import type { LinkedTourOption } from '../../types'
import { TOUR_PICKS_MAX } from '../../types'

type Props = {
  isOpen: boolean
  tours: LinkedTourOption[]
  /** Currently saved pick ids, in pick order. May include stale ids not present in `tours`. */
  selectedTourIds: number[]
  onConfirm: (tourIds: number[]) => void
  onClose: () => void
}

export function TourPicksModal({
  isOpen,
  tours,
  selectedTourIds,
  onConfirm,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  // Pick order matters; stale ids are kept so confirming never silently drops them.
  const [checkedIds, setCheckedIds] = useState<number[]>(selectedTourIds)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setCheckedIds(selectedTourIds)
    const timer = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [isOpen, selectedTourIds])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const lowerQuery = query.toLowerCase()
  const filtered = tours.filter((tour) => {
    const title = (tour.title ?? '').toLowerCase()
    return title.includes(lowerQuery) || `tour #${tour.id}`.includes(lowerQuery)
  })

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  function toggleTour(tourId: number) {
    setCheckedIds((current) => {
      if (current.includes(tourId)) {
        return current.filter((id) => id !== tourId)
      }
      if (current.length >= TOUR_PICKS_MAX) {
        return current
      }
      return [...current, tourId]
    })
  }

  function handleConfirm() {
    onConfirm(checkedIds)
    onClose()
  }

  return (
    <div className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="stl-picker-modal stl-picker-modal--tour-picks"
        role="dialog"
        aria-modal="true"
        aria-label="Select Tour Picks"
      >
        <div className="stl-picker-modal__header">
          <div className="stl-existing-stop-picker__header-copy">
            <h3>Select Tour Picks</h3>
            <p>
              Feature up to {TOUR_PICKS_MAX} of this attraction's linked tours, in the order you pick them.
              Tour titles, prices, and booking links stay live from Location Manager.
            </p>
          </div>
          <button type="button" className="stl-picker-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="stl-picker-modal__search">
          <input
            ref={searchRef}
            type="search"
            className="stl-picker-search-input"
            placeholder="Search linked tours..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="stl-tour-picks-modal__list">
          {filtered.length === 0 ? (
            <p className="stl-picker-empty">No linked tours match your search.</p>
          ) : null}

          {filtered.map((tour) => {
            const pickIndex = checkedIds.indexOf(tour.id)
            const isPicked = pickIndex !== -1
            const atCap = !isPicked && checkedIds.length >= TOUR_PICKS_MAX
            const tourLabel = tour.title?.trim() || `Tour #${tour.id}`

            return (
              <label
                key={tour.id}
                className={`stl-tour-pick-row${isPicked ? ' stl-tour-pick-row--picked' : ''}${atCap ? ' stl-tour-pick-row--disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isPicked}
                  disabled={atCap}
                  onChange={() => toggleTour(tour.id)}
                  aria-label={tourLabel}
                />
                <span className="stl-tour-pick-row__order">
                  {isPicked ? `#${pickIndex + 1}` : ''}
                </span>
                <span className="stl-tour-pick-row__title">{tourLabel}</span>
                {tour.price?.trim() ? (
                  <span className="stl-tour-pick-row__price">{tour.price}</span>
                ) : null}
              </label>
            )
          })}
        </div>

        <div className="stl-picker-modal__footer">
          <span className="stl-existing-stop-picker__count">
            {checkedIds.length}/{TOUR_PICKS_MAX} selected
          </span>
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="stl-btn" onClick={handleConfirm}>
            Save Picks
          </button>
        </div>
      </div>
    </div>
  )
}
