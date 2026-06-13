import type { ComposeItineraryIntroRequest, ComposeItineraryIntroStop } from '../../../staging/api'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import { isManualItineraryBlockType } from '../../types'
import { getItineraryAiArticleTitle } from './ai-rewrite.service'
import { buildArticleLocationLabel } from './ai-autowrite.service'

const INTRO_TARGET_ID_SUFFIX = '_header_intro'

const ITINERARY_BLOCK_CATEGORY_LABELS: Record<ItineraryBlockType, string> = {
  'itinerary-dining': 'Dining',
  'itinerary-accommodations': 'Accommodations',
  'itinerary-where-staying': "Where You're Staying",
  'itinerary-attractions': 'Attractions',
  'itinerary-nightlife': 'Nightlife',
  'itinerary-key-location': 'Key Location',
  'itinerary-tour-agency': 'Tour Agency',
}

/**
 * Stable marker id for the intro auto-write in the builder's single
 * `activeAiTargetId` slot. The intro no longer rides the blurb batch (ADR 0018),
 * but the spinner still keys off this id.
 */
export function getItineraryIntroTargetId(draft: ListicleItineraryDraft): string {
  return `${draft.draftId}${INTRO_TARGET_ID_SUFFIX}`
}

function resolveStopTitle(
  item: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string {
  if (isManualItineraryBlockType(item.blockType)) {
    return item.title.trim() || item.operator.trim()
  }
  if (!item.item) return ''
  const relatedOptions = relatedByBlockType[item.blockType] || []
  return relatedOptions.find((entry) => entry.id === item.item)?.title?.trim() || ''
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
    ;[...day.whereStaying, ...day.items].forEach((item) => {
      const title = resolveStopTitle(item, relatedByBlockType)
      if (!title) return
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
