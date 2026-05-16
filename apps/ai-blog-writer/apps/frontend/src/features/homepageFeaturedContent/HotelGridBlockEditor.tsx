import { useMemo, useState } from 'react'

import HomepageBlockConvertSection from './HomepageBlockConvertSection'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockSectionTextFields from './HomepageBlockSectionTextFields'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
import HotelGridLayout from './HotelGridLayout'
import { HotelGridPickerModal } from './HotelGridPickerModal'
import type {
  HomepageHotelGridCandidatesResponse,
  HomepageHotelGridItemRef,
  HomepageHotelGridSelection
} from './hotelGridTypes'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
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
  token,
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
  token: string | null
  canManage: boolean
  selectionQueryKey: unknown[]
  saveSelection: (
    token: string,
    items: HomepageHotelGridItemRef[]
  ) => Promise<HomepageHotelGridSelection>
  fetchCandidates: (
    token: string,
    params: HotelGridCandidateParams
  ) => Promise<HomepageHotelGridCandidatesResponse>
  /** Persist optional section title (PUT without items). */
  saveHotelGridSectionHeading?: (
    token: string,
    value: string | null
  ) => Promise<void>
  saveHotelGridSectionSubheading?: (
    token: string,
    value: string | null
  ) => Promise<void>
  convertBlockTargets?: CuratedHomepageBlockType[]
  onConvertEmptyBlock?: (
    token: string,
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
    token,
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
            {blockConfig.label} · {block.selection.totalSlots} slots
          </span>
        </div>
        <div className="hf-block-header-actions">
          <span className="hf-block-slot-meta" aria-live="polite">
            {slots.filter(Boolean).length} / {block.selection.totalSlots} filled
          </span>
          <button
            type="button"
            className="hf-btn-icon hf-block-settings-gear"
            title="Block settings — section title, change type when empty"
            aria-label="Block settings"
            disabled={!token}
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
          {slots.filter(Boolean).length} / {block.selection.totalSlots} filled
        </p>
        <HomepageBlockSectionTextFields
          blockId={block.id}
          token={token}
          sectionHeading={block.sectionHeading}
          sectionSubheading={block.sectionSubheading}
          settingsOpen={settingsOpen}
          saveSectionHeading={saveHotelGridSectionHeading}
          saveSectionSubheading={saveHotelGridSectionSubheading}
        />
        <HomepageBlockConvertSection
          blockId={block.id}
          currentBlockType={block.blockType}
          currentSlotCount={block.selection.totalSlots}
          token={token}
          convertTargetOptions={convertTargetOptions}
          canConvert={canConvertEmptyBlock}
          onConvert={async (tok, blockType, slotCount) => {
            if (!onConvertEmptyBlock) return
            await onConvertEmptyBlock(tok, blockType, slotCount)
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
        <p className="hf-panel-desc">{blockConfig.description}.</p>
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
          itemLabel={
            block.blockType === 'tour-grid'
              ? 'tour'
              : block.blockType === 'things-to-do-attractions'
                ? 'place'
                : 'hotel'
          }
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
          itemLabel={
            block.blockType === 'tour-grid'
              ? 'tour'
              : block.blockType === 'things-to-do-attractions'
                ? 'place'
                : 'hotel'
          }
        />
      )}
    </div>
  )
}
