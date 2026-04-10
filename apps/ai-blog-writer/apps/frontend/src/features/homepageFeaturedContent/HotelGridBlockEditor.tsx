import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HotelGridLayout from './HotelGridLayout'
import { HotelGridPickerModal } from './HotelGridPickerModal'
import type {
  HomepageHotelGridCandidatesResponse,
  HomepageHotelGridItemRef,
  HomepageHotelGridSelection,
} from './hotelGridTypes'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type HotelOrAttractionGridBlockResponse,
} from './pageBlocks'
import {
  useHomepageHotelGridSlots,
  type HotelGridCandidateParams,
} from './useHomepageHotelGridSlots'

function getInvalidMessage(blockType: HotelOrAttractionGridBlockResponse['blockType'], count: number): string {
  const noun = blockType === 'things-to-do-attractions' ? 'place' : 'hotel'
  const plural = blockType === 'things-to-do-attractions' ? 'places' : 'hotels'
  if (count === 1) return `One saved ${noun} is no longer eligible. Replace it before saving again.`
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
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
}: {
  block: HotelOrAttractionGridBlockResponse
  blockIndex: number
  token: string | null
  canManage: boolean
  selectionQueryKey: unknown[]
  saveSelection: (token: string, items: HomepageHotelGridItemRef[]) => Promise<HomepageHotelGridSelection>
  fetchCandidates: (
    token: string,
    params: HotelGridCandidateParams,
  ) => Promise<HomepageHotelGridCandidatesResponse>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}) {
  const slotEditorState = useHomepageHotelGridSlots({
    token,
    canManage,
    fetchSelection: () => Promise.resolve(block.selection),
    saveSelection,
    fetchCandidates,
    selectionQueryKey,
  })

  const {
    selectionQuery,
    candidatesQuery,
    saveMutation,
    slots,
    savedInvalidItems,
    pickerSlotIndex,
    usedIds,
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    candidatePage,
    handleCandidatePick,
    handleMove,
    handleRemove,
    handleReset,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex,
    draftSlots,
  } = slotEditorState

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

  const currentSlotItem = pickerSlotIndex !== null ? slots[pickerSlotIndex] : null
  const currentSlotId = currentSlotItem?.id ?? null

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-tag">{blockConfig.label} · {block.selection.totalSlots} slots</span>
        </div>
        <HomepageBlockDeleteTrigger
          blockId={block.id}
          blockIndex={blockIndex}
          blockLabel={blockConfig.label}
          onDeleteBlock={onDeleteBlock}
          isDeletingBlock={isDeletingBlock}
          deleteError={deleteError}
        />
      </div>
      <div className="hf-block-content">
        <p className="hf-panel-desc">{blockConfig.description}.</p>
        {savedInvalidItems.length > 0 && (
          <div className="hf-banner warning">
            {getInvalidMessage(block.blockType, savedInvalidItems.length)}
          </div>
        )}
        {resultMessage && (
          <div className={`hf-banner ${saveMutation.isError ? 'error' : 'success'}`}>{resultMessage}</div>
        )}
        <div className="hf-slot-controls">
          <span className="hf-panel-desc">{slots.filter(Boolean).length} / {block.selection.totalSlots} slots filled</span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="button" className="hf-btn-ghost" onClick={handleReset} disabled={!hasUnsavedChanges}>
              Discard
            </button>
            <button type="button" className="hf-btn-primary" onClick={handleSave} disabled={saveDisabled}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <HotelGridLayout
          slots={slots}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
          onMove={handleMove}
          onRemove={handleRemove}
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
        />
      )}
    </div>
  )
}
