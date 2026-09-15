import { Dialog } from './Dialog'
import type { DayDraft } from '../types'

/**
 * Reducing the day count, shown as what it actually removes.
 *
 * Days are dropped from the end, so this names them — with their working title,
 * their stop count, and a mark against any that carry notes, since notes are
 * the part nobody expects a number field to delete. Cancel puts the count back
 * and changes nothing.
 */

export interface RemoveDaysDialogProps {
  removing: DayDraft[]
  firstRemovedIndex: number
  onCancel: () => void
  onConfirm: () => void
}

export function RemoveDaysDialog({
  removing,
  firstRemovedIndex,
  onCancel,
  onConfirm,
}: RemoveDaysDialogProps) {
  const withNotes = removing.filter(day => day.setupNotes.trim() || day.preparationNotes.trim())

  return (
    <Dialog
      title={`Remove ${removing.length} day${removing.length === 1 ? '' : 's'}?`}
      description="Lowering the day count removes days from the end of the trip."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ip-button-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ip-button-danger" onClick={onConfirm}>
            Remove {removing.length === 1 ? 'the day' : `${removing.length} days`}
          </button>
        </>
      }
    >
      <ul className="ip-remove-list">
        {removing.map((day, offset) => (
          <li key={day.id}>
            <span className="ip-radio-label">
              Day {firstRemovedIndex + offset + 1} — {day.label}
            </span>
            <span className="ip-radio-note">
              {day.sourceTemplateName} · {day.slots.length} stop{day.slots.length === 1 ? '' : 's'}
              {day.setupNotes.trim() ? ' · day notes' : ''}
              {day.preparationNotes.trim() ? ' · preparation notes' : ''}
            </span>
          </li>
        ))}
      </ul>
      {withNotes.length > 0 ? (
        <p className="ip-warning-text">
          {withNotes.length === 1 ? 'One of these days has' : `${withNotes.length} of these days have`} notes
          you wrote. They go too.
        </p>
      ) : null}
    </Dialog>
  )
}
