import { ArrowRight, Check, CircleAlert, Info, Pencil } from 'lucide-react'
import { availableTimeLabel, dayDateLabel, preferenceRows, travelPointLabel, tripSummaryRows } from '../context'
import { isApprovalCurrent } from '../draft'
import { CATEGORY_LABELS, DAYPART_LABELS, STOP_KIND_LABELS } from '../templates'
import { canApproveDay, canOpenWorkspace, errorsOnly, type DraftValidation, type Issue } from '../validation'
import type { ItinerarySetupDraft } from '../types'
import type { SetupAction } from '../setupReducer'

/**
 * Stage 3 — read the whole skeleton, then approve each day.
 *
 * Approval is per day and explicit. Nothing arrives ticked and there is no
 * approve-all, because the only thing this screen is for is looking at each day
 * once, and a shortcut past that makes the gate decorative.
 *
 * What approval means is written where the button is: the structure is right.
 * It is not a claim that venues were chosen, schedules verified, or a day's
 * Grill completed — none of which has happened yet.
 */

export interface LayoutReviewProps {
  draft: ItinerarySetupDraft
  validation: DraftValidation
  dispatch: (action: SetupAction) => void
  onEditDay: (dayId: string) => void
  onGoToIssue: (issue: Issue) => void
  onOpenWorkspace: () => void
  announce: (message: string) => void
}

export function LayoutReview({
  draft,
  validation,
  dispatch,
  onEditDay,
  onGoToIssue,
  onOpenWorkspace,
  announce,
}: LayoutReviewProps) {
  const { trip, days } = draft
  const approvedCount = days.filter(day => isApprovalCurrent(day, trip)).length
  const ready = canOpenWorkspace(draft, validation)
  const firstUnapproved = days.findIndex(day => !isApprovalCurrent(day, trip))
  const preferences = preferenceRows(trip)

  return (
    <div className="ip-review">
      <header className="ip-stage-header">
        <h1>Review your day layouts</h1>
        <p className="ip-stage-instruction">
          Read each day and approve it. Approving confirms the structure — not the places, the
          timings or the writing.
        </p>
      </header>

      <section className="ip-review-trip">
        <h2 className="ip-review-title">{trip.titleSeed}</h2>
        <dl className="ip-detail-list ip-detail-list-inline">
          {tripSummaryRows(trip).map(row => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        {preferences.length > 0 ? (
          <details className="ip-disclosure ip-disclosure-inset">
            <summary>
              Shared preferences <span className="ip-disclosure-note">{preferences.length} entered</span>
            </summary>
            <dl className="ip-detail-list">
              {preferences.map(row => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>

      {days.map((day, index) => {
        const issues = validation.byDay[day.id] ?? []
        const errors = errorsOnly(issues)
        const acknowledgeable = issues.find(issue => issue.acknowledgmentKind)
        const approved = isApprovalCurrent(day, trip)
        const stale = Boolean(day.approval) && !approved
        const date = dayDateLabel(trip, index)

        return (
          <section
            key={day.id}
            className={`ip-review-day${approved ? ' ip-review-day-approved' : ''}`}
            aria-labelledby={`ip-review-day-${day.id}`}
          >
            <header className="ip-review-day-head">
              <h2 id={`ip-review-day-${day.id}`}>
                Day {index + 1}
                {date ? <span className="ip-review-date"> · {date}</span> : null}
                {/* Only when it says something the heading does not: an
                    untouched day is labelled "Day 3" and printing that twice is
                    noise. */}
                {day.label.trim() && day.label.trim() !== `Day ${index + 1}` ? (
                  <span className="ip-review-day-label">{day.label}</span>
                ) : null}
              </h2>
              <p className="ip-review-day-meta">
                {day.sourceTemplateName}
                {day.sourceTemplateOrigin === 'custom' ? ' (saved layout)' : ''} · {availableTimeLabel(day)}
              </p>
            </header>

            <ol className="ip-review-slots">
              {day.slots.map(slot => (
                <li key={slot.id}>
                  <span className="ip-daypart">{DAYPART_LABELS[slot.daypart]}</span>
                  <span className="ip-review-slot-body">
                    <span className="ip-review-slot-name">
                      {slot.label}
                      {slot.optional ? <span className="ip-optional-mark"> · optional</span> : null}
                    </span>
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
              {day.slots.length === 0 ? <li className="ip-empty">No stops.</li> : null}
            </ol>

            {stale ? (
              <p className="ip-notice" role="status">
                <Info size={16} aria-hidden />
                <span>Trip details changed. Review this layout again.</span>
              </p>
            ) : null}

            {errors.length > 0 ? (
              <ul className="ip-day-issues">
                {errors.map(issue => (
                  <li key={issue.id} className="ip-day-issue-error">
                    <CircleAlert size={14} aria-hidden />
                    <button type="button" className="ip-link-button" onClick={() => onGoToIssue(issue)}>
                      <span className="ip-sr-only">Error: </span>
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {errors.length === 0 && acknowledgeable ? (
              <div className="ip-ack" role="group" aria-label="Confirm this day's order and window">
                <p>
                  <Info size={15} aria-hidden /> {acknowledgeable.message}
                </p>
                <button
                  type="button"
                  className="ip-button-quiet ip-button-small"
                  onClick={() => {
                    dispatch({
                      type: 'acknowledge',
                      dayId: day.id,
                      kind: acknowledgeable.acknowledgmentKind!,
                    })
                    announce(`Day ${index + 1} order and window confirmed.`)
                  }}
                >
                  Keep this order and window
                </button>
              </div>
            ) : null}

            <div className="ip-review-day-actions">
              {approved ? (
                <>
                  <span className="ip-approved-mark">
                    <Check size={16} aria-hidden /> Layout approved
                  </span>
                  <button type="button" className="ip-button-quiet" onClick={() => onEditDay(day.id)}>
                    <Pencil size={15} aria-hidden /> Edit layout
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ip-button-primary"
                    disabled={!canApproveDay(validation, day.id)}
                    onClick={() => {
                      dispatch({ type: 'approveDay', dayId: day.id })
                      announce(`Day ${index + 1} layout approved.`)
                    }}
                  >
                    Approve layout
                  </button>
                  <button type="button" className="ip-button-quiet" onClick={() => onEditDay(day.id)}>
                    <Pencil size={15} aria-hidden /> Edit layout
                  </button>
                </>
              )}
            </div>
          </section>
        )
      })}

      <div className="ip-action-bar">
        <span className="ip-action-note">
          {ready
            ? `${approvedCount} of ${days.length} layout${days.length === 1 ? '' : 's'} approved.`
            : firstUnapproved >= 0
              ? `${approvedCount} of ${days.length} approved. Approve Day ${firstUnapproved + 1} to continue.`
              : `${approvedCount} of ${days.length} approved.`}
        </span>
        <button type="button" className="ip-button-primary" disabled={!ready} onClick={onOpenWorkspace}>
          Open day workspace <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}
