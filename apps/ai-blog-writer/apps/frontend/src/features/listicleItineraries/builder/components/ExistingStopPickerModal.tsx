import { useEffect, useMemo, useRef, useState } from 'react'
import { getRelatedItemDisplayLabel } from '../../../shared/related-items/normalizeRelatedItems'
import type { RelatedItemCollection, RelatedItemOption } from '../../types'
import { getRelatedPhotoObjects, resolveImageUrl } from '../../../shared/builder/utils/item-media.utils'

export type ExistingStopPickerOption = {
  selectionKey: string
  collection: RelatedItemCollection
  collectionLabel: string
  item: RelatedItemOption
  canUseAsStartingPoint?: boolean
}

type Props = {
  isOpen: boolean
  items: ExistingStopPickerOption[]
  mode: 'single' | 'multiple'
  title: string
  description?: string
  selectedKeys: string[]
  confirmLabel: string
  emptyMessage: string
  searchPlaceholder?: string
  requireCoordinates?: boolean
  onConfirm: (keys: string[]) => void
  onClose: () => void
}

type CollectionFilter = RelatedItemCollection | 'all'

function uniqueKeys(keys: string[]): string[] {
  return Array.from(new Set(keys))
}

export function ExistingStopPickerModal({
  isOpen,
  items,
  mode,
  title,
  description,
  selectedKeys,
  confirmLabel,
  emptyMessage,
  searchPlaceholder = 'Search stops...',
  requireCoordinates = false,
  onConfirm,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [checkedKeys, setCheckedKeys] = useState<string[]>(() => uniqueKeys(selectedKeys))
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setCheckedKeys(uniqueKeys(selectedKeys))
    setCollectionFilter('all')
    const timer = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [isOpen, selectedKeys])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const collectionOptions = useMemo(
    () => Array.from(new Map(
      items.map((entry) => [entry.collection, { value: entry.collection, label: entry.collectionLabel }]),
    ).values()),
    [items],
  )

  if (!isOpen) return null

  const lowerQuery = query.toLowerCase()
  const filtered = items.filter((entry) => {
    if (collectionFilter !== 'all' && entry.collection !== collectionFilter) {
      return false
    }

    const displayLabel = getRelatedItemDisplayLabel(entry.item).toLowerCase()
    return displayLabel.includes(lowerQuery) || (entry.item.location ?? '').toLowerCase().includes(lowerQuery)
  })
  const filteredSelectableKeys = filtered
    .filter((entry) => !(requireCoordinates && !entry.canUseAsStartingPoint))
    .map((entry) => entry.selectionKey)

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  function toggleItem(selectionKey: string) {
    setCheckedKeys((current) => {
      if (mode === 'single') {
        return current.includes(selectionKey) ? [] : [selectionKey]
      }

      return current.includes(selectionKey)
        ? current.filter((entry) => entry !== selectionKey)
        : [...current, selectionKey]
    })
  }

  function selectAllFiltered() {
    setCheckedKeys((current) => uniqueKeys([...current, ...filteredSelectableKeys]))
  }

  function clearFiltered() {
    setCheckedKeys((current) => current.filter((key) => !filteredSelectableKeys.includes(key)))
  }

  function handleConfirm() {
    onConfirm(checkedKeys)
    onClose()
  }

  return (
    <div className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="stl-picker-modal stl-picker-modal--existing-stops"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="stl-picker-modal__header">
          <div className="stl-existing-stop-picker__header-copy">
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="stl-picker-modal__close" onClick={onClose} aria-label="Close">
            X
          </button>
        </div>

        <div className="stl-picker-modal__search stl-existing-stop-picker__search">
          <input
            ref={searchRef}
            type="search"
            className="stl-picker-search-input"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="stl-existing-stop-picker__filters" aria-label="Filter by collection">
            <button
              type="button"
              className={`stl-existing-stop-picker__filter${collectionFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setCollectionFilter('all')}
              aria-pressed={collectionFilter === 'all'}
            >
              All
            </button>
            {collectionOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`stl-existing-stop-picker__filter${collectionFilter === option.value ? ' is-active' : ''}`}
                onClick={() => setCollectionFilter(option.value)}
                aria-pressed={collectionFilter === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          {mode === 'multiple' ? (
            <div className="stl-existing-stop-picker__toolbar">
              <button type="button" className="stl-btn stl-btn-secondary stl-btn-xs" onClick={selectAllFiltered}>
                Select Filtered
              </button>
              <button type="button" className="stl-btn stl-btn-secondary stl-btn-xs" onClick={clearFiltered}>
                Clear Filtered
              </button>
            </div>
          ) : null}
        </div>

        <div className="stl-picker-grid stl-picker-grid--items">
          {filtered.length === 0 ? (
            <p className="stl-picker-empty">{emptyMessage}</p>
          ) : null}

          {filtered.map((entry) => {
            const photos = getRelatedPhotoObjects(entry.item)
            const firstPhoto = photos[0]
            const thumbUrl = firstPhoto ? resolveImageUrl(firstPhoto) : undefined
            const isSelected = checkedKeys.includes(entry.selectionKey)
            const displayLabel = getRelatedItemDisplayLabel(entry.item)
            const cardLabel = entry.item.location && entry.item.location !== displayLabel
              ? `${displayLabel} - ${entry.item.location}`
              : displayLabel
            const isDisabled = requireCoordinates && !entry.canUseAsStartingPoint

            return (
              <label
                key={entry.selectionKey}
                className={`stl-picker-card stl-picker-card--related-item stl-existing-stop-picker-card${isSelected ? ' stl-picker-card--selected' : ''}${isDisabled ? ' stl-picker-card--disabled' : ''}`}
                title={cardLabel}
              >
                <input
                  type={mode === 'multiple' ? 'checkbox' : 'radio'}
                  name={`${title}-existing-stop-selection`}
                  className="stl-existing-stop-picker__input"
                  checked={isSelected}
                  onChange={() => toggleItem(entry.selectionKey)}
                  aria-label={cardLabel}
                  disabled={isDisabled}
                />
                <div className="stl-picker-card__media">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={displayLabel}
                      className="stl-picker-card__thumb"
                      loading="lazy"
                    />
                  ) : (
                    <div className="stl-picker-card__thumb--empty">{entry.collectionLabel}</div>
                  )}
                </div>
                <div className="stl-picker-card__caption stl-existing-stop-picker__caption">
                  <div className="stl-existing-stop-picker__meta">
                    <span className="stl-existing-stop-picker__badge">{entry.collectionLabel}</span>
                    {isDisabled ? (
                      <span className="stl-existing-stop-picker__meta-note">Needs coordinates</span>
                    ) : null}
                  </div>
                  <span className="stl-picker-card__name">{displayLabel}</span>
                  {entry.item.location && entry.item.location !== displayLabel ? (
                    <span className="stl-picker-card__location">{entry.item.location}</span>
                  ) : null}
                </div>
              </label>
            )
          })}
        </div>

        <div className="stl-picker-modal__footer">
          <span className="stl-existing-stop-picker__count">
            {checkedKeys.length} selected
          </span>
          <button type="button" className="stl-btn stl-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="stl-btn" onClick={handleConfirm} disabled={checkedKeys.length < 1}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
