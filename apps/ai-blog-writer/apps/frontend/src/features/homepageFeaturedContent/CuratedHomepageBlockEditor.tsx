import { useMemo, useState } from 'react'
import CuratedHomepageBlockSettings from './CuratedHomepageBlockSettings'
import HomepageFeaturedSlotEditor from './HomepageFeaturedSlotEditor'
import {
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES,
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type ArticleCuratedHomepageBlockResponse,
  type ArticleGridFourLayout,
  type CuratedHomepageBlockType,
  type FeaturedArticlesSlot3Layout,
  type FeaturedArticlesSlot4Layout,
  type FeaturedArticlesSlot5Layout
} from './pageBlocks'
import { useCuratedHomepageLayouts } from './useCuratedHomepageLayouts'
import {
  useHomepageFeaturedSlots,
  type CandidateParams
} from './useHomepageFeaturedSlots'
import { usePageBlockDuplicateExclusion } from './usePageBlockDuplicateExclusion'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection
} from './types'
import EditorialFeaturePanelEditor from './EditorialFeaturePanelEditor'
import AuthorFeaturePanelEditor from './AuthorFeaturePanelEditor'
import type {
  AuthorFeatureFieldsUpdate,
  EditorialFeatureFieldsUpdate
} from './mainHomepage/blocks/blockSettings.api'

type Props = {
  block: ArticleCuratedHomepageBlockResponse
  blockIndex: number
  canManage: boolean
  selectionQueryKey: unknown[]
  saveSelection: (
    items: HomepageFeaturedItemRef[],
    slotCount?: number
  ) => Promise<HomepageFeaturedSelection>
  saveSectionHeading?: (value: string | null) => Promise<void>
  saveSectionSubheading?: (value: string | null) => Promise<void>
  saveCreatorKicker?: (value: string | null) => Promise<void>
  saveSlot3Layout?: (value: FeaturedArticlesSlot3Layout) => Promise<void>
  saveSlot4Layout?: (value: FeaturedArticlesSlot4Layout) => Promise<void>
  saveSlot5Layout?: (value: FeaturedArticlesSlot5Layout) => Promise<void>
  saveArticleGridFourLayout?: (value: ArticleGridFourLayout) => Promise<void>
  convertEmptyFeaturedArticlesTargets?: CuratedHomepageBlockType[]
  onConvertEmptyFeaturedArticlesBlock?: (
    blockType: CuratedHomepageBlockType,
    slotCount: number
  ) => Promise<void>
  fetchCandidates: (
    params: CandidateParams
  ) => Promise<HomepageFeaturedCandidatesResponse>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
  externalUsedKeys?: Set<string>
  onSlotsChange?: (blockId: string, keys: Set<string>) => void
  saveEditorialFeatureFields?: (
    fields: EditorialFeatureFieldsUpdate
  ) => Promise<void>
  saveAuthorFeatureFields?: (fields: AuthorFeatureFieldsUpdate) => Promise<void>
}

export default function CuratedHomepageBlockEditor({
  block,
  blockIndex,
  canManage,
  selectionQueryKey,
  saveSelection,
  saveSectionHeading,
  saveSectionSubheading,
  saveCreatorKicker,
  saveSlot3Layout,
  saveSlot4Layout,
  saveSlot5Layout,
  saveArticleGridFourLayout,
  convertEmptyFeaturedArticlesTargets = CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  onConvertEmptyFeaturedArticlesBlock,
  fetchCandidates,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
  externalUsedKeys,
  onSlotsChange,
  saveEditorialFeatureFields,
  saveAuthorFeatureFields
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[block.blockType]
  const layouts = useCuratedHomepageLayouts({
    block,
    saveSlot3Layout,
    saveSlot4Layout,
    saveSlot5Layout,
    saveArticleGridFourLayout
  })
  const slotEditorState = useHomepageFeaturedSlots({
    canManage,
    selection: block.selection,
    saveSelection,
    fetchCandidates,
    selectionQueryKey,
    lockedCollectionFilter:
      block.blockType === 'questurian-maps'
        ? 'single-type-listicles'
        : undefined,
    candidateAuthorIds:
      block.blockType === 'author-feature'
        ? block.authorCards.map((card) => card.author.id)
        : undefined
  })
  const effectiveSlotEditorState = usePageBlockDuplicateExclusion({
    blockId: block.id,
    slotEditorState,
    externalUsedKeys,
    onSlotsChange
  })

  const convertTargets = useMemo(() => {
    const others = convertEmptyFeaturedArticlesTargets.filter(
      (target) => target !== block.blockType
    )
    return [block.blockType, ...others]
  }, [convertEmptyFeaturedArticlesTargets, block.blockType])

  const { slots, savedSlots, savedInvalidItems, hasUnsavedChanges } =
    slotEditorState
  const savedTotalSlots = block.selection.totalSlots
  const slotsFilled = slots.filter(Boolean).length
  const staleSlotNotice =
    savedInvalidItems.length === 0
      ? null
      : `${savedInvalidItems.length} slot${savedInvalidItems.length === 1 ? '' : 's'} ${savedInvalidItems.length === 1 ? 'has a broken item' : 'have broken items'}. This block stays at ${savedTotalSlots} slot${savedTotalSlots === 1 ? '' : 's'} and is blocked — hidden from the published homepage — until you replace ${savedInvalidItems.length === 1 ? 'it' : 'them'}.`
  const canConvert =
    ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES.includes(block.blockType) &&
    Boolean(onConvertEmptyFeaturedArticlesBlock) &&
    convertTargets.length > 0 &&
    !hasUnsavedChanges &&
    savedSlots.every((slot) => !slot) &&
    savedInvalidItems.length === 0

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
            {slotsFilled} / {slots.length} filled
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

      {staleSlotNotice ? (
        <div className="hf-banner error">{staleSlotNotice}</div>
      ) : null}

      <CuratedHomepageBlockSettings
        block={block}
        blockIndex={blockIndex}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        layoutState={layouts}
        saveSectionHeading={saveSectionHeading}
        saveSectionSubheading={saveSectionSubheading}
        saveCreatorKicker={saveCreatorKicker}
        enableSlot3Layout={
          Boolean(saveSlot3Layout) &&
          block.blockType === 'featured-articles' &&
          savedTotalSlots === 3
        }
        enableSlot4Layout={
          Boolean(saveSlot4Layout) &&
          block.blockType === 'featured-articles' &&
          savedTotalSlots === 4
        }
        enableSlot5Layout={
          Boolean(saveSlot5Layout) &&
          block.blockType === 'featured-articles' &&
          savedTotalSlots === 5
        }
        enableArticleGridFourLayout={
          Boolean(saveArticleGridFourLayout) &&
          block.blockType === 'article-grid' &&
          savedTotalSlots === 4
        }
        slotEditorState={slotEditorState}
        convertTargets={convertTargets}
        canConvert={canConvert}
        onConvert={onConvertEmptyFeaturedArticlesBlock}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlock}
        deleteError={deleteError}
      />

      <div className="hf-block-content">
        {block.blockType === 'editorial-feature' &&
        saveEditorialFeatureFields ? (
          <EditorialFeaturePanelEditor
            block={block}
            canManage={canManage}
            saveFields={saveEditorialFeatureFields}
          />
        ) : null}
        {block.blockType === 'author-feature' && saveAuthorFeatureFields ? (
          <AuthorFeaturePanelEditor
            block={block}
            canManage={canManage}
            saveFields={saveAuthorFeatureFields}
          />
        ) : null}
        {block.sectionHeading?.trim() &&
        block.blockType !== 'featured-creator-article' ? (
          <h2 className="hf-block-section-heading-h2 hf-block-public-section-title">
            {block.sectionHeading.trim()}
          </h2>
        ) : null}
        {block.sectionSubheading?.trim() &&
        block.blockType !== 'featured-creator-article' ? (
          <p className="hf-block-public-section-subtitle">
            {block.sectionSubheading.trim()}
          </p>
        ) : null}
        <HomepageFeaturedSlotEditor
          pageTitle=""
          pageSubtitle={blockConfig.description}
          slotEditorState={effectiveSlotEditorState}
          compact
          suppressToolbar
          variant={block.blockType}
          creatorKicker={
            block.blockType === 'featured-creator-article'
              ? block.creatorKicker?.trim() || block.sectionHeading
              : undefined
          }
          featuredArticlesSlot3Layout={
            block.blockType === 'featured-articles' && savedTotalSlots === 3
              ? layouts.slot3.draft
              : undefined
          }
          featuredArticlesSlot4Layout={
            block.blockType === 'featured-articles' && savedTotalSlots === 4
              ? layouts.slot4.draft
              : undefined
          }
          featuredArticlesSlot5Layout={
            block.blockType === 'featured-articles' && savedTotalSlots === 5
              ? layouts.slot5.draft
              : undefined
          }
          articleGridFourLayout={
            block.blockType === 'article-grid' && savedTotalSlots === 4
              ? layouts.articleGridFour.draft
              : undefined
          }
          editorialFeatureBlock={
            block.blockType === 'editorial-feature' ? block : undefined
          }
          authorFeatureBlock={
            block.blockType === 'author-feature' ? block : undefined
          }
        />
      </div>
    </div>
  )
}
