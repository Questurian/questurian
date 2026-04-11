import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { LocationGridPickerModal } from './LocationGridPickerModal'
import LocationGridLayout from './LocationGridLayout'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
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

const SECTION_HEADING_MAX_LEN = 120

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
  /** Persist optional section title (PUT without items). */
  saveLocationGridSectionHeading?: (token: string, value: string | null) => Promise<void>
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
  saveLocationGridSectionHeading,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
}: Props) {
  const savedSectionHeading = block.sectionHeading ?? ''
  const [sectionHeadingDraft, setSectionHeadingDraft] = useState(savedSectionHeading)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const sectionHeadingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSectionHeadingDraft(savedSectionHeading)
  }, [block.id, savedSectionHeading])

  useEffect(() => {
    if (!settingsOpen || !saveLocationGridSectionHeading) return
    const id = window.setTimeout(() => sectionHeadingInputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [settingsOpen, saveLocationGridSectionHeading])

  const headingTrimmed = sectionHeadingDraft.trim()
  const headingDirty = headingTrimmed !== savedSectionHeading.trim()

  const headingMutation = useMutation({
    mutationFn: async (value: string | null) => {
      if (!token || !saveLocationGridSectionHeading) return
      await saveLocationGridSectionHeading(token, value)
    },
  })

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
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    candidatePage,
    handleCandidatePick,
    handleMove,
    handleRemove,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex,
    draftSlots,
    hasAllSlotsFilled,
    hasUnsavedChanges,
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

  const saveNeedsAllSlots =
    hasUnsavedChanges && !hasAllSlotsFilled && Boolean(token) && !saveMutation.isPending

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-label-minimal">{blockConfig.label}</span>
        </div>
        <div className="hf-block-header-actions">
          <span className="hf-block-slot-meta" aria-live="polite">
            {slots.filter(Boolean).length} / {block.selection.totalSlots} filled
          </span>
          <button
            type="button"
            className="hf-btn-icon hf-block-settings-gear"
            title="Block settings — save, delete, section title"
            aria-label="Block settings"
            disabled={!token}
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
                  ? `Fill all ${block.selection.totalSlots} locations before saving.`
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
          {slots.filter(Boolean).length} / {block.selection.totalSlots} filled
        </p>
          {saveLocationGridSectionHeading ? (
            <section className="hf-block-settings-section">
              <h3 className="hf-block-settings-kicker">Section title</h3>
              <p className="hf-block-settings-hint">
                Optional headline shown above this grid on the public site.
              </p>
              <label className="hf-sr-only" htmlFor={`hf-lg-section-${block.id}`}>
                Section title
              </label>
              <input
                ref={sectionHeadingInputRef}
                id={`hf-lg-section-${block.id}`}
                type="text"
                className="hf-block-section-heading-input"
                maxLength={SECTION_HEADING_MAX_LEN}
                placeholder="e.g. Explore destinations"
                value={sectionHeadingDraft}
                onChange={(e) => setSectionHeadingDraft(e.target.value)}
                disabled={!token || headingMutation.isPending}
                autoComplete="off"
              />
              <div className="hf-block-section-heading-row">
                <button
                  type="button"
                  className="hf-btn-ghost"
                  disabled={!token || !headingDirty || headingMutation.isPending}
                  onClick={() => setSectionHeadingDraft(savedSectionHeading)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="hf-btn-primary"
                  disabled={!token || !headingDirty || headingMutation.isPending}
                  onClick={() =>
                    headingMutation.mutate(headingTrimmed === '' ? null : headingTrimmed)}
                >
                  {headingMutation.isPending ? 'Saving…' : 'Save title'}
                </button>
              </div>
              {headingMutation.isError ? (
                <p className="hf-block-section-heading-error">
                  {headingMutation.error instanceof Error
                    ? headingMutation.error.message
                    : 'Failed to save heading.'}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="hf-block-settings-section">
            <h3 className="hf-block-settings-kicker">Saving the grid</h3>
            <p className="hf-block-settings-hint">
              The public homepage expects every slot filled ({block.selection.totalSlots}{' '}
              {childLabel}). Save is only available when all slots have a location and there are no
              duplicate picks.
            </p>
            {saveNeedsAllSlots ? (
              <p className="hf-block-settings-hint" style={{ color: 'var(--accent)' }}>
                You have unsaved changes but the grid is not complete — fill the remaining slots
                before saving.
              </p>
            ) : null}
          </section>
      </HomepageBlockSettingsModal>

      <div className="hf-block-content">
        <p className="hf-panel-desc">
          {blockConfig.description}. This block can only select {childLabel}. Click a card to pick or
          swap a location; use the arrows to reorder.
        </p>

        {savedInvalidItems.length > 0 && (
          <div className="hf-banner warning">{getInvalidMessage(savedInvalidItems.length)}</div>
        )}

        {resultMessage && (
          <div className={`hf-banner ${saveMutation.isError ? 'error' : 'success'}`}>
            {resultMessage}
          </div>
        )}

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
