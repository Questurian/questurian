import { useMemo, useState } from 'react'

import HomepageBlockConvertSection from './HomepageBlockConvertSection'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockSectionTextFields from './HomepageBlockSectionTextFields'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
import HomepageBlockSlotCountSection from './HomepageBlockSlotCountSection'
import HotelGridLayout from './HotelGridLayout'
import { HotelGridPickerModal } from './HotelGridPickerModal'
import type {
  HomepageHotelGridCandidatesResponse,
  HomepageHotelGridItemRef,
  HomepageHotelGridSelection
} from './hotelGridTypes'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  isGrowingCarouselBlockType,
  type CuratedHomepageBlockType,
  type HotelOrAttractionGridBlockResponse
} from './pageBlocks'
import {
  useHomepageHotelGridSlots,
  type HotelGridCandidateParams
} from './useHomepageHotelGridSlots'

function getInvalidMessage(
  blockType: HotelOrAttractionGridBlockResponse['blockType'],
  count: number
): string {
  const noun =
    blockType === 'things-to-do-attractions'
      ? 'place'
      : blockType === 'tour-grid'
        ? 'tour'
        : 'hotel'
  const plural =
    blockType === 'things-to-do-attractions'
      ? 'places'
      : blockType === 'tour-grid'
        ? 'tours'
        : 'hotels'
  if (count === 1)
    return `One saved ${noun} is no longer eligible. Replace it before saving again.`
  return `${count} saved ${plural} are no longer eligible. Replace them before saving.`
}

export default function HotelGridBlockEditor({
  block,
  blockIndex,
  canManage,
  selectionQueryKey,
  saveSelection,
  fetchCandidates,
  convertBlockTargets,
  onConvertEmptyBlock,
  saveHotelGridSectionHeading,
  saveHotelGridSectionSubheading,
  onDeleteBlock,
  isDeletingBlock,
  deleteError
}: {
  block: HotelOrAttractionGridBlockResponse
  blockIndex: number
  canManage: boolean
  selectionQueryKey: unknown[]
  saveSelection: (
    items: HomepageHotelGridItemRef[],
    slotCount?: number
  ) => Promise<HomepageHotelGridSelection>
  fetchCandidates: (
    params: HotelGridCandidateParams
  ) => Promise<HomepageHotelGridCandidatesResponse>
  /** Persist optional section title (PUT without items). */
  saveHotelGridSectionHeading?: (value: string | null) => Promise<void>
  saveHotelGridSectionSubheading?: (value: string | null) => Promise<void>
  convertBlockTargets?: CuratedHomepageBlockType[]
  onConvertEmptyBlock?: (
    blockType: CuratedHomepageBlockType,
    slotCount: number
  ) => Promise<void>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}) {
  const savedSectionHeading = block.sectionHeading ?? ''
  const savedSectionSubheading = block.sectionSubheading ?? ''
  const [settingsOpen, setSettingsOpen] = useState(false)

  const slotEditorState = useHomepageHotelGridSlots({
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
    handleRemove,
    handleResizeSlotCount,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex,
    draftSlots,
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
  const growsWithContent = isGrowingCarouselBlockType(block.blockType)
  const itemLabel =
    block.blockType === 'tour-grid'
      ? 'tour'
      : block.blockType === 'things-to-do-attractions'
        ? 'place'
        : 'hotel'

  function handleAppendItem() {
    if (
      !growsWithContent ||
      slots.some((slot) => slot === null) ||
      slots.length >= blockConfig.maxSlotCount
    ) {
      return
    }

    const nextSlotIndex = slots.length
    handleResizeSlotCount(nextSlotIndex + 1)
    setPickerSlotIndex(nextSlotIndex)
  }

  if (selectionQuery.isLoading && draftSlots === null) {
    return (
      <div className="hf-block-section">
        <div className="hf-state-screen">
          <h2>Loading…</h2>
          <p>Fetching saved {blockConfig.label.toLowerCase()}.</p>
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
              : `Failed to load ${blockConfig.label.toLowerCase()}.`}
          </p>
        </div>
      </div>
    )
  }

  const currentSlotItem =
    pickerSlotIndex !== null ? slots[pickerSlotIndex] : null
  const currentSlotId = currentSlotItem?.id ?? null

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-tag">
            {blockConfig.label} · {slots.length} slots
          </span>
        </div>
        <div className="hf-block-header-actions">
          <span className="hf-block-slot-meta" aria-live="polite">
            {slots.filter(Boolean).length} / {slots.length} filled
          </span>
          <button
            type="button"
            className="hf-btn-icon hf-block-settings-gear"
            title="Block settings — section title, change type when empty"
            aria-label="Block settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          <button
            type="button"
            className="hf-btn-primary hf-block-header-save"
            onClick={handleSave}
            disabled={saveDisabled}
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
        </div>
      </div>

      <HomepageBlockSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Block settings"
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
          saveSectionHeading={saveHotelGridSectionHeading}
          saveSectionSubheading={saveHotelGridSectionSubheading}
        />
        {!growsWithContent ? (
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
        ) : null}
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
        {!canConvertEmptyBlock ? (
          <p className="hf-block-settings-hint">
            To change type, clear every slot and save (or discard unsaved edits)
            so there are no saved picks.
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
          {blockConfig.description}.
          {growsWithContent
            ? ` Add cards as needed — ${blockConfig.minSlotCount} minimum, ${blockConfig.maxSlotCount} maximum.`
            : ''}
        </p>
        {savedInvalidItems.length > 0 && (
          <div className="hf-banner warning">
            {getInvalidMessage(block.blockType, savedInvalidItems.length)}
          </div>
        )}
        {resultMessage && (
          <div
            className={`hf-banner ${saveMutation.isError ? 'error' : 'success'}`}
          >
            {resultMessage}
          </div>
        )}
        <HotelGridLayout
          slots={slots}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
          onReorder={handleReorderAll}
          onAppend={growsWithContent ? handleAppendItem : undefined}
          onRemove={
            growsWithContent
              ? (slotIndex) => handleRemove(slotIndex, blockConfig.minSlotCount)
              : undefined
          }
          maxItems={growsWithContent ? blockConfig.maxSlotCount : undefined}
          itemLabel={itemLabel}
        />
      </div>

      {pickerSlotIndex !== null && (
        <HotelGridPickerModal
          slotIndex={pickerSlotIndex}
          candidatesQuery={candidatesQuery}
          searchValue={searchValue}
          candidatePage={candidatePage}
          usedIds={usedIds}
          currentSlotId={currentSlotId}
          onPick={handleCandidatePick}
          onClose={() => setPickerSlotIndex(null)}
          setSearchValue={setSearchValue}
          setCandidatePage={setCandidatePage}
          itemLabel={itemLabel}
        />
      )}
    </div>
  )
}
