import type { ListicleType, LocationOption, SingleTypeListicleDraft } from '../../types'
import { AiTitleInput } from '../../../staging/features/markdown-editor'
import type { AiTitleGenerateInput } from '../../../staging/features/markdown-editor'
import { BuilderStepHeader } from '../../../shared/builder/components/BuilderStepHeader'
import { LISTICLE_TYPE_OPTIONS } from '../constants/builder-options.constants'
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
  isSynced?: boolean
  onContinue: () => void
  onUpdateSetup: () => void
  onSaveSetup: () => void
  onCancelUpdateSetup: () => void
  updateDraft: (next: Partial<SingleTypeListicleDraft>) => void
  setTargetItemCount: (nextCount: number) => void
  onTitleAiGenerate?: (input: AiTitleGenerateInput) => Promise<string>
  onSlugChange?: (slug: string) => void
  onGenerateSlugWithAi?: () => Promise<void>
  isGeneratingSlug?: boolean
}

function getAiTitleDisabledReason(draft: SingleTypeListicleDraft, isSynced: boolean): string | undefined {
  if (!isSynced && draft.step1_complete && !draft.in_update_mode) return 'Setup is locked'
  if (!draft.location && !draft.listicleType) return 'Set a location and data type first'
  if (!draft.location) return 'Set a location first'
  if (!draft.listicleType) return 'Set a data type first'
  if (!draft.title.trim()) return 'Write a title first, then AI can improve it'
  return undefined
}

export function BuilderSetupPanel({
  draft,
  locations,
  isSynced = false,
  onContinue,
  onUpdateSetup,
  onSaveSetup,
  onCancelUpdateSetup,
  updateDraft,
  setTargetItemCount,
  onTitleAiGenerate,
  onSlugChange,
  onGenerateSlugWithAi,
  isGeneratingSlug,
}: BuilderSetupPanelProps) {
  const aiTitleDisabledReason = getAiTitleDisabledReason(draft, isSynced)
  const isStep1Valid = validateStep1(draft).length === 0
  const isCoreSetupChosen = Boolean(draft.location.trim() && draft.listicleType)
  const hasLockedItemData = hasAnyWrittenItemData(draft.items)
  const isSetupLocked = !isSynced && draft.step1_complete && !draft.in_update_mode
  const isTargetCountLocked = isSetupLocked || hasLockedItemData
  const selectedTargetCount = draft.targetItemCount > 0 ? draft.targetItemCount : null
  const selectedPrimaryLocation = findLocationByKey(locations, draft.location)
  const neighborhoodOptions = getNeighborhoodOptionsForLocation(locations, draft.location)
  const showNeighborhoodPicker = isCityLocation(selectedPrimaryLocation)

  return (
    <section className="stl-panel stl-setup-panel">
      <BuilderStepHeader
        stepLabel="Step 1"
        title="Setup"
        isSynced={isSynced}
        isStepComplete={draft.step1_complete}
        isInUpdateMode={draft.in_update_mode}
        canContinue={isStep1Valid}
        onContinue={onContinue}
        onUpdate={onUpdateSetup}
        onSave={onSaveSetup}
        onCancelUpdate={onCancelUpdateSetup}
        updateLabel="Update Setup"
        saveLabel="Save Setup"
      />

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
          <span>Slug *</span>
          <div className="stl-seo-input-wrap">
            <input
              className="stl-seo-input-with-ai"
              value={draft.payloadSlug || ''}
              disabled={isSetupLocked}
              placeholder="e.g. best-steakhouses-las-vegas"
              onChange={(event) => onSlugChange ? onSlugChange(event.target.value) : updateDraft({ payloadSlug: event.target.value })}
            />
            {onGenerateSlugWithAi && (isSynced || !isSetupLocked) ? (
              <span className="stl-seo-ai-trigger-wrap">
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary stl-seo-ai-btn"
                  onClick={() => void onGenerateSlugWithAi()}
                  disabled={isGeneratingSlug || !draft.title.trim()}
                >
                  {isGeneratingSlug ? 'Generating...' : 'AI'}
                </button>
              </span>
            ) : null}
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
