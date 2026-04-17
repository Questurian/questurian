import type { ListicleItineraryDraft, LocationOption } from '../../types'
import { AiTitleInput } from '../../../staging/features/markdown-editor'
import type { AiTitleGenerateInput } from '../../../staging/features/markdown-editor'
import {
  findLocationByKey,
  formatLocationLabel,
  getNeighborhoodOptionsForLocation,
  isCityLocation,
} from '../../../locationScope/scope'

type BuilderSetupPanelProps = {
  draft: ListicleItineraryDraft
  locations: LocationOption[]
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
  const isSetupLocked = draft.step1_complete && !draft.in_update_mode
  const selectedPrimaryLocation = findLocationByKey(locations, draft.location)
  const neighborhoodOptions = getNeighborhoodOptionsForLocation(locations, draft.location)
  const showNeighborhoodPicker = isCityLocation(selectedPrimaryLocation)

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
                ? 'Optional. When selected, stop pickers match only these exact neighborhoods.'
                : 'No neighborhoods are available under this city.'}
            </small>
          </label>
        ) : null}
      </div>

    </section>
  )
}
