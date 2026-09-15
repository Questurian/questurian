import { useState } from 'react'
import { CircleAlert, X } from 'lucide-react'
import { CATEGORY_LABELS, DAYPART_LABELS, DAYPART_ORDER, STOP_KIND_LABELS } from '../templates'
import { fieldIds, type Issue } from '../validation'
import type {
  Daypart,
  PlaceCategory,
  SlotSnapshot,
  StopKind,
  TransportMode,
  TravelPoint,
  TripDraft,
} from '../types'

/**
 * One stop, opened for editing.
 *
 * The full rules live here and only here. A collapsed row says what the stop is
 * — daypart, name, kind, optional — because that is what you scan; the category
 * boundary, the cues and the exclusions are what you change, and they belong
 * behind the row you are changing rather than on every row at once.
 *
 * Nothing is hidden from the day, only from the list. A template's rules are
 * carried in full even while the disclosure is shut, and the raw collection
 * keys never surface: an operator picks Restaurant, Activity and Nightlife.
 */

const CATEGORIES: PlaceCategory[] = ['dining', 'attractions', 'nightlife']

const TRANSPORT_MODES: Array<{ value: TransportMode; label: string }> = [
  { value: 'unspecified', label: 'Unspecified' },
  { value: 'walk', label: 'Walk' },
  { value: 'public_transport', label: 'Public transport' },
  { value: 'taxi', label: 'Taxi or rideshare' },
  { value: 'car', label: 'Car' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'flight', label: 'Flight' },
]

const SEARCHABLE: StopKind[] = ['place', 'experience']

/** What a kind change would throw away. Empty means nothing is lost. */
function lossesFromKindChange(slot: SlotSnapshot, next: StopKind): string[] {
  const losses: string[] = []
  const wasSearchable = SEARCHABLE.includes(slot.kind)
  const willSearch = SEARCHABLE.includes(next)
  if (wasSearchable && !willSearch) {
    if (slot.allowedCategories.length > 0) losses.push('allowed and preferred categories')
    if (slot.cues.length > 0) losses.push('search cues')
    if (slot.exclusions.length > 0) losses.push('exclusions')
  }
  if (slot.kind === 'travel' && next !== 'travel' && slot.travel) {
    losses.push('the from and to points')
  }
  return losses
}

function applyKind(slot: SlotSnapshot, next: StopKind): Partial<SlotSnapshot> {
  const patch: Partial<SlotSnapshot> = { kind: next }
  const willSearch = SEARCHABLE.includes(next)
  if (!willSearch) {
    patch.allowedCategories = []
    patch.preferredCategories = []
    patch.cues = []
    patch.exclusions = []
  } else if (slot.allowedCategories.length === 0) {
    patch.allowedCategories = next === 'experience' ? ['attractions'] : ['dining']
  }
  patch.travel =
    next === 'travel'
      ? (slot.travel ?? { from: { ref: 'base' }, to: { ref: 'custom', text: '' }, mode: 'unspecified' })
      : undefined
  return patch
}

export interface StopEditorProps {
  slot: SlotSnapshot
  trip: TripDraft
  issues: Issue[]
  onPatch: (patch: Partial<SlotSnapshot>) => void
}

export function StopEditor({ slot, trip, issues, onPatch }: StopEditorProps) {
  const [pendingKind, setPendingKind] = useState<StopKind | null>(null)
  const [cueInput, setCueInput] = useState('')
  const [exclusionInput, setExclusionInput] = useState('')

  const searchable = SEARCHABLE.includes(slot.kind)
  const issueFor = (fieldId: string) => issues.find(issue => issue.fieldId === fieldId)

  function error(fieldId: string) {
    const issue = issueFor(fieldId)
    if (!issue) return null
    return (
      <p className="ip-field-error" id={`${fieldId}-message`}>
        <CircleAlert size={14} aria-hidden />
        <span>
          <span className="ip-sr-only">Error: </span>
          {issue.message}
        </span>
      </p>
    )
  }

  function requestKind(next: StopKind) {
    if (next === slot.kind) return
    if (lossesFromKindChange(slot, next).length > 0) {
      setPendingKind(next)
      return
    }
    onPatch(applyKind(slot, next))
  }

  function travelPointControl(which: 'from' | 'to') {
    const travel = slot.travel ?? {
      from: { ref: 'base' as const },
      to: { ref: 'custom' as const, text: '' },
      mode: 'unspecified' as TransportMode,
    }
    const point = travel[which]
    const fieldId = which === 'from' ? fieldIds.slotTravelFrom(slot.id) : fieldIds.slotTravelTo(slot.id)

    const setPoint = (next: TravelPoint) =>
      onPatch({ travel: { ...travel, [which]: next } })

    return (
      <div className="ip-field">
        <label htmlFor={fieldId}>{which === 'from' ? 'From' : 'To'}</label>
        <select
          id={fieldId}
          value={point.ref}
          aria-invalid={Boolean(issueFor(fieldId)) || undefined}
          aria-describedby={issueFor(fieldId) ? `${fieldId}-message` : undefined}
          onChange={event => {
            const ref = event.target.value as TravelPoint['ref']
            setPoint(ref === 'custom' ? { ref: 'custom', text: '' } : { ref })
          }}
        >
          <option value="base">{trip.baseCity.trim() || 'Base city'}</option>
          <option value="getaway">
            {trip.getaway.destination.trim() || 'Getaway destination — undecided'}
          </option>
          <option value="custom">Somewhere else</option>
        </select>
        {point.ref === 'custom' ? (
          <input
            type="text"
            className="ip-inline-input"
            value={point.text}
            placeholder="Name the place in your own words"
            aria-label={`${which === 'from' ? 'From' : 'To'} — place name`}
            onChange={event => setPoint({ ref: 'custom', text: event.target.value })}
          />
        ) : null}
        {error(fieldId)}
      </div>
    )
  }

  function tokenList(
    values: string[],
    onRemove: (value: string) => void,
    describe: (value: string) => string,
  ) {
    if (values.length === 0) return null
    return (
      <ul className="ip-tokens ip-tokens-small">
        {values.map(value => (
          <li key={value}>
            <span>{value}</span>
            <button type="button" aria-label={describe(value)} onClick={() => onRemove(value)}>
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="ip-stop-editor">
      {pendingKind ? (
        <div className="ip-inline-confirm" role="alert">
          <p>
            Switching to {STOP_KIND_LABELS[pendingKind]} drops{' '}
            {lossesFromKindChange(slot, pendingKind).join(', ')}. Nothing has changed yet.
          </p>
          <div className="ip-inline-confirm-actions">
            <button
              type="button"
              className="ip-button-primary ip-button-small"
              onClick={() => {
                onPatch(applyKind(slot, pendingKind))
                setPendingKind(null)
              }}
            >
              Switch anyway
            </button>
            <button
              type="button"
              className="ip-button-quiet ip-button-small"
              onClick={() => setPendingKind(null)}
            >
              Keep as is
            </button>
          </div>
        </div>
      ) : null}

      <div className="ip-field-row">
        <div className="ip-field">
          <label htmlFor={fieldIds.slotLabel(slot.id)}>Stop name</label>
          <input
            id={fieldIds.slotLabel(slot.id)}
            type="text"
            value={slot.label}
            aria-invalid={Boolean(issueFor(fieldIds.slotLabel(slot.id))) || undefined}
            aria-describedby={
              issueFor(fieldIds.slotLabel(slot.id)) ? `${fieldIds.slotLabel(slot.id)}-message` : undefined
            }
            onChange={event => onPatch({ label: event.target.value })}
          />
          {error(fieldIds.slotLabel(slot.id))}
        </div>

        <div className="ip-field ip-field-narrow">
          <label htmlFor={fieldIds.slotDaypart(slot.id)}>Time of day</label>
          <select
            id={fieldIds.slotDaypart(slot.id)}
            value={slot.daypart}
            aria-invalid={Boolean(issueFor(fieldIds.slotDaypart(slot.id))) || undefined}
            aria-describedby={
              issueFor(fieldIds.slotDaypart(slot.id))
                ? `${fieldIds.slotDaypart(slot.id)}-message`
                : undefined
            }
            onChange={event => onPatch({ daypart: event.target.value as Daypart })}
          >
            {DAYPART_ORDER.map(daypart => (
              <option key={daypart} value={daypart}>
                {DAYPART_LABELS[daypart]}
              </option>
            ))}
          </select>
          {error(fieldIds.slotDaypart(slot.id))}
        </div>
      </div>

      <div className="ip-field-row">
        <fieldset className="ip-fieldset ip-fieldset-tight">
          <legend>Kind</legend>
          <div className="ip-segmented ip-segmented-small" role="radiogroup" aria-label="Kind of stop">
            {(Object.keys(STOP_KIND_LABELS) as StopKind[]).map(kind => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={slot.kind === kind}
                className={slot.kind === kind ? 'ip-segment ip-segment-on' : 'ip-segment'}
                onClick={() => requestKind(kind)}
              >
                {STOP_KIND_LABELS[kind]}
              </button>
            ))}
          </div>
          <p className="ip-helper">
            {slot.kind === 'free_time'
              ? 'Free time searches for nothing. It only holds the space.'
              : slot.kind === 'travel'
                ? 'Travel is a transfer to plan, not a place to pick.'
                : 'This stop ends in a venue search.'}
          </p>
        </fieldset>

        <label className="ip-checkbox ip-checkbox-standalone">
          <input
            type="checkbox"
            checked={slot.optional}
            onChange={event => onPatch({ optional: event.target.checked })}
          />
          <span>
            <span className="ip-radio-label">Optional stop</span>
            <span className="ip-radio-note">Can be skipped. Its details still have to be valid.</span>
          </span>
        </label>
      </div>

      {slot.kind === 'travel' ? (
        <div className="ip-field-row">
          {travelPointControl('from')}
          {travelPointControl('to')}
          <div className="ip-field ip-field-narrow">
            <label htmlFor={`ip-travel-mode-${slot.id}`}>How</label>
            <select
              id={`ip-travel-mode-${slot.id}`}
              value={slot.travel?.mode ?? 'unspecified'}
              onChange={event =>
                onPatch({
                  travel: {
                    from: slot.travel?.from ?? { ref: 'base' },
                    to: slot.travel?.to ?? { ref: 'custom', text: '' },
                    mode: event.target.value as TransportMode,
                  },
                })
              }
            >
              {TRANSPORT_MODES.map(mode => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className="ip-field">
        <label htmlFor={fieldIds.slotPurpose(slot.id)}>Purpose</label>
        <p className="ip-helper" id={`${fieldIds.slotPurpose(slot.id)}-helper`}>
          {searchable
            ? 'Why this stop exists. It is what the search is told to look for.'
            : 'Why this stop exists.'}
        </p>
        <textarea
          id={fieldIds.slotPurpose(slot.id)}
          rows={2}
          value={slot.purpose}
          aria-invalid={Boolean(issueFor(fieldIds.slotPurpose(slot.id))) || undefined}
          aria-describedby={
            [
              `${fieldIds.slotPurpose(slot.id)}-helper`,
              issueFor(fieldIds.slotPurpose(slot.id)) ? `${fieldIds.slotPurpose(slot.id)}-message` : null,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={event => onPatch({ purpose: event.target.value })}
        />
        {error(fieldIds.slotPurpose(slot.id))}
      </div>

      {searchable ? (
        <details className="ip-disclosure ip-disclosure-inset">
          <summary>
            Selection rules{' '}
            <span className="ip-disclosure-note">
              {slot.allowedCategories.map(category => CATEGORY_LABELS[category]).join(', ') || 'none set'}
              {slot.cues.length > 0 ? ` · ${slot.cues.length} cue${slot.cues.length === 1 ? '' : 's'}` : ''}
              {slot.exclusions.length > 0 ? ` · ${slot.exclusions.length} to avoid` : ''}
            </span>
          </summary>

          <fieldset className="ip-fieldset ip-fieldset-tight" id={fieldIds.slotCategories(slot.id)}>
            <legend>Allowed</legend>
            <p className="ip-helper">The boundary. A stop can never be filled from outside it.</p>
            <div className="ip-checkbox-row">
              {CATEGORIES.map(category => {
                const on = slot.allowedCategories.includes(category)
                return (
                  <label key={category} className="ip-checkbox">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const allowed = on
                          ? slot.allowedCategories.filter(value => value !== category)
                          : [...slot.allowedCategories, category]
                        onPatch({
                          allowedCategories: allowed,
                          // A preference for something no longer allowed is not
                          // a preference, it is a contradiction.
                          preferredCategories: slot.preferredCategories.filter(value =>
                            allowed.includes(value),
                          ),
                        })
                      }}
                    />
                    <span>{CATEGORY_LABELS[category]}</span>
                  </label>
                )
              })}
            </div>
            {error(fieldIds.slotCategories(slot.id))}
          </fieldset>

          <fieldset className="ip-fieldset ip-fieldset-tight">
            <legend>Preferred</legend>
            <p className="ip-helper">
              Chosen first within what is allowed. A preference never adds a category.
            </p>
            <div className="ip-checkbox-row">
              {slot.allowedCategories.map(category => {
                const on = slot.preferredCategories.includes(category)
                return (
                  <label key={category} className="ip-checkbox">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        onPatch({
                          preferredCategories: on
                            ? slot.preferredCategories.filter(value => value !== category)
                            : [...slot.preferredCategories, category],
                        })
                      }
                    />
                    <span>{CATEGORY_LABELS[category]}</span>
                  </label>
                )
              })}
              {slot.allowedCategories.length === 0 ? (
                <p className="ip-helper">Allow a category first.</p>
              ) : null}
            </div>
          </fieldset>

          <div className="ip-field">
            <label htmlFor={`ip-cues-${slot.id}`}>Search cues</label>
            <p className="ip-helper" id={`ip-cues-${slot.id}-helper`}>
              What the experience should feel like. Guidance, not requirements.
            </p>
            <div className="ip-token-input">
              <input
                id={`ip-cues-${slot.id}`}
                type="text"
                value={cueInput}
                aria-describedby={`ip-cues-${slot.id}-helper`}
                onChange={event => setCueInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Enter' && event.key !== ',') return
                  event.preventDefault()
                  const value = cueInput.trim()
                  if (!value || slot.cues.includes(value)) {
                    setCueInput('')
                    return
                  }
                  onPatch({ cues: [...slot.cues, value] })
                  setCueInput('')
                }}
              />
            </div>
            {tokenList(
              slot.cues,
              value => onPatch({ cues: slot.cues.filter(cue => cue !== value) }),
              value => `Remove cue ${value}`,
            )}
          </div>

          <div className="ip-field">
            <label htmlFor={`ip-exclusions-${slot.id}`}>Avoid</label>
            <p className="ip-helper" id={`ip-exclusions-${slot.id}-helper`}>
              Carried into research. It never cancels a trip-wide restriction.
            </p>
            <div className="ip-token-input">
              <input
                id={`ip-exclusions-${slot.id}`}
                type="text"
                value={exclusionInput}
                aria-describedby={`ip-exclusions-${slot.id}-helper`}
                onChange={event => setExclusionInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Enter' && event.key !== ',') return
                  event.preventDefault()
                  const value = exclusionInput.trim()
                  if (!value || slot.exclusions.includes(value)) {
                    setExclusionInput('')
                    return
                  }
                  onPatch({ exclusions: [...slot.exclusions, value] })
                  setExclusionInput('')
                }}
              />
            </div>
            {tokenList(
              slot.exclusions,
              value => onPatch({ exclusions: slot.exclusions.filter(item => item !== value) }),
              value => `Remove exclusion ${value}`,
            )}
          </div>
        </details>
      ) : null}
    </div>
  )
}
