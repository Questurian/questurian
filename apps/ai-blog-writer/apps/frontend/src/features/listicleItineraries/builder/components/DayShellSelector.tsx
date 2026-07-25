import { useMemo } from 'react'
import type {
  DayShellId,
  DayShellTemplate,
  ListicleItineraryDraft,
} from '../../types'
import {
  DEFAULT_DAY_SHELL_ID,
  getAvailableDayShells,
  getDayShellTemplate,
} from '../constants/day-shells.constants'
import { FieldInfoHint } from '../../../../shared/builder/components/FieldInfoHint'
import {
  getShellIdForDay,
  setShellForAllDays,
  setShellForDay,
} from './day-shell-selection.utils'

type DayShellSelectorProps = {
  draft: ListicleItineraryDraft
  libraryShells: DayShellTemplate[]
  isSetupLocked: boolean
  updateDraft: (next: Partial<ListicleItineraryDraft>) => void
  onOpenLayoutManager?: () => void
}

export function DayShellSelector({
  draft,
  libraryShells,
  isSetupLocked,
  updateDraft,
  onOpenLayoutManager,
}: DayShellSelectorProps) {
  const firstShellId = draft.days[0]
    ? getShellIdForDay(draft, draft.days[0].id)
    : DEFAULT_DAY_SHELL_ID
  const shellOptions = useMemo(() => {
    const draftShells = getAvailableDayShells(draft.customDayShells)
    const knownIds = new Set(draftShells.map((shell) => shell.id))
    const libraryOnly = libraryShells.filter(
      (shell) => !knownIds.has(shell.id) && shell.slots.length > 0,
    )
    return [...draftShells, ...libraryOnly]
  }, [draft.customDayShells, libraryShells])

  const snapshotForSelection = (
    shellId: DayShellId,
  ): Pick<ListicleItineraryDraft, 'customDayShells'> | undefined => {
    const draftHasShell = getAvailableDayShells(draft.customDayShells).some(
      (shell) => shell.id === shellId,
    )
    if (draftHasShell) return undefined
    const libraryShell = libraryShells.find((shell) => shell.id === shellId)
    if (!libraryShell) return undefined
    return {
      customDayShells: [
        ...(draft.customDayShells ?? []),
        {
          ...libraryShell,
          slots: libraryShell.slots.map((slot) => ({ ...slot })),
        },
      ],
    }
  }

  return (
    <div className="stl-field stl-day-shells">
      <div className="stl-day-shells__header">
        <div>
          <h3 className="stl-section-heading">
            <span className="stl-field-label-with-hint">
              Day shell
              <FieldInfoHint text="Choose the shape of the day before AI generation. The shell controls stop count, order, meal slots, activity slots, and nightlife slots." />
            </span>
          </h3>
        </div>
        {onOpenLayoutManager ? (
          <button
            type="button"
            className="stl-btn stl-btn-secondary"
            onClick={onOpenLayoutManager}
          >
            Manage layouts
          </button>
        ) : null}
      </div>

      {draft.dayCount > 1 ? (
        <div className="stl-day-shell-apply">
          <label className="stl-field stl-day-shell-apply__select">
            <span>Apply shell to all days</span>
            <select
              className="stl-field-input"
              value={firstShellId}
              disabled={isSetupLocked}
              onChange={(event) => {
                const shellId = event.target.value as DayShellId
                updateDraft({
                  ...snapshotForSelection(shellId),
                  dayShellSelections: setShellForAllDays(draft, shellId),
                })
              }}
            >
              {shellOptions.map((shell) => (
                <option key={shell.id} value={shell.id}>
                  {shell.name} — {shell.slots.length} stops
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="stl-day-shell-grid">
        {draft.days.map((day, dayIndex) => {
          const shellId = getShellIdForDay(draft, day.id)
          const shell = getDayShellTemplate(shellId, draft.customDayShells)
          return (
            <div className="stl-day-shell-card" key={day.id}>
              <label className="stl-field">
                <span>Day {dayIndex + 1} template</span>
                <select
                  className="stl-field-input"
                  value={shellId}
                  disabled={isSetupLocked}
                  onChange={(event) => {
                    const nextShellId = event.target.value as DayShellId
                    updateDraft({
                      ...snapshotForSelection(nextShellId),
                      dayShellSelections: setShellForDay(draft, day.id, nextShellId),
                    })
                  }}
                >
                  {shellOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} — {option.slots.length} stops
                    </option>
                  ))}
                </select>
              </label>
              <p className="stl-day-shell-card__slot-summary">
                {shell.slots.map((slot) => slot.label).join(' → ')}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
