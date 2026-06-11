import { useMemo } from 'react'
import { LIST_TONE_OPTIONS, resizeItineraryDays, type DayShellId, type DayShellSelection, type DayShellTemplate, type ListicleItineraryDraft, type ListTone, type LocationOption } from '../../types'
import { ITINERARY_DAY_COUNT_OPTIONS } from '../constants/builder-options.constants'
import { DEFAULT_DAY_SHELL_ID, getAvailableDayShells, getDayShellTemplate } from '../constants/day-shells.constants'
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
  /** Day Shell Library shells loaded from the backend (Custom Day Shells). */
  libraryShells?: DayShellTemplate[]
  onOpenLayoutManager?: () => void
}

function getAiTitleDisabledReason(draft: ListicleItineraryDraft, isSynced: boolean): string | undefined {
  if (!isSynced && draft.step1_complete && !draft.in_update_mode) return 'Setup is locked'
  if (!draft.location) return 'Set a location first'
  if (!draft.title.trim()) return 'Write a title first, then AI can improve it'
  return undefined
}

function getShellIdForDay(draft: ListicleItineraryDraft, dayId: string): DayShellId {
  return draft.dayShellSelections?.find((entry) => entry.dayId === dayId)?.shellId ?? DEFAULT_DAY_SHELL_ID
}

function buildDayShellSelections(draft: ListicleItineraryDraft, fallbackShellId = DEFAULT_DAY_SHELL_ID): DayShellSelection[] {
  return draft.days.map((day) => ({
    dayId: day.id,
    shellId: getShellIdForDay(draft, day.id) || fallbackShellId,
  }))
}

function setShellForDay(draft: ListicleItineraryDraft, dayId: string, shellId: DayShellId): DayShellSelection[] {
  const current = buildDayShellSelections(draft)
  return current.map((entry) => entry.dayId === dayId ? { ...entry, shellId } : entry)
}

function setShellForAllDays(draft: ListicleItineraryDraft, shellId: DayShellId): DayShellSelection[] {
  return draft.days.map((day) => ({ dayId: day.id, shellId }))
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
  libraryShells = [],
  onOpenLayoutManager,
}: BuilderSetupPanelProps) {
  const aiTitleDisabledReason = getAiTitleDisabledReason(draft, isSynced)
  const isSetupLocked = !isSynced && draft.step1_complete && !draft.in_update_mode
  const selectedPrimaryLocation = findLocationByKey(locations, draft.location)
  const neighborhoodOptions = getNeighborhoodOptionsForLocation(locations, draft.location)
  const showNeighborhoodPicker = isCityLocation(selectedPrimaryLocation)
  const firstShellId = draft.days[0] ? getShellIdForDay(draft, draft.days[0].id) : DEFAULT_DAY_SHELL_ID

  // Dropdown options: built-ins + this draft's snapshots + library shells not yet
  // snapshotted. The draft's copy wins on id collision (snapshot semantics — a
  // later library edit must not change what this itinerary generates).
  const shellOptions = useMemo(() => {
    const draftShells = getAvailableDayShells(draft.customDayShells)
    const knownIds = new Set(draftShells.map((shell) => shell.id))
    const libraryOnly = libraryShells.filter((shell) => !knownIds.has(shell.id) && shell.slots.length > 0)
    return [...draftShells, ...libraryOnly]
  }, [draft.customDayShells, libraryShells])

  /** Selecting a library shell copies its slots into the draft (snapshot-on-select). */
  const snapshotForSelection = (shellId: DayShellId): Pick<ListicleItineraryDraft, 'customDayShells'> | undefined => {
    const draftHasShell = getAvailableDayShells(draft.customDayShells).some((shell) => shell.id === shellId)
    if (draftHasShell) return undefined
    const libraryShell = libraryShells.find((shell) => shell.id === shellId)
    if (!libraryShell) return undefined
    return {
      customDayShells: [
        ...(draft.customDayShells ?? []),
        { ...libraryShell, slots: libraryShell.slots.map((slot) => ({ ...slot })) },
      ],
    }
  }

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
              const resized = resizeItineraryDays(draft, next)
              updateDraft({
                ...resized,
                dayShellSelections: buildDayShellSelections(resized, firstShellId),
              })
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

      <div className="stl-field stl-day-shells">
        <div className="stl-day-shells__header">
          <div>
            <label className="stl-field-label-row">
              <span>Day shell *</span>
            </label>
            <small className="stl-summary-note">
              Choose the shape of the day before AI generation. The shell controls stop count, order, meal slots, activity slots, and nightlife slots.
            </small>
          </div>
          {onOpenLayoutManager ? (
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={onOpenLayoutManager}
            >
              Manage layouts
            </button>
          ) : null}
        </div>

        <div className="stl-day-shell-apply">
          <label className="stl-field stl-day-shell-apply__select">
            <span>Apply shell to all days</span>
            <select
              className="stl-field-input"
              value={firstShellId}
              disabled={isSetupLocked}
              onChange={(event) => {
                const shellId = event.target.value as DayShellId
                updateDraft({
                  ...snapshotForSelection(shellId),
                  dayShellSelections: setShellForAllDays(draft, shellId),
                })
              }}
            >
              {shellOptions.map((shell) => (
                <option key={shell.id} value={shell.id}>
                  {shell.name} — {shell.slots.length} stops
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="stl-day-shell-grid">
          {draft.days.map((day, dayIndex) => {
            const shellId = getShellIdForDay(draft, day.id)
            const shell = getDayShellTemplate(shellId, draft.customDayShells)
            return (
              <div className="stl-day-shell-card" key={day.id}>
                <label className="stl-field">
                  <span>Day {dayIndex + 1} template</span>
                  <select
                    className="stl-field-input"
                    value={shellId}
                    disabled={isSetupLocked}
                    onChange={(event) => {
                      const nextShellId = event.target.value as DayShellId
                      updateDraft({
                        ...snapshotForSelection(nextShellId),
                        dayShellSelections: setShellForDay(draft, day.id, nextShellId),
                      })
                    }}
                  >
                    {shellOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} — {option.slots.length} stops
                      </option>
                    ))}
                  </select>
                </label>
                <p className="stl-day-shell-card__description">{shell.description}</p>
                <p className="stl-day-shell-card__slot-summary">
                  {shell.slots.map((slot) => slot.label).join(' → ')}
                </p>
              </div>
            )
          })}
        </div>
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
