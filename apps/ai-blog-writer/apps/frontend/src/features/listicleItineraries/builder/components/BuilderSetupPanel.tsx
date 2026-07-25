import { useState } from 'react'
import { resizeItineraryDays, type ListicleItineraryDraft } from '../../types'
import {
  findLocationByKey,
  getNeighborhoodOptionsForLocation,
} from '../../../../shared/locationScope/lookup'
import { isCityLocation } from '../../../../shared/locationScope/levels'
import { AutobuildBriefField } from './AutobuildBriefField'
import { DayShellSelector } from './DayShellSelector'
import { ItineraryBasicsFields } from './ItineraryBasicsFields'
import { SharedNeighborhoodsField } from './SharedNeighborhoodsField'
import { SharedNeighborhoodsModal } from './SharedNeighborhoodsModal'
import { TravelerProfileModal } from './TravelerProfileModal'
import type { BuilderSetupPanelProps } from './builder-setup-panel.types'
import {
  buildDayShellSelections,
  getShellIdForDay,
} from './day-shell-selection.utils'
import { DEFAULT_DAY_SHELL_ID } from '../constants/day-shells.constants'

function getAiTitleDisabledReason(
  draft: ListicleItineraryDraft,
  isSynced: boolean,
): string | undefined {
  if (!isSynced && draft.step1_complete && !draft.in_update_mode) {
    return 'Setup is locked'
  }
  if (!draft.location) return 'Set a location first'
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
  const [isSharedNeighborhoodsModalOpen, setIsSharedNeighborhoodsModalOpen] =
    useState(false)
  const [isTravelerProfileModalOpen, setIsTravelerProfileModalOpen] =
    useState(false)
  const isSetupLocked =
    !isSynced && draft.step1_complete && !draft.in_update_mode
  const selectedPrimaryLocation = findLocationByKey(locations, draft.location)
  const neighborhoodOptions = getNeighborhoodOptionsForLocation(
    locations,
    draft.location,
  )
  const showNeighborhoodPicker = isCityLocation(selectedPrimaryLocation)
  const canUseAutobuildBrief = Boolean(draft.title.trim() && draft.location)
  const autobuildBriefDisabledReason = !draft.title.trim()
    ? 'Add a title before writing or using the AI Autobuild brief.'
    : !draft.location
      ? 'Select a location before writing or using the AI Autobuild brief.'
      : undefined

  const handleDayCountChange = (nextDayCount: number) => {
    if (nextDayCount === draft.dayCount) return
    if (
      nextDayCount < draft.dayCount &&
      !window.confirm(
        'Fewer days permanently removes lodging and stops on the dropped days. Continue?',
      )
    ) {
      return
    }

    const firstShellId = draft.days[0]
      ? getShellIdForDay(draft, draft.days[0].id)
      : DEFAULT_DAY_SHELL_ID
    const resized = resizeItineraryDays(draft, nextDayCount)
    updateDraft({
      ...resized,
      dayShellSelections: buildDayShellSelections(resized, firstShellId),
    })
  }

  return (
    <section className="stl-panel">
      <ItineraryBasicsFields
        draft={draft}
        locations={locations}
        selectedPrimaryLocation={selectedPrimaryLocation}
        isSetupLocked={isSetupLocked}
        isSynced={isSynced}
        aiTitleDisabledReason={getAiTitleDisabledReason(draft, isSynced)}
        onContinue={onContinue}
        onUpdateSetup={onUpdateSetup}
        onSaveSetup={onSaveSetup}
        onCancelUpdateSetup={onCancelUpdateSetup}
        updateDraft={updateDraft}
        onDayCountChange={handleDayCountChange}
        onSlugChange={onSlugChange}
        onGenerateSlugWithAi={onGenerateSlugWithAi}
        isGeneratingSlug={isGeneratingSlug}
      >
        {showNeighborhoodPicker ? (
          <SharedNeighborhoodsField
            draft={draft}
            neighborhoodOptions={neighborhoodOptions}
            isSetupLocked={isSetupLocked}
            onOpen={() => setIsSharedNeighborhoodsModalOpen(true)}
          />
        ) : null}
      </ItineraryBasicsFields>

      <DayShellSelector
        draft={draft}
        libraryShells={libraryShells}
        isSetupLocked={isSetupLocked}
        updateDraft={updateDraft}
        onOpenLayoutManager={onOpenLayoutManager}
      />

      {onGenerateItinerary ? (
        <AutobuildBriefField
          draft={draft}
          isSetupLocked={isSetupLocked}
          isGeneratingItinerary={isGeneratingItinerary}
          canUseAutobuildBrief={canUseAutobuildBrief}
          disabledReason={autobuildBriefDisabledReason}
          canComposeTravelerBrief={Boolean(onComposeTravelerBrief)}
          hasAutobuildReport={hasAutobuildReport}
          onGenerateItinerary={onGenerateItinerary}
          onOpenTravelerProfile={() => setIsTravelerProfileModalOpen(true)}
          onViewAutobuildReport={onViewAutobuildReport}
          updateDraft={updateDraft}
        />
      ) : null}

      {onComposeTravelerBrief ? (
        <TravelerProfileModal
          isOpen={isTravelerProfileModalOpen}
          profile={draft.travelerProfile}
          onCompose={onComposeTravelerBrief}
          onApply={(profile, brief) => {
            const currentBrief = (draft.generationBrief || '').trim()
            const lastComposed = (
              draft.travelerProfile?.composedBrief || ''
            ).trim()
            if (
              currentBrief &&
              currentBrief !== lastComposed &&
              !window.confirm(
                'The current brief was written or edited by hand. Replace it with the composed paragraph?',
              )
            ) {
              return false
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
          onConfirm={(sharedNeighborhoods) =>
            updateDraft({ sharedNeighborhoods })
          }
          onClose={() => setIsSharedNeighborhoodsModalOpen(false)}
        />
      ) : null}
    </section>
  )
}
