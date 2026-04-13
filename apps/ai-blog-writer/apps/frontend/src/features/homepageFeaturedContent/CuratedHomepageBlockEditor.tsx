import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import HomepageBlockConvertSection from './HomepageBlockConvertSection'
import HomepageBlockSectionTextFields from './HomepageBlockSectionTextFields'
import HomepageFeaturedSlotEditor from './HomepageFeaturedSlotEditor'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
import {
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES,
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type ArticleCuratedHomepageBlockResponse,
  type ArticleGridBlockResponse,
  type ArticleGridFourLayout,
  type CuratedHomepageBlockType,
  type FeaturedArticlesBlockResponse,
  type FeaturedArticlesSlot3Layout,
  type FeaturedArticlesSlot4Layout,
  type FeaturedArticlesSlot5Layout,
} from './pageBlocks'
import { useHomepageFeaturedSlots, type CandidateParams } from './useHomepageFeaturedSlots'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'

function slot3LayoutForBlock(block: ArticleCuratedHomepageBlockResponse): FeaturedArticlesSlot3Layout {
  if (block.blockType !== 'featured-articles' || block.selection.totalSlots !== 3) {
    return 'hero-left'
  }
  return (block as FeaturedArticlesBlockResponse).slot3Layout ?? 'hero-left'
}

function slot4LayoutForBlock(block: ArticleCuratedHomepageBlockResponse): FeaturedArticlesSlot4Layout {
  if (block.blockType !== 'featured-articles' || block.selection.totalSlots !== 4) {
    return 'sidebar-stack'
  }
  return (block as FeaturedArticlesBlockResponse).slot4Layout ?? 'sidebar-stack'
}

function slot5LayoutForBlock(block: ArticleCuratedHomepageBlockResponse): FeaturedArticlesSlot5Layout {
  if (block.blockType !== 'featured-articles' || block.selection.totalSlots !== 5) {
    return 'card-grid'
  }
  return (block as FeaturedArticlesBlockResponse).slot5Layout ?? 'card-grid'
}

function articleGridFourLayoutForBlock(
  block: ArticleCuratedHomepageBlockResponse,
): ArticleGridFourLayout {
  if (block.blockType !== 'article-grid' || block.selection.totalSlots !== 4) {
    return 'four-across'
  }
  return (block as ArticleGridBlockResponse).articleGridFourLayout ?? 'four-across'
}

type Props = {
  block: ArticleCuratedHomepageBlockResponse
  blockIndex: number
  token: string | null
  canManage: boolean
  selectionQueryKey: unknown[]
  saveSelection: (
    token: string,
    items: HomepageFeaturedItemRef[],
  ) => Promise<HomepageFeaturedSelection>
  /** Persist optional section title (PUT without items). */
  saveSectionHeading?: (token: string, value: string | null) => Promise<void>
  saveSectionSubheading?: (token: string, value: string | null) => Promise<void>
  /** Persist 3-slot layout for Featured Articles (PUT without items). */
  saveSlot3Layout?: (token: string, value: FeaturedArticlesSlot3Layout) => Promise<void>
  /** Persist 4-slot layout for Featured Articles (PUT without items). */
  saveSlot4Layout?: (token: string, value: FeaturedArticlesSlot4Layout) => Promise<void>
  saveSlot5Layout?: (token: string, value: FeaturedArticlesSlot5Layout) => Promise<void>
  /** Article Grid with 4 slots: one row × four (wide) vs 2×2 (square). */
  saveArticleGridFourLayout?: (token: string, value: ArticleGridFourLayout) => Promise<void>
  /**
   * When this article-curated block has no saved items, user can switch type (section title kept).
   * Defaults to {@link CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES} when unset.
   */
  convertEmptyFeaturedArticlesTargets?: CuratedHomepageBlockType[]
  onConvertEmptyFeaturedArticlesBlock?: (
    token: string,
    blockType: CuratedHomepageBlockType,
    slotCount: number,
  ) => Promise<void>
  fetchCandidates: (
    token: string,
    params: CandidateParams,
  ) => Promise<HomepageFeaturedCandidatesResponse>
  onDeleteBlock: (blockId: string) => void
  isDeletingBlock: boolean
  deleteError: string | null
}

export default function CuratedHomepageBlockEditor({
  block,
  blockIndex,
  token,
  canManage,
  selectionQueryKey,
  saveSelection,
  saveSectionHeading,
  saveSectionSubheading,
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
}: Props) {
  const savedSectionHeading = block.sectionHeading ?? ''
  const savedSectionSubheading = block.sectionSubheading ?? ''

  const [slot3LayoutDraft, setSlot3LayoutDraft] = useState<FeaturedArticlesSlot3Layout>(() =>
    slot3LayoutForBlock(block),
  )
  const [slot4LayoutDraft, setSlot4LayoutDraft] = useState<FeaturedArticlesSlot4Layout>(() =>
    slot4LayoutForBlock(block),
  )
  const [slot5LayoutDraft, setSlot5LayoutDraft] = useState<FeaturedArticlesSlot5Layout>(() =>
    slot5LayoutForBlock(block),
  )
  const [articleGridFourLayoutDraft, setArticleGridFourLayoutDraft] = useState<ArticleGridFourLayout>(
    () => articleGridFourLayoutForBlock(block),
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  const convertTargets = useMemo(() => {
    const list =
      convertEmptyFeaturedArticlesTargets.length > 0 ? convertEmptyFeaturedArticlesTargets : []
    const others = list.filter((t) => t !== block.blockType)
    return [block.blockType, ...others]
  }, [convertEmptyFeaturedArticlesTargets, block.blockType])

  const savedSlot3Layout = slot3LayoutForBlock(block)

  useEffect(() => {
    setSlot3LayoutDraft(savedSlot3Layout)
  }, [savedSlot3Layout])

  const savedSlot4Layout = slot4LayoutForBlock(block)

  useEffect(() => {
    setSlot4LayoutDraft(savedSlot4Layout)
  }, [savedSlot4Layout])

  const savedSlot5Layout = slot5LayoutForBlock(block)

  useEffect(() => {
    setSlot5LayoutDraft(savedSlot5Layout)
  }, [savedSlot5Layout])

  const savedArticleGridFourLayout = articleGridFourLayoutForBlock(block)

  useEffect(() => {
    setArticleGridFourLayoutDraft(savedArticleGridFourLayout)
  }, [savedArticleGridFourLayout])

  const slot3LayoutDirty = slot3LayoutDraft !== savedSlot3Layout
  const slot4LayoutDirty = slot4LayoutDraft !== savedSlot4Layout
  const slot5LayoutDirty = slot5LayoutDraft !== savedSlot5Layout
  const articleGridFourLayoutDirty = articleGridFourLayoutDraft !== savedArticleGridFourLayout

  const slot3LayoutMutation = useMutation({
    mutationFn: async (value: FeaturedArticlesSlot3Layout) => {
      if (!token || !saveSlot3Layout) return
      await saveSlot3Layout(token, value)
    },
  })

  const slot4LayoutMutation = useMutation({
    mutationFn: async (value: FeaturedArticlesSlot4Layout) => {
      if (!token || !saveSlot4Layout) return
      await saveSlot4Layout(token, value)
    },
  })

  const slot5LayoutMutation = useMutation({
    mutationFn: async (value: FeaturedArticlesSlot5Layout) => {
      if (!token || !saveSlot5Layout) return
      await saveSlot5Layout(token, value)
    },
  })

  const articleGridFourLayoutMutation = useMutation({
    mutationFn: async (value: ArticleGridFourLayout) => {
      if (!token || !saveArticleGridFourLayout) return
      await saveArticleGridFourLayout(token, value)
    },
  })

  const slotEditorState = useHomepageFeaturedSlots({
    token,
    canManage,
    fetchSelection: () => Promise.resolve(block.selection),
    saveSelection,
    fetchCandidates,
    selectionQueryKey,
    lockedCollectionFilter:
      block.blockType === 'questurian-maps' ? 'single-type-listicles' : undefined,
  })

  const {
    selectionQuery,
    saveMutation,
    slots,
    saveDisabled,
    handleSave,
    savedSlots,
    savedInvalidItems,
    hasUnsavedChanges,
  } = slotEditorState

  const totalSlots = block.selection.totalSlots
  const slotsFilled = slots.filter(Boolean).length
  const slotsTotal = selectionQuery.data?.totalSlots ?? slots.length
  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[block.blockType]

  const canConvertEmptyFeaturedArticles =
    ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES.includes(block.blockType)
    && Boolean(onConvertEmptyFeaturedArticlesBlock)
    && convertTargets.length > 0
    && !hasUnsavedChanges
    && savedSlots.every((s) => !s)
    && savedInvalidItems.length === 0

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-tag">{blockConfig.label} · {totalSlots} slots</span>
        </div>
        <div className="hf-block-header-actions">
          <span className="hf-block-slot-meta" aria-live="polite">
            {slotsFilled} / {slotsTotal} filled
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
          {slotsFilled} / {slotsTotal} filled
        </p>
          <HomepageBlockSectionTextFields
            blockId={block.id}
            token={token}
            sectionHeading={block.sectionHeading}
            sectionSubheading={block.sectionSubheading}
            settingsOpen={settingsOpen}
            saveSectionHeading={saveSectionHeading}
            saveSectionSubheading={saveSectionSubheading}
          />

          {saveSlot3Layout &&
          block.blockType === 'featured-articles' &&
          block.selection.totalSlots === 3 ? (
            <section className="hf-block-settings-section">
              <h3 className="hf-block-settings-kicker">Three-slot layout</h3>
              <p className="hf-block-settings-hint">
                How the three articles are arranged in this block (public homepage follows this).
              </p>
              <div
                className="hf-slot3-layout-options"
                role="radiogroup"
                aria-label="Three-slot layout"
              >
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-slot3-${block.id}`}
                    checked={slot3LayoutDraft === 'hero-left'}
                    onChange={() => setSlot3LayoutDraft('hero-left')}
                    disabled={!token || slot3LayoutMutation.isPending}
                  />
                  <span>
                    Hero left — two stacked on the right
                  </span>
                </label>
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-slot3-${block.id}`}
                    checked={slot3LayoutDraft === 'featured-center'}
                    onChange={() => setSlot3LayoutDraft('featured-center')}
                    disabled={!token || slot3LayoutMutation.isPending}
                  />
                  <span>
                    Three columns — large feature in the center
                  </span>
                </label>
              </div>
              <div className="hf-block-section-heading-row">
                <button
                  type="button"
                  className="hf-btn-ghost"
                  disabled={!token || !slot3LayoutDirty || slot3LayoutMutation.isPending}
                  onClick={() => setSlot3LayoutDraft(savedSlot3Layout)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="hf-btn-primary"
                  disabled={!token || !slot3LayoutDirty || slot3LayoutMutation.isPending}
                  onClick={() => slot3LayoutMutation.mutate(slot3LayoutDraft)}
                >
                  {slot3LayoutMutation.isPending ? 'Saving…' : 'Save layout'}
                </button>
              </div>
              {slot3LayoutMutation.isError ? (
                <p className="hf-block-section-heading-error">
                  {slot3LayoutMutation.error instanceof Error
                    ? slot3LayoutMutation.error.message
                    : 'Failed to save layout.'}
                </p>
              ) : null}
            </section>
          ) : null}

          {saveSlot4Layout &&
          block.blockType === 'featured-articles' &&
          block.selection.totalSlots === 4 ? (
            <section className="hf-block-settings-section">
              <h3 className="hf-block-settings-kicker">Four-slot layout</h3>
              <p className="hf-block-settings-hint">
                How the four articles are arranged (public homepage follows this).
              </p>
              <div
                className="hf-slot3-layout-options"
                role="radiogroup"
                aria-label="Four-slot layout"
              >
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-slot4-${block.id}`}
                    checked={slot4LayoutDraft === 'sidebar-stack'}
                    onChange={() => setSlot4LayoutDraft('sidebar-stack')}
                    disabled={!token || slot4LayoutMutation.isPending}
                  />
                  <span>Hero column + stacked sidebar (default)</span>
                </label>
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-slot4-${block.id}`}
                    checked={slot4LayoutDraft === 'one-over-three'}
                    onChange={() => setSlot4LayoutDraft('one-over-three')}
                    disabled={!token || slot4LayoutMutation.isPending}
                  />
                  <span>Lead row: text + image, then three columns</span>
                </label>
              </div>
              <div className="hf-block-section-heading-row">
                <button
                  type="button"
                  className="hf-btn-ghost"
                  disabled={!token || !slot4LayoutDirty || slot4LayoutMutation.isPending}
                  onClick={() => setSlot4LayoutDraft(savedSlot4Layout)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="hf-btn-primary"
                  disabled={!token || !slot4LayoutDirty || slot4LayoutMutation.isPending}
                  onClick={() => slot4LayoutMutation.mutate(slot4LayoutDraft)}
                >
                  {slot4LayoutMutation.isPending ? 'Saving…' : 'Save layout'}
                </button>
              </div>
              {slot4LayoutMutation.isError ? (
                <p className="hf-block-section-heading-error">
                  {slot4LayoutMutation.error instanceof Error
                    ? slot4LayoutMutation.error.message
                    : 'Failed to save layout.'}
                </p>
              ) : null}
            </section>
          ) : null}

          {saveSlot5Layout &&
          block.blockType === 'featured-articles' &&
          block.selection.totalSlots === 5 ? (
            <section className="hf-block-settings-section">
              <h3 className="hf-block-settings-kicker">Five-slot layout</h3>
              <p className="hf-block-settings-hint">
                Card grid matches the old default; magazine uses a wide hero and a narrow sidebar
                (section title above the block still comes from Section title).
              </p>
              <div
                className="hf-slot3-layout-options"
                role="radiogroup"
                aria-label="Five-slot layout"
              >
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-slot5-${block.id}`}
                    checked={slot5LayoutDraft === 'card-grid'}
                    onChange={() => setSlot5LayoutDraft('card-grid')}
                    disabled={!token || slot5LayoutMutation.isPending}
                  />
                  <span>Card grid (default)</span>
                </label>
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-slot5-${block.id}`}
                    checked={slot5LayoutDraft === 'hero-sidebar'}
                    onChange={() => setSlot5LayoutDraft('hero-sidebar')}
                    disabled={!token || slot5LayoutMutation.isPending}
                  />
                  <span>Magazine — hero + sidebar stack</span>
                </label>
              </div>
              <div className="hf-block-section-heading-row">
                <button
                  type="button"
                  className="hf-btn-ghost"
                  disabled={!token || !slot5LayoutDirty || slot5LayoutMutation.isPending}
                  onClick={() => setSlot5LayoutDraft(savedSlot5Layout)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="hf-btn-primary"
                  disabled={!token || !slot5LayoutDirty || slot5LayoutMutation.isPending}
                  onClick={() => slot5LayoutMutation.mutate(slot5LayoutDraft)}
                >
                  {slot5LayoutMutation.isPending ? 'Saving…' : 'Save layout'}
                </button>
              </div>
              {slot5LayoutMutation.isError ? (
                <p className="hf-block-section-heading-error">
                  {slot5LayoutMutation.error instanceof Error
                    ? slot5LayoutMutation.error.message
                    : 'Failed to save layout.'}
                </p>
              ) : null}
            </section>
          ) : null}

          {saveArticleGridFourLayout &&
          block.blockType === 'article-grid' &&
          block.selection.totalSlots === 4 ? (
            <section className="hf-block-settings-section">
              <h3 className="hf-block-settings-kicker">Four-card layout</h3>
              <p className="hf-block-settings-hint">
                One row × four uses wide (16:10) thumbnails. 2×2 uses square (1:1) thumbnails.
              </p>
              <div
                className="hf-slot3-layout-options"
                role="radiogroup"
                aria-label="Article grid four-slot layout"
              >
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-ag4-${block.id}`}
                    checked={articleGridFourLayoutDraft === 'four-across'}
                    onChange={() => setArticleGridFourLayoutDraft('four-across')}
                    disabled={!token || articleGridFourLayoutMutation.isPending}
                  />
                  <span>One row × four — wide images</span>
                </label>
                <label className="hf-slot3-layout-label">
                  <input
                    type="radio"
                    name={`hf-ag4-${block.id}`}
                    checked={articleGridFourLayoutDraft === 'two-by-two'}
                    onChange={() => setArticleGridFourLayoutDraft('two-by-two')}
                    disabled={!token || articleGridFourLayoutMutation.isPending}
                  />
                  <span>2×2 grid — square images</span>
                </label>
              </div>
              <div className="hf-block-section-heading-row">
                <button
                  type="button"
                  className="hf-btn-ghost"
                  disabled={
                    !token || !articleGridFourLayoutDirty || articleGridFourLayoutMutation.isPending
                  }
                  onClick={() => setArticleGridFourLayoutDraft(savedArticleGridFourLayout)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="hf-btn-primary"
                  disabled={
                    !token || !articleGridFourLayoutDirty || articleGridFourLayoutMutation.isPending
                  }
                  onClick={() => articleGridFourLayoutMutation.mutate(articleGridFourLayoutDraft)}
                >
                  {articleGridFourLayoutMutation.isPending ? 'Saving…' : 'Save layout'}
                </button>
              </div>
              {articleGridFourLayoutMutation.isError ? (
                <p className="hf-block-section-heading-error">
                  {articleGridFourLayoutMutation.error instanceof Error
                    ? articleGridFourLayoutMutation.error.message
                    : 'Failed to save layout.'}
                </p>
              ) : null}
            </section>
          ) : null}

          {!saveSectionHeading && !canConvertEmptyFeaturedArticles ? (
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
            canConvert={canConvertEmptyFeaturedArticles}
            onConvert={async (tok, blockType, slotCount) => {
              if (!onConvertEmptyFeaturedArticlesBlock) return
              await onConvertEmptyFeaturedArticlesBlock(tok, blockType, slotCount)
            }}
            onConverted={() => setSettingsOpen(false)}
          />
      </HomepageBlockSettingsModal>

      <div className="hf-block-content">
        {savedSectionHeading.trim() ? (
          <h2 className="hf-block-section-heading-h2 hf-block-public-section-title">
            {savedSectionHeading.trim()}
          </h2>
        ) : null}
        {savedSectionSubheading.trim() ? (
          <p className="hf-block-public-section-subtitle">{savedSectionSubheading.trim()}</p>
        ) : null}
        <HomepageFeaturedSlotEditor
          pageTitle=""
          pageSubtitle={blockConfig.description}
          slotEditorState={slotEditorState}
          compact
          suppressToolbar
          variant={block.blockType}
          featuredArticlesSlot3Layout={
            block.blockType === 'featured-articles' && block.selection.totalSlots === 3
              ? slot3LayoutDraft
              : undefined
          }
          featuredArticlesSlot4Layout={
            block.blockType === 'featured-articles' && block.selection.totalSlots === 4
              ? slot4LayoutDraft
              : undefined
          }
          featuredArticlesSlot5Layout={
            block.blockType === 'featured-articles' && block.selection.totalSlots === 5
              ? slot5LayoutDraft
              : undefined
          }
          articleGridFourLayout={
            block.blockType === 'article-grid' && block.selection.totalSlots === 4
              ? articleGridFourLayoutDraft
              : undefined
          }
        />
      </div>
    </div>
  )
}
