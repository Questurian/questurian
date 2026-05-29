import { LIST_TONE_OPTIONS, resizeItineraryDays, type ListicleItineraryDraft, type ListTone, type LocationOption } from '../../types'
import { ITINERARY_DAY_COUNT_OPTIONS } from '../constants/builder-options.constants'
import { AiTitleInput } from '../../../../shared/markdown-editor'
import type { AiTitleGenerateInput } from '../../../../shared/markdown-editor'
import { BuilderStepHeader } from '../../../../shared/builder/components/BuilderStepHeader'
import {
  findLocationByKey,
  formatLocationLabel,
  getNeighborhoodOptionsForLocation,
  isCityLocation,
} from '../../../../shared/locationScope/scope'

type BuilderSetupPanelProps = {
  draft: ListicleItineraryDraft
  locations: LocationOption[]
  isSynced?: boolean
  onContinue: () => void
  onUpdateSetup: () => void
  onSaveSetup: () => void
  onCancelUpdateSetup: () => void
  updateDraft: (next: Partial<ListicleItineraryDraft>) => void
  onTitleAiGenerate?: (input: AiTitleGenerateInput) => Promise<string>
  onSlugChange?: (slug: string) => void
  onGenerateSlugWithAi?: () => Promise<void>
  isGeneratingSlug?: boolean
  /** Itinerary Autobuild: fill the day slots from the Description brief. */
  onGenerateItinerary?: () => void
  isGeneratingItinerary?: boolean
}

function getAiTitleDisabledReason(draft: ListicleItineraryDraft, isSynced: boolean): string | undefined {
  if (!isSynced && draft.step1_complete && !draft.in_update_mode) return 'Setup is locked'
  if (!draft.location) return 'Set a location first'
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
  onTitleAiGenerate,
  onSlugChange,
  onGenerateSlugWithAi,
  isGeneratingSlug,
  onGenerateItinerary,
  isGeneratingItinerary,
}: BuilderSetupPanelProps) {
  const aiTitleDisabledReason = getAiTitleDisabledReason(draft, isSynced)
  const isSetupLocked = !isSynced && draft.step1_complete && !draft.in_update_mode
  const selectedPrimaryLocation = findLocationByKey(locations, draft.location)
  const neighborhoodOptions = getNeighborhoodOptionsForLocation(locations, draft.location)
  const showNeighborhoodPicker = isCityLocation(selectedPrimaryLocation)

  return (
    <section className="stl-panel">
      <BuilderStepHeader
        stepLabel="Step 1"
        title="Setup"
        isSynced={isSynced}
        isStepComplete={draft.step1_complete}
        isInUpdateMode={draft.in_update_mode}
        onContinue={onContinue}
        onUpdate={onUpdateSetup}
        onSave={onSaveSetup}
        onCancelUpdate={onCancelUpdateSetup}
        updateLabel="Update Setup"
        saveLabel="Save Setup"
      />

      <div className="stl-grid stl-grid-2">
        <label className="stl-field">
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

        <label className="stl-field">
          <span>Itinerary length (days) *</span>
          <select
            value={draft.dayCount}
            disabled={isSetupLocked}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (next === draft.dayCount) return
              if (next < draft.dayCount) {
                const ok = window.confirm(
                  'Fewer days permanently removes lodging and stops on the dropped days. Continue?',
                )
                if (!ok) return
              }
              updateDraft(resizeItineraryDays(draft, next))
            }}
          >
            {ITINERARY_DAY_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'day' : 'days'}
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

        <div className="stl-field">
          <label className="stl-field-label-row">
            <span>List Tone *</span>
          </label>
          <select
            className="stl-field-input"
            value={draft.listTone}
            disabled={isSetupLocked}
            onChange={(event) => updateDraft({ listTone: event.target.value as ListTone })}
            aria-label="List tone for AI-generated copy"
          >
            {LIST_TONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </select>
          <small className="stl-summary-note">
            Sets the editorial register for every blurb and the intro in this itinerary. You can change it any time and re-generate.
          </small>
        </div>

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

      {onGenerateItinerary ? (
        <div className="stl-field stl-autobuild">
          <label className="stl-field-label-row">
            <span>Description (AI Autobuild brief)</span>
          </label>
          <textarea
            className="stl-field-input stl-autobuild-brief"
            rows={5}
            value={draft.generationBrief || ''}
            disabled={isSetupLocked || isGeneratingItinerary}
            placeholder="Describe the experience — e.g. eat at the most luxurious fine-dining spots, premium afternoon, rooftop cocktails, comfortable central hotel, easy access between stops."
            onChange={(event) => updateDraft({ generationBrief: event.target.value })}
          />
          <small className="stl-summary-note">
            The AI reads the title + this brief, queries published listings, and fills the day slots
            (with a reason for each pick). Blurbs and images are not generated. Re-running replaces the current stops.
          </small>
          <div className="stl-autobuild-actions">
            <button
              type="button"
              className="stl-btn stl-btn-primary"
              onClick={() => onGenerateItinerary()}
              disabled={
                isGeneratingItinerary
                || !draft.location
                || !draft.title.trim()
                || !(draft.generationBrief || '').trim()
              }
            >
              {isGeneratingItinerary ? 'Generating itinerary…' : 'Generate itinerary with AI'}
            </button>
          </div>
        </div>
      ) : null}

    </section>
  )
}
