import { findLocationByKey } from '../../../locationScope/scope'
import type {
  GenerateListicleContentRequest,
  GenerateListicleContentResponse,
  GenerateListicleContentTarget,
  ListicleWriterCategory,
} from '../../../staging/api'
import type {
  ItineraryBlockType,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import { buildItineraryAiArticleContext, getItineraryAiArticleTitle } from './ai-rewrite.service'

const INTRO_TARGET_ID_SUFFIX = '_header_intro'

function formatPromptLocationLabel(location?: Pick<LocationOption, 'country' | 'city' | 'neighborhood' | 'locationKey'> | null): string {
  if (!location) return ''
  const parts = [location.neighborhood, location.city, location.country]
    .map((value) => (value || '').trim())
    .filter(Boolean)
  if (parts.length > 0) {
    return parts.join(', ')
  }
  return (location.locationKey || '').replace(/\|/g, ', ')
}

function buildArticleLocationLabel(
  draft: ListicleItineraryDraft,
  locations: LocationOption[],
): string {
  const primaryLocation = findLocationByKey(locations, draft.location)
  const sharedLabels = draft.sharedNeighborhoods
    .map((id) => locations.find((location) => location.id === id))
    .filter((location): location is LocationOption => Boolean(location))
    .map((location) => location.neighborhood?.trim() || location.city?.trim() || location.country?.trim() || '')
    .filter(Boolean)

  const baseLabel = formatPromptLocationLabel(primaryLocation)
  if (sharedLabels.length < 1) {
    return baseLabel || draft.location
  }

  return `${baseLabel} (focus neighborhoods: ${sharedLabels.join(', ')})`
}

function mapBlockTypeToCategory(blockType: ItineraryBlockType): ListicleWriterCategory {
  switch (blockType) {
    case 'itinerary-accommodations':
      return 'accommodations'
    case 'itinerary-attractions':
      return 'attractions'
    case 'itinerary-nightlife':
      return 'nightlife'
    case 'itinerary-key-location':
      return 'key_location'
    case 'itinerary-dining':
    default:
      return 'dining'
  }
}

function buildStopTimeLabel(item: ListicleItineraryDraft['items'][number]): string {
  const durationParts: string[] = []
  if (item.durationHours > 0) {
    durationParts.push(`${item.durationHours}h`)
  }
  if (Number(item.durationMinutes) > 0) {
    durationParts.push(`${item.durationMinutes}m`)
  }
  if (durationParts.length < 1) {
    durationParts.push('0m')
  }
  return `${item.timeHour}:${item.timeMinute} ${item.timePeriod} (${durationParts.join(' ')})`
}

export function getItineraryIntroTargetId(draft: ListicleItineraryDraft): string {
  return `${draft.draftId}${INTRO_TARGET_ID_SUFFIX}`
}

function buildIntroTarget(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
  articleLocationLabel: string,
): GenerateListicleContentTarget {
  const selectedTitles = draft.items
    .map((item) => {
      const relatedOptions = relatedByBlockType[item.blockType] || []
      return relatedOptions.find((entry) => entry.id === item.item)?.title?.trim() || ''
    })
    .filter(Boolean)

  const itineraryWindow = `${draft.itineraryStartHour}:${draft.itineraryStartMinute} ${draft.itineraryStartPeriod} to ${draft.itineraryEndHour}:${draft.itineraryEndMinute} ${draft.itineraryEndPeriod}`
  const supportingContext = [
    `Day audience: ${draft.dayAudience || 'anyday'}`,
    `Itinerary window: ${itineraryWindow}`,
    selectedTitles.length > 0 ? `Selected stops: ${selectedTitles.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  return {
    targetId: getItineraryIntroTargetId(draft),
    fieldType: 'intro',
    currentContent: draft.header.introMarkdown,
    locationLabel: articleLocationLabel,
    supportingContext,
  }
}

function buildStopTarget(
  draft: ListicleItineraryDraft,
  relatedItem: RelatedItemOption,
  item: ListicleItineraryDraft['items'][number],
  articleLocationLabel: string,
): GenerateListicleContentTarget {
  const supportingContext = [
    `Article title: ${draft.title.trim()}`,
    `Stop time: ${buildStopTimeLabel(item)}`,
    `Block category: ${mapBlockTypeToCategory(item.blockType)}`,
    relatedItem.location?.trim() ? `Known item location: ${relatedItem.location.trim()}` : '',
    `Media mode: ${item.mediaMode}`,
  ].filter(Boolean).join('\n')

  return {
    targetId: `${item.id}_blurb`,
    fieldType: 'blurb',
    category: mapBlockTypeToCategory(item.blockType),
    displayName: relatedItem.title,
    researchSubject: relatedItem.title,
    locationLabel: relatedItem.location?.trim() || articleLocationLabel,
    currentContent: item.blurbMarkdown,
    supportingContext,
  }
}

export function getItineraryAutoWriteTargetIds(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string[] {
  const targetIds: string[] = []
  if (!draft.header.introMarkdown.trim()) {
    targetIds.push(getItineraryIntroTargetId(draft))
  }

  draft.items.forEach((item) => {
    if (item.blurbMarkdown.trim()) return
    if (!item.item) return
    const relatedOptions = relatedByBlockType[item.blockType] || []
    const relatedItem = relatedOptions.find((entry) => entry.id === item.item)
    if (!relatedItem) return
    targetIds.push(`${item.id}_blurb`)
  })

  return targetIds
}

export function buildItineraryGenerateListicleContentRequest(params: {
  draft: ListicleItineraryDraft
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  locations: LocationOption[]
  targetIds: string[]
  modelName: ListicleItineraryDraft['editorModelName']
  customInstruction?: string
  skipExisting?: boolean
  includeArticleContext?: boolean
}): GenerateListicleContentRequest {
  const {
    draft,
    relatedByBlockType,
    locations,
    targetIds,
    modelName,
    customInstruction,
    skipExisting = false,
    includeArticleContext = true,
  } = params

  const targetIdSet = new Set(targetIds)
  const articleLocationLabel = buildArticleLocationLabel(draft, locations)
  const targets: GenerateListicleContentTarget[] = []

  const introTarget = buildIntroTarget(draft, relatedByBlockType, articleLocationLabel)
  if (targetIdSet.has(introTarget.targetId)) {
    targets.push(introTarget)
  }

  draft.items.forEach((item) => {
    if (!item.item) return
    const relatedOptions = relatedByBlockType[item.blockType] || []
    const relatedItem = relatedOptions.find((entry) => entry.id === item.item)
    if (!relatedItem) return
    const target = buildStopTarget(draft, relatedItem, item, articleLocationLabel)
    if (targetIdSet.has(target.targetId)) {
      targets.push(target)
    }
  })

  return {
    articleTitle: getItineraryAiArticleTitle(draft),
    articleType: 'listicle-itinerary',
    locationLabel: articleLocationLabel,
    articleContext: includeArticleContext ? buildItineraryAiArticleContext(draft) : undefined,
    modelName,
    customInstruction,
    skipExisting,
    targets,
  }
}

export function applyItineraryGeneratedContent(
  draft: ListicleItineraryDraft,
  response: GenerateListicleContentResponse,
): ListicleItineraryDraft {
  const introTargetId = getItineraryIntroTargetId(draft)
  return {
    ...draft,
    header: response.results[introTargetId]?.status === 'generated' && response.results[introTargetId]?.markdown
      ? {
          ...draft.header,
          introMarkdown: response.results[introTargetId]?.markdown || draft.header.introMarkdown,
          introJsonText: '',
        }
      : draft.header,
    items: draft.items.map((item) => {
      const result = response.results[`${item.id}_blurb`]
      if (result?.status !== 'generated' || !result.markdown) {
        return item
      }
      return {
        ...item,
        blurbMarkdown: result.markdown,
        blurbJsonText: '',
      }
    }),
  }
}
