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
  updateLocationHomepageCreatorKicker,
  updateLocationHomepageEditorialFeatureFields
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
  type PageBlockResponse
} from './pageBlocks'

export type LocationHomepageBlockRendererProps = {
  block: PageBlockResponse
  blockIndex: number
  homepageId: number
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
    blockType: CuratedHomepageBlockType,
    slotCount: number
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
  invalidateHomepage
}: LocationHomepageBlockRendererProps) {
  const isDeletingBlockFor = (blockId: string) =>
    isDeletePending && deletingBlockId === blockId
  const deleteErrorFor = (blockId: string) =>
    isDeletePending || deletingBlockId !== blockId ? null : deleteError

  if (isArticleCuratedHomepageBlock(block)) {
    return (
      <CuratedHomepageBlockEditor
        block={block}
        blockIndex={idx}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        selectionQueryKey={[
          'location-homepage-block',
          numericId,
          ...homepageBlockEditorIdentity(block)
        ]}
        saveSelection={async (items, slotCount) => {
          const updated = await updateLocationHomepageBlock(
            numericId,
            block.id,
            items,
            slotCount
          )
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is ArticleCuratedHomepageBlockResponse =>
              candidate.id === block.id &&
              candidate.blockType === block.blockType
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={(params) =>
          block.blockType === 'questurian-maps'
            ? fetchLocationHomepageCandidates(numericId, {
                ...params,
                type: 'single-type-listicles'
              })
            : block.blockType === 'where-to-eat-drink'
              ? fetchLocationHomepageWhereToEatDrinkCandidates(
                  numericId,
                  params
                )
              : block.blockType === 'things-to-do-listicles'
                ? fetchLocationHomepageThingsToDoListicleCandidates(
                    numericId,
                    params
                  )
                : fetchLocationHomepageCandidates(
                    numericId,
                    params as Parameters<
                      typeof fetchLocationHomepageCandidates
                    >[1]
                  )
        }
        saveSectionHeading={block.blockType === 'editorial-feature' ? undefined : async (value) => {
          await updateLocationHomepageFeaturedSectionHeading(numericId, block.id, value)
          invalidateHomepage()
        }}
        saveSectionSubheading={block.blockType === 'editorial-feature' ? undefined : async (value) => {
          await updateLocationHomepageFeaturedSectionSubheading(numericId, block.id, value)
          invalidateHomepage()
        }}
        saveCreatorKicker={
          block.blockType === 'featured-creator-article'
            ? async (value) => {
                await updateLocationHomepageCreatorKicker(
                  numericId,
                  block.id,
                  value
                )
                invalidateHomepage()
              }
            : undefined
        }
        saveSlot3Layout={
          block.blockType === 'featured-articles' &&
          block.selection.totalSlots === 3
            ? async (value) => {
                await updateLocationHomepageFeaturedSlot3Layout(
                  numericId,
                  block.id,
                  value
                )
                invalidateHomepage()
              }
            : undefined
        }
        saveSlot4Layout={
          block.blockType === 'featured-articles' &&
          block.selection.totalSlots === 4
            ? async (value) => {
                await updateLocationHomepageFeaturedSlot4Layout(
                  numericId,
                  block.id,
                  value
                )
                invalidateHomepage()
              }
            : undefined
        }
        saveSlot5Layout={
          block.blockType === 'featured-articles' &&
          block.selection.totalSlots === 5
            ? async (value) => {
                await updateLocationHomepageFeaturedSlot5Layout(
                  numericId,
                  block.id,
                  value
                )
                invalidateHomepage()
              }
            : undefined
        }
        saveArticleGridFourLayout={
          block.blockType === 'article-grid' && block.selection.totalSlots === 4
            ? async (value) => {
                await updateLocationHomepageArticleGridFourLayout(
                  numericId,
                  block.id,
                  value
                )
                invalidateHomepage()
              }
            : undefined
        }
        saveEditorialFeatureFields={
          block.blockType === 'editorial-feature'
            ? async (fields) => {
                await updateLocationHomepageEditorialFeatureFields(
                  numericId,
                  block.id,
                  fields
                )
                invalidateHomepage()
              }
            : undefined
        }
        convertEmptyFeaturedArticlesTargets={convertTargets}
        onConvertEmptyFeaturedArticlesBlock={async (blockType, slotCount) => {
          await onConvertBlock(block, blockType, slotCount)
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
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        childLevel={locationGridChildLevel}
        selectionQueryKey={[
          'location-homepage-location-grid',
          numericId,
          ...homepageBlockEditorIdentity(block)
        ]}
        saveSelection={async (items, slotCount) => {
          const updated = await updateLocationHomepageBlock(
            numericId,
            block.id,
            items,
            slotCount
          )
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is LocationGridBlockResponse =>
              candidate.id === block.id &&
              candidate.blockType === block.blockType
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={(params) =>
          fetchLocationHomepageLocationGridCandidates(numericId, params)
        }
        saveLocationGridSectionHeading={async (value) => {
          await updateLocationHomepageFeaturedSectionHeading(
            numericId,
            block.id,
            value
          )
          invalidateHomepage()
        }}
        saveLocationGridSectionSubheading={async (value) => {
          await updateLocationHomepageFeaturedSectionSubheading(
            numericId,
            block.id,
            value
          )
          invalidateHomepage()
        }}
        saveLocationGridMediaAspect={async (value) => {
          await updateLocationHomepageLocationGridMediaAspect(
            numericId,
            block.id,
            value
          )
          invalidateHomepage()
        }}
        convertBlockTargets={convertTargets}
        onConvertEmptyBlock={async (blockType, slotCount) => {
          await onConvertBlock(block, blockType, slotCount)
        }}
      />
    )
  }

  if (isNewsletterSignupBlock(block)) {
    return (
      <NewsletterSignupBlockEditor
        block={block}
        blockIndex={idx}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(block.id)}
        deleteError={deleteErrorFor(block.id)}
        saveSectionHeading={async (value) => {
          await updateLocationHomepageFeaturedSectionHeading(
            numericId,
            block.id,
            value
          )
          invalidateHomepage()
        }}
        saveSectionSubheading={async (value) => {
          await updateLocationHomepageFeaturedSectionSubheading(
            numericId,
            block.id,
            value
          )
          invalidateHomepage()
        }}
      />
    )
  }

  if (
    isHotelGridBlock(block) ||
    isTourGridBlock(block) ||
    isThingsToDoAttractionsBlock(block)
  ) {
    const gridBlock = block
    return (
      <HotelGridBlockEditor
        block={gridBlock}
        blockIndex={idx}
        canManage={canManage}
        onDeleteBlock={onDeleteBlock}
        isDeletingBlock={isDeletingBlockFor(gridBlock.id)}
        deleteError={deleteErrorFor(gridBlock.id)}
        selectionQueryKey={[
          'location-homepage-hotel-grid',
          numericId,
          ...homepageBlockEditorIdentity(gridBlock)
        ]}
        saveSelection={async (items, slotCount) => {
          const updated = await updateLocationHomepageBlock(
            numericId,
            gridBlock.id,
            items,
            slotCount
          )
          const updatedBlock = updated.pageBlocks.find(
            (candidate): candidate is HotelOrAttractionGridBlockResponse =>
              candidate.id === gridBlock.id &&
              candidate.blockType === gridBlock.blockType
          )
          if (!updatedBlock) throw new Error('Block not found after save.')
          invalidateHomepage()
          return updatedBlock.selection
        }}
        fetchCandidates={(params) =>
          gridBlock.blockType === 'things-to-do-attractions'
            ? fetchLocationHomepageThingsToDoAttractionCandidates(
                numericId,
                params
              )
            : gridBlock.blockType === 'tour-grid'
              ? fetchLocationHomepageTourGridCandidates(numericId, params)
              : fetchLocationHomepageHotelGridCandidates(numericId, params)
        }
        convertBlockTargets={convertTargets}
        onConvertEmptyBlock={async (blockType, slotCount) => {
          await onConvertBlock(gridBlock, blockType, slotCount)
        }}
        saveHotelGridSectionHeading={async (value) => {
          await updateLocationHomepageFeaturedSectionHeading(
            numericId,
            gridBlock.id,
            value
          )
          invalidateHomepage()
        }}
        saveHotelGridSectionSubheading={async (value) => {
          await updateLocationHomepageFeaturedSectionSubheading(
            numericId,
            gridBlock.id,
            value
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
        <p>
          Editor for &ldquo;{block.blockType}&rdquo; blocks is not yet available
          in this tool.
        </p>
      </div>
    </div>
  )
}
