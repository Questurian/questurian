import {
  fetchHomepageFeaturedCandidates,
  fetchHomepageHotelGridCandidates,
  fetchHomepageLocationGridCandidates,
  fetchThingsToDoAttractionCandidates,
  fetchThingsToDoListicleCandidates,
  fetchTourGridCandidates,
  fetchWhereToEatDrinkCandidates,
  updateMainHomepageArticleGridFourLayout,
  updateMainHomepageBlock,
  updateMainHomepageFeaturedSectionHeading,
  updateMainHomepageFeaturedSectionSubheading,
  updateMainHomepageFeaturedSlot3Layout,
  updateMainHomepageFeaturedSlot4Layout,
  updateMainHomepageFeaturedSlot5Layout,
  updateMainHomepageLocationGridMediaAspect,
} from './api'
import CuratedHomepageBlockEditor from './CuratedHomepageBlockEditor'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import HotelGridBlockEditor from './HotelGridBlockEditor'
import LocationGridBlockEditor from './LocationGridBlockEditor'
import NewsletterSignupBlockEditor from './NewsletterSignupBlockEditor'
import {
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  homepageBlockEditorIdentity,
  isArticleCuratedHomepageBlock,
  isHotelGridBlock,
  isLocationGridBlock,
  isNewsletterSignupBlock,
  isThingsToDoAttractionsBlock,
  isTourGridBlock,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
  type HotelOrAttractionGridBlockResponse,
  type LocationGridBlockResponse,
  type PageBlockResponse,
} from './pageBlocks'

type Props = {
  block: PageBlockResponse
  blockIndex: number
  token: string | null
  canManage: boolean
  externalUsedKeys: Set<string>
  onSlotsChange: (blockId: string, keys: Set<string>) => void
  onDeleteBlock: (blockId: string) => void
  isDeletePending: boolean
  deletingBlockId: string | null
  deleteError: string | null
  onConvertBlock: (
    block: PageBlockResponse,
    currentToken: string,
    blockType: CuratedHomepageBlockType,
    slotCount: number,
  ) => Promise<void>
  invalidateHomepage: () => void
}

export default function MainHomepageBlockRenderer({
  block,
  blockIndex,
  token,
  canManage,
  externalUsedKeys,
  onSlotsChange,
  onDeleteBlock,
  isDeletePending,
  deletingBlockId,
  deleteError,
  onConvertBlock,
  invalidateHomepage,
}: Props) {
  const isDeletingBlockFor = (blockId: string) =>
    isDeletePending && deletingBlockId === blockId
  const deleteErrorFor = (blockId: string) =>
    isDeletePending || deletingBlockId !== blockId ? null : deleteError

  if (isArticleCuratedHomepageBlock(block)) {
    return (
      <CuratedHomepageBlockEditor
        block={block}
        blockIndex={blockIndex}
        token={token}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        selectionQueryKey={[
          'main-homepage-block',
          ...homepageBlockEditorIdentity(block),
          token,
        ]}
        saveSelection={async (currentToken, items, slotCount) => {
          const updated = await updateMainHomepageBlock(
            currentToken,
            block.id,
            items,
            slotCount,
          )
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is ArticleCuratedHomepageBlockResponse =>
              candidate.id === block.id && candidate.blockType === block.blockType,
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={(currentToken, params) =>
          block.blockType === 'questurian-maps'
            ? fetchHomepageFeaturedCandidates(currentToken, {
                ...params,
                type: 'single-type-listicles',
              })
            : block.blockType === 'where-to-eat-drink'
              ? fetchWhereToEatDrinkCandidates(currentToken, params)
              : block.blockType === 'things-to-do-listicles'
                ? fetchThingsToDoListicleCandidates(currentToken, params)
                : fetchHomepageFeaturedCandidates(currentToken, params)}
        saveSectionHeading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionHeading(currentToken, block.id, value)
          invalidateHomepage()
        }}
        saveSectionSubheading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionSubheading(currentToken, block.id, value)
          invalidateHomepage()
        }}
        saveSlot3Layout={
          block.blockType === 'featured-articles' && block.selection.totalSlots === 3
            ? async (currentToken, value) => {
                await updateMainHomepageFeaturedSlot3Layout(currentToken, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        saveSlot4Layout={
          block.blockType === 'featured-articles' && block.selection.totalSlots === 4
            ? async (currentToken, value) => {
                await updateMainHomepageFeaturedSlot4Layout(currentToken, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        saveSlot5Layout={
          block.blockType === 'featured-articles' && block.selection.totalSlots === 5
            ? async (currentToken, value) => {
                await updateMainHomepageFeaturedSlot5Layout(currentToken, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        saveArticleGridFourLayout={
          block.blockType === 'article-grid' && block.selection.totalSlots === 4
            ? async (currentToken, value) => {
                await updateMainHomepageArticleGridFourLayout(currentToken, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        convertEmptyFeaturedArticlesTargets={CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES}
        onConvertEmptyFeaturedArticlesBlock={async (
          currentToken,
          blockType,
          slotCount,
        ) => {
          await onConvertBlock(block, currentToken, blockType, slotCount)
        }}
        externalUsedKeys={externalUsedKeys}
        onSlotsChange={onSlotsChange}
      />
    )
  }

  if (isLocationGridBlock(block)) {
    return (
      <LocationGridBlockEditor
        block={block}
        blockIndex={blockIndex}
        token={token}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        childLevel="city"
        selectionQueryKey={[
          'main-homepage-location-grid',
          ...homepageBlockEditorIdentity(block),
          token,
        ]}
        saveSelection={async (currentToken, items, slotCount) => {
          const updated = await updateMainHomepageBlock(
            currentToken,
            block.id,
            items,
            slotCount,
          )
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is LocationGridBlockResponse =>
              candidate.id === block.id && candidate.blockType === block.blockType,
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={fetchHomepageLocationGridCandidates}
        saveLocationGridSectionHeading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionHeading(currentToken, block.id, value)
          invalidateHomepage()
        }}
        saveLocationGridSectionSubheading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionSubheading(currentToken, block.id, value)
          invalidateHomepage()
        }}
        saveLocationGridMediaAspect={async (currentToken, value) => {
          await updateMainHomepageLocationGridMediaAspect(currentToken, block.id, value)
          invalidateHomepage()
        }}
        convertBlockTargets={CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES}
        onConvertEmptyBlock={async (currentToken, blockType, slotCount) => {
          await onConvertBlock(block, currentToken, blockType, slotCount)
        }}
      />
    )
  }

  if (isNewsletterSignupBlock(block)) {
    return (
      <NewsletterSignupBlockEditor
        block={block}
        blockIndex={blockIndex}
        token={token}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        saveSectionHeading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionHeading(currentToken, block.id, value)
          invalidateHomepage()
        }}
        saveSectionSubheading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionSubheading(currentToken, block.id, value)
          invalidateHomepage()
        }}
      />
    )
  }

  if (
    isHotelGridBlock(block)
    || isTourGridBlock(block)
    || isThingsToDoAttractionsBlock(block)
  ) {
    const gridBlock = block
    return (
      <HotelGridBlockEditor
        block={gridBlock}
        blockIndex={blockIndex}
        token={token}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(gridBlock.id)}
        deleteError={deleteErrorFor(gridBlock.id)}
        selectionQueryKey={[
          'main-homepage-hotel-grid',
          ...homepageBlockEditorIdentity(gridBlock),
          token,
        ]}
        saveSelection={async (currentToken, items, slotCount) => {
          const updated = await updateMainHomepageBlock(
            currentToken,
            gridBlock.id,
            items,
            slotCount,
          )
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is HotelOrAttractionGridBlockResponse =>
              candidate.id === gridBlock.id
              && candidate.blockType === gridBlock.blockType,
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={(currentToken, params) =>
          gridBlock.blockType === 'things-to-do-attractions'
            ? fetchThingsToDoAttractionCandidates(currentToken, params)
            : gridBlock.blockType === 'tour-grid'
              ? fetchTourGridCandidates(currentToken, params)
              : fetchHomepageHotelGridCandidates(currentToken, params)}
        convertBlockTargets={CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES}
        onConvertEmptyBlock={async (currentToken, blockType, slotCount) => {
          await onConvertBlock(gridBlock, currentToken, blockType, slotCount)
        }}
        saveHotelGridSectionHeading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionHeading(
            currentToken,
            gridBlock.id,
            value,
          )
          invalidateHomepage()
        }}
        saveHotelGridSectionSubheading={async (currentToken, value) => {
          await updateMainHomepageFeaturedSectionSubheading(
            currentToken,
            gridBlock.id,
            value,
          )
          invalidateHomepage()
        }}
      />
    )
  }

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-tag">{block.blockType}</span>
        </div>
        <HomepageBlockDeleteTrigger
          blockId={block.id}
          blockIndex={blockIndex}
          blockLabel={block.blockType}
          onDeleteBlock={onDeleteBlock}
          isDeletingBlock={isDeletingBlockFor(block.id)}
          deleteError={deleteErrorFor(block.id)}
        />
      </div>
      <div className="hf-block-content hf-empty">
        <p>
          Editor for &ldquo;{block.blockType}&rdquo; blocks is not yet available in
          this tool.
        </p>
      </div>
    </div>
  )
}
