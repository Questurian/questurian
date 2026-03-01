import type { ListicleType, LocationOption, SingleTypeListicleDraft } from '../../types'
import { AiTitleInput } from '../../../staging/features/markdown-editor'
import type { AiTitleGenerateInput } from '../../../staging/features/markdown-editor'
import { LISTICLE_TYPE_OPTIONS } from '../constants/builder-options.constants'
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

function formatLocationToken(token: string): string {
  return token
    .trim()
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function formatLocationLabel(location: LocationOption): string {
  const partsFromFields = [
    location.country,
    location.city || undefined,
    location.neighborhood || undefined,
  ]
    .map((part) => (part || '').trim())
    .filter(Boolean)

  if (partsFromFields.length > 0) {
    return partsFromFields.map((part) => formatLocationToken(part)).join(' > ')
  }

  const partsFromKey = (location.locationKey || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  if (partsFromKey.length > 0) {
    return partsFromKey.map((part) => formatLocationToken(part)).join(' > ')
  }

  return location.locationKey
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
            onChange={(event) => updateDraft({ location: event.target.value, locationRef: null })}
          >
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.locationKey}>
                {formatLocationLabel(location)}
              </option>
            ))}
          </select>
        </label>

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

          {selectedTargetCount ? (
            <p className="stl-summary-note stl-setup-note">
              Target size controls item cards. Changing this count auto-creates blank items.
            </p>
          ) : (
            <p className="stl-summary-note stl-setup-note">Pick a target size to generate blank item cards.</p>
          )}

          {hasLockedItemData ? (
            <p className="stl-summary-note stl-setup-note">
              Target size locks after item data is entered. Remove items (or clear item content) to change it.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
