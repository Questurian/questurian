import type { ReactNode } from 'react'
import {
  LIST_TONE_OPTIONS,
  type ListicleItineraryDraft,
  type ListTone,
  type LocationOption,
} from '../../types'
import { ITINERARY_DAY_COUNT_OPTIONS } from '../constants/builder-options.constants'
import { BuilderStepHeader } from '../../../../shared/builder/components/BuilderStepHeader'
import { FieldInfoHint } from '../../../../shared/builder/components/FieldInfoHint'
import { formatLocationLabel } from '../../../../shared/locationScope/labels'
import { ItineraryTitlePipelineButton } from './ItineraryTitlePipelineButton'

type ItineraryBasicsFieldsProps = {
  draft: ListicleItineraryDraft
  locations: LocationOption[]
  selectedPrimaryLocation: LocationOption | null | undefined
  isSetupLocked: boolean
  isSynced: boolean
  aiTitleDisabledReason?: string
  onContinue: () => void
  onUpdateSetup: () => void
  onSaveSetup: () => void
  onCancelUpdateSetup: () => void
  updateDraft: (next: Partial<ListicleItineraryDraft>) => void
  onDayCountChange: (dayCount: number) => void
  onSlugChange?: (slug: string) => void
  onGenerateSlugWithAi?: () => Promise<void>
  isGeneratingSlug?: boolean
  children?: ReactNode
}

export function ItineraryBasicsFields({
  draft,
  locations,
  selectedPrimaryLocation,
  isSetupLocked,
  isSynced,
  aiTitleDisabledReason,
  onContinue,
  onUpdateSetup,
  onSaveSetup,
  onCancelUpdateSetup,
  updateDraft,
  onDayCountChange,
  onSlugChange,
  onGenerateSlugWithAi,
  isGeneratingSlug,
  children,
}: ItineraryBasicsFieldsProps) {
  return (
    <>
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
            <span className="stl-title-ai-trigger-wrap">
              <ItineraryTitlePipelineButton
                locationLabel={
                  selectedPrimaryLocation
                    ? formatLocationLabel(selectedPrimaryLocation)
                    : null
                }
                defaultDayCount={draft.dayCount}
                onApply={(title) => updateDraft({ title })}
                disabledReason={aiTitleDisabledReason}
              />
            </span>
          </div>
        </label>

        <label className="stl-field">
          <span>Location *</span>
          <select
            value={draft.location}
            disabled={isSetupLocked}
            onChange={(event) =>
              updateDraft({
                location: event.target.value,
                locationRef: null,
                sharedNeighborhoods: [],
              })
            }
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
          <span>Itinerary Length *</span>
          <select
            value={draft.dayCount}
            disabled={isSetupLocked}
            onChange={(event) => onDayCountChange(Number(event.target.value))}
          >
            {ITINERARY_DAY_COUNT_OPTIONS.map((dayCount) => (
              <option key={dayCount} value={dayCount}>
                {dayCount} {dayCount === 1 ? 'day' : 'days'}
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
              onChange={(event) =>
                onSlugChange
                  ? onSlugChange(event.target.value)
                  : updateDraft({ payloadSlug: event.target.value })
              }
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
            <span className="stl-field-label-with-hint">
              List Tone *
              <FieldInfoHint text="Sets the editorial register for every blurb and the intro in this itinerary. You can change it any time and re-generate." />
            </span>
          </label>
          <select
            className="stl-field-input"
            value={draft.listTone}
            disabled={isSetupLocked}
            onChange={(event) =>
              updateDraft({ listTone: event.target.value as ListTone })
            }
            aria-label="List tone for AI-generated copy"
          >
            {LIST_TONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </select>
        </div>
        {children}
      </div>
    </>
  )
}
