import { LocationGridPickerModal } from './LocationGridPickerModal'
import LocationGridLayout from './LocationGridLayout'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import type {
  HomepageLocationGridCandidatesResponse,
  HomepageLocationGridItemRef,
  HomepageLocationGridLevel,
  HomepageLocationGridSelection,
} from './locationGridTypes'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type LocationGridBlockResponse,
} from './pageBlocks'
import {
  useHomepageLocationGridSlots,
  type LocationGridCandidateParams,
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
  token: string | null
  canManage: boolean
  childLevel: HomepageLocationGridLevel
  selectionQueryKey: unknown[]
  saveSelection: (
    token: string,
    items: HomepageLocationGridItemRef[],
  ) => Promise<HomepageLocationGridSelection>
  fetchCandidates: (
    token: string,
    params: LocationGridCandidateParams,
  ) => Promise<HomepageLocationGridCandidatesResponse>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}

export default function LocationGridBlockEditor({
  block,
  blockIndex,
  token,
  canManage,
  childLevel,
  selectionQueryKey,
  saveSelection,
  fetchCandidates,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
}: Props) {
  const slotEditorState = useHomepageLocationGridSlots({
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

  const currentSlotItem = pickerSlotIndex !== null ? slots[pickerSlotIndex] : null
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
        <p className="hf-panel-desc">
          {blockConfig.description}. This block can only select {childLabel}.
        </p>

        {savedInvalidItems.length > 0 && (
          <div className="hf-banner warning">{getInvalidMessage(savedInvalidItems.length)}</div>
        )}

        {resultMessage && (
          <div className={`hf-banner ${saveMutation.isError ? 'error' : 'success'}`}>
            {resultMessage}
          </div>
        )}

        <div className="hf-slot-controls">
          <span className="hf-panel-desc">
            {slots.filter(Boolean).length} / {block.selection.totalSlots} slots filled
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="hf-btn-ghost"
              onClick={handleReset}
              disabled={!hasUnsavedChanges}
            >
              Discard
            </button>
            <button
              type="button"
              className="hf-btn-primary"
              onClick={handleSave}
              disabled={saveDisabled}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <LocationGridLayout
          slots={slots}
          childLevel={childLevel}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
          onMove={handleMove}
          onRemove={handleRemove}
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
