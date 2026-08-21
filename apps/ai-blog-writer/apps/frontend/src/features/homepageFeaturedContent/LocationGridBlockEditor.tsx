import { useMutation } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { LocationGridPickerModal } from './LocationGridPickerModal'
import LocationGridLayout from './LocationGridLayout'
import HomepageBlockConvertSection from './HomepageBlockConvertSection'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockSectionTextFields from './HomepageBlockSectionTextFields'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
import HomepageBlockSlotCountSection from './HomepageBlockSlotCountSection'
import {
  LOCATION_GRID_MEDIA_ASPECTS,
  type HomepageLocationGridCandidatesResponse,
  type HomepageLocationGridItemRef,
  type HomepageLocationGridLevel,
  type HomepageLocationGridSelection,
  type LocationGridMediaAspect
} from './locationGridTypes'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type CuratedHomepageBlockType,
  type LocationGridBlockResponse
} from './pageBlocks'
import {
  useHomepageLocationGridSlots,
  type LocationGridCandidateParams
} from './useHomepageLocationGridSlots'

function getInvalidMessage(count: number): string {
  if (count === 1) {
    return 'One saved location is no longer eligible. Replace it before saving again.'
  }

  return `${count} saved locations are no longer eligible. Replace them before saving.`
}

type Props = {
  block: LocationGridBlockResponse
  blockIndex: number
  canManage: boolean
  childLevel: HomepageLocationGridLevel
  selectionQueryKey: unknown[]
  saveSelection: (
    items: HomepageLocationGridItemRef[],
    slotCount?: number
  ) => Promise<HomepageLocationGridSelection>
  fetchCandidates: (
    params: LocationGridCandidateParams
  ) => Promise<HomepageLocationGridCandidatesResponse>
  /** Persist optional section title (PUT without items). */
  saveLocationGridSectionHeading?: (
    value: string | null
  ) => Promise<void>
  saveLocationGridSectionSubheading?: (
    value: string | null
  ) => Promise<void>
  saveLocationGridMediaAspect?: (
    value: LocationGridMediaAspect
  ) => Promise<void>
  /** When the grid has no saved locations, user may switch block type (section title kept). */
  convertBlockTargets?: CuratedHomepageBlockType[]
  onConvertEmptyBlock?: (
    blockType: CuratedHomepageBlockType,
    slotCount: number
  ) => Promise<void>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}

export default function LocationGridBlockEditor({
  block,
  blockIndex,
  canManage,
  childLevel,
  selectionQueryKey,
  saveSelection,
  fetchCandidates,
  saveLocationGridSectionHeading,
  saveLocationGridSectionSubheading,
  saveLocationGridMediaAspect,
  convertBlockTargets,
  onConvertEmptyBlock,
  onDeleteBlock,
  isDeletingBlock,
  deleteError
}: Props) {
  const savedSectionHeading = block.sectionHeading ?? ''
  const savedSectionSubheading = block.sectionSubheading ?? ''
  const savedMediaAspect: LocationGridMediaAspect =
    block.mediaAspect ?? 'rectangle'
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mediaAspectDraft, setMediaAspectDraft] =
    useState<LocationGridMediaAspect>(savedMediaAspect)

  useEffect(() => {
    setMediaAspectDraft(savedMediaAspect)
  }, [savedMediaAspect])

  const mediaAspectDirty = mediaAspectDraft !== savedMediaAspect

  const mediaAspectMutation = useMutation({
    mutationFn: async (value: LocationGridMediaAspect) => {
      if (!saveLocationGridMediaAspect) return
      await saveLocationGridMediaAspect(value)
    }
  })

  const slotEditorState = useHomepageLocationGridSlots({
    canManage,
    selection: block.selection,
    saveSelection,
    fetchCandidates,
    selectionQueryKey
  })

  const {
    selectionQuery,
    candidatesQuery,
    saveMutation,
    slots,
    savedSlots,
    savedInvalidItems,
    pickerSlotIndex,
    usedIds,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    candidatePage,
    handleCandidatePick,
    handleReorderAll,
    handleResizeSlotCount,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex,
    draftSlots,
    hasAllSlotsFilled,
    hasUnsavedChanges
  } = slotEditorState

  const convertTargetOptions = useMemo(() => {
    const list = convertBlockTargets ?? []
    const others = list.filter((t) => t !== block.blockType)
    return [block.blockType, ...others]
  }, [convertBlockTargets, block.blockType])

  const canConvertEmptyBlock =
    Boolean(onConvertEmptyBlock) &&
    convertTargetOptions.length > 0 &&
    !hasUnsavedChanges &&
    savedSlots.every((s) => !s) &&
    savedInvalidItems.length === 0

  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[block.blockType]
  const childLabel = childLevel === 'city' ? 'cities' : 'neighborhoods'

  if (selectionQuery.isLoading && draftSlots === null) {
    return (
      <div className="hf-block-section">
        <div className="hf-state-screen">
          <h2>Loading…</h2>
          <p>Fetching saved location grid.</p>
        </div>
      </div>
    )
  }

  if (selectionQuery.error && draftSlots === null) {
    return (
      <div className="hf-block-section">
        <div className="hf-state-screen">
          <h2>{blockConfig.label}</h2>
          <p>
            {selectionQuery.error instanceof Error
              ? selectionQuery.error.message
              : 'Failed to load location grid.'}
          </p>
        </div>
      </div>
    )
  }

  const currentSlotItem =
    pickerSlotIndex !== null ? slots[pickerSlotIndex] : null
  const currentSlotId = currentSlotItem?.id ?? null

  // No signed-in conjunct here: this editor renders only under RequireAuth,
  // so the guard this replaced was already unreachable (ADR-0028).
  const saveNeedsAllSlots =
    hasUnsavedChanges && !hasAllSlotsFilled && !saveMutation.isPending

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-label-minimal">
            {blockConfig.label}
          </span>
        </div>
        <div className="hf-block-header-actions">
          <span className="hf-block-slot-meta" aria-live="polite">
            {slots.filter(Boolean).length} / {slots.length} filled
          </span>
          <button
            type="button"
            className="hf-btn-icon hf-block-settings-gear"
            title="Block settings — save, delete, section title"
            aria-label="Block settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </div>
      </div>

      <HomepageBlockSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="hf-btn-primary hf-block-header-save"
              onClick={handleSave}
              disabled={saveDisabled}
              title={
                saveNeedsAllSlots
                  ? `Fill all ${slots.length} locations before saving.`
                  : undefined
              }
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <HomepageBlockDeleteTrigger
              blockId={block.id}
              blockIndex={blockIndex}
              blockLabel={blockConfig.label}
              onDeleteBlock={onDeleteBlock}
              isDeletingBlock={isDeletingBlock}
              deleteError={deleteError}
            />
          </>
        }
      >
        <p
          className="hf-block-slot-meta hf-block-settings-slot-summary"
          aria-live="polite"
        >
          {slots.filter(Boolean).length} / {slots.length} filled
        </p>
        <HomepageBlockSectionTextFields
          blockId={block.id}
          sectionHeading={block.sectionHeading}
          sectionSubheading={block.sectionSubheading}
          settingsOpen={settingsOpen}
          saveSectionHeading={saveLocationGridSectionHeading}
          saveSectionSubheading={saveLocationGridSectionSubheading}
        />

        <HomepageBlockSlotCountSection
          blockId={block.id}
          blockType={block.blockType}
          currentSlotCount={slots.length}
          savedSlotCount={block.selection.totalSlots}
          slots={slots}
          invalidSlots={savedInvalidItems.map((item) => item.slot)}
          disabled={saveMutation.isPending}
          isPending={saveMutation.isPending}
          onResize={handleResizeSlotCount}
        />

        {saveLocationGridMediaAspect ? (
          <section className="hf-block-settings-section">
            <h3 className="hf-block-settings-kicker">Card image shape</h3>
            <p className="hf-block-settings-hint">
              Aspect ratio for each location cover image in this grid (editor
              preview matches the public homepage).
            </p>
            <div
              className="hf-slot3-layout-options"
              role="radiogroup"
              aria-label="Location grid image shape"
            >
              {LOCATION_GRID_MEDIA_ASPECTS.map((aspect) => (
                <label key={aspect} className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-lg-aspect-${block.id}`}
                    checked={mediaAspectDraft === aspect}
                    onChange={() => setMediaAspectDraft(aspect)}
                    disabled={mediaAspectMutation.isPending}
                  />
                  <span>
                    {aspect === 'rectangle'
                      ? 'Rectangle — wide (16:10)'
                      : aspect === 'square'
                        ? 'Square — 1:1'
                        : 'Portrait — taller (3:4, not phone-tall)'}
                  </span>
                </label>
              ))}
            </div>
            <div className="hf-block-section-heading-row">
              <button
                type="button"
                className="hf-btn-ghost"
                disabled={!mediaAspectDirty || mediaAspectMutation.isPending}
                onClick={() => setMediaAspectDraft(savedMediaAspect)}
              >
                Reset
              </button>
              <button
                type="button"
                className="hf-btn-primary"
                disabled={!mediaAspectDirty || mediaAspectMutation.isPending}
                onClick={() => mediaAspectMutation.mutate(mediaAspectDraft)}
              >
                {mediaAspectMutation.isPending ? 'Saving…' : 'Save shape'}
              </button>
            </div>
            {mediaAspectMutation.isError ? (
              <p className="hf-block-section-heading-error">
                {mediaAspectMutation.error instanceof Error
                  ? mediaAspectMutation.error.message
                  : 'Failed to save image shape.'}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="hf-block-settings-section">
          <h3 className="hf-block-settings-kicker">Saving the grid</h3>
          <p className="hf-block-settings-hint">
            The public homepage expects every slot filled (
            {slots.length} {childLabel}). Save is only available
            when all slots have a location and there are no duplicate picks.
          </p>
          {saveNeedsAllSlots ? (
            <p
              className="hf-block-settings-hint"
              style={{ color: 'var(--accent)' }}
            >
              You have unsaved changes but the grid is not complete — fill the
              remaining slots before saving.
            </p>
          ) : null}
        </section>

        <HomepageBlockConvertSection
          blockId={block.id}
          currentBlockType={block.blockType}
          currentSlotCount={block.selection.totalSlots}
          convertTargetOptions={convertTargetOptions}
          canConvert={canConvertEmptyBlock}
          onConvert={async (blockType, slotCount) => {
            if (!onConvertEmptyBlock) return
            await onConvertEmptyBlock(blockType, slotCount)
          }}
          onConverted={() => setSettingsOpen(false)}
        />
        {onConvertEmptyBlock && !canConvertEmptyBlock ? (
          <p className="hf-block-settings-hint">
            To change type, remove every location, save an empty grid (or
            discard unsaved edits), and fix any invalid picks first.
          </p>
        ) : null}
      </HomepageBlockSettingsModal>

      <div className="hf-block-content">
        {savedSectionHeading.trim() ? (
          <h2 className="hf-block-section-heading-h2 hf-block-public-section-title">
            {savedSectionHeading.trim()}
          </h2>
        ) : null}
        {savedSectionSubheading.trim() ? (
          <p className="hf-block-public-section-subtitle">
            {savedSectionSubheading.trim()}
          </p>
        ) : null}
        <p className="hf-panel-desc">
          {blockConfig.description}. This block can only select {childLabel}.
          Click a card to pick or swap a location; drag handles swap slot
          positions.
        </p>

        {savedInvalidItems.length > 0 && (
          <div className="hf-banner warning">
            {getInvalidMessage(savedInvalidItems.length)}
          </div>
        )}

        {resultMessage && (
          <div
            className={`hf-banner ${saveMutation.isError ? 'error' : 'success'}`}
          >
            {resultMessage}
          </div>
        )}

        <LocationGridLayout
          slots={slots}
          childLevel={childLevel}
          mediaAspect={mediaAspectDraft}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
          onReorder={handleReorderAll}
        />
      </div>

      {pickerSlotIndex !== null && (
        <LocationGridPickerModal
          slotIndex={pickerSlotIndex}
          childLevel={childLevel}
          candidatesQuery={candidatesQuery}
          searchValue={searchValue}
          candidatePage={candidatePage}
          usedIds={usedIds}
          currentSlotId={currentSlotId}
          onPick={handleCandidatePick}
          onClose={() => setPickerSlotIndex(null)}
          setSearchValue={setSearchValue}
          setCandidatePage={setCandidatePage}
        />
      )}
    </div>
  )
}
