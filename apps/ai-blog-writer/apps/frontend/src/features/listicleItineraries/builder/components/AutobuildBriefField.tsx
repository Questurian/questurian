import type { ListicleItineraryDraft } from '../../types'
import { FieldInfoHint } from '../../../../shared/builder/components/FieldInfoHint'

type AutobuildBriefFieldProps = {
  draft: ListicleItineraryDraft
  isSetupLocked: boolean
  isGeneratingItinerary?: boolean
  canUseAutobuildBrief: boolean
  disabledReason?: string
  canComposeTravelerBrief: boolean
  hasAutobuildReport: boolean
  onGenerateItinerary: () => void
  onOpenTravelerProfile: () => void
  onViewAutobuildReport?: () => void
  updateDraft: (next: Partial<ListicleItineraryDraft>) => void
}

export function AutobuildBriefField({
  draft,
  isSetupLocked,
  isGeneratingItinerary,
  canUseAutobuildBrief,
  disabledReason,
  canComposeTravelerBrief,
  hasAutobuildReport,
  onGenerateItinerary,
  onOpenTravelerProfile,
  onViewAutobuildReport,
  updateDraft,
}: AutobuildBriefFieldProps) {
  const controlsDisabled =
    isSetupLocked || isGeneratingItinerary || !canUseAutobuildBrief

  return (
    <div className="stl-field stl-autobuild">
      <div className="stl-field-label-row stl-autobuild-brief-header">
        <span className="stl-field-label-with-hint">
          Description (AI Autobuild brief)
          <FieldInfoHint text="The AI reads the title + this brief, queries published listings, and fills the day slots (with a reason for each pick). Blurbs and images are not generated. Re-running replaces the current stops." />
        </span>
        {canComposeTravelerBrief ? (
          <button
            type="button"
            className="stl-btn stl-btn-secondary"
            disabled={controlsDisabled}
            onClick={onOpenTravelerProfile}
          >
            Traveler Profile…
          </button>
        ) : null}
      </div>
      <textarea
        className="stl-field-input stl-autobuild-brief"
        rows={5}
        value={draft.generationBrief || ''}
        disabled={controlsDisabled}
        placeholder="Describe the experience — e.g. eat at the most luxurious fine-dining spots, premium afternoon, rooftop cocktails, comfortable central hotel, easy access between stops."
        onChange={(event) => updateDraft({ generationBrief: event.target.value })}
      />
      {disabledReason ? <p className="stl-helper-text">{disabledReason}</p> : null}
      <div className="stl-autobuild-controls">
        <div className="stl-autobuild-actions">
          <button
            type="button"
            className="stl-btn stl-btn-primary"
            onClick={onGenerateItinerary}
            disabled={
              isGeneratingItinerary ||
              !canUseAutobuildBrief ||
              !(draft.generationBrief || '').trim()
            }
          >
            {isGeneratingItinerary
              ? 'Generating itinerary…'
              : 'Generate itinerary with AI'}
          </button>
          {hasAutobuildReport && onViewAutobuildReport ? (
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={onViewAutobuildReport}
            >
              View report
            </button>
          ) : null}
        </div>
        <label className="stl-autobuild-lodging-toggle">
          <input
            type="checkbox"
            checked={draft.includeLodging !== false}
            disabled={controlsDisabled}
            onChange={(event) => updateDraft({ includeLodging: event.target.checked })}
          />
          <span>Include lodging</span>
        </label>
      </div>
    </div>
  )
}
