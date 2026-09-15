import { useState } from 'react'
import { Dialog } from './Dialog'
import { isApprovalCurrent } from '../draft'
import { availableTimeLabel } from '../context'
import type { DayDraft, TripDraft } from '../types'

/**
 * Copy this day's shape onto others.
 *
 * What travels is the layout: the day type, the ordered stops and their rules.
 * What stays is everything that describes the target day rather than this one —
 * its working title, its available window, its notes. Each target gets its own
 * copy of the stops, so editing one afterwards does not edit the rest.
 *
 * Targets that would lose something say so before you apply: an approved day
 * reopens, and a day with a narrower window may end up with stops it cannot
 * hold. Nothing is replaced until Apply.
 */

export interface CopyLayoutDialogProps {
  source: DayDraft
  sourceNumber: number
  days: DayDraft[]
  trip: TripDraft
  onApply: (targetIds: string[]) => void
  onCancel: () => void
}

export function CopyLayoutDialog({
  source,
  sourceNumber,
  days,
  trip,
  onApply,
  onCancel,
}: CopyLayoutDialogProps) {
  const [selected, setSelected] = useState<string[]>([])
  const targets = days.filter(day => day.id !== source.id)

  const toggle = (dayId: string) =>
    setSelected(current =>
      current.includes(dayId) ? current.filter(id => id !== dayId) : [...current, dayId],
    )

  return (
    <Dialog
      title={`Copy Day ${sourceNumber}'s layout`}
      description={`${source.sourceTemplateName} · ${source.slots.length} stop${source.slots.length === 1 ? '' : 's'}. Working titles, windows and notes stay with each day.`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ip-button-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="ip-button-primary"
            disabled={selected.length === 0}
            onClick={() => onApply(selected)}
          >
            Replace {selected.length === 0 ? 'selected days' : `${selected.length} day${selected.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      {targets.length === 0 ? (
        <p className="ip-empty">There is no other day to copy onto.</p>
      ) : (
        <ul className="ip-copy-list">
          {targets.map(day => {
            const index = days.findIndex(candidate => candidate.id === day.id)
            const approved = isApprovalCurrent(day, trip)
            const narrower = day.availableTime.id !== 'full_day'
            return (
              <li key={day.id}>
                <label className="ip-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(day.id)}
                    onChange={() => toggle(day.id)}
                  />
                  <span>
                    <span className="ip-radio-label">
                      Day {index + 1} — {day.label}
                    </span>
                    <span className="ip-radio-note">
                      Replaces {day.sourceTemplateName}, {day.slots.length} stop
                      {day.slots.length === 1 ? '' : 's'}
                      {approved ? ' · reopens its approval' : ''}
                      {narrower ? ` · window is ${availableTimeLabel(day)}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
