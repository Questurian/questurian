import type {
  ComposeDayBlurbsNeighborStop,
  ComposeDayBlurbsRequest,
  ComposeDayBlurbStop
} from '../../../staging/api'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption
} from '../../types'
import { resolveItineraryAngleForBlockType } from '../../types'
import { ITINERARY_BLOCK_CATEGORY_LABELS } from '../constants/builder-options.constants'
import {
  getResolvedDayStops,
  resolveStopTitle
} from '../utils/itineraryStopBlock.utils'
import { buildArticleLocationLabel } from './ai-autowrite.service'
import { getItineraryAiArticleTitle } from './ai-rewrite.service'

type RelatedStopsByBlockType = Record<ItineraryBlockType, RelatedItemOption[]>

function toComposeStop(
  item: ItineraryItemBlock,
  relatedByBlockType: RelatedStopsByBlockType
): ComposeDayBlurbStop {
  return {
    targetId: `${item.id}_blurb`,
    title: resolveStopTitle(item, relatedByBlockType),
    category: ITINERARY_BLOCK_CATEGORY_LABELS[item.blockType],
    daypart: item.shellSlotDaypart,
    angle: resolveItineraryAngleForBlockType(item.blockType, item.angle),
    selectionReason: item.selectionReason?.trim() || undefined,
    // Context-only stops carry existing copy so the composer can preserve the
    // day's handoffs without rewriting those stops (ADR 0022).
    existingBlurb: item.blurbMarkdown.trim() || undefined
  }
}

function toNeighborStop(
  item: ItineraryItemBlock | undefined,
  relatedByBlockType: RelatedStopsByBlockType
): ComposeDayBlurbsNeighborStop | undefined {
  if (!item) return undefined
  const title = resolveStopTitle(item, relatedByBlockType)
  if (!title) return undefined
  return { title, category: ITINERARY_BLOCK_CATEGORY_LABELS[item.blockType] }
}

export function buildItineraryComposeDayBlurbsRequest(params: {
  draft: ListicleItineraryDraft
  dayIndex: number
  relatedByBlockType: RelatedStopsByBlockType
  locations: LocationOption[]
  modelName: ComposeDayBlurbsRequest['modelName']
  /**
   * Author only these stops; the day's other resolved stops ride along as
   * context-only seeds (ADR 0022). Omit to author the whole day (ADR 0019).
   */
  writeTargetIds?: string[]
}): ComposeDayBlurbsRequest {
  const {
    draft,
    dayIndex,
    relatedByBlockType,
    locations,
    modelName,
    writeTargetIds
  } = params
  const day = draft.days[dayIndex]
  const prevDay = draft.days[dayIndex - 1]
  const nextDay = draft.days[dayIndex + 1]
  const prevResolved = prevDay
    ? getResolvedDayStops(prevDay, relatedByBlockType)
    : []
  const nextResolved = nextDay
    ? getResolvedDayStops(nextDay, relatedByBlockType)
    : []

  return {
    articleTitle: getItineraryAiArticleTitle(draft),
    locationLabel: buildArticleLocationLabel(draft, locations),
    listTone: draft.listTone,
    planOverview: draft.planOverview?.trim() || undefined,
    intro: draft.header.introMarkdown.trim() || undefined,
    dayLabel: `Day ${dayIndex + 1}`,
    dayCount: draft.days.length || undefined,
    prevDayLastStop: toNeighborStop(
      prevResolved[prevResolved.length - 1],
      relatedByBlockType
    ),
    nextDayFirstStop: toNeighborStop(nextResolved[0], relatedByBlockType),
    writeTargetIds,
    modelName,
    stops: getResolvedDayStops(day, relatedByBlockType).map((item) =>
      toComposeStop(item, relatedByBlockType)
    )
  }
}
