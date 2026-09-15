import { useEffect, useRef, useState } from 'react'
import { Check, Info, Lock, Pencil } from 'lucide-react'
import { DayTabs } from './DayTabs'
import { Dialog } from './Dialog'
import {
  availableTimeLabel,
  dayDateLabel,
  preferenceRows,
  travelPointLabel,
  tripSummaryRows,
} from '../context'
import { CATEGORY_LABELS, DAYPART_LABELS, STOP_KIND_LABELS } from '../templates'
import type { DraftValidation } from '../validation'
import type { ItinerarySetupDraft } from '../types'
import type { SetupAction } from '../setupReducer'

/**
 * Stage 4 — the day workspace, with the AI deliberately not wired.
 *
 * What works here works for real: switching days, reading the approved layout
 * and the inherited trip context, and writing preparation notes that stay
 * attached to their day. What does not work says so once, in one notice, beside
 * a composer that is visibly disabled.
 *
 * There is no simulated transcript, no spinner, and no Start button that
 * quietly does nothing. A fake conversation would be the one thing on this
 * screen an operator could not tell apart from a real one, and they would plan
 * a trip around it.
 *
 * Notes are saved explicitly rather than autosaved, because "saved" has to mean
 * something when the next screen is a conversation you are preparing for. That
 * is also why leaving with unsaved notes asks first.
 */

export interface DayWorkspaceProps {
  draft: ItinerarySetupDraft
  validation: DraftValidation
  dispatch: (action: SetupAction) => void
  onEditLayouts: () => void
  announce: (message: string) => void
}

export function DayWorkspace({
  draft,
  validation,
  dispatch,
  onEditLayouts,
  announce,
}: DayWorkspaceProps) {
  const { trip, days } = draft
  const activeDay = days.find(day => day.id === draft.ui.activeDayId) ?? days[0]
  const dayNumber = days.findIndex(day => day.id === activeDay?.id) + 1

  const [notes, setNotes] = useState(activeDay?.preparationNotes ?? '')
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null)
  const loadedDayRef = useRef(activeDay?.id)

  // Switching days loads that day's notes. Keyed by day id, never by position,
  // so a renamed or reordered day cannot be handed someone else's notes.
  useEffect(() => {
    if (!activeDay || loadedDayRef.current === activeDay.id) return
    loadedDayRef.current = activeDay.id
    setNotes(activeDay.preparationNotes)
  }, [activeDay])

  const dirty = Boolean(activeDay) && notes !== activeDay.preparationNotes

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function save() {
    if (!activeDay) return
    dispatch({ type: 'patchDay', dayId: activeDay.id, patch: { preparationNotes: notes } })
    announce(`Notes saved for day ${dayNumber}.`)
  }

  function guard(navigate: () => void) {
    if (dirty) {
      setPendingNav(() => navigate)
      return
    }
    navigate()
  }

  if (!activeDay) {
    return <p className="ip-empty">No days to plan yet.</p>
  }

  const preferences = preferenceRows(trip)

  return (
    <div className="ip-workspace">
      <header className="ip-stage-header">
        <h1>Plan each day</h1>
        <p className="ip-stage-instruction">
          Every layout is approved. Each day gets its own Grill; the notes you leave here are what it
          starts from.
        </p>
      </header>

      <div className="ip-workspace-bar">
        <DayTabs
          days={days}
          trip={trip}
          validation={validation}
          activeDayId={activeDay.id}
          idPrefix="ip-workspace"
          onSelect={dayId => guard(() => dispatch({ type: 'setActiveDay', dayId }))}
        />
        <button type="button" className="ip-button-quiet" onClick={() => guard(onEditLayouts)}>
          <Pencil size={15} aria-hidden /> Edit layouts
        </button>
      </div>

      <div
        className="ip-workspace-panel"
        role="tabpanel"
        id={`ip-workspace-panel-${activeDay.id}`}
        aria-labelledby={`ip-workspace-tab-${activeDay.id}`}
        tabIndex={0}
      >
        <div className="ip-workspace-main">
          <h2 className="ip-workspace-day-title">
            Day {dayNumber}
            {dayDateLabel(trip, dayNumber - 1) ? ` · ${dayDateLabel(trip, dayNumber - 1)}` : ''} ·{' '}
            {activeDay.sourceTemplateName}
          </h2>

          <section className="ip-grill" aria-labelledby="ip-grill-heading">
            <h3 id="ip-grill-heading">Day Grill</h3>
            <p className="ip-notice" role="status">
              <Lock size={16} aria-hidden />
              <span>
                The conversation is not connected yet. Your trip details, this day&rsquo;s layout and
                these notes are what it will be given when it is.
              </span>
            </p>

            <div className="ip-composer">
              <label htmlFor="ip-composer-input" className="ip-sr-only">
                Message the day Grill
              </label>
              <textarea
                id="ip-composer-input"
                rows={2}
                disabled
                placeholder="Message composer unavailable"
                aria-describedby="ip-composer-note"
              />
              <button type="button" className="ip-button-primary" disabled aria-describedby="ip-composer-note">
                Start day Grill
              </button>
              <p className="ip-helper" id="ip-composer-note">
                Disabled because no AI is wired to this screen in this build.
              </p>
            </div>
          </section>

          <section className="ip-notes" aria-labelledby="ip-notes-heading">
            <h3 id="ip-notes-heading">Preparation notes</h3>
            <label htmlFor={`ip-notes-${activeDay.id}`}>Notes for this day</label>
            <p className="ip-helper" id={`ip-notes-${activeDay.id}-helper`}>
              Anything you want to explore when planning this day.
            </p>
            <textarea
              id={`ip-notes-${activeDay.id}`}
              rows={6}
              value={notes}
              aria-describedby={`ip-notes-${activeDay.id}-helper`}
              onChange={event => setNotes(event.target.value)}
            />
            <div className="ip-notes-actions">
              <button type="button" className="ip-button-primary" disabled={!dirty} onClick={save}>
                Save notes
              </button>
              <span className={dirty ? 'ip-save-state ip-save-state-dirty' : 'ip-save-state'}>
                {dirty ? (
                  <>
                    <Info size={14} aria-hidden /> Not saved yet
                  </>
                ) : notes ? (
                  <>
                    <Check size={14} aria-hidden /> Saved
                  </>
                ) : (
                  'No notes yet'
                )}
              </span>
            </div>
          </section>
        </div>

        <aside className="ip-workspace-context" aria-label="Context for this day">
          <section>
            <h3>This day</h3>
            <p className="ip-context-meta">
              {activeDay.label.trim() && activeDay.label.trim() !== `Day ${dayNumber}`
                ? `${activeDay.label} · `
                : ''}
              {availableTimeLabel(activeDay)}
            </p>
            <ol className="ip-context-slots">
              {activeDay.slots.map(slot => (
                <li key={slot.id}>
                  <span className="ip-daypart">{DAYPART_LABELS[slot.daypart]}</span>
                  <span>
                    {slot.label}
                    {slot.optional ? <span className="ip-optional-mark"> · optional</span> : null}
                    <span className="ip-review-slot-meta">
                      {STOP_KIND_LABELS[slot.kind]}
                      {slot.kind === 'travel' && slot.travel
                        ? ` · ${travelPointLabel(slot.travel.from, trip)} → ${travelPointLabel(slot.travel.to, trip)}`
                        : slot.allowedCategories.length > 0
                          ? ` · ${slot.allowedCategories.map(category => CATEGORY_LABELS[category]).join(', ')}`
                          : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {activeDay.setupNotes.trim() ? (
              <>
                <h4>Day notes from setup</h4>
                <p className="ip-context-text">{activeDay.setupNotes}</p>
              </>
            ) : null}
          </section>

          <details className="ip-disclosure ip-disclosure-inset" open>
            <summary>
              Shared trip details <span className="ip-disclosure-note">entered once</span>
            </summary>
            <p className="ip-context-title">{trip.titleSeed}</p>
            <dl className="ip-detail-list">
              {tripSummaryRows(trip).map(row => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
              {preferences.map(row => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </aside>
      </div>

      {pendingNav ? (
        <Dialog
          title="Save your notes first?"
          description={`Day ${dayNumber} has notes you have not saved.`}
          onClose={() => setPendingNav(null)}
          footer={
            <>
              <button type="button" className="ip-button-quiet" onClick={() => setPendingNav(null)}>
                Stay here
              </button>
              <button
                type="button"
                className="ip-button-quiet"
                onClick={() => {
                  const go = pendingNav
                  setNotes(activeDay.preparationNotes)
                  setPendingNav(null)
                  go?.()
                }}
              >
                Discard them
              </button>
              <button
                type="button"
                className="ip-button-primary"
                onClick={() => {
                  const go = pendingNav
                  save()
                  setPendingNav(null)
                  go?.()
                }}
              >
                Save and continue
              </button>
            </>
          }
        >
          <p className="ip-dialog-lead">
            Notes are kept with the day. Leaving without saving loses only what you typed since the
            last save.
          </p>
        </Dialog>
      ) : null}
    </div>
  )
}
