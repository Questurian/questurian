import { DAY_AUDIENCE_OPTIONS, PERIOD_OPTIONS, QUARTER_MINUTE_OPTIONS } from '../constants/builder-options.constants'
import type { DayAudience, ListicleItineraryDraft, Meridiem, QuarterMinute } from '../../types'
import { AiTitleInput } from '../../../staging/features/markdown-editor'
import type { AiTitleGenerateInput } from '../../../staging/features/markdown-editor'

type BuilderSetupPanelProps = {
  draft: ListicleItineraryDraft
  locations: Array<{ id: number; locationKey: string }>
  onContinue: () => void
  onUpdateSetup: () => void
  onSaveSetup: () => void
  onCancelUpdateSetup: () => void
  updateDraft: (next: Partial<ListicleItineraryDraft>) => void
  onTitleAiGenerate?: (input: AiTitleGenerateInput) => Promise<string>
}

function getAiTitleDisabledReason(draft: ListicleItineraryDraft): string | undefined {
  if (draft.step1_complete && !draft.in_update_mode) return 'Click "Update Setup" to edit title'
  if (!draft.location) return 'Set a location in Step 1 first'
  if (!draft.title.trim()) return 'Write a title first, then AI can improve it'
  return undefined
}

export function BuilderSetupPanel({
  draft,
  locations,
  onContinue,
  onUpdateSetup,
  onSaveSetup,
  onCancelUpdateSetup,
  updateDraft,
  onTitleAiGenerate,
}: BuilderSetupPanelProps) {
  const aiTitleDisabledReason = getAiTitleDisabledReason(draft)

  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 1</span> Setup
        </h2>
        <div className="stl-inline-actions">
          {!draft.step1_complete ? (
            <button type="button" className="stl-btn" onClick={onContinue}>
              Continue
            </button>
          ) : null}
          {draft.step1_complete && !draft.in_update_mode ? (
            <button type="button" className="stl-btn stl-btn-secondary" onClick={onUpdateSetup}>
              Update Setup
            </button>
          ) : null}
          {draft.in_update_mode ? (
            <>
              <button type="button" className="stl-btn" onClick={onSaveSetup}>
                Save Setup
              </button>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={onCancelUpdateSetup}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="stl-grid stl-grid-2">
        <label className="stl-field">
          <span>Title *</span>
          <div className="stl-title-input-wrap">
            <input
              className="stl-title-input"
              value={draft.title}
              disabled={draft.step1_complete && !draft.in_update_mode}
              onChange={(event) => updateDraft({ title: event.target.value })}
            />
            {onTitleAiGenerate ? (
              <span className="stl-title-ai-trigger-wrap">
                <AiTitleInput
                  currentTitle={draft.title}
                  onGenerate={onTitleAiGenerate}
                  onApply={(title) => updateDraft({ title })}
                  disabledReason={aiTitleDisabledReason}
                />
              </span>
            ) : null}
          </div>
        </label>

        <label className="stl-field">
          <span>Location *</span>
          <select
            value={draft.location}
            disabled={draft.step1_complete && !draft.in_update_mode}
            onChange={(event) => updateDraft({ location: event.target.value, locationRef: null })}
          >
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.locationKey}>
                {location.locationKey}
              </option>
            ))}
          </select>
        </label>

        <label className="stl-field">
          <span>Day Type *</span>
          <select
            value={draft.dayAudience}
            disabled={draft.step1_complete && !draft.in_update_mode}
            onChange={(event) => updateDraft({ dayAudience: event.target.value as DayAudience | '' })}
          >
            <option value="">Select day type</option>
            {DAY_AUDIENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stl-grid stl-grid-2">
        <div className="stl-field">
          <span>Itinerary Start *</span>
          <div className="stl-grid stl-grid-3">
            <input
              type="number"
              min={1}
              max={12}
              value={draft.itineraryStartHour}
              disabled={draft.step1_complete && !draft.in_update_mode}
              onChange={(event) => updateDraft({ itineraryStartHour: Number(event.target.value) || 0 })}
            />
            <select
              value={draft.itineraryStartMinute}
              disabled={draft.step1_complete && !draft.in_update_mode}
              onChange={(event) => updateDraft({ itineraryStartMinute: event.target.value as QuarterMinute })}
            >
              {QUARTER_MINUTE_OPTIONS.map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
            <select
              value={draft.itineraryStartPeriod}
              disabled={draft.step1_complete && !draft.in_update_mode}
              onChange={(event) => updateDraft({ itineraryStartPeriod: event.target.value as Meridiem })}
            >
              {PERIOD_OPTIONS.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <p className="stl-summary-note">
        Total itinerary end time is derived from your last stop. Use "End Here" on the last stop to lock it now.
      </p>
    </section>
  )
}
