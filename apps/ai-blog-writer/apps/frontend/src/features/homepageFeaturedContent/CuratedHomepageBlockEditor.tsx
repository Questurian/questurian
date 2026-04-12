import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import HomepageBlockConvertSection from './HomepageBlockConvertSection'
import HomepageFeaturedSlotEditor from './HomepageFeaturedSlotEditor'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HomepageBlockSettingsModal from './HomepageBlockSettingsModal'
import {
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES,
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
} from './pageBlocks'
import { useHomepageFeaturedSlots, type CandidateParams } from './useHomepageFeaturedSlots'
import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'

const SECTION_HEADING_MAX_LEN = 120

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
  convertEmptyFeaturedArticlesTargets = CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  onConvertEmptyFeaturedArticlesBlock,
  fetchCandidates,
  onDeleteBlock,
  isDeletingBlock,
  deleteError,
}: Props) {
  const savedSectionHeading = block.sectionHeading ?? ''

  const [sectionHeadingDraft, setSectionHeadingDraft] = useState(savedSectionHeading)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const sectionHeadingInputRef = useRef<HTMLInputElement>(null)

  const convertTargets = useMemo(() => {
    const list =
      convertEmptyFeaturedArticlesTargets.length > 0 ? convertEmptyFeaturedArticlesTargets : []
    return list.filter((t) => t !== block.blockType)
  }, [convertEmptyFeaturedArticlesTargets, block.blockType])

  useEffect(() => {
    setSectionHeadingDraft(savedSectionHeading)
  }, [block.id, block.blockType, savedSectionHeading])

  useEffect(() => {
    if (!settingsOpen || !saveSectionHeading) return
    const id = window.setTimeout(() => sectionHeadingInputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [settingsOpen, saveSectionHeading])

  const headingTrimmed = sectionHeadingDraft.trim()
  const headingDirty = headingTrimmed !== savedSectionHeading.trim()

  const headingMutation = useMutation({
    mutationFn: async (value: string | null) => {
      if (!token || !saveSectionHeading) return
      await saveSectionHeading(token, value)
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
          {saveSectionHeading ? (
            <section className="hf-block-settings-section">
              <h3 className="hf-block-settings-kicker">Section title</h3>
              <p className="hf-block-settings-hint">
                Optional headline shown above this block on the public site.
              </p>
              <label className="hf-sr-only" htmlFor={`hf-section-${block.id}`}>
                Section title
              </label>
              <input
                ref={sectionHeadingInputRef}
                id={`hf-section-${block.id}`}
                type="text"
                className="hf-block-section-heading-input"
                maxLength={SECTION_HEADING_MAX_LEN}
                placeholder="e.g. Featured reporting"
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

          {!saveSectionHeading && !canConvertEmptyFeaturedArticles ? (
            <p className="hf-block-settings-hint">
              Choose articles in the grid below, then use <strong>Save</strong> in the footer to
              persist slot picks.
            </p>
          ) : null}

          <HomepageBlockConvertSection
            blockId={block.id}
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
        <HomepageFeaturedSlotEditor
          pageTitle=""
          pageSubtitle={blockConfig.description}
          slotEditorState={slotEditorState}
          compact
          suppressToolbar
          variant={block.blockType}
        />
      </div>
    </div>
  )
}
