import {
  composeItineraryStopReasonWithAi,
  type ComposeStopReasonRequest,
} from '../../../staging/api'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import { resolveItineraryAngleForBlockType } from '../../types'
import { buildArticleLocationLabel } from './ai-autowrite.service'
import { getItineraryAiArticleTitle } from './ai-rewrite.service'
import { ITINERARY_BLOCK_CATEGORY_LABELS, resolveStopTitle } from './compose-day-blurbs.service'

export type ComposeStopReasonParams = {
  draft: ListicleItineraryDraft
  item: ItineraryItemBlock
  /** The operator's rough, hand-written rationale. */
  roughReason: string
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  locations: LocationOption[]
  modelName?: ComposeStopReasonRequest['modelName']
}

export type ComposeStopReasonResult = {
  /** The reason to preview in the editable ⓘ field before the operator commits. */
  reason: string
  /** True when the refine call failed and the operator's raw text was kept. */
  fallback: boolean
}

/**
 * Build the refine request for one stop: the operator's rough note plus the
 * stop's identity (title/category/daypart/angle) and trip framing, so "why it
 * fits here" is grounded the same way Autobuild's reasons stage is.
 */
export function buildItineraryComposeStopReasonRequest(
  params: ComposeStopReasonParams,
): ComposeStopReasonRequest {
  const { draft, item, roughReason, relatedByBlockType, locations, modelName } = params
  return {
    roughReason: roughReason.trim(),
    title: resolveStopTitle(item, relatedByBlockType),
    category: ITINERARY_BLOCK_CATEGORY_LABELS[item.blockType],
    daypart: item.shellSlotDaypart,
    angle: resolveItineraryAngleForBlockType(item.blockType, item.angle),
    articleTitle: getItineraryAiArticleTitle(draft) || undefined,
    locationLabel: buildArticleLocationLabel(draft, locations) || undefined,
    planOverview: draft.planOverview?.trim() || undefined,
    modelName,
  }
}

/**
 * Refine the operator's rough note into a Selection reason. On any failure the
 * operator's own text is returned (ADR 0020 raw-text fallback) — a flaky LLM
 * call must never block the gate. The result is meant to be previewed in the
 * editable ⓘ field before the operator commits it.
 */
export async function composeItineraryStopReason(
  params: ComposeStopReasonParams,
): Promise<ComposeStopReasonResult> {
  const rawText = params.roughReason.trim()
  try {
    const response = await composeItineraryStopReasonWithAi(
      buildItineraryComposeStopReasonRequest(params),
    )
    const reason = response.reason?.trim()
    return reason ? { reason, fallback: false } : { reason: rawText, fallback: true }
  } catch {
    return { reason: rawText, fallback: true }
  }
}
