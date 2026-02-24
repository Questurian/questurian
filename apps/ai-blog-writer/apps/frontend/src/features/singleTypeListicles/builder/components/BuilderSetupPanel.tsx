import type { ListicleType, SingleTypeListicleDraft } from '../../types'
import { LISTICLE_TYPE_OPTIONS } from '../constants/builder-options.constants'

type BuilderSetupPanelProps = {
  draft: SingleTypeListicleDraft
  locations: Array<{ id: number; locationKey: string }>
  onContinue: () => void
  onUpdateSetup: () => void
  onSaveSetup: () => void
  onCancelUpdateSetup: () => void
  updateDraft: (next: Partial<SingleTypeListicleDraft>) => void
}

export function BuilderSetupPanel({
  draft,
  locations,
  onContinue,
  onUpdateSetup,
  onSaveSetup,
  onCancelUpdateSetup,
  updateDraft,
}: BuilderSetupPanelProps) {
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
          <input
            value={draft.title}
            disabled={draft.step1_complete && !draft.in_update_mode}
            onChange={(event) => updateDraft({ title: event.target.value })}
          />
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
          <span>Listicle Data Type *</span>
          <select
            value={draft.listicleType}
            disabled={draft.step1_complete && !draft.in_update_mode}
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
          <span>Target List Size (1-50) *</span>
          <input
            type="number"
            min={1}
            max={50}
            value={draft.targetItemCount}
            disabled={draft.step1_complete && !draft.in_update_mode}
            onChange={(event) => updateDraft({ targetItemCount: Number(event.target.value) || 0 })}
          />
        </label>
      </div>
    </section>
  )
}
