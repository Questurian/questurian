import { useState } from 'react'
import { Dialog } from './Dialog'
import { CATEGORY_LABELS, DAYPART_LABELS, FREE_TIME_PRESET, STOP_PRESETS, TRAVEL_PRESET } from '../templates'
import type { SlotSnapshot } from '../types'

/**
 * The stop palette.
 *
 * A list of individual stops, not another day sequence — the plan is explicit
 * about that, and it is why this shows one preview pane rather than a second
 * agenda. Free time and Travel sit at the end because they are structural: one
 * searches for nothing, the other is a transfer.
 *
 * The preview is the whole point. Adding "Break or refreshment" also adds its
 * categories, its cues and its purpose, and an operator should see that before
 * it lands in their day, not after.
 */

type Preset = Omit<SlotSnapshot, 'id'>

const PALETTE: Array<{ group: string; items: Preset[] }> = [
  { group: 'Stops', items: STOP_PRESETS },
  { group: 'Structure', items: [FREE_TIME_PRESET, TRAVEL_PRESET] },
]

export interface AddStopDialogProps {
  dayNumber: number
  onAdd: (preset: Preset) => void
  onCancel: () => void
}

export function AddStopDialog({ dayNumber, onAdd, onCancel }: AddStopDialogProps) {
  const [selected, setSelected] = useState<Preset>(STOP_PRESETS[0])

  return (
    <Dialog
      wide
      title={`Add a stop to Day ${dayNumber}`}
      description="Pick a stop to see what it brings with it. It is added at the end, and you can move it from there."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ip-button-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ip-button-primary" onClick={() => onAdd(selected)}>
            Add {selected.label}
          </button>
        </>
      }
    >
      <div className="ip-palette">
        <div className="ip-palette-list" role="listbox" aria-label="Stop presets" tabIndex={-1}>
          {PALETTE.map(section => (
            <div key={section.group}>
              <p className="ip-palette-group">{section.group}</p>
              {section.items.map(preset => (
                <button
                  key={preset.sourceSlotId ?? preset.label}
                  type="button"
                  role="option"
                  aria-selected={selected.label === preset.label}
                  className={
                    selected.label === preset.label ? 'ip-palette-item ip-palette-item-on' : 'ip-palette-item'
                  }
                  onClick={() => setSelected(preset)}
                  onDoubleClick={() => onAdd(preset)}
                >
                  <span className="ip-daypart">{DAYPART_LABELS[preset.daypart]}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="ip-palette-preview">
          <h3>{selected.label}</h3>
          <p className="ip-dialog-lead">{selected.purpose}</p>
          <dl className="ip-detail-list">
            <div>
              <dt>Time of day</dt>
              <dd>{DAYPART_LABELS[selected.daypart]}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>
                {selected.kind === 'free_time'
                  ? 'Free time — no venue search'
                  : selected.kind === 'travel'
                    ? 'Travel — a transfer to plan'
                    : selected.kind === 'experience'
                      ? 'Experience'
                      : 'Place'}
              </dd>
            </div>
            {selected.allowedCategories.length > 0 ? (
              <div>
                <dt>Allowed</dt>
                <dd>{selected.allowedCategories.map(category => CATEGORY_LABELS[category]).join(', ')}</dd>
              </div>
            ) : null}
            {selected.preferredCategories.length > 0 ? (
              <div>
                <dt>Preferred</dt>
                <dd>{selected.preferredCategories.map(category => CATEGORY_LABELS[category]).join(', ')}</dd>
              </div>
            ) : null}
            {selected.cues.length > 0 ? (
              <div>
                <dt>Cues</dt>
                <dd>{selected.cues.join(', ')}</dd>
              </div>
            ) : null}
            {selected.exclusions.length > 0 ? (
              <div>
                <dt>Avoid</dt>
                <dd>{selected.exclusions.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </Dialog>
  )
}
