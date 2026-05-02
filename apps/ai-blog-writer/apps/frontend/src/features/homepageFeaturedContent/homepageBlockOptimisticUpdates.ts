import type {
  CuratedHomepageBlockType,
  PageBlockResponse,
} from './pageBlocks'

type HomepageBlockList = {
  pageBlocks: PageBlockResponse[]
}

function articleSelection(totalSlots: number) {
  return {
    items: [],
    invalidItems: [],
    isComplete: totalSlots === 0,
    allowDrafts: true,
    totalSlots,
  }
}

function locationGridSelection(totalSlots: number) {
  return {
    items: [],
    invalidItems: [],
    isComplete: totalSlots === 0,
    totalSlots,
  }
}

function hotelGridSelection(totalSlots: number) {
  return {
    items: [],
    invalidItems: [],
    isComplete: totalSlots === 0,
    allowDrafts: true,
    totalSlots,
  }
}

function sectionText(block: PageBlockResponse) {
  return {
    sectionHeading: 'sectionHeading' in block ? block.sectionHeading : null,
    sectionSubheading: 'sectionSubheading' in block ? block.sectionSubheading : null,
  }
}

export function reorderHomepageBlocksInCache<T extends HomepageBlockList>(
  homepage: T | undefined,
  orderedBlockIds: string[],
): T | undefined {
  if (!homepage) return homepage

  const blocksById = new Map(homepage.pageBlocks.map((block) => [block.id, block]))
  if (
    orderedBlockIds.length !== homepage.pageBlocks.length
    || orderedBlockIds.some((id) => !blocksById.has(id))
  ) {
    return homepage
  }

  return {
    ...homepage,
    pageBlocks: orderedBlockIds.map((id) => blocksById.get(id)!),
  }
}

export function deleteHomepageBlockFromCache<T extends HomepageBlockList>(
  homepage: T | undefined,
  blockId: string,
): T | undefined {
  if (!homepage) return homepage

  return {
    ...homepage,
    pageBlocks: homepage.pageBlocks.filter((block) => block.id !== blockId),
  }
}

export function replaceHomepageBlockInCache<T extends HomepageBlockList>(
  homepage: T | undefined,
  block: PageBlockResponse,
): T | undefined {
  if (!homepage) return homepage

  return {
    ...homepage,
    pageBlocks: homepage.pageBlocks.map((candidate) =>
      candidate.id === block.id ? block : candidate,
    ),
  }
}

export function buildOptimisticConvertedHomepageBlock(
  block: PageBlockResponse,
  blockType: CuratedHomepageBlockType,
  slotCount: number,
): PageBlockResponse {
  const text = sectionText(block)

  if (blockType === 'location-grid') {
    return {
      id: block.id,
      blockType,
      ...text,
      mediaAspect: 'rectangle',
      selection: locationGridSelection(slotCount),
    }
  }

  if (
    blockType === 'hotel-grid'
    || blockType === 'tour-grid'
    || blockType === 'things-to-do-attractions'
  ) {
    return {
      id: block.id,
      blockType,
      ...text,
      selection: hotelGridSelection(slotCount),
    }
  }

  if (blockType === 'article-grid') {
    return {
      id: block.id,
      blockType,
      ...text,
      articleGridFourLayout: slotCount === 4 ? 'four-across' : null,
      selection: articleSelection(slotCount),
    }
  }

  if (blockType === 'featured-articles') {
    return {
      id: block.id,
      blockType,
      ...text,
      slot3Layout: slotCount === 3 ? 'hero-left' : null,
      slot4Layout: slotCount === 4 ? 'sidebar-stack' : null,
      slot5Layout: slotCount === 5 ? 'card-grid' : null,
      selection: articleSelection(slotCount),
    }
  }

  return {
    id: block.id,
    blockType,
    ...text,
    selection: articleSelection(slotCount),
  } as PageBlockResponse
}
