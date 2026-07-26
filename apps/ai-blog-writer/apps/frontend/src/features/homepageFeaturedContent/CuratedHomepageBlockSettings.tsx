import HomepageBlockConvertSection from './HomepageBlockConvertSection'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockLayoutSection from './HomepageBlockLayoutSection'
import HomepageBlockSectionTextFields from './HomepageBlockSectionTextFields'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
import HomepageBlockSlotCountSection from './HomepageBlockSlotCountSection'
import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
} from './pageBlocks'
import type { CuratedHomepageLayoutsState } from './useCuratedHomepageLayouts'
import type { UseHomepageFeaturedSlotsResult } from './useHomepageFeaturedSlots'

type Props = {
  block: ArticleCuratedHomepageBlockResponse
  blockIndex: number
  token: string | null
  isOpen: boolean
  onClose: () => void
  layoutState: CuratedHomepageLayoutsState
  saveSectionHeading?: (token: string, value: string | null) => Promise<void>
  saveSectionSubheading?: (token: string, value: string | null) => Promise<void>
  enableSlot3Layout: boolean
  enableSlot4Layout: boolean
  enableSlot5Layout: boolean
  enableArticleGridFourLayout: boolean
  slotEditorState: UseHomepageFeaturedSlotsResult
  convertTargets: CuratedHomepageBlockType[]
  canConvert: boolean
  onConvert?: (
    token: string,
    blockType: CuratedHomepageBlockType,
    slotCount: number,
  ) => Promise<void>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}

export default function CuratedHomepageBlockSettings({
  block,
  blockIndex,
  token,
  isOpen,
  onClose,
  layoutState,
  saveSectionHeading,
  saveSectionSubheading,
  enableSlot3Layout,
  enableSlot4Layout,
  enableSlot5Layout,
  enableArticleGridFourLayout,
  slotEditorState,
  convertTargets,
  canConvert,
  onConvert,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
}: Props) {
  const {
    saveMutation,
    slots,
    saveDisabled,
    handleSave,
    handleResizeSlotCount,
    savedInvalidItems,
  } = slotEditorState
  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[block.blockType]
  const slotsFilled = slots.filter(Boolean).length

  return (
    <HomepageBlockSettingsModal
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
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
        </>
      }
    >
      <p className="hf-block-slot-meta hf-block-settings-slot-summary" aria-live="polite">
        {slotsFilled} / {slots.length} filled
      </p>
      <HomepageBlockSectionTextFields
        blockId={block.id}
        token={token}
        sectionHeading={block.sectionHeading}
        sectionSubheading={block.sectionSubheading}
        settingsOpen={isOpen}
        saveSectionHeading={saveSectionHeading}
        saveSectionSubheading={saveSectionSubheading}
      />
      <HomepageBlockSlotCountSection
        blockId={block.id}
        blockType={block.blockType}
        currentSlotCount={slots.length}
        savedSlotCount={block.selection.totalSlots}
        slots={slots}
        invalidSlots={savedInvalidItems.map((item) => item.slot)}
        disabled={!token || saveMutation.isPending}
        isPending={saveMutation.isPending}
        onResize={handleResizeSlotCount}
      />

      {enableSlot3Layout ? (
        <HomepageBlockLayoutSection
          title="Three-slot layout"
          hint="How the three articles are arranged in this block (public homepage follows this)."
          name={`hf-slot3-${block.id}`}
          ariaLabel="Three-slot layout"
          value={layoutState.slot3.draft}
          options={[
            { value: 'hero-left', label: 'Hero left — two stacked on the right' },
            { value: 'featured-center', label: 'Three columns — large feature in the center' },
          ]}
          disabled={!token}
          dirty={layoutState.slot3.dirty}
          isPending={layoutState.slot3.mutation.isPending}
          error={layoutState.slot3.mutation.error}
          onChange={layoutState.slot3.setDraft}
          onReset={() => layoutState.slot3.setDraft(layoutState.slot3.savedValue)}
          onSave={() => layoutState.slot3.mutation.mutate(layoutState.slot3.draft)}
        />
      ) : null}

      {enableSlot4Layout ? (
        <HomepageBlockLayoutSection
          title="Four-slot layout"
          hint="How the four articles are arranged (public homepage follows this)."
          name={`hf-slot4-${block.id}`}
          ariaLabel="Four-slot layout"
          value={layoutState.slot4.draft}
          options={[
            { value: 'sidebar-stack', label: 'Hero column + stacked sidebar (default)' },
            { value: 'one-over-three', label: 'Lead row: text + image, then three columns' },
          ]}
          disabled={!token}
          dirty={layoutState.slot4.dirty}
          isPending={layoutState.slot4.mutation.isPending}
          error={layoutState.slot4.mutation.error}
          onChange={layoutState.slot4.setDraft}
          onReset={() => layoutState.slot4.setDraft(layoutState.slot4.savedValue)}
          onSave={() => layoutState.slot4.mutation.mutate(layoutState.slot4.draft)}
        />
      ) : null}

      {enableSlot5Layout ? (
        <HomepageBlockLayoutSection
          title="Five-slot layout"
          hint="Card grid matches the old default; magazine uses a wide hero and a narrow sidebar."
          name={`hf-slot5-${block.id}`}
          ariaLabel="Five-slot layout"
          value={layoutState.slot5.draft}
          options={[
            { value: 'card-grid', label: 'Card grid (default)' },
            { value: 'hero-sidebar', label: 'Magazine — hero + sidebar stack' },
          ]}
          disabled={!token}
          dirty={layoutState.slot5.dirty}
          isPending={layoutState.slot5.mutation.isPending}
          error={layoutState.slot5.mutation.error}
          onChange={layoutState.slot5.setDraft}
          onReset={() => layoutState.slot5.setDraft(layoutState.slot5.savedValue)}
          onSave={() => layoutState.slot5.mutation.mutate(layoutState.slot5.draft)}
        />
      ) : null}

      {enableArticleGridFourLayout ? (
        <HomepageBlockLayoutSection
          title="Four-card layout"
          hint="One row × four uses wide (16:10) thumbnails. 2×2 uses square (1:1) thumbnails."
          name={`hf-ag4-${block.id}`}
          ariaLabel="Article grid four-slot layout"
          value={layoutState.articleGridFour.draft}
          options={[
            { value: 'four-across', label: 'One row × four — wide images' },
            { value: 'two-by-two', label: '2×2 grid — square images' },
          ]}
          disabled={!token}
          dirty={layoutState.articleGridFour.dirty}
          isPending={layoutState.articleGridFour.mutation.isPending}
          error={layoutState.articleGridFour.mutation.error}
          onChange={layoutState.articleGridFour.setDraft}
          onReset={() =>
            layoutState.articleGridFour.setDraft(layoutState.articleGridFour.savedValue)
          }
          onSave={() =>
            layoutState.articleGridFour.mutation.mutate(layoutState.articleGridFour.draft)
          }
        />
      ) : null}

      {!saveSectionHeading && !canConvert ? (
        <p className="hf-block-settings-hint">
          Choose articles in the grid below, then use <strong>Save</strong> in the footer to
          persist slot picks.
        </p>
      ) : null}

      <HomepageBlockConvertSection
        blockId={block.id}
        currentBlockType={block.blockType}
        currentSlotCount={block.selection.totalSlots}
        token={token}
        convertTargetOptions={convertTargets}
        canConvert={canConvert}
        onConvert={async (currentToken, blockType, slotCount) => {
          if (!onConvert) return
          await onConvert(currentToken, blockType, slotCount)
        }}
        onConverted={onClose}
      />
    </HomepageBlockSettingsModal>
  )
}
