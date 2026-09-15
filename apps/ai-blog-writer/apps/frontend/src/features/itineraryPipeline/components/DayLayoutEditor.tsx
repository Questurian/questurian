import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CopyPlus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { StopEditor } from './StopEditor'
import { AddStopDialog } from './AddStopDialog'
import { CopyLayoutDialog } from './CopyLayoutDialog'
import { LayoutReplacementDialog } from './LayoutReplacementDialog'
import { availableTimeLabel } from '../context'
import { AVAILABLE_TIME_LABELS, daypartFitsWindow } from '../draft'
import { BUILT_IN_TEMPLATES, DAYPART_LABELS, STOP_KIND_LABELS, findTemplate } from '../templates'
import { fieldIds, type Issue } from '../validation'
import type { CustomTemplatesState } from '../customTemplates'
import type { SetupAction, RemovedSlot } from '../setupReducer'
import type { AvailableTimeId, DayDraft, DayTemplate, SlotSnapshot, TripDraft } from '../types'

/**
 * Stage 2 — the day agenda, which is the part of this screen that has to feel
 * good.
 *
 * Choosing a day type fills a visible, ordered sequence of stops you can
 * immediately reorder, rename and remove. Everything around it — the type, the
 * window, the working title — is quiet, on the right, out of the way.
 *
 * Rows are terse on purpose. Daypart, name, kind, and a mark when a stop is
 * optional or falls outside the day's window; the rules open under the row you
 * are editing. A window that excludes a stop never deletes it: it says so and
 * offers the three ways out.
 */

export interface DayLayoutEditorProps {
  day: DayDraft
  dayNumber: number
  days: DayDraft[]
  trip: TripDraft
  issues: Issue[]
  customTemplates: CustomTemplatesState
  expandedSlotId: string | null
  lastRemoval: RemovedSlot | null
  dispatch: (action: SetupAction) => void
  announce: (message: string) => void
}

const WINDOW_HELPER: Record<AvailableTimeId, string> = {
  full_day: 'Every daypart is available.',
  morning_only: 'Morning and late morning. Lunch counts as the start of the afternoon here.',
  afternoon_onward: 'Afternoon, dinner, evening and nightlife.',
  evening_only: 'Dinner, evening and nightlife.',
  custom: 'Dayparts cannot be checked against a clock window, so you confirm the fit on review.',
}

export function DayLayoutEditor({
  day,
  dayNumber,
  days,
  trip,
  issues,
  customTemplates,
  expandedSlotId,
  lastRemoval,
  dispatch,
  announce,
}: DayLayoutEditorProps) {
  const [pendingTemplate, setPendingTemplate] = useState<DayTemplate | null>(null)
  const [addingStop, setAddingStop] = useState(false)
  const [copying, setCopying] = useState(false)
  const [refocus, setRefocus] = useState<{ slotId: string; direction: -1 | 1 } | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  // A moved row keeps the focus that moved it, so a second press moves it again.
  useEffect(() => {
    if (!refocus) return
    const selector = `[data-move="${refocus.direction === -1 ? 'up' : 'down'}"][data-slot="${refocus.slotId}"]`
    listRef.current?.querySelector<HTMLElement>(selector)?.focus()
    setRefocus(null)
  }, [refocus, day.slots])

  const issuesFor = (slotId: string) => issues.filter(issue => issue.slotId === slotId)

  /**
   * Problems shown above the agenda.
   *
   * Anything about a stop you are already editing is left to the field itself;
   * everything else is listed here with a link, because a stop the window
   * excludes is not deleted and not opened — so without this the only sign of
   * it would be a chip on a collapsed row.
   */
  const dayLevelIssues = issues.filter(issue => issue.slotId !== expandedSlotId)

  function chooseTemplate(templateId: string) {
    if (templateId === day.sourceTemplateId) return
    const template = findTemplate(templateId, customTemplates.templates)
    if (template) setPendingTemplate(template)
  }

  function move(slot: SlotSnapshot, direction: -1 | 1) {
    const index = day.slots.findIndex(candidate => candidate.id === slot.id)
    const target = index + direction
    if (target < 0 || target >= day.slots.length) return
    dispatch({ type: 'moveSlot', dayId: day.id, slotId: slot.id, direction })
    announce(`${slot.label} moved to position ${target + 1} of ${day.slots.length}.`)
    setRefocus({ slotId: slot.id, direction })
  }

  const currentTemplate = findTemplate(day.sourceTemplateId, customTemplates.templates)

  return (
    <div className="ip-day-editor">
      <div className="ip-agenda">
        <div className="ip-agenda-head">
          <h2>
            {day.label || `Day ${dayNumber}`}
            <span className="ip-agenda-sub">
              {day.sourceTemplateName} · {day.slots.length} stop{day.slots.length === 1 ? '' : 's'}
            </span>
          </h2>
        </div>

        {dayLevelIssues.length > 0 ? (
          <ul className="ip-day-issues">
            {dayLevelIssues.map(issue => (
              <li key={issue.id} className={issue.severity === 'error' ? 'ip-day-issue-error' : 'ip-day-issue-warning'}>
                <CircleAlert size={14} aria-hidden />
                {issue.slotId ? (
                  <button
                    type="button"
                    className="ip-link-button"
                    onClick={() => dispatch({ type: 'setExpandedSlot', slotId: issue.slotId! })}
                  >
                    <span className="ip-sr-only">{issue.severity === 'error' ? 'Error: ' : 'Note: '}</span>
                    {issue.message}
                  </button>
                ) : (
                  <span>
                    <span className="ip-sr-only">{issue.severity === 'error' ? 'Error: ' : 'Note: '}</span>
                    {issue.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <ol className="ip-stop-list" ref={listRef}>
          {day.slots.map((slot, index) => {
            const expanded = slot.id === expandedSlotId
            const slotIssues = issuesFor(slot.id)
            const broken = slotIssues.some(issue => issue.severity === 'error')
            const outside = !daypartFitsWindow(slot.daypart, day.availableTime)
            return (
              <li
                key={slot.id}
                className={`ip-stop${expanded ? ' ip-stop-open' : ''}${broken ? ' ip-stop-broken' : ''}`}
              >
                <div className="ip-stop-row">
                  <span className="ip-daypart">{DAYPART_LABELS[slot.daypart]}</span>
                  <button
                    type="button"
                    className="ip-stop-name"
                    aria-expanded={expanded}
                    aria-controls={`ip-stop-panel-${slot.id}`}
                    onClick={() =>
                      dispatch({ type: 'setExpandedSlot', slotId: expanded ? null : slot.id })
                    }
                  >
                    <span>{slot.label || <em>Unnamed stop</em>}</span>
                    <span className="ip-stop-marks">
                      <span className="ip-stop-kind">{STOP_KIND_LABELS[slot.kind]}</span>
                      {slot.optional ? <span className="ip-chip">Optional</span> : null}
                      {outside ? <span className="ip-chip ip-chip-error">Outside the window</span> : null}
                      {broken && !outside ? <span className="ip-chip ip-chip-error">Needs a fix</span> : null}
                    </span>
                  </button>
                  <div className="ip-stop-actions">
                    <button
                      type="button"
                      data-move="up"
                      data-slot={slot.id}
                      className="ip-icon-button"
                      aria-label={`Move ${slot.label || 'stop'} up`}
                      disabled={index === 0}
                      onClick={() => move(slot, -1)}
                    >
                      <ChevronUp size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      data-move="down"
                      data-slot={slot.id}
                      className="ip-icon-button"
                      aria-label={`Move ${slot.label || 'stop'} down`}
                      disabled={index === day.slots.length - 1}
                      onClick={() => move(slot, 1)}
                    >
                      <ChevronDown size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ip-icon-button ip-icon-button-danger"
                      aria-label={`Remove ${slot.label || 'stop'}`}
                      onClick={() => {
                        dispatch({ type: 'removeSlot', dayId: day.id, slotId: slot.id })
                        announce(`${slot.label || 'Stop'} removed. Undo is available.`)
                      }}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="ip-stop-panel" id={`ip-stop-panel-${slot.id}`}>
                    <StopEditor
                      slot={slot}
                      trip={trip}
                      issues={slotIssues}
                      onPatch={patch =>
                        dispatch({ type: 'patchSlot', dayId: day.id, slotId: slot.id, patch })
                      }
                    />
                    <div className="ip-stop-panel-foot">
                      <button
                        type="button"
                        className="ip-button-quiet ip-button-small"
                        onClick={() => dispatch({ type: 'setExpandedSlot', slotId: null })}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
          {day.slots.length === 0 ? (
            <li className="ip-empty">This day has no stops yet. Choose a day type, or add one.</li>
          ) : null}
        </ol>

        {lastRemoval && lastRemoval.dayId === day.id ? (
          <div className="ip-undo" role="status">
            <span>Removed “{lastRemoval.slot.label || 'stop'}”.</span>
            <button
              type="button"
              className="ip-link-button"
              onClick={() => {
                dispatch({ type: 'undoRemoveSlot' })
                announce(`${lastRemoval.slot.label || 'Stop'} restored.`)
              }}
            >
              <RotateCcw size={14} aria-hidden /> Undo
            </button>
          </div>
        ) : null}

        <div className="ip-agenda-actions">
          <button type="button" className="ip-button-quiet" onClick={() => setAddingStop(true)}>
            <Plus size={16} aria-hidden /> Add stop
          </button>
          <button
            type="button"
            className="ip-button-quiet"
            disabled={days.length < 2}
            onClick={() => setCopying(true)}
          >
            <CopyPlus size={16} aria-hidden /> Copy layout to other days
          </button>
        </div>
      </div>

      <aside className="ip-day-options" aria-label={`Day ${dayNumber} options`}>
        <div className="ip-field">
          <label htmlFor={fieldIds.dayTemplate(day.id)}>Day type</label>
          <select
            id={fieldIds.dayTemplate(day.id)}
            value={day.sourceTemplateId}
            onChange={event => chooseTemplate(event.target.value)}
          >
            <optgroup label="Built-in">
              {BUILT_IN_TEMPLATES.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </optgroup>
            {customTemplates.templates.length > 0 ? (
              <optgroup label="Saved layouts">
                {customTemplates.templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {/* A layout that was chosen while the library was reachable stays
                selectable after it is not: the day owns its snapshot. */}
            {!findTemplate(day.sourceTemplateId, customTemplates.templates) ? (
              <optgroup label="This day">
                <option value={day.sourceTemplateId}>{day.sourceTemplateName}</option>
              </optgroup>
            ) : null}
          </select>
          <p className="ip-helper">{currentTemplate?.rhythm ?? 'A layout saved with this day.'}</p>
          {customTemplates.loading ? (
            <p className="ip-helper">Loading saved layouts…</p>
          ) : null}
          {customTemplates.error ? (
            <p className="ip-field-warning">
              <CircleAlert size={14} aria-hidden />
              <span>
                Saved layouts could not be loaded. Built-in types still work.{' '}
                <button type="button" className="ip-link-button" onClick={customTemplates.retry}>
                  Retry
                </button>
              </span>
            </p>
          ) : null}
        </div>

        <div className="ip-field">
          <label htmlFor={`ip-window-${day.id}`}>Available time</label>
          <select
            id={`ip-window-${day.id}`}
            value={day.availableTime.id}
            onChange={event =>
              dispatch({
                type: 'setAvailableTime',
                dayId: day.id,
                availableTime: {
                  ...day.availableTime,
                  id: event.target.value as AvailableTimeId,
                },
              })
            }
          >
            {(Object.keys(AVAILABLE_TIME_LABELS) as AvailableTimeId[]).map(id => (
              <option key={id} value={id}>
                {AVAILABLE_TIME_LABELS[id]}
              </option>
            ))}
          </select>
          <p className="ip-helper">{WINDOW_HELPER[day.availableTime.id]}</p>

          {day.availableTime.id === 'custom' ? (
            <div className="ip-custom-window">
              <div className="ip-field-row">
                <div className="ip-field ip-field-narrow">
                  <label htmlFor={fieldIds.customStart(day.id)}>Starts</label>
                  <input
                    id={fieldIds.customStart(day.id)}
                    type="time"
                    value={day.availableTime.customStart}
                    onChange={event =>
                      dispatch({
                        type: 'setAvailableTime',
                        dayId: day.id,
                        availableTime: { ...day.availableTime, customStart: event.target.value },
                      })
                    }
                  />
                </div>
                <div className="ip-field ip-field-narrow">
                  <label htmlFor={fieldIds.customEnd(day.id)}>Ends</label>
                  <input
                    id={fieldIds.customEnd(day.id)}
                    type="time"
                    value={day.availableTime.customEnd}
                    onChange={event =>
                      dispatch({
                        type: 'setAvailableTime',
                        dayId: day.id,
                        availableTime: { ...day.availableTime, customEnd: event.target.value },
                      })
                    }
                  />
                </div>
              </div>
              <label className="ip-checkbox">
                <input
                  type="checkbox"
                  checked={day.availableTime.endsNextDay}
                  onChange={event =>
                    dispatch({
                      type: 'setAvailableTime',
                      dayId: day.id,
                      availableTime: { ...day.availableTime, endsNextDay: event.target.checked },
                    })
                  }
                />
                <span>Ends next day</span>
              </label>
            </div>
          ) : null}
        </div>

        <div className="ip-field">
          <label htmlFor={`ip-label-${day.id}`}>Working title</label>
          <p className="ip-helper" id={`ip-label-${day.id}-helper`}>
            A label for this day. Not a second article title.
          </p>
          <input
            id={`ip-label-${day.id}`}
            type="text"
            value={day.label}
            aria-describedby={`ip-label-${day.id}-helper`}
            onChange={event =>
              dispatch({ type: 'patchDay', dayId: day.id, patch: { label: event.target.value } })
            }
          />
        </div>

        <details className="ip-disclosure ip-disclosure-inset">
          <summary>
            Day notes <span className="ip-disclosure-note">optional</span>
          </summary>
          <p className="ip-helper">
            Constraints you already know, such as an arrival time. What the day is about is the
            Grill&rsquo;s job, not this box.
          </p>
          <textarea
            rows={3}
            aria-label={`Notes for day ${dayNumber} setup`}
            value={day.setupNotes}
            onChange={event =>
              dispatch({ type: 'patchDay', dayId: day.id, patch: { setupNotes: event.target.value } })
            }
          />
        </details>

        <p className="ip-aside-note">Window: {availableTimeLabel(day)}</p>
      </aside>

      {pendingTemplate ? (
        <LayoutReplacementDialog
          day={day}
          dayNumber={dayNumber}
          template={pendingTemplate}
          onCancel={() => setPendingTemplate(null)}
          onApply={() => {
            dispatch({ type: 'applyTemplate', dayId: day.id, template: pendingTemplate })
            announce(`Layout updated to ${pendingTemplate.name}.`)
            setPendingTemplate(null)
          }}
        />
      ) : null}

      {addingStop ? (
        <AddStopDialog
          dayNumber={dayNumber}
          onCancel={() => setAddingStop(false)}
          onAdd={preset => {
            dispatch({ type: 'addSlot', dayId: day.id, slot: preset })
            announce(`${preset.label} added to day ${dayNumber}.`)
            setAddingStop(false)
          }}
        />
      ) : null}

      {copying ? (
        <CopyLayoutDialog
          source={day}
          sourceNumber={dayNumber}
          days={days}
          trip={trip}
          onCancel={() => setCopying(false)}
          onApply={targetIds => {
            dispatch({ type: 'copyLayout', fromDayId: day.id, toDayIds: targetIds })
            announce(
              `Layout copied to ${targetIds.length} day${targetIds.length === 1 ? '' : 's'}.`,
            )
            setCopying(false)
          }}
        />
      ) : null}
    </div>
  )
}
