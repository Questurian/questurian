import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleAlert, CloudOff, Info, RotateCcw } from 'lucide-react'
import { useAuth } from '../auth'
import { DayLayoutEditor } from './components/DayLayoutEditor'
import { DayTabs } from './components/DayTabs'
import { DayWorkspace } from './components/DayWorkspace'
import { Dialog } from './components/Dialog'
import { ErrorSummary } from './components/ErrorSummary'
import { LayoutReview } from './components/LayoutReview'
import { RemoveDaysDialog } from './components/RemoveDaysDialog'
import { StageNav } from './components/StageNav'
import { StaysPanel } from './components/StaysPanel'
import { TripDetailsForm } from './components/TripDetailsForm'
import { useCustomTemplates } from './customTemplates'
import { useItineraryDraft } from './useItineraryDraft'
import { isApprovalCurrent, parsedDayCount } from './draft'
import {
  canOpenReview,
  canOpenWorkspace,
  dayIsReady,
  errorsOnly,
  tripIsValid,
  type Issue,
} from './validation'
import type { Stage } from './types'
import './itinerary-pipeline.css'

/**
 * The itinerary setup workflow: trip details, day layouts, approval, workspace.
 *
 * One route, four local stages. This component owns navigation, focus and the
 * things that are true of the whole screen — the save status, the announcements
 * and the gates between stages. Form logic lives in the stage components and
 * state logic lives in the reducer; the page is the shell they hang on.
 *
 * Nothing here calls an AI, generates a title, runs research or writes to a
 * backend. The draft is kept in this browser, and the screen says so in those
 * words.
 */

export default function ItineraryPipelinePage() {
  const { user } = useAuth()
  const controller = useItineraryDraft(user?.id ?? null)
  const customTemplates = useCustomTemplates()
  const { draft, dispatch, validation, state } = controller

  const [showTripIssues, setShowTripIssues] = useState(false)
  const [showDayIssues, setShowDayIssues] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage>(draft.ui.stage)
  /** Deferred focus and announcements, cancelled if the page goes away first. */
  const deferredRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  useEffect(
    () => () => {
      deferredRef.current.forEach(clearTimeout)
      deferredRef.current = []
    },
    [],
  )

  const defer = useCallback((work: () => void, delay: number) => {
    deferredRef.current.push(setTimeout(work, delay))
  }, [])

  const announce = useCallback(
    (message: string) => {
      // Cleared first so that repeating the same sentence is still announced.
      setAnnouncement('')
      defer(() => setAnnouncement(message), 30)
    },
    [defer],
  )

  const stage = draft.ui.stage
  const days = draft.days
  const activeDay = days.find(day => day.id === draft.ui.activeDayId) ?? days[0] ?? null
  const activeDayNumber = activeDay ? days.findIndex(day => day.id === activeDay.id) + 1 : 0

  const tripValid = tripIsValid(validation)
  const reviewReady = canOpenReview(draft, validation)
  const workspaceReady = canOpenWorkspace(draft, validation)

  const reachable: Record<Stage, boolean> = {
    trip: true,
    days: tripValid && days.length > 0,
    review: reviewReady,
    workspace: workspaceReady,
  }

  const blockedReason: Record<Stage, string | null> = {
    trip: null,
    days: tripValid ? null : 'Finish the trip details first.',
    review: reviewReady ? null : 'Every day needs a valid layout first.',
    workspace: workspaceReady ? null : 'Every layout needs to be approved first.',
  }

  // A stale approval cannot be walked around. If the workspace is open when one
  // goes stale — a cross-tab edit, say — it closes back to review, notes intact.
  useEffect(() => {
    if (stage === 'workspace' && !workspaceReady) {
      dispatch({ type: 'setStage', stage: 'review' })
      announce('Trip details changed. Those layouts need reviewing again.')
    }
  }, [stage, workspaceReady, dispatch, announce])

  // Focus the new stage's heading, so keyboard and screen-reader users land at
  // the top of what changed rather than wherever the old button was.
  useEffect(() => {
    if (stageRef.current === stage) return
    stageRef.current = stage
    headingRef.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [stage])

  function focusIssue(issue: Issue) {
    if (issue.dayId) {
      dispatch({ type: 'setActiveDay', dayId: issue.dayId })
      if (stage === 'review') dispatch({ type: 'setStage', stage: 'days' })
      if (issue.slotId) dispatch({ type: 'setExpandedSlot', slotId: issue.slotId })
    }
    if (!issue.fieldId) return
    // After the stage or the expanded row has had a chance to render.
    defer(() => {
      const target = document.getElementById(issue.fieldId!)
      if (!target) return
      target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      if (target instanceof HTMLElement) target.focus({ preventScroll: true })
    }, 60)
  }

  function goToStage(next: Stage) {
    if (!reachable[next]) return
    controller.flush()
    dispatch({ type: 'setStage', stage: next })
  }

  /** Continue from Trip details: validate, then make the day list match. */
  function shapeDays() {
    setShowTripIssues(true)
    const errors = errorsOnly(validation.trip)
    if (errors.length > 0) {
      focusIssue(errors[0])
      return
    }
    const count = parsedDayCount(draft.trip)
    if (count === null) return

    // Always reviewed, never guessed at. A day carries edited stops as well as
    // notes, and deciding for the operator which of those was worth asking
    // about is how work disappears quietly.
    if (count < days.length) {
      setPendingRemoval(count)
      return
    }
    applyDayCount(count)
  }

  function applyDayCount(count: number) {
    dispatch({ type: 'syncDays', count })
    dispatch({ type: 'setStage', stage: 'days' })
    setShowTripIssues(false)
    controller.flush()
    announce(`${count} day${count === 1 ? '' : 's'} ready to shape.`)
  }

  function reviewLayouts() {
    setShowDayIssues(true)
    const failing = days.find(day => !dayIsReady(validation, day.id))
    if (failing) {
      const issue = errorsOnly(validation.byDay[failing.id] ?? [])[0]
      dispatch({ type: 'setActiveDay', dayId: failing.id })
      if (issue) focusIssue(issue)
      return
    }
    dispatch({ type: 'setStage', stage: 'review' })
    setShowDayIssues(false)
    controller.flush()
  }

  const dayStageIssues = useMemo(() => {
    if (!showDayIssues) return []
    return days.flatMap((day, index) =>
      errorsOnly(validation.byDay[day.id] ?? []).map(issue => ({
        ...issue,
        message: `Day ${index + 1}: ${issue.message}`,
      })),
    )
  }, [days, validation, showDayIssues])

  const approvedCount = days.filter(day => isApprovalCurrent(day, draft.trip)).length

  if (controller.loading) {
    return (
      <div className="ip-page">
        <p className="ip-empty">Loading your draft…</p>
      </div>
    )
  }

  return (
    <div className="ip-page">
      <div className="ip-page-head">
        <StageNav stage={stage} reachable={reachable} blockedReason={blockedReason} onGo={goToStage} />
        <div className="ip-page-head-actions">
          <SaveStatus controller={controller} />
          <button
            type="button"
            className="ip-button-quiet ip-button-small"
            onClick={() => setConfirmingReset(true)}
          >
            <RotateCcw size={14} aria-hidden /> Start over
          </button>
        </div>
      </div>

      {confirmingReset ? (
        <Dialog
          title="Start over with a new trip?"
          description="This clears the trip, its days and hotels from this browser."
          onClose={() => setConfirmingReset(false)}
          footer={
            <>
              <button type="button" className="ip-button-quiet" onClick={() => setConfirmingReset(false)}>
                Keep this trip
              </button>
              <button
                type="button"
                className="ip-button-danger"
                onClick={() => {
                  controller.resetDraft()
                  setConfirmingReset(false)
                  announce('Started a new trip.')
                }}
              >
                Start over
              </button>
            </>
          }
        >
          <p className="ip-dialog-lead">
            The next interview starts a brand-new run. Work already saved for this trip —
            interviews and proposals — is not deleted; it just stops showing here.
          </p>
        </Dialog>
      ) : null}

      {controller.incompatible ? (
        <div className="ip-banner ip-banner-warning" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <p>{controller.incompatible}</p>
            <p className="ip-helper">
              Your saved draft has been left alone. Starting fresh will remove it from this browser.
            </p>
          </div>
          <button type="button" className="ip-button-danger ip-button-small" onClick={controller.resetDraft}>
            Start a fresh draft
          </button>
        </div>
      ) : null}

      {controller.conflict ? (
        <div className="ip-banner ip-banner-warning" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <p>This draft was changed in another tab. Saving here is paused until you choose.</p>
          </div>
          <div className="ip-banner-actions">
            <button type="button" className="ip-button-quiet ip-button-small" onClick={controller.acceptIncoming}>
              Load the saved draft
            </button>
            <button type="button" className="ip-button-primary ip-button-small" onClick={controller.keepThisTab}>
              Keep this tab&rsquo;s version
            </button>
          </div>
        </div>
      ) : null}

      <div className="ip-stage" ref={headingRef}>
        {stage === 'trip' ? (
          <>
            {showTripIssues && validation.trip.length > 0 ? (
              <ErrorSummary
                heading="Before you can shape the days"
                issues={validation.trip}
                onGoTo={focusIssue}
              />
            ) : null}
            <TripDetailsForm
              trip={draft.trip}
              issues={validation.trip}
              showAllIssues={showTripIssues}
              approvedCount={approvedCount}
              onChange={dispatch}
              onContinue={shapeDays}
              onBlurField={controller.flush}
            />
          </>
        ) : null}

        {stage === 'days' && activeDay ? (
          <>
            <header className="ip-stage-header">
              <h1 tabIndex={-1}>Shape your days</h1>
              <p className="ip-stage-instruction">Choose a day type, then adjust its stops.</p>
            </header>

            <div className="ip-trip-strip">
              <p>
                <strong>{draft.trip.titleSeed}</strong>
                <span>
                  {draft.trip.baseCity} · {days.length} day{days.length === 1 ? '' : 's'}
                </span>
              </p>
              <button
                type="button"
                className="ip-button-quiet ip-button-small"
                onClick={() => goToStage('trip')}
              >
                Edit trip details
              </button>
            </div>

            <StaysPanel trip={draft.trip} dayCount={days.length} dispatch={dispatch} />

            {dayStageIssues.length > 0 ? (
              <ErrorSummary
                heading="These days are not ready yet"
                issues={dayStageIssues}
                onGoTo={focusIssue}
              />
            ) : null}

            <DayTabs
              days={days}
              trip={draft.trip}
              validation={validation}
              activeDayId={activeDay.id}
              idPrefix="ip-days"
              onSelect={dayId => dispatch({ type: 'setActiveDay', dayId })}
            />

            <div
              role="tabpanel"
              id={`ip-days-panel-${activeDay.id}`}
              aria-labelledby={`ip-days-tab-${activeDay.id}`}
              tabIndex={0}
              className="ip-day-panel"
            >
              <DayLayoutEditor
                key={activeDay.id}
                day={activeDay}
                dayNumber={activeDayNumber}
                days={days}
                trip={draft.trip}
                issues={validation.byDay[activeDay.id] ?? []}
                customTemplates={customTemplates}
                expandedSlotId={draft.ui.expandedSlotId}
                lastRemoval={state.lastRemoval}
                dispatch={dispatch}
                announce={announce}
              />
            </div>

            <div className="ip-action-bar">
              <button type="button" className="ip-button-quiet" onClick={() => goToStage('trip')}>
                <ArrowLeft size={16} aria-hidden /> Trip details
              </button>
              <span className="ip-action-note">
                {days.filter(day => dayIsReady(validation, day.id)).length} of {days.length} day
                {days.length === 1 ? '' : 's'} ready
              </span>
              <button type="button" className="ip-button-primary" onClick={reviewLayouts}>
                Review layouts <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </>
        ) : null}

        {stage === 'review' ? (
          <LayoutReview
            draft={draft}
            validation={validation}
            dispatch={dispatch}
            announce={announce}
            onGoToIssue={focusIssue}
            onEditDay={dayId => {
              dispatch({ type: 'setActiveDay', dayId })
              dispatch({ type: 'setStage', stage: 'days' })
            }}
            onOpenWorkspace={() => {
              dispatch({ type: 'setStage', stage: 'workspace' })
              controller.flush()
            }}
          />
        ) : null}

        {stage === 'workspace' ? (
          <DayWorkspace
            draft={draft}
            validation={validation}
            dispatch={dispatch}
            announce={announce}
            onEditLayouts={() => dispatch({ type: 'setStage', stage: 'review' })}
          />
        ) : null}
      </div>

      {pendingRemoval !== null ? (
        <RemoveDaysDialog
          removing={days.slice(pendingRemoval)}
          firstRemovedIndex={pendingRemoval}
          onCancel={() => {
            // Cancel restores the count so the form matches the days again.
            dispatch({ type: 'patchTrip', patch: { dayCountInput: String(days.length) } })
            setPendingRemoval(null)
          }}
          onConfirm={() => {
            const count = pendingRemoval
            setPendingRemoval(null)
            applyDayCount(count)
          }}
        />
      ) : null}

      <div className="ip-sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}

function SaveStatus({ controller }: { controller: ReturnType<typeof useItineraryDraft> }) {
  if (!controller.durable) {
    return (
      <p className="ip-save-status ip-save-status-warning">
        <CloudOff size={14} aria-hidden />
        <span>Not saved — this draft is lost if you reload.</span>
      </p>
    )
  }
  if (controller.saveStatus === 'error') {
    return (
      <p className="ip-save-status ip-save-status-error" role="alert">
        <CircleAlert size={14} aria-hidden />
        <span>Changes aren&rsquo;t saved on this browser.</span>
        <button type="button" className="ip-link-button" onClick={controller.retrySave}>
          Retry
        </button>
      </p>
    )
  }
  if (controller.saveStatus === 'saved') {
    return (
      <p className="ip-save-status">
        <Check size={14} aria-hidden />
        <span>Saved on this browser</span>
      </p>
    )
  }
  if (controller.saveStatus === 'saving') {
    return (
      <p className="ip-save-status">
        <Info size={14} aria-hidden />
        <span>Saving…</span>
      </p>
    )
  }
  return null
}
