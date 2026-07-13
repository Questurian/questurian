import type {
  ItineraryDay,
  ItineraryStopBlock,
  ItineraryTourAgencyBlock,
  ItineraryVenueBlock,
  ListicleItineraryArticle,
} from '@/features/articles/types/itineraryListicle'
import {
  isListicleVenue,
  type ListicleItemRow,
} from '@/features/articles/types/mapsListicle'

export function itineraryDaysForArticle(
  article: ListicleItineraryArticle,
): ItineraryDay[] {
  const days = article.itineraryDays?.filter(Boolean) ?? []
  if (days.length > 0) {
    return days
  }

  return [
    {
      id: 'legacy-single-day',
      whereStaying: article.whereStaying ?? [],
      items: article.items ?? [],
    },
  ]
}

export function isTourAgencyBlock(
  block: ItineraryStopBlock,
): block is ItineraryTourAgencyBlock {
  return block.blockType === 'itinerary-tour-agency'
}

export function venueRowFromBlock(
  block: ItineraryVenueBlock,
  fallbackId: string,
): ListicleItemRow | null {
  if (!isListicleVenue(block.item)) {
    return null
  }

  return {
    id: block.id ?? fallbackId,
    blurb: block.blurb,
    item: block.item,
    blockType: block.blockType,
    mediaMode: block.mediaMode,
    selectedPhotos: block.selectedPhotos ?? undefined,
    selectedInstagramPost: block.selectedInstagramPost,
    tours: block.tours,
  }
}

export function populatedVenueStops(
  blocks: ItineraryVenueBlock[] | null | undefined,
): ListicleItemRow[] {
  return (blocks ?? [])
    .map((block, index) => venueRowFromBlock(block, `${block.blockType}-${index}`))
    .filter((row): row is ListicleItemRow => Boolean(row))
}
