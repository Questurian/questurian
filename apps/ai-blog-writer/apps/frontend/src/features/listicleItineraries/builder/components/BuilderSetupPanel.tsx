import { useMemo, useState } from 'react'
import { LIST_TONE_OPTIONS, resizeItineraryDays, type DayShellId, type DayShellSelection, type DayShellTemplate, type ListicleItineraryDraft, type ListTone, type LocationOption, type TravelerProfile } from '../../types'
import { ITINERARY_DAY_COUNT_OPTIONS } from '../constants/builder-options.constants'
import { DEFAULT_DAY_SHELL_ID, getAvailableDayShells, getDayShellTemplate } from '../constants/day-shells.constants'
import { AiTitleInput } from '../../../../shared/markdown-editor'
import type { AiTitleGenerateInput } from '../../../../shared/markdown-editor'
import { BuilderStepHeader } from '../../../../shared/builder/components/BuilderStepHeader'
import { FieldInfoHint } from '../../../../shared/builder/components/FieldInfoHint'
import { SharedNeighborhoodsModal } from './SharedNeighborhoodsModal'
import { TravelerProfileModal } from './TravelerProfileModal'
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
  /** Traveler Profile: compose a Generation Brief paragraph from the profile. */
  onComposeTravelerBrief?: (profile: TravelerProfile) => Promise<string>
  /** Autobuild Report: open the last run's diagnostic timeline. */
  onViewAutobuildReport?: () => void
  hasAutobuildReport?: boolean
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

function getSharedNeighborhoodsTriggerLabel(
  selectedIds: number[],
  neighborhoodOptions: LocationOption[],
): string {
  if (selectedIds.length === 0) return 'City-wide (no filter)'
  if (selectedIds.length === 1) {
    const match = neighborhoodOptions.find((location) => location.id === selectedIds[0])
    return match ? formatNeighborhoodChipLabel(match) : '1 neighborhood selected'
  }
  return `${selectedIds.length} neighborhoods selected`
}

function formatNeighborhoodChipLabel(location: LocationOption): string {
  const neighborhood = location.neighborhood?.trim()
  if (neighborhood) {
    return neighborhood
      .split(/[\s_-]+/g)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const parts = formatLocationLabel(location).split(' > ')
  return parts[parts.length - 1] ?? formatLocationLabel(location)
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
  onComposeTravelerBrief,
  onViewAutobuildReport,
  hasAutobuildReport = false,
  libraryShells = [],
  onOpenLayoutManager,
}: BuilderSetupPanelProps) {
  const [isSharedNeighborhoodsModalOpen, setIsSharedNeighborhoodsModalOpen] = useState(false)
  const [isTravelerProfileModalOpen, setIsTravelerProfileModalOpen] = useState(false)
  const aiTitleDisabledReason = getAiTitleDisabledReason(draft, isSynced)
  const isSetupLocked = !isSynced && draft.step1_complete && !draft.in_update_mode
  const selectedPrimaryLocation = findLocationByKey(locations, draft.location)
  const neighborhoodOptions = getNeighborhoodOptionsForLocation(locations, draft.location)
  const showNeighborhoodPicker = isCityLocation(selectedPrimaryLocation)
  const firstShellId = draft.days[0] ? getShellIdForDay(draft, draft.days[0].id) : DEFAULT_DAY_SHELL_ID
  const canUseAutobuildBrief = Boolean(draft.title.trim() && draft.location)
  const autobuildBriefDisabledReason = !draft.title.trim()
    ? 'Add a title before writing or using the AI Autobuild brief.'
    : !draft.location
    ? 'Select a location before writing or using the AI Autobuild brief.'
    : undefined

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
          <span>Itinerary Length *</span>
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
            <span className="stl-field-label-with-hint">
              List Tone *
              <FieldInfoHint text="Sets the editorial register for every blurb and the intro in this itinerary. You can change it any time and re-generate." />
            </span>
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
        </div>

        {showNeighborhoodPicker ? (
          <div className="stl-field stl-shared-neighborhoods-field">
            <label className="stl-field-label-row">
              <span className="stl-field-label-with-hint">
                Shared Neighborhoods
                <FieldInfoHint
                  text={
                    neighborhoodOptions.length > 0
                      ? 'Optional. When selected, stop pickers match only these exact neighborhoods.'
                      : 'No neighborhoods are available under this city.'
                  }
                />
              </span>
            </label>
            <button
              type="button"
              className="stl-picker-trigger"
              disabled={isSetupLocked || neighborhoodOptions.length < 1}
              onClick={() => setIsSharedNeighborhoodsModalOpen(true)}
            >
              <span className="stl-picker-trigger__preview">
                <span
                  className={`stl-picker-trigger__label${draft.sharedNeighborhoods.length === 0 ? ' stl-picker-trigger__label--placeholder' : ''}`}
                >
                  {neighborhoodOptions.length > 0
                    ? getSharedNeighborhoodsTriggerLabel(draft.sharedNeighborhoods, neighborhoodOptions)
                    : 'No neighborhoods available'}
                </span>
              </span>
              <span className="stl-picker-trigger__caret">▼</span>
            </button>
            {draft.sharedNeighborhoods.length > 1 ? (
              <div className="stl-shared-neighborhoods-summary">
                {draft.sharedNeighborhoods.map((neighborhoodId) => {
                  const location = neighborhoodOptions.find((entry) => entry.id === neighborhoodId)
                  if (!location) return null
                  return (
                    <span key={neighborhoodId} className="stl-shared-neighborhoods-chip">
                      {formatNeighborhoodChipLabel(location)}
                    </span>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="stl-field stl-day-shells">
        <div className="stl-day-shells__header">
          <div>
            <h3 className="stl-section-heading">
              <span className="stl-field-label-with-hint">
                Day shell
                <FieldInfoHint text="Choose the shape of the day before AI generation. The shell controls stop count, order, meal slots, activity slots, and nightlife slots." />
              </span>
            </h3>
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

        {draft.dayCount > 1 ? (
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
        ) : null}

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
          <div className="stl-field-label-row stl-autobuild-brief-header">
            <span className="stl-field-label-with-hint">
              Description (AI Autobuild brief)
              <FieldInfoHint text="The AI reads the title + this brief, queries published listings, and fills the day slots (with a reason for each pick). Blurbs and images are not generated. Re-running replaces the current stops." />
            </span>
            {onComposeTravelerBrief ? (
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                disabled={isSetupLocked || isGeneratingItinerary || !canUseAutobuildBrief}
                onClick={() => setIsTravelerProfileModalOpen(true)}
              >
                Traveler Profile…
              </button>
            ) : null}
          </div>
          <textarea
            className="stl-field-input stl-autobuild-brief"
            rows={5}
            value={draft.generationBrief || ''}
            disabled={isSetupLocked || isGeneratingItinerary || !canUseAutobuildBrief}
            placeholder="Describe the experience — e.g. eat at the most luxurious fine-dining spots, premium afternoon, rooftop cocktails, comfortable central hotel, easy access between stops."
            onChange={(event) => updateDraft({ generationBrief: event.target.value })}
          />
          {autobuildBriefDisabledReason ? (
            <p className="stl-helper-text">{autobuildBriefDisabledReason}</p>
          ) : null}
          <div className="stl-autobuild-controls">
            <div className="stl-autobuild-actions">
              <button
                type="button"
                className="stl-btn stl-btn-primary"
                onClick={() => onGenerateItinerary()}
                disabled={
                  isGeneratingItinerary
                  || !canUseAutobuildBrief
                  || !(draft.generationBrief || '').trim()
                }
              >
                {isGeneratingItinerary ? 'Generating itinerary…' : 'Generate itinerary with AI'}
              </button>
              {hasAutobuildReport && onViewAutobuildReport ? (
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary"
                  onClick={() => onViewAutobuildReport()}
                >
                  View report
                </button>
              ) : null}
            </div>
            <label className="stl-autobuild-lodging-toggle">
              <input
                type="checkbox"
                checked={draft.includeLodging !== false}
                disabled={isSetupLocked || isGeneratingItinerary || !canUseAutobuildBrief}
                onChange={(event) => updateDraft({ includeLodging: event.target.checked })}
              />
              <span>Include lodging</span>
            </label>
          </div>
        </div>
      ) : null}

      {onComposeTravelerBrief ? (
        <TravelerProfileModal
          isOpen={isTravelerProfileModalOpen}
          profile={draft.travelerProfile}
          onCompose={onComposeTravelerBrief}
          onApply={(profile, brief) => {
            const currentBrief = (draft.generationBrief || '').trim()
            const lastComposed = (draft.travelerProfile?.composedBrief || '').trim()
            if (currentBrief && currentBrief !== lastComposed) {
              const ok = window.confirm(
                'The current brief was written or edited by hand. Replace it with the composed paragraph?',
              )
              if (!ok) return false
            }
            updateDraft({ travelerProfile: profile, generationBrief: brief })
            return true
          }}
          onClose={() => setIsTravelerProfileModalOpen(false)}
        />
      ) : null}

      {showNeighborhoodPicker ? (
        <SharedNeighborhoodsModal
          isOpen={isSharedNeighborhoodsModalOpen}
          neighborhoods={neighborhoodOptions}
          selectedNeighborhoodIds={draft.sharedNeighborhoods}
          onConfirm={(sharedNeighborhoods) => updateDraft({ sharedNeighborhoods })}
          onClose={() => setIsSharedNeighborhoodsModalOpen(false)}
        />
      ) : null}

    </section>
  )
}
