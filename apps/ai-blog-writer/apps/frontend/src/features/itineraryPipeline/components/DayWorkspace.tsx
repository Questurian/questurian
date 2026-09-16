import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CircleAlert, Info, PanelRight, Pencil } from 'lucide-react'
import { DayTabs } from './DayTabs'
import { Dialog } from './Dialog'
import { DayGrill } from './dayWork/DayGrill'
import { DayDirectionReview } from './dayWork/DayDirectionReview'
import { DayImportPanel } from './dayWork/DayImportPanel'
import { DayPromptPanel } from './dayWork/DayPromptPanel'
import { DayResultView } from './dayWork/DayResultView'
import { DayContextDrawer } from './dayWork/DayContextDrawer'
import { DayProgress } from './dayWork/DayProgress'
import { StageFold } from './dayWork/Step'
import { attentionFor, stopNames } from './dayWork/attention'
import { useDayWork } from '../dayWork/useDayWork'
import type { DayState } from '../dayWork/types'
import { availableTimeLabel, dayDateLabel } from '../context'
import type { DraftValidation } from '../validation'
import type { ItinerarySetupDraft } from '../types'
import type { SetupAction } from '../setupReducer'

/**
 * Stage 4 — one day, from an approved layout to a researched day.
 *
 * The screen answers four questions in order: where am I (the progress
 * track), what has happened and what needs me (the status callout), and what
 * the next action does (the live step, which is the only one open). Finished
 * stages fold to one line each and reopen on request. Once a day is saved the
 * day itself leads, and the stages that made it move below it under "How this
 * day was made". The server decides which step is live by deriving the day's
 * state from the artifacts that exist; there is no stored status to fall out
 * of step with them.
 *
 * The day's context — its layout, its notes, the trip it inherits — is a
 * drawer rather than a permanent column: it is reference, and the column cost
 * the work half its width.
 *
 * Preparation notes are still saved explicitly rather than autosaved. "Saved"
 * has to mean something when the next screen is a conversation you are
 * preparing for; that is also why leaving with unsaved notes asks first.
 */

export interface DayWorkspaceProps {
  draft: ItinerarySetupDraft
  validation: DraftValidation
  dispatch: (action: SetupAction) => void
  onEditLayouts: () => void
  announce: (message: string) => void
}

/** The four steps, in the order the day moves through them. */
type StepName = 'grill' | 'direction' | 'prompt' | 'import'

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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const loadedDayRef = useRef(activeDay?.id)

  const onLinked = useCallback(
    (workspaceId: string) => dispatch({ type: 'linkWorkspace', workspaceId }),
    [dispatch],
  )
  const work = useDayWork(draft, activeDay?.id ?? null, onLinked)

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

  const day = work.day
  const state: DayState = day?.state ?? 'ready_to_start'
  const slots =
    day?.slots ??
    activeDay.slots.map(slot => ({
      id: slot.id,
      label: slot.label,
      kind: slot.kind,
      daypart: slot.daypart,
      optional: slot.optional,
      categories: slot.allowedCategories,
      purpose: slot.purpose,
    }))

  // Why each stop is in the day: what the interview agreed it is for, else
  // what the layout said. Shown under the place research chose for it.
  const roles = new Map(slots.map(slot => [slot.id, slot.purpose]))
  for (const entry of day?.accepted_direction?.direction.slot_directions ?? []) {
    if (entry.role) roles.set(entry.slot_id, entry.role)
  }

  const hasGrill = Boolean(day?.grill)
  const agreed = day?.grill?.status === 'agreed'
  const hasDirection = Boolean(day?.accepted_direction || day?.candidate_direction)
  const accepted = Boolean(day?.accepted_direction) && !day?.candidate_direction
  const hasExport = Boolean(day?.export)
  const research = day?.research ?? null
  const researchAnswer =
    research?.state === 'done' && research.for_current_export ? research.raw : ''
  // An in-app answer nobody has saved yet, or a checked paste.
  const answerWaiting =
    !work.researching &&
    ((Boolean(researchAnswer) && !research?.saved_as_revision) ||
      (Boolean(work.preview?.valid) && !day?.result))

  const savedAttention = day?.result
    ? attentionFor(
        day.result.result,
        day.result.report,
        stopNames(day.result.result, slots),
      )
    : null

  // Exactly one step is live, and it is the one holding the action the day is
  // waiting on. Derived from the server's own word for where the day stands,
  // so the highlight and the rules that gate the buttons cannot disagree.
  //
  // At `prompt_ready` the live step is research until an answer is back, and
  // reviewing that answer after. A saved day points at no process step: the
  // day itself is what to read, unless a newer answer is waiting to be saved.
  function liveStepFor(): StepName | null {
    switch (state) {
      case 'layout_needs_review':
        return null
      case 'ready_to_start':
      case 'grill_asking':
        return 'grill'
      case 'agreed':
      case 'direction_review':
        return 'direction'
      case 'direction_accepted':
      case 'context_changed':
        return 'prompt'
      case 'prompt_ready':
        return work.researching || !answerWaiting ? 'prompt' : 'import'
      case 'saved_needs_work':
      case 'saved_complete':
        return answerWaiting ? 'import' : null
    }
  }
  const liveStep = liveStepFor()

  function toneFor(step: StepName, isDone: boolean) {
    if (liveStep === step) return 'active' as const
    return isDone ? ('done' as const) : ('waiting' as const)
  }

  const notesEditor = (
    <div className="ip-notes">
      <h3 id="ip-notes-heading">Preparation notes</h3>
      <label htmlFor={`ip-notes-${activeDay.id}`}>Notes for this day</label>
      <p className="ip-helper" id={`ip-notes-${activeDay.id}-helper`}>
        Anything the Grill should know. Saved notes are part of what it is
        given; unsaved ones are not. Changing them after research makes the
        research prompt out of date.
      </p>
      <textarea
        id={`ip-notes-${activeDay.id}`}
        rows={4}
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
    </div>
  )
  const notesInline = state === 'ready_to_start' || state === 'layout_needs_review'

  const steps: Record<StepName, { available: boolean; done: boolean; el: ReactNode }> = {
    grill: {
      available: true,
      done: agreed,
      el: (
        <DayGrill
          grill={day?.grill ?? null}
          tone={toneFor('grill', hasGrill)}
          busy={work.busy !== null}
          spending={work.spending}
          canStart={Boolean(activeDay.approval)}
          blockedReason={
            activeDay.approval
              ? null
              : 'This day needs an approved layout before it can be interviewed.'
          }
          contextChanged={Boolean(day?.grill_context_changed)}
          onStart={work.start}
          onAnswer={work.answer}
          onReopen={work.reopen}
        />
      ),
    },
    direction: {
      available: hasGrill || hasDirection,
      done: accepted,
      el: (
        <DayDirectionReview
          candidate={day?.candidate_direction ?? null}
          accepted={day?.accepted_direction ?? null}
          slots={slots}
          tone={toneFor('direction', Boolean(day?.accepted_direction))}
          busy={work.busy !== null}
          canPrepare={agreed}
          onPrepare={work.prepareDirection}
          onAccept={work.accept}
        />
      ),
    },
    prompt: {
      available: Boolean(day?.accepted_direction) || hasExport,
      done: hasExport && !day?.export?.stale,
      el: (
        <DayPromptPanel
          export_={day?.export ?? null}
          research={research}
          dayLabel={`day-${dayNumber}`}
          tone={toneFor('prompt', hasExport && !day?.export?.stale)}
          busy={work.busy === 'export' || work.busy === 'research'}
          researching={work.researching}
          canBuild={Boolean(day?.accepted_direction)}
          onBuild={work.buildPrompt}
          onResearch={work.research}
          announce={announce}
        />
      ),
    },
    import: {
      available: hasExport,
      done: Boolean(day?.result),
      el: (
        <DayImportPanel
          preview={work.preview}
          researched={researchAnswer}
          slots={slots}
          roles={roles}
          tone={toneFor('import', Boolean(day?.result))}
          busy={work.busy !== null}
          previewing={work.busy === 'preview'}
          applying={work.busy === 'apply'}
          canImport={hasExport}
          hasSavedResult={Boolean(day?.result)}
          onPreview={work.runPreview}
          onClear={work.clearPreview}
          onApply={work.apply}
          announce={announce}
        />
      ),
    },
  }

  function foldSummary(step: StepName): string {
    switch (step) {
      case 'grill': {
        const answered = day?.grill?.turns.length ?? 0
        return agreed
          ? `Agreed after ${answered} answer${answered === 1 ? '' : 's'}`
          : `${answered} answered so far`
      }
      case 'direction': {
        const shown = day?.candidate_direction ?? day?.accepted_direction
        if (!shown) return 'Not written yet'
        return accepted
          ? `Accepted, version ${shown.revision} — ${shown.direction.promise}`
          : 'Written down, waiting for you to accept it'
      }
      case 'prompt':
        if (day?.export?.stale) return 'The prompt is out of date'
        if (research?.state === 'done' && research.for_current_export) {
          return `Researched on ${research.model || 'Claude'}${
            research.searches != null ? ` · ${research.searches} searches` : ''
          }${research.cost_usd != null ? ` · about $${research.cost_usd.toFixed(2)}` : ''}`
        }
        return hasExport ? 'Prompt built' : 'Not built yet'
      case 'import':
        return day?.result
          ? `Version ${day.result.result_revision} saved. Paste or load a newer answer here to replace it.`
          : 'Got an answer from another tool? Paste or load its JSON here.'
    }
  }

  const FOLD_LABELS: Record<StepName, string> = {
    grill: 'Interview',
    direction: 'Direction',
    prompt: 'Research',
    import: 'Review and save',
  }

  const order: StepName[] = ['grill', 'direction', 'prompt', 'import']
  const liveIndex = liveStep ? order.indexOf(liveStep) : -1
  const available = order.filter(step => steps[step].available)
  const fold = (step: StepName, label = FOLD_LABELS[step]) => (
    <StageFold key={step} label={label} summary={foldSummary(step)} done={steps[step].done}>
      {steps[step].el}
    </StageFold>
  )

  let flow: ReactNode
  if (day?.result) {
    const made = available.filter(step => step !== liveStep)
    flow = (
      <>
        {liveStep ? steps[liveStep].el : null}
        <DayResultView
          saved={day.result}
          slots={slots}
          roles={roles}
          history={day.result_history}
          review={day.review}
          busy={work.busy !== null}
          onSaveReview={work.review}
        />
        {made.length > 0 ? (
          <section className="ip-made" aria-labelledby="ip-made-heading">
            <h3 className="ip-section-title" id="ip-made-heading">
              How this day was made
            </h3>
            <p className="ip-helper">
              The earlier stages, kept for reference. Open one to reread it or to
              start it again.
            </p>
            {made.map(step =>
              step === 'import' ? fold(step, 'Replace with a new answer') : fold(step),
            )}
          </section>
        ) : null}
      </>
    )
  } else if (liveStep) {
    const before = available.filter(step => order.indexOf(step) < liveIndex)
    flow = (
      <>
        {before.map(step => fold(step))}
        {steps[liveStep].el}
        {liveStep === 'prompt' && steps.import.available
          ? fold('import', 'Or paste an answer from elsewhere')
          : null}
      </>
    )
  } else {
    flow = steps.grill.el
  }

  return (
    <div className="ip-workspace">
      <header className="ip-stage-header">
        <h1 tabIndex={-1}>Plan each day</h1>
        <p className="ip-stage-instruction">
          Every layout is approved. Each day is planned on its own: an
          interview, research, then a saved day you can review.
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
        <div className="ip-day-header">
          <div>
            <h2 className="ip-workspace-day-title">
              Day {dayNumber}
              {dayDateLabel(trip, dayNumber - 1) ? ` · ${dayDateLabel(trip, dayNumber - 1)}` : ''} ·{' '}
              {activeDay.sourceTemplateName}
            </h2>
            <p className="ip-day-meta">
              <span>{trip.baseCity}</span>
              <span>{availableTimeLabel(activeDay)}</span>
              <span>
                {activeDay.slots.length} planned stop{activeDay.slots.length === 1 ? '' : 's'}
              </span>
            </p>
          </div>
          <button
            type="button"
            className="ip-button-quiet"
            aria-haspopup="dialog"
            onClick={() => setDrawerOpen(true)}
          >
            <PanelRight size={15} aria-hidden /> Day details
            {dirty && !notesInline ? <span className="ip-dirty-mark"> · notes not saved</span> : null}
          </button>
        </div>

        <DayProgress
          state={state}
          day={day}
          researching={work.researching}
          answerWaiting={answerWaiting}
          blockingCount={savedAttention?.blocking.length ?? 0}
        />

        {work.error ? (
          <div className="ip-banner ip-banner-warning" role="alert">
            <CircleAlert size={16} aria-hidden />
            <div>
              <p>{work.error}</p>
            </div>
            <button
              type="button"
              className="ip-button-quiet ip-button-small"
              onClick={work.dismissError}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {day?.pending_attempt && !work.spending ? (
          // A call this day dispatched and never heard the end of. Shown
          // rather than hidden behind a fresh Start button: the provider may
          // well have answered and billed, and only a person can decide
          // whether to buy it again.
          //
          // Not while this screen has a call out, though. Reading the day
          // and answering a turn race each other by design — the read
          // returns in milliseconds and the turn takes twenty seconds — so
          // the read sees this screen's own request still open and would
          // otherwise report it as lost while it was simply still thinking.
          <div className="ip-banner ip-banner-warning" role="status">
            <AlertTriangle size={16} aria-hidden />
            <div>
              <p>
                A request sent at {day.pending_attempt.started_at} never came
                back. It may still have been charged. Whatever you do next
                starts a fresh one.
              </p>
            </div>
          </div>
        ) : null}

        {work.busy === 'reading' && !day ? (
          // Only when there is nothing to show yet. A read that overlaps a
          // turn — linking the workspace starts one — must not replace a
          // conversation that is already on screen with a spinner.
          <p className="ip-empty">Reading this day&rsquo;s work…</p>
        ) : (
          <div className="ip-flow">
            {notesInline ? (
              <section className="ip-step" aria-labelledby="ip-notes-heading">
                {notesEditor}
              </section>
            ) : null}
            {flow}
          </div>
        )}
      </div>

      {drawerOpen ? (
        <DayContextDrawer
          trip={trip}
          day={activeDay}
          dayNumber={dayNumber}
          notes={notesInline ? null : notesEditor}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}

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
            Notes are kept with the day and are part of what the Grill is given.
            Leaving without saving loses only what you typed since the last save.
          </p>
        </Dialog>
      ) : null}
    </div>
  )
}
