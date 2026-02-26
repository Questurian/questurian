import { useEffect, useRef, useState } from 'react'
import type { InstagramPostOption } from '../../types'
import { resolveInstagramPreviewUrl } from '../utils/item-media.utils'

type Props = {
  isOpen: boolean
  posts: InstagramPostOption[]
  selectedPostId: number | null
  onSelect: (id: number | null) => void
  onClose: () => void
}

export function InstagramPickerModal({ isOpen, posts, selectedPostId, onSelect, onClose }: Props) {
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
  const filtered = posts.filter((post) => post.title.toLowerCase().includes(lowerQuery))

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  function handleSelect(id: number | null) {
    onSelect(id)
    onClose()
  }

  return (
    <div className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div className="stl-picker-modal" role="dialog" aria-modal="true" aria-label="Select Instagram post">
        <div className="stl-picker-modal__header">
          <h3>Select Instagram Post</h3>
          <button type="button" className="stl-picker-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="stl-picker-modal__search">
          <input
            ref={searchRef}
            type="search"
            className="stl-picker-search-input"
            placeholder="Search by title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="stl-picker-grid stl-picker-grid--items">
          {/* None card */}
          <button
            type="button"
            className={`stl-picker-card stl-picker-card--unset${selectedPostId === null ? ' stl-picker-card--selected' : ''}`}
            onClick={() => handleSelect(null)}
          >
            <span>✕</span>
            <span>None</span>
          </button>

          {filtered.length === 0 && (
            <p className="stl-picker-empty">No posts match your search.</p>
          )}

          {filtered.map((post) => {
            const thumbUrl = resolveInstagramPreviewUrl(post)
            const isSelected = post.id === selectedPostId

            return (
              <button
                key={post.id}
                type="button"
                className={`stl-picker-card${isSelected ? ' stl-picker-card--selected' : ''}`}
                onClick={() => handleSelect(post.id)}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={post.title}
                    className="stl-picker-card__thumb stl-picker-card__thumb--photo"
                    loading="lazy"
                  />
                ) : (
                  <div className="stl-picker-card__thumb--empty stl-picker-card__thumb--photo">📷</div>
                )}
                <div className="stl-picker-card__info">
                  <span className="stl-picker-card__name">{post.title}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
