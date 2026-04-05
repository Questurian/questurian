import type { ListicleType, LocationOption, SingleTypeListicleDraft } from '../../types'
import { AiTitleInput } from '../../../staging/features/markdown-editor'
import type { AiTitleGenerateInput } from '../../../staging/features/markdown-editor'
import { LISTICLE_TYPE_OPTIONS } from '../constants/builder-options.constants'
import { TRIP_INTENT_OPTIONS } from '../../../trip-intent'
import type { TripIntent } from '../../../trip-intent'
import {
  findLocationByKey,
  formatLocationLabel,
  getNeighborhoodOptionsForLocation,
  isCityLocation,
} from '../../../locationScope/scope'
import { hasAnyWrittenItemData } from '../utils/item-target-count.utils'
import { validateStep1 } from '../validators/setup.validators'

const TARGET_SIZE_PRESETS = [5, 10, 15, 20, 30, 40, 50]

type BuilderSetupPanelProps = {
  draft: SingleTypeListicleDraft
  locations: LocationOption[]
  onContinue: () => void
  onUpdateSetup: () => void
  onSaveSetup: () => void
  onCancelUpdateSetup: () => void
  updateDraft: (next: Partial<SingleTypeListicleDraft>) => void
  setTargetItemCount: (nextCount: number) => void
  onTitleAiGenerate?: (input: AiTitleGenerateInput) => Promise<string>
}

function getAiTitleDisabledReason(draft: SingleTypeListicleDraft): string | undefined {
  if (draft.step1_complete && !draft.in_update_mode) return 'Click "Update Setup" to edit title'
  if (!draft.location && !draft.listicleType) return 'Set a location and data type in Step 1 first'
  if (!draft.location) return 'Set a location in Step 1 first'
  if (!draft.listicleType) return 'Set a data type in Step 1 first'
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
  setTargetItemCount,
  onTitleAiGenerate,
}: BuilderSetupPanelProps) {
  const aiTitleDisabledReason = getAiTitleDisabledReason(draft)
  const isStep1Valid = validateStep1(draft).length === 0
  const isCoreSetupChosen = Boolean(draft.location.trim() && draft.listicleType)
  const hasLockedItemData = hasAnyWrittenItemData(draft.items)
  const isSetupLocked = draft.step1_complete && !draft.in_update_mode
  const isTargetCountLocked = isSetupLocked || hasLockedItemData
  const selectedTargetCount = draft.targetItemCount > 0 ? draft.targetItemCount : null
  const selectedTripIntent = draft.tripIntent || []
  const canUnsetLastTripIntent = selectedTripIntent.length > 1
  const selectedPrimaryLocation = findLocationByKey(locations, draft.location)
  const neighborhoodOptions = getNeighborhoodOptionsForLocation(locations, draft.location)
  const showNeighborhoodPicker = isCityLocation(selectedPrimaryLocation)

  const handleTripIntentChange = (intent: TripIntent, nextChecked: boolean) => {
    const nextTripIntent = nextChecked
      ? [...new Set([...selectedTripIntent, intent])]
      : selectedTripIntent.filter((value) => value !== intent)

    if (nextTripIntent.length === 0) return
    if (!nextChecked && !canUnsetLastTripIntent && selectedTripIntent.includes(intent)) return

    updateDraft({
      tripIntent: nextTripIntent as SingleTypeListicleDraft['tripIntent'],
    })
  }

  return (
    <section className="stl-panel stl-setup-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 1</span> Setup
        </h2>
        <div className="stl-inline-actions">
          {!draft.step1_complete && isStep1Valid ? (
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

      <div className="stl-grid stl-setup-grid stl-setup-stack">
        <label className="stl-field">
          <span>Location *</span>
          <select
            value={draft.location}
            disabled={isSetupLocked}
            onChange={(event) => updateDraft({
              location: event.target.value,
              locationRef: null,
              sharedNeighborhoods: [],
            })}
          >
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.locationKey}>
                {formatLocationLabel(location)}
              </option>
            ))}
          </select>
        </label>

        {showNeighborhoodPicker ? (
          <label className="stl-field">
            <span>Shared Neighborhoods</span>
            <select
              className="stl-multi-select"
              multiple
              size={Math.min(Math.max(neighborhoodOptions.length, 3), 8)}
              value={draft.sharedNeighborhoods.map(String)}
              disabled={isSetupLocked || neighborhoodOptions.length < 1}
              onChange={(event) => updateDraft({
                sharedNeighborhoods: Array.from(event.target.selectedOptions)
                  .map((option) => Number(option.value))
                  .filter((value) => Number.isFinite(value)),
              })}
            >
              {neighborhoodOptions.map((location) => (
                <option key={location.id} value={location.id}>
                  {formatLocationLabel(location)}
                </option>
              ))}
            </select>
            <small className="stl-summary-note">
              {neighborhoodOptions.length > 0
                ? 'Optional. When selected, related item filters match only these exact neighborhoods.'
                : 'No neighborhoods are available under this city.'}
            </small>
          </label>
        ) : null}

        <label className="stl-field">
          <span>Listicle Data Type *</span>
          <select
            value={draft.listicleType}
            disabled={isSetupLocked}
            onChange={(event) => updateDraft({ listicleType: event.target.value as ListicleType | '' })}
          >
            <option value="">Select type</option>
            {LISTICLE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="stl-field">
          <span>Trip Intent *</span>
          <div className="stl-trip-intent-options">
            {TRIP_INTENT_OPTIONS.map((intent) => {
              const isChecked = selectedTripIntent.includes(intent.value)
              const isDisabled = isSetupLocked || (isChecked && !canUnsetLastTripIntent)

              return (
                <label
                  key={intent.value}
                  className={`stl-trip-intent-option${isChecked ? ' is-selected' : ''}${isDisabled ? ' is-disabled' : ''}`}
                >
                  <input
                    className="stl-trip-intent-input"
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    aria-label={`Trip intent ${intent.label}`}
                    onChange={(event) => handleTripIntentChange(intent.value, event.target.checked)}
                  />
                  <span className="stl-trip-intent-copy">
                    <span className="stl-trip-intent-label">{intent.label}</span>
                    <span className="stl-trip-intent-description">{intent.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </label>
      </div>

      {!isCoreSetupChosen ? (
        <p className="stl-summary-note stl-setup-note">Choose location and data type to continue.</p>
      ) : (
        <>
          <div className="stl-grid stl-setup-grid stl-setup-stack">
            <label className="stl-field stl-setup-title-field">
              <span>Title *</span>
              <div className="stl-title-input-wrap">
                <input
                  className="stl-title-input"
                  value={draft.title}
                  disabled={isSetupLocked}
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

            <label className="stl-field stl-target-size-field">
              <div className="stl-field-label-row">
                <span>Target List Size (1-50) *</span>
                <span className="stl-target-count-badge">
                  {selectedTargetCount ? `${selectedTargetCount} items` : 'Not selected'}
                </span>
              </div>

              <div className="stl-target-size-presets" role="group" aria-label="Target list size presets">
                {TARGET_SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`stl-target-size-chip ${selectedTargetCount === preset ? 'is-active' : ''}`}
                    disabled={isTargetCountLocked}
                    onClick={() => setTargetItemCount(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <input
                className="stl-target-size-slider"
                type="range"
                min={1}
                max={50}
                step={1}
                value={selectedTargetCount || 1}
                disabled={isTargetCountLocked}
                onChange={(event) => setTargetItemCount(Number(event.target.value))}
                aria-label="Target list size"
              />
            </label>
          </div>

          {selectedTargetCount ? null : (
            <p className="stl-summary-note stl-setup-note">Pick a target size to generate blank item cards.</p>
          )}
        </>
      )}
    </section>
  )
}
