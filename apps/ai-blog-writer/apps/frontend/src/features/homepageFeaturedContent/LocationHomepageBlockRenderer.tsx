import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import CuratedHomepageBlockEditor from './CuratedHomepageBlockEditor'
import HotelGridBlockEditor from './HotelGridBlockEditor'
import LocationGridBlockEditor from './LocationGridBlockEditor'
import NewsletterSignupBlockEditor from './NewsletterSignupBlockEditor'
import {
  fetchLocationHomepageCandidates,
  fetchLocationHomepageHotelGridCandidates,
  fetchLocationHomepageTourGridCandidates,
  fetchLocationHomepageLocationGridCandidates,
  fetchLocationHomepageThingsToDoAttractionCandidates,
  fetchLocationHomepageThingsToDoListicleCandidates,
  fetchLocationHomepageWhereToEatDrinkCandidates,
  updateLocationHomepageBlock,
  updateLocationHomepageFeaturedSectionHeading,
  updateLocationHomepageFeaturedSectionSubheading,
  updateLocationHomepageLocationGridMediaAspect,
  updateLocationHomepageFeaturedSlot3Layout,
  updateLocationHomepageFeaturedSlot4Layout,
  updateLocationHomepageFeaturedSlot5Layout,
  updateLocationHomepageArticleGridFourLayout,
} from './locationHomepages'
import {
  homepageBlockEditorIdentity,
  isHotelGridBlock,
  isTourGridBlock,
  isThingsToDoAttractionsBlock,
  isArticleCuratedHomepageBlock,
  isLocationGridBlock,
  isNewsletterSignupBlock,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
  type HotelOrAttractionGridBlockResponse,
  type LocationGridBlockResponse,
  type PageBlockResponse,
} from './pageBlocks'

/**
 * React key for a rendered block, and it matters: the sortable list keys its
 * wrappers by `block.id` alone, so a convert (same id, new blockType/slotCount)
 * would otherwise reuse the mounted editor and its TanStack cache entry. Keying
 * on the editor identity forces the remount.
 *
 * Branch order mirrors the renderer below — in particular an unknown block, and
 * a location-grid block without a child level, fall through to the placeholder
 * and must key on `block.id`, because `homepageBlockEditorIdentity` reads
 * `selection.totalSlots` which `UnknownBlockResponse` does not have.
 */
export function locationHomepageBlockKey(
  block: PageBlockResponse,
  locationGridChildLevel: 'neighborhood' | null,
): string {
  if (
    isArticleCuratedHomepageBlock(block)
    || (isLocationGridBlock(block) && locationGridChildLevel)
    || isNewsletterSignupBlock(block)
    || isHotelGridBlock(block)
    || isTourGridBlock(block)
    || isThingsToDoAttractionsBlock(block)
  ) {
    return homepageBlockEditorIdentity(block).join(':')
  }
  return block.id
}

export type LocationHomepageBlockRendererProps = {
  block: PageBlockResponse
  blockIndex: number
  homepageId: number
  token: string | null
  canManage: boolean
  locationGridChildLevel: 'neighborhood' | null
  convertTargets: CuratedHomepageBlockType[]
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

/**
 * Picks the editor for a single homepage block and wires its save/fetch
 * callbacks to the location-homepage API. Falls through to a placeholder for
 * block types whose editor is not built yet.
 */
export default function LocationHomepageBlockRenderer({
  block,
  blockIndex: idx,
  homepageId: numericId,
  token,
  canManage,
  locationGridChildLevel,
  convertTargets,
  externalUsedKeys,
  onSlotsChange,
  onDeleteBlock,
  isDeletePending,
  deletingBlockId,
  deleteError,
  onConvertBlock,
  invalidateHomepage,
}: LocationHomepageBlockRendererProps) {
  const isDeletingBlockFor = (blockId: string) => isDeletePending && deletingBlockId === blockId
  const deleteErrorFor = (blockId: string) =>
    isDeletePending || deletingBlockId !== blockId ? null : deleteError

  if (isArticleCuratedHomepageBlock(block)) {
    return (
      <CuratedHomepageBlockEditor
        block={block}
        blockIndex={idx}
        token={token}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        selectionQueryKey={[
          'location-homepage-block',
          numericId,
          ...homepageBlockEditorIdentity(block),
          token,
        ]}
        saveSelection={async (currentToken, items, slotCount) => {
          const updated = await updateLocationHomepageBlock(
            currentToken,
            numericId,
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
            ? fetchLocationHomepageCandidates(currentToken, numericId, {
                ...params,
                type: 'single-type-listicles',
              })
            : block.blockType === 'where-to-eat-drink'
              ? fetchLocationHomepageWhereToEatDrinkCandidates(currentToken, numericId, params)
              : block.blockType === 'things-to-do-listicles'
                ? fetchLocationHomepageThingsToDoListicleCandidates(currentToken, numericId, params)
                : fetchLocationHomepageCandidates(
                  currentToken,
                  numericId,
                  params as Parameters<typeof fetchLocationHomepageCandidates>[2],
                )}
        saveSectionHeading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, block.id, value)
          invalidateHomepage()
        }}
        saveSectionSubheading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, block.id, value)
          invalidateHomepage()
        }}
        saveSlot3Layout={
          block.blockType === 'featured-articles' && block.selection.totalSlots === 3
            ? async (currentToken, value) => {
                await updateLocationHomepageFeaturedSlot3Layout(currentToken, numericId, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        saveSlot4Layout={
          block.blockType === 'featured-articles' && block.selection.totalSlots === 4
            ? async (currentToken, value) => {
                await updateLocationHomepageFeaturedSlot4Layout(currentToken, numericId, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        saveSlot5Layout={
          block.blockType === 'featured-articles' && block.selection.totalSlots === 5
            ? async (currentToken, value) => {
                await updateLocationHomepageFeaturedSlot5Layout(currentToken, numericId, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        saveArticleGridFourLayout={
          block.blockType === 'article-grid' && block.selection.totalSlots === 4
            ? async (currentToken, value) => {
                await updateLocationHomepageArticleGridFourLayout(currentToken, numericId, block.id, value)
                invalidateHomepage()
              }
            : undefined
        }
        convertEmptyFeaturedArticlesTargets={convertTargets}
        onConvertEmptyFeaturedArticlesBlock={async (currentToken, blockType, slotCount) => {
          await onConvertBlock(block, currentToken, blockType, slotCount)
        }}
        externalUsedKeys={externalUsedKeys}
        onSlotsChange={onSlotsChange}
      />
    )
  }

  if (isLocationGridBlock(block) && locationGridChildLevel) {
    return (
      <LocationGridBlockEditor
        block={block}
        blockIndex={idx}
        token={token}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        childLevel={locationGridChildLevel}
        selectionQueryKey={[
          'location-homepage-location-grid',
          numericId,
          ...homepageBlockEditorIdentity(block),
          token,
        ]}
        saveSelection={async (currentToken, items, slotCount) => {
          const updated = await updateLocationHomepageBlock(currentToken, numericId, block.id, items, slotCount)
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is LocationGridBlockResponse =>
              candidate.id === block.id && candidate.blockType === block.blockType,
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={(currentToken, params) =>
          fetchLocationHomepageLocationGridCandidates(currentToken, numericId, params)}
        saveLocationGridSectionHeading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, block.id, value)
          invalidateHomepage()
        }}
        saveLocationGridSectionSubheading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, block.id, value)
          invalidateHomepage()
        }}
        saveLocationGridMediaAspect={async (currentToken, value) => {
          await updateLocationHomepageLocationGridMediaAspect(currentToken, numericId, block.id, value)
          invalidateHomepage()
        }}
        convertBlockTargets={convertTargets}
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
        blockIndex={idx}
        token={token}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        saveSectionHeading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, block.id, value)
          invalidateHomepage()
        }}
        saveSectionSubheading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, block.id, value)
          invalidateHomepage()
        }}
      />
    )
  }

  if (isHotelGridBlock(block) || isTourGridBlock(block) || isThingsToDoAttractionsBlock(block)) {
    const gridBlock = block
    return (
      <HotelGridBlockEditor
        block={gridBlock}
        blockIndex={idx}
        token={token}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(gridBlock.id)}
        deleteError={deleteErrorFor(gridBlock.id)}
        selectionQueryKey={[
          'location-homepage-hotel-grid',
          numericId,
          ...homepageBlockEditorIdentity(gridBlock),
          token,
        ]}
        saveSelection={async (currentToken, items, slotCount) => {
          const updated = await updateLocationHomepageBlock(currentToken, numericId, gridBlock.id, items, slotCount)
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is HotelOrAttractionGridBlockResponse =>
              candidate.id === gridBlock.id && candidate.blockType === gridBlock.blockType,
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={(currentToken, params) =>
          gridBlock.blockType === 'things-to-do-attractions'
            ? fetchLocationHomepageThingsToDoAttractionCandidates(
              currentToken,
              numericId,
              params,
            )
            : gridBlock.blockType === 'tour-grid'
              ? fetchLocationHomepageTourGridCandidates(currentToken, numericId, params)
              : fetchLocationHomepageHotelGridCandidates(currentToken, numericId, params)}
        convertBlockTargets={convertTargets}
        onConvertEmptyBlock={async (currentToken, blockType, slotCount) => {
          await onConvertBlock(gridBlock, currentToken, blockType, slotCount)
        }}
        saveHotelGridSectionHeading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, gridBlock.id, value)
          invalidateHomepage()
        }}
        saveHotelGridSectionSubheading={async (currentToken, value) => {
          await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, gridBlock.id, value)
          invalidateHomepage()
        }}
      />
    )
  }

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {idx + 1}</span>
          <span className="hf-block-type-tag">{block.blockType}</span>
        </div>
        <HomepageBlockDeleteTrigger
          blockId={block.id}
          blockIndex={idx}
          blockLabel={block.blockType}
          onDeleteBlock={onDeleteBlock}
          isDeletingBlock={isDeletingBlockFor(block.id)}
          deleteError={deleteErrorFor(block.id)}
        />
      </div>
      <div className="hf-block-content hf-empty">
        <p>Editor for &ldquo;{block.blockType}&rdquo; blocks is not yet available in this tool.</p>
      </div>
    </div>
  )
}
