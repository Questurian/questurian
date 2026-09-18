import type { ReactNode } from 'react'
import { Dialog } from '../Dialog'
import {
  availableTimeLabel,
  preferenceRows,
  travelPointLabel,
  tripSummaryRows,
} from '../../context'
import { CATEGORY_LABELS, DAYPART_LABELS, STOP_KIND_LABELS } from '../../templates'
import type { DayDraft, TripDraft } from '../../types'

/**
 * What the day inherits — its layout, its notes, the shared trip — on request.
 *
 * It used to be a permanent column beside the work, which halved the width of
 * the thing being read and repeated what the steps already said. It is
 * reference: you open it to check a stop's categories or the trip's areas, and
 * close it again. So it is a drawer, not a column and not a step.
 */

export interface DayContextDrawerProps {
  trip: TripDraft
  day: DayDraft
  dayNumber: number
  /** The preparation-notes editor, when it lives here rather than inline. */
  notes: ReactNode | null
  onClose: () => void
}

export function DayContextDrawer({ trip, day, dayNumber, notes, onClose }: DayContextDrawerProps) {
  const preferences = preferenceRows(trip)
  return (
    <Dialog
      drawer
      title={`Day ${dayNumber} details`}
      description="The layout this day was approved with, and the trip it belongs to. The interview and the research both work from this."
      onClose={onClose}
      footer={
        <button type="button" className="ip-button-quiet" onClick={onClose}>
          Close
        </button>
      }
    >
      <section className="ip-drawer-section" aria-labelledby="ip-drawer-layout">
        <h3 id="ip-drawer-layout">Layout</h3>
        <p className="ip-context-meta">
          {day.label.trim() && day.label.trim() !== `Day ${dayNumber}` ? `${day.label} · ` : ''}
          {day.sourceTemplateName} · {availableTimeLabel(day)}
        </p>
        <p className="ip-helper">
          The planned jobs in this day. Research chooses a real place for each.
        </p>
        <ol className="ip-context-slots">
          {day.slots.map(slot => (
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
        {day.setupNotes.trim() ? (
          <>
            <h4>Day notes from setup</h4>
            <p className="ip-context-text">{day.setupNotes}</p>
          </>
        ) : null}
      </section>

      {notes ? <section className="ip-drawer-section">{notes}</section> : null}

      <section className="ip-drawer-section" aria-labelledby="ip-drawer-trip">
        <h3 id="ip-drawer-trip">Shared trip details</h3>
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
      </section>
    </Dialog>
  )
}
