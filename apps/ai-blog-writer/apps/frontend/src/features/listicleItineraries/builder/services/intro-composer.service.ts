import type { ComposeItineraryIntroRequest, ComposeItineraryIntroStop } from '../../../staging/api'
import type {
  ItineraryBlockType,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import { ITINERARY_BLOCK_CATEGORY_LABELS } from '../constants/builder-options.constants'
import { getResolvedDayStops, resolveStopTitle } from '../utils/itineraryStopBlock.utils'
import { getItineraryAiArticleTitle } from './ai-rewrite.service'
import { buildArticleLocationLabel } from './ai-autowrite.service'

const INTRO_TARGET_ID_SUFFIX = '_header_intro'

/**
 * Stable marker id for the intro auto-write in the builder's single
 * `activeAiTargetId` slot. The intro no longer rides the blurb batch (ADR 0018),
 * but the spinner still keys off this id.
 */
export function getItineraryIntroTargetId(draft: ListicleItineraryDraft): string {
  return `${draft.draftId}${INTRO_TARGET_ID_SUFFIX}`
}

/**
 * The ordered, resolved stops the Intro composer writes against — the live stop
 * list is the ground truth (ADR 0018). A stop with no resolved identity (an
 * unpicked related slot) is skipped. `selectionReason` is attached only when
 * present; the orphaned-reason fix keeps a present reason describing the current
 * pick.
 */
export function getItineraryIntroComposableStops(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): ComposeItineraryIntroStop[] {
  const stops: ComposeItineraryIntroStop[] = []

  draft.days.forEach((day, dayIndex) => {
    const dayLabel = `Day ${dayIndex + 1}`
    getResolvedDayStops(day, relatedByBlockType).forEach((item) => {
      const title = resolveStopTitle(item, relatedByBlockType)
      stops.push({
        title,
        category: ITINERARY_BLOCK_CATEGORY_LABELS[item.blockType],
        dayLabel,
        selectionReason: item.selectionReason?.trim() || undefined,
      })
    })
  })

  return stops
}

/**
 * Why the intro is not yet composable, or undefined if it is. Gated on title +
 * at least one resolved stop (ADR 0018) — autobuild is not a prerequisite; with
 * no plan signal the composer degrades to stops + title + location + tone.
 */
export function getItineraryIntroComposeDisabledReason(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string | undefined {
  if (!draft.title.trim()) return 'Add a title before writing the intro'
  if (getItineraryIntroComposableStops(draft, relatedByBlockType).length < 1) {
    return 'Add at least one stop before writing the intro'
  }
  return undefined
}

export function buildItineraryComposeIntroRequest(params: {
  draft: ListicleItineraryDraft
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  locations: LocationOption[]
  modelName: ComposeItineraryIntroRequest['modelName']
}): ComposeItineraryIntroRequest {
  const { draft, relatedByBlockType, locations, modelName } = params

  return {
    articleTitle: getItineraryAiArticleTitle(draft),
    locationLabel: buildArticleLocationLabel(draft, locations),
    listTone: draft.listTone,
    planOverview: draft.planOverview?.trim() || undefined,
    dayCount: draft.days.length || undefined,
    modelName,
    stops: getItineraryIntroComposableStops(draft, relatedByBlockType),
  }
}

export function applyItineraryComposedIntro(
  draft: ListicleItineraryDraft,
  intro: string,
): ListicleItineraryDraft {
  return {
    ...draft,
    header: {
      ...draft.header,
      introMarkdown: intro,
      introJsonText: '',
    },
  }
}
