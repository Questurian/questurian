import { useEffect, useRef, useState } from 'react'
import type { RelatedItemOption } from '../../types'
import { getRelatedPhotoObjects, resolveImageUrl } from '../utils/item-media.utils'

type Props = {
  isOpen: boolean
  items: RelatedItemOption[]
  selectedItemId: number | null
  onSelect: (id: number | null) => void
  onClose: () => void
}

export function RelatedItemPickerModal({ isOpen, items, selectedItemId, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    const timer = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [isOpen])

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
  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(lowerQuery) ||
      (item.location ?? '').toLowerCase().includes(lowerQuery),
  )

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  function handleSelect(id: number | null) {
    onSelect(id)
    onClose()
  }

  return (
    <div className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div className="stl-picker-modal" role="dialog" aria-modal="true" aria-label="Select related item">
        <div className="stl-picker-modal__header">
          <h3>Select Related Item</h3>
          <button type="button" className="stl-picker-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="stl-picker-modal__search">
          <input
            ref={searchRef}
            type="search"
            className="stl-picker-search-input"
            placeholder="Search by name or location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="stl-picker-grid stl-picker-grid--items">
          {/* None card */}
          <button
            type="button"
            className={`stl-picker-card stl-picker-card--unset${selectedItemId === null ? ' stl-picker-card--selected' : ''}`}
            onClick={() => handleSelect(null)}
          >
            <span>✕</span>
            <span>None</span>
          </button>

          {filtered.length === 0 && (
            <p className="stl-picker-empty">No items match your search.</p>
          )}

          {filtered.map((item) => {
            const photos = getRelatedPhotoObjects(item)
            const firstPhoto = photos[0]
            const thumbUrl = firstPhoto ? resolveImageUrl(firstPhoto) : undefined
            const isSelected = item.id === selectedItemId

            return (
              <button
                key={item.id}
                type="button"
                className={`stl-picker-card${isSelected ? ' stl-picker-card--selected' : ''}`}
                onClick={() => handleSelect(item.id)}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={item.title}
                    className="stl-picker-card__thumb"
                    loading="lazy"
                  />
                ) : (
                  <div className="stl-picker-card__thumb--empty">🖼</div>
                )}
                <div className="stl-picker-card__info">
                  <span className="stl-picker-card__name">{item.title}</span>
                  {item.location && (
                    <span className="stl-picker-card__location">{item.location}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
