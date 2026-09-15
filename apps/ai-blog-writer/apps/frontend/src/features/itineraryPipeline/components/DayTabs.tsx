import { useEffect, useRef } from 'react'
import { Check, CircleAlert, Clock, Pencil } from 'lucide-react'
import { dayTabLabel } from '../context'
import { DAY_STATUS_LABELS, dayStatus, type DraftValidation, type DayStatus } from '../validation'
import type { DayDraft, TripDraft } from '../types'

/**
 * The day rail.
 *
 * A real tablist: arrow keys move between days, Home and End jump to the ends,
 * and only the selected tab is in the tab order — so reaching the panel from
 * the rail takes one Tab, not one per day.
 *
 * Each tab carries its own state, because the question the operator actually
 * has at this point is "which day still needs me", and a rail of identical
 * chips cannot answer it. Browsing a tab never changes that state.
 */

const STATUS_ICON: Record<DayStatus, typeof Check> = {
  needs_layout: CircleAlert,
  ready: Clock,
  approved: Check,
  needs_review: Pencil,
}

export interface DayTabsProps {
  days: DayDraft[]
  trip: TripDraft
  validation: DraftValidation
  activeDayId: string | null
  onSelect: (dayId: string) => void
  idPrefix: string
}

export function DayTabs({ days, trip, validation, activeDayId, onSelect, idPrefix }: DayTabsProps) {
  const railRef = useRef<HTMLDivElement>(null)

  // Keep the selected day in view when it changes from outside the rail —
  // following an error link, for instance.
  useEffect(() => {
    const selected = railRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    // Guarded: jsdom and older embedded webviews have no scrollIntoView.
    selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeDayId])

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = days.findIndex(day => day.id === activeDayId)
    if (index < 0) return
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % days.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + days.length) % days.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = days.length - 1
    else return
    event.preventDefault()
    onSelect(days[next].id)
    railRef.current
      ?.querySelector<HTMLElement>(`#${idPrefix}-tab-${days[next].id}`)
      ?.focus()
  }

  return (
    <div className="ip-tab-rail" role="tablist" aria-label="Days" ref={railRef} onKeyDown={onKeyDown}>
      {days.map((day, index) => {
        const status = dayStatus(day, trip, validation)
        const selected = day.id === activeDayId
        const Icon = STATUS_ICON[status]
        return (
          <button
            key={day.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${day.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${day.id}`}
            tabIndex={selected ? 0 : -1}
            className={`ip-tab ip-tab-${status}${selected ? ' ip-tab-on' : ''}`}
            onClick={() => onSelect(day.id)}
          >
            <span className="ip-tab-name">{dayTabLabel(trip, index)}</span>
            <span className="ip-tab-status">
              <Icon size={13} aria-hidden />
              {DAY_STATUS_LABELS[status]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
