import { useEffect, useMemo, useState } from 'react'
import type { DayShellSlot, DayShellTemplate } from '../../types'
import { BUILT_IN_DAY_SHELLS, DAY_SHELL_SLOT_PRESETS } from '../constants/day-shells.constants'

type Props = {
  isOpen: boolean
  libraryShells: DayShellTemplate[]
  onCreate: (shell: DayShellTemplate) => Promise<void>
  onUpdate: (shell: DayShellTemplate) => Promise<void>
  onDelete: (shellId: string) => Promise<void>
  onClose: () => void
}

/** One editable row. `uid` keeps React keys stable across reorder/duplicate. */
type EditorSlotRow = DayShellSlot & { uid: string }

type EditorState = {
  /** Library shell id being updated, or null when creating (new layout or built-in fork). */
  targetShellId: string | null
  sourceName: string
  name: string
  description: string
  slots: EditorSlotRow[]
}

let nextUid = 0
function makeUid(): string {
  nextUid += 1
  return `slot_row_${nextUid}`
}

function toEditorRows(slots: DayShellSlot[]): EditorSlotRow[] {
  return slots.map((slot) => ({ ...slot, uid: makeUid() }))
}

/** Strip a previous save's positional suffix so re-saving doesn't stack `_1_1`. */
function baseSlotId(id: string): string {
  return id.replace(/_\d+$/, '')
}

function finalizeSlots(rows: EditorSlotRow[]): DayShellSlot[] {
  return rows.map(({ uid: _uid, ...slot }, index) => ({
    ...slot,
    id: `${baseSlotId(slot.id)}_${index + 1}`,
  }))
}

export function DayShellLibraryModal({ isOpen, libraryShells, onCreate, onUpdate, onDelete, onClose }: Props) {
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setEditor(null)
    setError(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const builtInIds = useMemo(() => new Set(BUILT_IN_DAY_SHELLS.map((shell) => shell.id)), [])

  if (!isOpen) return null

  const startNewLayout = () => {
    setError(null)
    setEditor({
      targetShellId: null,
      sourceName: 'New layout',
      name: '',
      description: '',
      slots: [],
    })
  }

  const startEdit = (shell: DayShellTemplate) => {
    const isBuiltIn = builtInIds.has(shell.id)
    setError(null)
    setEditor({
      targetShellId: isBuiltIn ? null : shell.id,
      sourceName: isBuiltIn ? `Copy of ${shell.name}` : shell.name,
      name: isBuiltIn ? `${shell.name} (edited)` : shell.name,
      description: shell.description,
      slots: toEditorRows(shell.slots),
    })
  }

  const moveSlot = (index: number, delta: -1 | 1) => {
    setEditor((current) => {
      if (!current) return current
      const target = index + delta
      if (target < 0 || target >= current.slots.length) return current
      const slots = [...current.slots]
      ;[slots[index], slots[target]] = [slots[target], slots[index]]
      return { ...current, slots }
    })
  }

  const duplicateSlot = (index: number) => {
    setEditor((current) => {
      if (!current) return current
      const slots = [...current.slots]
      slots.splice(index + 1, 0, { ...slots[index], uid: makeUid() })
      return { ...current, slots }
    })
  }

  const removeSlot = (index: number) => {
    setEditor((current) => {
      if (!current) return current
      return { ...current, slots: current.slots.filter((_, i) => i !== index) }
    })
  }

  const addPresetSlot = (preset: DayShellSlot) => {
    setEditor((current) => {
      if (!current) return current
      return { ...current, slots: [...current.slots, { ...preset, uid: makeUid() }] }
    })
  }

  const canSave = Boolean(editor && editor.name.trim() && editor.slots.length > 0 && !isSaving)

  const saveEditor = async () => {
    if (!editor || !canSave) return
    setIsSaving(true)
    setError(null)
    const shell: DayShellTemplate = {
      id: editor.targetShellId ?? `custom_day_shell_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: editor.name.trim(),
      description: editor.description.trim() || `${editor.slots.length} custom stops.`,
      slots: finalizeSlots(editor.slots),
    }
    try {
      if (editor.targetShellId) {
        await onUpdate(shell)
      } else {
        await onCreate(shell)
      }
      setEditor(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the layout.')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteShell = async (shell: DayShellTemplate) => {
    if (!window.confirm(`Delete "${shell.name}" from the layout library? Itineraries already using it keep their copy.`)) return
    setDeletingId(shell.id)
    setError(null)
    try {
      await onDelete(shell.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the layout.')
    } finally {
      setDeletingId(null)
    }
  }

  const renderShellRow = (shell: DayShellTemplate, isBuiltIn: boolean) => (
    <div className="stl-shell-library-row" key={shell.id}>
      <div className="stl-shell-library-row__info">
        <div className="stl-shell-library-row__title">
          <strong>{shell.name}</strong>
          <span className="stl-shell-library-row__count">{shell.slots.length} stops</span>
          {isBuiltIn ? <span className="stl-shell-library-row__badge">Built-in</span> : null}
        </div>
        <p className="stl-shell-library-row__description">{shell.description}</p>
        <p className="stl-shell-library-row__slots">
          {shell.slots.map((slot) => slot.label).join(' → ')}
        </p>
      </div>
      <div className="stl-shell-library-row__actions">
        <button type="button" className="stl-btn stl-btn-secondary stl-btn-xs" onClick={() => startEdit(shell)}>
          {isBuiltIn ? 'Edit a copy' : 'Edit'}
        </button>
        {!isBuiltIn ? (
          <button
            type="button"
            className="stl-btn stl-btn-secondary stl-btn-xs stl-shell-library-row__delete"
            disabled={deletingId === shell.id}
            onClick={() => void deleteShell(shell)}
          >
            {deletingId === shell.id ? 'Deleting…' : 'Delete'}
          </button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="stl-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="stl-modal stl-shell-library-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Manage day layouts"
        onClick={(event) => event.stopPropagation()}
      >
        {editor === null ? (
          <>
            <div className="stl-shell-library-header">
              <div>
                <h3>Day layouts</h3>
                <p className="stl-summary-note">
                  Built-in layouts are fixed — editing one saves a copy to your library.
                  Layouts already applied to an itinerary keep their own copy; library changes never alter saved itineraries.
                </p>
              </div>
              <button type="button" className="stl-btn stl-btn-primary" onClick={startNewLayout}>
                New layout
              </button>
            </div>

            {error ? <p className="stl-shell-library-error" role="alert">{error}</p> : null}

            <h4 className="stl-shell-library-section-title">Your library</h4>
            {libraryShells.length > 0 ? (
              libraryShells.map((shell) => renderShellRow(shell, false))
            ) : (
              <p className="stl-summary-note">No saved layouts yet. Create one or edit a copy of a built-in.</p>
            )}

            <h4 className="stl-shell-library-section-title">Built-in layouts</h4>
            {BUILT_IN_DAY_SHELLS.map((shell) => renderShellRow(shell, true))}

            <div className="stl-shell-library-footer">
              <button type="button" className="stl-btn stl-btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="stl-shell-library-header">
              <div>
                <h3>{editor.targetShellId ? `Edit ${editor.sourceName}` : editor.sourceName}</h3>
                <p className="stl-summary-note">
                  Order the stops top-to-bottom — that's the order the day is generated in. Dayparts are labels, not constraints.
                </p>
              </div>
            </div>

            {error ? <p className="stl-shell-library-error" role="alert">{error}</p> : null}

            <div className="stl-grid stl-grid-2">
              <label className="stl-field">
                <span>Layout name *</span>
                <input
                  className="stl-field-input"
                  value={editor.name}
                  placeholder="e.g. Coffee, culture, tasting night"
                  onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)}
                />
              </label>
              <label className="stl-field">
                <span>Description</span>
                <input
                  className="stl-field-input"
                  value={editor.description}
                  placeholder="Optional internal note"
                  onChange={(event) => setEditor((current) => current ? { ...current, description: event.target.value } : current)}
                />
              </label>
            </div>

            <div className="stl-shell-editor-slots" aria-label="Layout stops in order">
              {editor.slots.length === 0 ? (
                <p className="stl-summary-note">No stops yet — add some from the catalog below.</p>
              ) : (
                editor.slots.map((slot, index) => (
                  <div className="stl-shell-editor-slot" key={slot.uid}>
                    <span className="stl-shell-editor-slot__order">{index + 1}</span>
                    <span className="stl-day-shell-slots__daypart">{slot.daypart.replace('_', ' ')}</span>
                    <span className="stl-shell-editor-slot__label">{slot.label}</span>
                    <span className="stl-shell-editor-slot__actions">
                      <button type="button" className="stl-btn stl-btn-secondary stl-btn-xs" aria-label={`Move ${slot.label} up`} disabled={index === 0} onClick={() => moveSlot(index, -1)}>↑</button>
                      <button type="button" className="stl-btn stl-btn-secondary stl-btn-xs" aria-label={`Move ${slot.label} down`} disabled={index === editor.slots.length - 1} onClick={() => moveSlot(index, 1)}>↓</button>
                      <button type="button" className="stl-btn stl-btn-secondary stl-btn-xs" aria-label={`Duplicate ${slot.label}`} onClick={() => duplicateSlot(index)}>⧉</button>
                      <button type="button" className="stl-btn stl-btn-secondary stl-btn-xs stl-shell-library-row__delete" aria-label={`Remove ${slot.label}`} onClick={() => removeSlot(index)}>✕</button>
                    </span>
                  </div>
                ))
              )}
            </div>

            <h4 className="stl-shell-library-section-title">Add a stop</h4>
            <div className="stl-day-shell-slot-catalog" aria-label="Stop presets">
              {DAY_SHELL_SLOT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className="stl-day-shell-slot-pill stl-day-shell-slot-pill--add"
                  onClick={() => addPresetSlot(preset)}
                >
                  <span className="stl-day-shell-slot-pill__label">{preset.label}</span>
                  <span className="stl-day-shell-slot-pill__daypart">{preset.daypart.replace('_', ' ')}</span>
                </button>
              ))}
            </div>

            <div className="stl-shell-library-footer">
              <button type="button" className="stl-btn stl-btn-secondary" disabled={isSaving} onClick={() => setEditor(null)}>
                Back
              </button>
              <button type="button" className="stl-btn stl-btn-primary" disabled={!canSave} onClick={() => void saveEditor()}>
                {isSaving ? 'Saving…' : editor.targetShellId ? 'Save changes' : 'Save to library'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
