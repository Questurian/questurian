import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ArrayFieldDefinition,
  LocationDocumentDraft,
  LocationFieldDefinition,
  LocationOption,
  MediaSetOption,
  RelationshipFieldDefinition,
  ScalarFieldDefinition,
} from '../types'
import {
  createDefaultObjectFromFields,
  formatLocationLabel,
  formatMediaSetLabel,
  getValueAtPath,
} from '../utils'
import { CoverImagePickerField } from './CoverImagePickerField'

type FieldRendererProps = {
  fields: LocationFieldDefinition[]
  basePath: string[]
  draft: LocationDocumentDraft
  token: string | null
  locationRef: number | null
  locations: LocationOption[]
  mediaSets: MediaSetOption[]
  onChange: (path: string[], value: unknown) => void
  onFieldAiGenerate: (path: string[], field: ScalarFieldDefinition) => void
  onFieldAiImprove: (path: string[], field: ScalarFieldDefinition) => void
  onArrayAiGenerate: (path: string[], field: ArrayFieldDefinition) => void
  onArrayAiImprove: (path: string[], field: ArrayFieldDefinition) => void
  isAiRunning: boolean
  activeAiPathKey: string | null
}

function isArrayRowPath(path: string[]) {
  return path.some((segment) => /^\d+$/.test(segment))
}

function shouldRenderField(field: LocationFieldDefinition, draft: LocationDocumentDraft) {
  return field.visibleWhen ? field.visibleWhen(draft) : true
}

function fieldWidthClass(field: LocationFieldDefinition): string {
  return field.width === 'half' ? 'ldb-field--half' : ''
}

function RelationshipFieldInput({
  field,
  value,
  hintValue,
  locations,
  mediaSets,
  onValueChange,
  onHintChange,
}: {
  field: RelationshipFieldDefinition
  value: number | null
  hintValue?: string
  locations: LocationOption[]
  mediaSets: MediaSetOption[]
  onValueChange: (value: number | null) => void
  onHintChange?: (value: string) => void
}) {
  const options = field.optionSource === 'mediaSets'
    ? mediaSets.map((item) => ({
        id: item.id,
        label: formatMediaSetLabel(item),
      }))
    : locations
      .filter((item) => field.optionSource !== 'neighborhoods' || item.level === 'neighborhood')
      .map((item) => ({
        id: item.id,
        label: formatLocationLabel(item),
      }))

  return (
    <div className="ldb-field-control-stack">
      <select
        className="ldb-select"
        value={value ?? ''}
        onChange={(event) => {
          const nextValue = event.target.value ? Number(event.target.value) : null
          onValueChange(Number.isFinite(nextValue as number) ? nextValue : null)
        }}
      >
        <option value="">Select {field.label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      {field.hintKey && onHintChange ? (
        <div className="ldb-hint-field">
          <label className="ldb-mini-label">{field.hintLabel || 'AI Hint'}</label>
          <input
            className="ldb-input"
            type="text"
            value={hintValue || ''}
            onChange={(event) => onHintChange(event.target.value)}
            placeholder="Optional AI hint or lookup phrase"
          />
        </div>
      ) : null}
    </div>
  )
}

function RelationshipManyFieldInput({
  field,
  value,
  hintValues,
  locations,
  onValueChange,
  onHintChange,
}: {
  field: RelationshipFieldDefinition
  value: number[]
  hintValues?: string[]
  locations: LocationOption[]
  onValueChange: (value: number[]) => void
  onHintChange?: (value: string[]) => void
}) {
  const [search, setSearch] = useState('')

  const options = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return locations
      .filter((item) => item.level === 'neighborhood')
      .filter((item) => {
        if (!normalizedSearch) return true
        return formatLocationLabel(item).toLowerCase().includes(normalizedSearch)
      })
      .slice(0, 24)
  }, [locations, search])

  return (
    <div className="ldb-field-control-stack">
      <div className="ldb-pill-list">
        {value.length === 0 ? <span className="ldb-pill-placeholder">No neighborhoods selected</span> : null}
        {value.map((id) => {
          const option = locations.find((item) => item.id === id)
          return (
            <span key={id} className="ldb-pill">
              {option ? formatLocationLabel(option) : `Location #${id}`}
              <button
                type="button"
                className="ldb-pill-remove"
                onClick={() => onValueChange(value.filter((item) => item !== id))}
                aria-label="Remove selected neighborhood"
              >
                ×
              </button>
            </span>
          )
        })}
      </div>

      <input
        className="ldb-input"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search neighborhood locations"
      />

      <div className="ldb-option-list">
        {options.map((option) => {
          const checked = value.includes(option.id)
          return (
            <label key={option.id} className={`ldb-option-row${checked ? ' is-selected' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  if (checked) {
                    onValueChange(value.filter((item) => item !== option.id))
                  } else {
                    onValueChange([...value, option.id])
                  }
                }}
              />
              <span>{formatLocationLabel(option)}</span>
            </label>
          )
        })}
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
    </div>
  )
}

function InlineAiMenu({
  onGenerate,
  onImprove,
  placement = 'center',
  isLoading = false,
  disabled = false,
}: {
  onGenerate: () => void
  onImprove: () => void
  placement?: 'center' | 'top' | 'flow'
  isLoading?: boolean
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const isDisabled = disabled || isLoading

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target as Node)) return
      setIsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (isDisabled) setIsOpen(false)
  }, [isDisabled])

  const handleGenerate = () => {
    if (isDisabled) return
    setIsOpen(false)
    onGenerate()
  }

  const handleImprove = () => {
    if (isDisabled) return
    setIsOpen(false)
    onImprove()
  }

  return (
    <div
      ref={rootRef}
      className={`ldb-inline-ai-menu${placement === 'top' ? ' ldb-inline-ai-menu--top' : ''}${placement === 'flow' ? ' ldb-inline-ai-menu--flow' : ''}`}
    >
      <button
        type="button"
        className={`ldb-inline-ai-trigger${isLoading ? ' is-loading' : ''}`}
        aria-label="Open AI options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isDisabled}
        onClick={() => {
          if (isDisabled) return
          setIsOpen((current) => !current)
        }}
      >
        {isLoading ? <span className="ldb-spinner ldb-spinner--sm" /> : 'AI'}
      </button>
      {isOpen ? (
        <div className="ldb-inline-ai-popover" role="menu">
          <button
            type="button"
            className="ldb-inline-ai-popover-btn"
            role="menuitem"
            disabled={isDisabled}
            onClick={handleGenerate}
          >
            Generate
          </button>
          <button
            type="button"
            className="ldb-inline-ai-popover-btn"
            role="menuitem"
            disabled={isDisabled}
            onClick={handleImprove}
          >
            Improve
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ScalarField({
  field,
  path,
  value,
  onChange,
  onFieldAiGenerate,
  onFieldAiImprove,
  isAiRunning,
  activeAiPathKey,
}: {
  field: ScalarFieldDefinition
  path: string[]
  value: unknown
  onChange: (path: string[], value: unknown) => void
  onFieldAiGenerate: (path: string[], field: ScalarFieldDefinition) => void
  onFieldAiImprove: (path: string[], field: ScalarFieldDefinition) => void
  isAiRunning: boolean
  activeAiPathKey: string | null
}) {
  const aiEligible = field.aiEnabled && !isArrayRowPath(path)
  const pathKey = path.join('.')
  const isLoading = isAiRunning && activeAiPathKey === pathKey

  return (
    <div className={`ldb-field ${field.width === 'half' ? 'ldb-field--half' : ''}`}>
      <div className="ldb-field-header">
        <label className="ldb-label">{field.label}</label>
      </div>

      {field.description ? <p className="ldb-field-description">{field.description}</p> : null}

      {field.type === 'textarea' ? (
        <div className={`ldb-input-with-ai${aiEligible ? ' is-ai-enabled is-textarea' : ''}`}>
          <textarea
            className="ldb-textarea"
            rows={4}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(path, event.target.value)}
            placeholder={field.placeholder}
          />
          {aiEligible ? (
            <InlineAiMenu
              placement="top"
              onGenerate={() => onFieldAiGenerate(path, field)}
              onImprove={() => onFieldAiImprove(path, field)}
              isLoading={isLoading}
              disabled={isAiRunning}
            />
          ) : null}
        </div>
      ) : null}

      {field.type === 'text' ? (
        <div className={`ldb-input-with-ai${aiEligible ? ' is-ai-enabled' : ''}`}>
          <input
            className="ldb-input"
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(path, event.target.value)}
            placeholder={field.placeholder}
          />
          {aiEligible ? (
            <InlineAiMenu
              onGenerate={() => onFieldAiGenerate(path, field)}
              onImprove={() => onFieldAiImprove(path, field)}
              isLoading={isLoading}
              disabled={isAiRunning}
            />
          ) : null}
        </div>
      ) : null}

      {field.type === 'number' ? (
        <div className={`ldb-input-with-ai${aiEligible ? ' is-ai-enabled' : ''}`}>
          <input
            className="ldb-input"
            type="number"
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => {
              const nextValue = event.target.value.trim()
              onChange(path, nextValue ? Number(nextValue) : null)
            }}
          />
          {aiEligible ? (
            <InlineAiMenu
              onGenerate={() => onFieldAiGenerate(path, field)}
              onImprove={() => onFieldAiImprove(path, field)}
              isLoading={isLoading}
              disabled={isAiRunning}
            />
          ) : null}
        </div>
      ) : null}

      {field.type === 'select' ? (
        <div className={`ldb-input-with-ai${aiEligible ? ' is-ai-enabled' : ''}`}>
          <select
            className="ldb-select"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(path, event.target.value)}
          >
            <option value="">Select an option</option>
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {aiEligible ? (
            <InlineAiMenu
              onGenerate={() => onFieldAiGenerate(path, field)}
              onImprove={() => onFieldAiImprove(path, field)}
              isLoading={isLoading}
              disabled={isAiRunning}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function FieldRenderer({
  fields,
  basePath,
  draft,
  token,
  locationRef,
  locations,
  mediaSets,
  onChange,
  onFieldAiGenerate,
  onFieldAiImprove,
  onArrayAiGenerate,
  onArrayAiImprove,
  isAiRunning,
  activeAiPathKey,
}: FieldRendererProps) {
  return (
    <div className="ldb-field-grid">
      {fields.map((field) => {
        if (!shouldRenderField(field, draft)) return null

        const path = [...basePath, field.key]
        const value = getValueAtPath(draft, path)

        if (field.type === 'group') {
          return (
            <section key={path.join('.')} className="ldb-subgroup">
              <div className="ldb-subgroup-header">
                <h3>{field.label}</h3>
                {field.description ? <p>{field.description}</p> : null}
              </div>
              <FieldRenderer
                fields={field.fields}
                basePath={path}
                draft={draft}
                token={token}
                locationRef={locationRef}
                locations={locations}
                mediaSets={mediaSets}
                onChange={onChange}
                onFieldAiGenerate={onFieldAiGenerate}
                onFieldAiImprove={onFieldAiImprove}
                onArrayAiGenerate={onArrayAiGenerate}
                onArrayAiImprove={onArrayAiImprove}
                isAiRunning={isAiRunning}
                activeAiPathKey={activeAiPathKey}
              />
            </section>
          )
        }

        if (field.type === 'array') {
          const items = Array.isArray(value) ? value : []
          const aiEligible = field.aiEnabled && !isArrayRowPath(path)
          const pathKey = path.join('.')
          const isLoading = isAiRunning && activeAiPathKey === pathKey

          return (
            <section key={path.join('.')} className="ldb-array">
              <div className="ldb-subgroup-header">
                <h3>{field.label}</h3>
                <div className="ldb-array-actions">
                  <span className="ldb-array-count">{items.length} items</span>
                  {aiEligible ? (
                    <InlineAiMenu
                      placement="flow"
                      onGenerate={() => onArrayAiGenerate(path, field)}
                      onImprove={() => onArrayAiImprove(path, field)}
                      isLoading={isLoading}
                      disabled={isAiRunning}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="ldb-ghost-btn"
                    disabled={isAiRunning}
                    onClick={() => onChange(path, [...items, createDefaultObjectFromFields(field.fields)])}
                  >
                    {field.addLabel || `Add ${field.label}`}
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="ldb-array-empty">No items added yet.</div>
              ) : (
                <div className="ldb-array-list">
                  {items.map((_item, index) => (
                    <article key={`${path.join('.')}.${index}`} className="ldb-array-item">
                      <div className="ldb-array-item-header">
                        <strong>{field.label} #{index + 1}</strong>
                        <button
                          type="button"
                          className="ldb-danger-link"
                          onClick={() => onChange(path, items.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          Remove
                        </button>
                      </div>
                      <FieldRenderer
                        fields={field.fields}
                        basePath={[...path, String(index)]}
                        draft={draft}
                        token={token}
                        locationRef={locationRef}
                        locations={locations}
                        mediaSets={mediaSets}
                        onChange={onChange}
                        onFieldAiGenerate={onFieldAiGenerate}
                        onFieldAiImprove={onFieldAiImprove}
                        onArrayAiGenerate={onArrayAiGenerate}
                        onArrayAiImprove={onArrayAiImprove}
                        isAiRunning={isAiRunning}
                        activeAiPathKey={activeAiPathKey}
                      />
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        }

        if (field.type === 'relationship') {
          const hintPath = field.hintKey ? [...basePath, field.hintKey] : null
          const hintValue = hintPath ? getValueAtPath(draft, hintPath) : undefined
          const isCoverImagePicker = field.picker === 'mediaSetLibrary' && !field.hasMany

          return (
            <div key={path.join('.')} className={`ldb-field ${fieldWidthClass(field)}`}>
              <div className="ldb-field-header">
                <label className="ldb-label">{field.label}</label>
              </div>
              {field.description ? <p className="ldb-field-description">{field.description}</p> : null}

              {isCoverImagePicker ? (
                <CoverImagePickerField
                  field={field}
                  value={typeof value === 'number' ? value : null}
                  token={token}
                  locationRef={locationRef}
                  mediaSets={mediaSets}
                  onValueChange={(nextValue) => onChange(path, nextValue)}
                />
              ) : field.hasMany ? (
                <RelationshipManyFieldInput
                  field={field}
                  value={Array.isArray(value) ? (value as number[]) : []}
                  hintValues={Array.isArray(hintValue) ? (hintValue as string[]) : []}
                  locations={locations}
                  onValueChange={(nextValue) => onChange(path, nextValue)}
                  onHintChange={field.hintKey ? (nextValue) => onChange([...basePath, field.hintKey!], nextValue) : undefined}
                />
              ) : (
                <RelationshipFieldInput
                  field={field}
                  value={typeof value === 'number' ? value : null}
                  hintValue={typeof hintValue === 'string' ? hintValue : ''}
                  locations={locations}
                  mediaSets={mediaSets}
                  onValueChange={(nextValue) => onChange(path, nextValue)}
                  onHintChange={field.hintKey ? (nextValue) => onChange([...basePath, field.hintKey!], nextValue) : undefined}
                />
              )}
            </div>
          )
        }

        return (
          <ScalarField
            key={path.join('.')}
            field={field}
            path={path}
            value={value}
            onChange={onChange}
            onFieldAiGenerate={onFieldAiGenerate}
            onFieldAiImprove={onFieldAiImprove}
            isAiRunning={isAiRunning}
            activeAiPathKey={activeAiPathKey}
          />
        )
      })}
    </div>
  )
}
