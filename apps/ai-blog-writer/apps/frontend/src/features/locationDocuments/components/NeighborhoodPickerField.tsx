import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  LocationDocumentDraft,
  LocationOption,
  RelationshipFieldDefinition,
} from '../types'
import {
  clampRelationshipSelections,
  formatLocationLabel,
  getNeighborhoodPickerOptions,
  toggleLimitedRelationshipSelection,
} from '../utils'

type NeighborhoodPickerFieldProps = {
  field: RelationshipFieldDefinition
  draft: LocationDocumentDraft
  value: number[]
  hintValues?: string[]
  locations: LocationOption[]
  onValueChange: (value: number[]) => void
  onHintChange?: (value: string[]) => void
}

function normalizeSelection(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))]
}

function formatNeighborhoodTitle(option: LocationOption): string {
  return option.neighborhoodName?.trim()
    || option.neighborhood?.trim()
    || formatLocationLabel(option)
}

export function NeighborhoodPickerField({
  field,
  draft,
  value,
  hintValues,
  locations,
  onValueChange,
  onHintChange,
}: NeighborhoodPickerFieldProps) {
  const maxSelections = field.maxSelections ?? 4
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const committedSelection = useMemo(() => normalizeSelection(value), [value])
  const [pendingSelection, setPendingSelection] = useState<number[]>(committedSelection)

  useEffect(() => {
    if (!isOpen) {
      setPendingSelection(committedSelection)
      setSearch('')
    }
  }, [committedSelection, isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const pickerState = useMemo(
    () => getNeighborhoodPickerOptions(locations, draft),
    [draft, locations],
  )

  const selectedLocations = useMemo(
    () => committedSelection
      .map((id) => locations.find((item) => item.id === id))
      .filter((item): item is LocationOption => Boolean(item)),
    [committedSelection, locations],
  )

  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    if (!normalizedSearch) {
      return pickerState.options
    }

    return pickerState.options.filter((option) => {
      const haystack = [
        option.neighborhoodName,
        option.neighborhood,
        option.cityName,
        option.city,
        option.countryName,
        option.country,
        option.locationKey,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [pickerState.options, search])

  const selectedCount = pendingSelection.length
  const hasReachedLimit = selectedCount >= maxSelections
  const scopeLabel = draft.cityName?.trim() || draft.city?.trim() || 'all neighborhoods'

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) {
      setIsOpen(false)
    }
  }

  const handleApply = () => {
    onValueChange(clampRelationshipSelections(pendingSelection, maxSelections))
    setIsOpen(false)
  }

  return (
    <div className="ldb-field-control-stack">
      <div className="ldb-neighborhood-picker">
        <div className="ldb-neighborhood-picker-toolbar">
          <div className="ldb-neighborhood-picker-copy">
            <strong>{committedSelection.length} / {maxSelections} selected</strong>
            <span>Pick neighborhoods or districts for this highlight.</span>
          </div>
          <div className="ldb-neighborhood-picker-actions">
            {committedSelection.length > 0 ? (
              <button
                type="button"
                className="ldb-danger-link"
                onClick={() => onValueChange([])}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="ldb-ghost-btn"
              onClick={() => setIsOpen(true)}
            >
              Select neighborhoods
            </button>
          </div>
        </div>

        <div className="ldb-pill-list">
          {selectedLocations.length === 0 ? (
            <span className="ldb-pill-placeholder">No neighborhoods selected yet</span>
          ) : (
            selectedLocations.map((option) => (
              <span key={option.id} className="ldb-pill">
                {formatNeighborhoodTitle(option)}
                <button
                  type="button"
                  className="ldb-pill-remove"
                  onClick={() => onValueChange(committedSelection.filter((id) => id !== option.id))}
                  aria-label={`Remove ${formatNeighborhoodTitle(option)}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {field.hintKey && onHintChange ? (
        <div className="ldb-hint-field">
          <label className="ldb-mini-label">{field.hintLabel || 'AI location keys'}</label>
          <textarea
            className="ldb-textarea"
            rows={3}
            value={(hintValues || []).join('\n')}
            onChange={(event) => {
              const nextValues = event.target.value
                .split(/\n|,/)
                .map((item) => item.trim())
                .filter(Boolean)
              onHintChange(nextValues)
            }}
            placeholder="AI can place unresolved locationKey suggestions here, one per line"
          />
        </div>
      ) : null}

      {isOpen ? createPortal(
        <div
          ref={overlayRef}
          className="ldb-ai-modal-backdrop"
          onClick={handleOverlayClick}
          role="presentation"
        >
          <div
            className="ldb-ai-modal ldb-neighborhood-modal"
            role="dialog"
            aria-modal="true"
            aria-label={field.label}
          >
            <div className="ldb-ai-modal-header">
              <div>
                <h2>Select Related Neighborhoods</h2>
                <p className="ldb-ai-modal-copy">
                  Choose up to {maxSelections} neighborhoods or districts for this highlight.
                </p>
              </div>
              <button
                type="button"
                className="ldb-modal-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close neighborhood picker"
              >
                ×
              </button>
            </div>

            <div className="ldb-neighborhood-modal-toolbar">
              <div className="ldb-pill-list">
                <span className="ldb-pill">
                  {selectedCount} / {maxSelections} selected
                </span>
                <span className={`ldb-pill${hasReachedLimit ? ' ldb-pill-muted' : ''}`}>
                  {hasReachedLimit ? 'Limit reached' : `${maxSelections - selectedCount} slots left`}
                </span>
                <span className="ldb-pill-placeholder">
                  {pickerState.isScopedToCity ? `Showing ${scopeLabel}` : 'Showing all cities until the city key is set'}
                </span>
              </div>

              <input
                className="ldb-input"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search neighborhoods or districts"
              />
            </div>

            {filteredOptions.length === 0 ? (
              <div className="ldb-neighborhood-empty">
                {pickerState.isScopedToCity
                  ? `No neighborhood documents are available for ${scopeLabel} yet.`
                  : 'No neighborhood documents matched this search.'}
              </div>
            ) : (
              <div className="ldb-neighborhood-card-grid">
                {filteredOptions.map((option) => {
                  const isSelected = pendingSelection.includes(option.id)
                  const isDisabled = !isSelected && hasReachedLimit
                  const optionTitle = formatNeighborhoodTitle(option)
                  const optionMeta = [option.cityName || option.city, option.countryName || option.country]
                    .filter((value): value is string => Boolean(value?.trim()))
                    .join(' · ')

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`ldb-neighborhood-card${isSelected ? ' is-selected' : ''}`}
                      disabled={isDisabled}
                      onClick={() => {
                        setPendingSelection((current) => (
                          toggleLimitedRelationshipSelection(current, option.id, maxSelections)
                        ))
                      }}
                    >
                      <span className="ldb-neighborhood-card-badge">
                        {isSelected ? 'Selected' : 'Available'}
                      </span>
                      <strong className="ldb-neighborhood-card-title">{optionTitle}</strong>
                      {optionMeta ? (
                        <span className="ldb-neighborhood-card-meta">{optionMeta}</span>
                      ) : null}
                      <span className="ldb-neighborhood-card-key">{option.locationKey}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="ldb-ai-modal-footer">
              <button
                type="button"
                className="ldb-ghost-btn"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ldb-btn"
                onClick={handleApply}
              >
                Apply selection
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
