import { useEffect, useRef, useState } from 'react'
import type { LocationOption } from '../../types'
import { formatLocationLabel } from '../../../../shared/locationScope/scope'

type Props = {
  isOpen: boolean
  neighborhoods: LocationOption[]
  selectedNeighborhoodIds: number[]
  onConfirm: (neighborhoodIds: number[]) => void
  onClose: () => void
}

export function SharedNeighborhoodsModal({
  isOpen,
  neighborhoods,
  selectedNeighborhoodIds,
  onConfirm,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [checkedIds, setCheckedIds] = useState<number[]>(selectedNeighborhoodIds)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setCheckedIds(selectedNeighborhoodIds)
    const timer = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [isOpen, selectedNeighborhoodIds])

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
  const filtered = neighborhoods.filter((location) => {
    const label = formatLocationLabel(location).toLowerCase()
    return label.includes(lowerQuery)
  })

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  function toggleNeighborhood(neighborhoodId: number) {
    setCheckedIds((current) => (
      current.includes(neighborhoodId)
        ? current.filter((id) => id !== neighborhoodId)
        : [...current, neighborhoodId]
    ))
  }

  function handleConfirm() {
    onConfirm(checkedIds)
    onClose()
  }

  return (
    <div className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="stl-picker-modal stl-picker-modal--shared-neighborhoods"
        role="dialog"
        aria-modal="true"
        aria-label="Select Shared Neighborhoods"
      >
        <div className="stl-picker-modal__header">
          <div className="stl-existing-stop-picker__header-copy">
            <h3>Shared Neighborhoods</h3>
            <p>
              Optional. When selected, stop pickers match only these exact neighborhoods.
              Leave empty to match city-wide.
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
            placeholder="Search neighborhoods..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="stl-shared-neighborhoods-modal__toolbar">
          <button
            type="button"
            className="stl-link-button"
            onClick={() => setCheckedIds(neighborhoods.map((location) => location.id))}
          >
            Select all
          </button>
          <button
            type="button"
            className="stl-link-button"
            onClick={() => setCheckedIds([])}
          >
            Clear all
          </button>
        </div>

        <div className="stl-shared-neighborhoods-modal__list">
          {filtered.length === 0 ? (
            <p className="stl-picker-empty">No neighborhoods match your search.</p>
          ) : null}

          {filtered.map((location) => {
            const isChecked = checkedIds.includes(location.id)
            const label = formatLocationLabel(location)

            return (
              <label
                key={location.id}
                className={`stl-neighborhood-option${isChecked ? ' is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleNeighborhood(location.id)}
                  aria-label={label}
                />
                <span className="stl-neighborhood-option__label">{label}</span>
              </label>
            )
          })}
        </div>

        <div className="stl-picker-modal__footer">
          <span className="stl-existing-stop-picker__count">
            {checkedIds.length === 0
              ? 'City-wide (no filter)'
              : `${checkedIds.length} neighborhood${checkedIds.length === 1 ? '' : 's'} selected`}
          </span>
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="stl-btn" onClick={handleConfirm}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
