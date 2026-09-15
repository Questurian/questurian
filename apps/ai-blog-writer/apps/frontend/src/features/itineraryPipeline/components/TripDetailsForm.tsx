import { useMemo, useRef, useState } from 'react'
import { ArrowRight, CircleAlert, Info, X } from 'lucide-react'
import { parsedDayCount } from '../draft'
import { derivedEndDate } from '../context'
import { fieldIds, type Issue } from '../validation'
import type {
  BudgetStyle,
  Pace,
  TimingMode,
  TransportPreference,
  TripDraft,
  TripScope,
  WalkingTolerance,
  Weekday,
} from '../types'
import type { SetupAction } from '../setupReducer'

/**
 * Stage 1 — the shared trip, entered as a form.
 *
 * A form rather than an interview because everything on it is a decision the
 * operator already holds: the title is finished, the city is known, the day
 * count is a number. Nothing here is generated, inferred from the title, or
 * asked twice.
 *
 * Errors appear on blur for a field you have touched, and for everything at
 * once when you press Shape days. The point is that an untouched form is not
 * covered in red, and a blocked continue tells you everything at once instead
 * of one problem per attempt.
 */

export interface TripDetailsFormProps {
  trip: TripDraft
  issues: Issue[]
  showAllIssues: boolean
  approvedCount: number
  onChange: (action: SetupAction) => void
  onContinue: () => void
  onBlurField: () => void
}

const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const TRANSPORT_OPTIONS: Array<{ value: TransportPreference; label: string }> = [
  { value: 'walking', label: 'Walking' },
  { value: 'public_transport', label: 'Public transport' },
  { value: 'taxi', label: 'Taxi or rideshare' },
  { value: 'rental_car', label: 'Rental car' },
]

export function TripDetailsForm({
  trip,
  issues,
  showAllIssues,
  approvedCount,
  onChange,
  onContinue,
  onBlurField,
}: TripDetailsFormProps) {
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [areaInput, setAreaInput] = useState('')
  const areaInputRef = useRef<HTMLInputElement>(null)

  const issuesByField = useMemo(() => {
    const map = new Map<string, Issue[]>()
    for (const issue of issues) {
      if (!issue.fieldId) continue
      map.set(issue.fieldId, [...(map.get(issue.fieldId) ?? []), issue])
    }
    return map
  }, [issues])

  const visibleIssue = (fieldId: string): Issue | undefined => {
    const forField = issuesByField.get(fieldId) ?? []
    if (forField.length === 0) return undefined
    // Warnings are always visible; they are information, not a blocked action.
    const warning = forField.find(issue => issue.severity === 'warning')
    if (warning && forField.length === 1) return warning
    if (!showAllIssues && !touched.has(fieldId)) return warning
    return forField.find(issue => issue.severity === 'error') ?? warning
  }

  const markTouched = (fieldId: string) => {
    setTouched(current => (current.has(fieldId) ? current : new Set(current).add(fieldId)))
    onBlurField()
  }

  const dayCount = parsedDayCount(trip)
  const dayOptions = dayCount ? Array.from({ length: dayCount }, (_, index) => index + 1) : []

  function addArea() {
    const value = areaInput.trim()
    if (!value) return
    onChange({ type: 'addArea', area: value })
    setAreaInput('')
    areaInputRef.current?.focus()
  }

  function fieldError(fieldId: string) {
    const issue = visibleIssue(fieldId)
    if (!issue) return null
    return (
      <p
        className={issue.severity === 'error' ? 'ip-field-error' : 'ip-field-warning'}
        id={`${fieldId}-message`}
      >
        {issue.severity === 'error' ? <CircleAlert size={14} aria-hidden /> : <Info size={14} aria-hidden />}
        <span>
          <span className="ip-sr-only">{issue.severity === 'error' ? 'Error: ' : 'Note: '}</span>
          {issue.message}
        </span>
      </p>
    )
  }

  const describedBy = (fieldId: string, helperId?: string) => {
    const parts = [helperId, visibleIssue(fieldId) ? `${fieldId}-message` : null].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : undefined
  }

  const invalid = (fieldId: string) => visibleIssue(fieldId)?.severity === 'error'

  return (
    <form
      className="ip-form"
      noValidate
      onSubmit={event => {
        event.preventDefault()
        onContinue()
      }}
    >
      <header className="ip-stage-header">
        <h1>Start with your itinerary</h1>
        <p className="ip-stage-instruction">Add your title and trip details. Next, shape each day.</p>
      </header>

      {approvedCount > 0 ? (
        <p className="ip-notice" role="status">
          <Info size={16} aria-hidden />
          <span>
            Changing anything here reopens {approvedCount === 1 ? 'the approved layout' : `all ${approvedCount} approved layouts`} for review. Your
            layouts and notes are kept.
          </span>
        </p>
      ) : null}

      <div className="ip-field">
        <label htmlFor={fieldIds.title}>Itinerary title</label>
        <p className="ip-helper" id={`${fieldIds.title}-helper`}>
          Use your finished or near-finished SEO title. It is kept word for word.
        </p>
        <input
          id={fieldIds.title}
          type="text"
          value={trip.titleSeed}
          placeholder="Three easy days of food and culture in Lima"
          aria-invalid={invalid(fieldIds.title) || undefined}
          aria-describedby={describedBy(fieldIds.title, `${fieldIds.title}-helper`)}
          onChange={event => onChange({ type: 'patchTrip', patch: { titleSeed: event.target.value } })}
          onBlur={() => markTouched(fieldIds.title)}
        />
        {fieldError(fieldIds.title)}
      </div>

      <div className="ip-field-row">
        <div className="ip-field ip-field-narrow">
          <label htmlFor={fieldIds.dayCount}>Number of days</label>
          <p className="ip-helper" id={`${fieldIds.dayCount}-helper`}>
            One editable day for each.
          </p>
          <input
            id={fieldIds.dayCount}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={trip.dayCountInput}
            aria-invalid={invalid(fieldIds.dayCount) || undefined}
            aria-describedby={describedBy(fieldIds.dayCount, `${fieldIds.dayCount}-helper`)}
            onChange={event =>
              onChange({ type: 'patchTrip', patch: { dayCountInput: event.target.value } })
            }
            onBlur={() => markTouched(fieldIds.dayCount)}
          />
          {fieldError(fieldIds.dayCount)}
        </div>

        <div className="ip-field">
          <label htmlFor={fieldIds.baseCity}>Base city</label>
          <p className="ip-helper" id={`${fieldIds.baseCity}-helper`}>
            Add the country too if the name is ambiguous.
          </p>
          <input
            id={fieldIds.baseCity}
            type="text"
            value={trip.baseCity}
            placeholder="Lima, Peru"
            aria-invalid={invalid(fieldIds.baseCity) || undefined}
            aria-describedby={describedBy(fieldIds.baseCity, `${fieldIds.baseCity}-helper`)}
            onChange={event => onChange({ type: 'patchTrip', patch: { baseCity: event.target.value } })}
            onBlur={() => markTouched(fieldIds.baseCity)}
          />
          {fieldError(fieldIds.baseCity)}
        </div>
      </div>

      <fieldset className="ip-fieldset">
        <legend>Scope</legend>
        <div className="ip-radio-stack">
          {(
            [
              { value: 'city_only' as TripScope, label: 'City only', note: 'Every day starts and ends in the base city.' },
              {
                value: 'with_getaway' as TripScope,
                label: 'Include an overnight getaway',
                note: 'The getaway uses days you already have and returns to the base city.',
              },
            ]
          ).map(option => (
            <label key={option.value} className="ip-radio">
              <input
                type="radio"
                name="ip-scope"
                value={option.value}
                checked={trip.scope === option.value}
                onChange={() => onChange({ type: 'patchTrip', patch: { scope: option.value } })}
              />
              <span>
                <span className="ip-radio-label">{option.label}</span>
                <span className="ip-radio-note">{option.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {trip.scope === 'with_getaway' ? (
        <div className="ip-subgroup">
          <div className="ip-field">
            <label htmlFor="ip-getaway-destination">Getaway destination</label>
            <p className="ip-helper" id="ip-getaway-destination-helper">
              Optional. It can stay undecided until that day&rsquo;s Grill.
            </p>
            <input
              id="ip-getaway-destination"
              type="text"
              value={trip.getaway.destination}
              placeholder="Paracas, if known"
              aria-describedby="ip-getaway-destination-helper"
              onChange={event =>
                onChange({
                  type: 'patchTrip',
                  patch: { getaway: { ...trip.getaway, destination: event.target.value } },
                })
              }
            />
          </div>
          <div className="ip-field-row">
            <div className="ip-field ip-field-narrow">
              <label htmlFor={fieldIds.getawayDeparture}>Leave on</label>
              <select
                id={fieldIds.getawayDeparture}
                value={trip.getaway.departureDay ?? ''}
                aria-invalid={invalid(fieldIds.getawayDeparture) || undefined}
                aria-describedby={describedBy(fieldIds.getawayDeparture)}
                onChange={event =>
                  onChange({
                    type: 'patchTrip',
                    patch: {
                      getaway: {
                        ...trip.getaway,
                        departureDay: event.target.value ? Number(event.target.value) : null,
                      },
                    },
                  })
                }
                onBlur={() => markTouched(fieldIds.getawayDeparture)}
              >
                <option value="">Choose a day</option>
                {dayOptions.map(day => (
                  <option key={day} value={day}>
                    Day {day}
                  </option>
                ))}
              </select>
              {fieldError(fieldIds.getawayDeparture)}
            </div>
            <div className="ip-field ip-field-narrow">
              <label htmlFor={fieldIds.getawayReturn}>Come back on</label>
              <select
                id={fieldIds.getawayReturn}
                value={trip.getaway.returnDay ?? ''}
                aria-invalid={invalid(fieldIds.getawayReturn) || undefined}
                aria-describedby={describedBy(fieldIds.getawayReturn)}
                onChange={event =>
                  onChange({
                    type: 'patchTrip',
                    patch: {
                      getaway: {
                        ...trip.getaway,
                        returnDay: event.target.value ? Number(event.target.value) : null,
                      },
                    },
                  })
                }
                onBlur={() => markTouched(fieldIds.getawayReturn)}
              >
                <option value="">Choose a day</option>
                {dayOptions.map(day => (
                  <option key={day} value={day}>
                    Day {day}
                  </option>
                ))}
              </select>
              {fieldError(fieldIds.getawayReturn)}
            </div>
          </div>
          <p className="ip-helper">
            You will add the Travel stops on those two days yourself — choosing a getaway never
            inserts them for you.
          </p>
        </div>
      ) : null}

      <fieldset className="ip-fieldset">
        <legend>Timing</legend>
        <div className="ip-segmented" role="radiogroup" aria-label="Timing">
          {(
            [
              { value: 'evergreen' as TimingMode, label: 'Evergreen' },
              { value: 'specific_dates' as TimingMode, label: 'Specific dates' },
              { value: 'weekday_sequence' as TimingMode, label: 'Weekday sequence' },
            ]
          ).map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={trip.timing.mode === option.value}
              className={trip.timing.mode === option.value ? 'ip-segment ip-segment-on' : 'ip-segment'}
              onClick={() =>
                onChange({
                  type: 'patchTrip',
                  patch: { timing: { ...trip.timing, mode: option.value } },
                })
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="ip-helper">
          {trip.timing.mode === 'evergreen'
            ? 'No dates or weekdays are attached to the days.'
            : trip.timing.mode === 'specific_dates'
              ? 'The last date follows from the number of days.'
              : 'Each day takes the next weekday in sequence.'}
        </p>

        {trip.timing.mode === 'specific_dates' ? (
          <div className="ip-field ip-field-narrow">
            <label htmlFor={fieldIds.startDate}>First date</label>
            <input
              id={fieldIds.startDate}
              type="date"
              value={trip.timing.startDate}
              aria-invalid={invalid(fieldIds.startDate) || undefined}
              aria-describedby={describedBy(fieldIds.startDate)}
              onChange={event =>
                onChange({
                  type: 'patchTrip',
                  patch: { timing: { ...trip.timing, startDate: event.target.value } },
                })
              }
              onBlur={() => markTouched(fieldIds.startDate)}
            />
            {fieldError(fieldIds.startDate)}
            {derivedEndDate(trip) ? (
              <p className="ip-helper">Last day: {derivedEndDate(trip)}</p>
            ) : null}
          </div>
        ) : null}

        {trip.timing.mode === 'weekday_sequence' ? (
          <div className="ip-field ip-field-narrow">
            <label htmlFor={fieldIds.firstWeekday}>First weekday</label>
            <select
              id={fieldIds.firstWeekday}
              value={trip.timing.firstWeekday}
              aria-invalid={invalid(fieldIds.firstWeekday) || undefined}
              aria-describedby={describedBy(fieldIds.firstWeekday)}
              onChange={event =>
                onChange({
                  type: 'patchTrip',
                  patch: {
                    timing: { ...trip.timing, firstWeekday: event.target.value as Weekday },
                  },
                })
              }
              onBlur={() => markTouched(fieldIds.firstWeekday)}
            >
              <option value="">Choose a weekday</option>
              {WEEKDAYS.map(weekday => (
                <option key={weekday} value={weekday}>
                  {weekday[0].toUpperCase() + weekday.slice(1)}
                </option>
              ))}
            </select>
            {fieldError(fieldIds.firstWeekday)}
          </div>
        ) : null}
      </fieldset>

      <div className="ip-field">
        <label htmlFor="ip-areas">Preferred areas</label>
        <p className="ip-helper" id="ip-areas-helper">
          Leave blank to choose areas during each day&rsquo;s Grill.
        </p>
        <div className="ip-token-input">
          <input
            id="ip-areas"
            ref={areaInputRef}
            type="text"
            value={areaInput}
            placeholder="Barranco"
            aria-describedby="ip-areas-helper"
            onChange={event => setAreaInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                addArea()
              }
            }}
            onBlur={addArea}
          />
          <button type="button" className="ip-button-quiet" onClick={addArea} disabled={!areaInput.trim()}>
            Add
          </button>
        </div>
        {trip.preferredAreas.length > 0 ? (
          <ul className="ip-tokens">
            {trip.preferredAreas.map(area => (
              <li key={area}>
                <span>{area}</span>
                <button
                  type="button"
                  aria-label={`Remove ${area}`}
                  onClick={() => onChange({ type: 'removeArea', area })}
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="ip-field">
        <label htmlFor="ip-starting-base">Starting base</label>
        <p className="ip-helper" id="ip-starting-base-helper">
          Optional. Where each day starts from, if that is already decided.
        </p>
        <input
          id="ip-starting-base"
          type="text"
          value={trip.startingBase}
          placeholder="Hotel or neighborhood, if known"
          aria-describedby="ip-starting-base-helper"
          onChange={event => onChange({ type: 'patchTrip', patch: { startingBase: event.target.value } })}
        />
      </div>

      <details className="ip-disclosure">
        <summary>
          Shared preferences <span className="ip-disclosure-note">optional</span>
        </summary>
        <p className="ip-helper">
          These apply to every day. Anything left blank stays unspecified — that is a real answer,
          not a gap.
        </p>

        <div className="ip-field">
          <label htmlFor="ip-audience">Who this is for</label>
          <input
            id="ip-audience"
            type="text"
            value={trip.sharedPreferences.audience}
            placeholder="Couple in their thirties, first time in the city"
            onChange={event => onChange({ type: 'patchPreferences', patch: { audience: event.target.value } })}
          />
        </div>

        <div className="ip-field-row">
          <div className="ip-field">
            <label htmlFor="ip-budget">Budget style</label>
            <select
              id="ip-budget"
              value={trip.sharedPreferences.budgetStyle}
              onChange={event =>
                onChange({
                  type: 'patchPreferences',
                  patch: { budgetStyle: event.target.value as BudgetStyle },
                })
              }
            >
              <option value="unspecified">Unspecified</option>
              <option value="budget">Budget-conscious</option>
              <option value="mid_range">Mid-range</option>
              <option value="premium">Premium</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div className="ip-field">
            <label htmlFor="ip-budget-note">Budget note</label>
            <input
              id="ip-budget-note"
              type="text"
              value={trip.sharedPreferences.budgetNote}
              placeholder="Exact amounts and currency, if any"
              onChange={event =>
                onChange({ type: 'patchPreferences', patch: { budgetNote: event.target.value } })
              }
            />
          </div>
        </div>

        <div className="ip-field-row">
          <div className="ip-field">
            <label htmlFor="ip-pace">Pace</label>
            <select
              id="ip-pace"
              value={trip.sharedPreferences.pace}
              onChange={event =>
                onChange({ type: 'patchPreferences', patch: { pace: event.target.value as Pace } })
              }
            >
              <option value="unspecified">Unspecified</option>
              <option value="relaxed">Relaxed</option>
              <option value="balanced">Balanced</option>
              <option value="full">Full</option>
            </select>
          </div>
          <div className="ip-field">
            <label htmlFor="ip-walking">Walking tolerance</label>
            <select
              id="ip-walking"
              value={trip.sharedPreferences.walkingTolerance}
              onChange={event =>
                onChange({
                  type: 'patchPreferences',
                  patch: { walkingTolerance: event.target.value as WalkingTolerance },
                })
              }
            >
              <option value="unspecified">Unspecified</option>
              <option value="short">Short walks</option>
              <option value="moderate">Moderate walks</option>
              <option value="long">Long walks welcome</option>
            </select>
          </div>
        </div>

        <fieldset className="ip-fieldset">
          <legend>Getting around</legend>
          <p className="ip-helper">Nothing ticked means unspecified, not walking only.</p>
          <div className="ip-checkbox-row">
            {TRANSPORT_OPTIONS.map(option => {
              const on = trip.sharedPreferences.transport.includes(option.value)
              return (
                <label key={option.value} className="ip-checkbox">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onChange({
                        type: 'patchPreferences',
                        patch: {
                          transport: on
                            ? trip.sharedPreferences.transport.filter(mode => mode !== option.value)
                            : [...trip.sharedPreferences.transport, option.value],
                        },
                      })
                    }
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
          <div className="ip-field">
            <label htmlFor="ip-transport-note">Transport note</label>
            <input
              id="ip-transport-note"
              type="text"
              value={trip.sharedPreferences.transportNote}
              onChange={event =>
                onChange({ type: 'patchPreferences', patch: { transportNote: event.target.value } })
              }
            />
          </div>
        </fieldset>

        <div className="ip-field-row">
          <div className="ip-field">
            <label htmlFor="ip-dietary">Dietary needs</label>
            <textarea
              id="ip-dietary"
              rows={2}
              value={trip.sharedPreferences.dietaryNeeds}
              placeholder="Blank means unspecified. Write None if there genuinely are none."
              onChange={event =>
                onChange({ type: 'patchPreferences', patch: { dietaryNeeds: event.target.value } })
              }
            />
          </div>
          <div className="ip-field">
            <label htmlFor="ip-access">Access needs</label>
            <textarea
              id="ip-access"
              rows={2}
              value={trip.sharedPreferences.accessNeeds}
              placeholder="Blank means unspecified."
              onChange={event =>
                onChange({ type: 'patchPreferences', patch: { accessNeeds: event.target.value } })
              }
            />
          </div>
        </div>

        <div className="ip-field-row">
          <div className="ip-field">
            <label htmlFor="ip-must-include">Must include</label>
            <textarea
              id="ip-must-include"
              rows={2}
              value={trip.sharedPreferences.mustInclude}
              onChange={event =>
                onChange({ type: 'patchPreferences', patch: { mustInclude: event.target.value } })
              }
            />
          </div>
          <div className="ip-field">
            <label htmlFor="ip-avoid">Avoid</label>
            <textarea
              id="ip-avoid"
              rows={2}
              value={trip.sharedPreferences.avoid}
              onChange={event =>
                onChange({ type: 'patchPreferences', patch: { avoid: event.target.value } })
              }
            />
          </div>
        </div>
      </details>

      <div className="ip-action-bar">
        <span className="ip-action-note">
          {dayCount ? `${dayCount} day${dayCount === 1 ? '' : 's'} to shape` : 'Add a day count to continue'}
        </span>
        <button type="submit" className="ip-button-primary">
          Shape days <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </form>
  )
}
