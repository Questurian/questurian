import { findLocationByKey } from '../../../../shared/locationScope/scope'
import type {
  GenerateListicleContentRequest,
  GenerateListicleContentResponse,
  GenerateListicleContentTarget,
  ListicleWriterCategory,
  PayloadCollectionSlug,
} from '../../../staging/api'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import {
  getItineraryAngleOptions,
  getItineraryBlocksInArticleOrder,
  isManualItineraryBlockType,
  relatedCollectionToBlockType,
  resolveItineraryAngleForBlockType,
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
    case 'itinerary-where-staying':
      return 'accommodations'
    case 'itinerary-attractions':
      return 'attractions'
    case 'itinerary-nightlife':
      return 'nightlife'
    case 'itinerary-key-location':
      return 'key_location'
    case 'itinerary-tour-agency':
      return 'attractions'
    case 'itinerary-dining':
    default:
      return 'dining'
  }
}

function mapBlockTypeToPayloadCollection(
  blockType: ItineraryBlockType,
): PayloadCollectionSlug | undefined {
  switch (blockType) {
    case 'itinerary-accommodations':
    case 'itinerary-where-staying':
      return 'accommodations'
    case 'itinerary-attractions':
      return 'attractions'
    case 'itinerary-nightlife':
      return 'nightlife'
    case 'itinerary-key-location':
      return 'key-locations'
    case 'itinerary-dining':
      return 'dining'
    case 'itinerary-tour-agency':
      return undefined
  }
}

function buildManualKeyLocationContext(
  item: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string {
  const labels = item.keyLocations.map((location) => {
    if (location.source === 'existing') {
      if (!location.relatedCollection || !location.relatedItem) {
        return ''
      }

      const relatedItem = (relatedByBlockType[relatedCollectionToBlockType(location.relatedCollection)] || [])
        .find((entry) => entry.id === location.relatedItem)

      return relatedItem?.title?.trim()
        || [location.relatedCollection, location.relatedItem].filter(Boolean).join(' #')
    }

    return [
      location.title.trim(),
      location.latitude.trim() && location.longitude.trim()
        ? `(${location.latitude.trim()}, ${location.longitude.trim()})`
        : '',
    ].filter(Boolean).join(' ')
  }).filter(Boolean)

  return labels.join(', ')
}

export function getItineraryIntroTargetId(draft: ListicleItineraryDraft): string {
  return `${draft.draftId}${INTRO_TARGET_ID_SUFFIX}`
}

function buildIntroTarget(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
  articleLocationLabel: string,
): GenerateListicleContentTarget {
  const selectedTitles = getItineraryBlocksInArticleOrder(draft)
    .map((item) => {
      if (isManualItineraryBlockType(item.blockType)) {
        return item.title.trim() || item.operator.trim() || ''
      }
      const relatedOptions = relatedByBlockType[item.blockType] || []
      return relatedOptions.find((entry) => entry.id === item.item)?.title?.trim() || ''
    })
    .filter(Boolean)

  const supportingContext = [
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
  item: ItineraryItemBlock,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
  articleLocationLabel: string,
): GenerateListicleContentTarget {
  const manualTourDurationLabel = `${item.tourDuration} hour${item.tourDuration === 1 ? '' : 's'}`
  const manualStartingPoint = [
    item.startingPoint.label.trim(),
    item.startingPoint.latitude.trim(),
    item.startingPoint.longitude.trim(),
  ]
  const hasManualStartingPoint = manualStartingPoint.some(Boolean)
  const formattedManualStartingPoint = hasManualStartingPoint
    ? item.startingPoint.label.trim()
      ? `${item.startingPoint.label.trim()} (${item.startingPoint.latitude.trim()}, ${item.startingPoint.longitude.trim()})`
      : `${item.startingPoint.latitude.trim()}, ${item.startingPoint.longitude.trim()}`
    : ''
  const isManualStop = isManualItineraryBlockType(item.blockType)
  const displayName = isManualStop
    ? item.title.trim() || item.operator.trim() || 'Tour agency stop'
    : undefined
  const supportingContext = [
    `Article title: ${draft.title.trim()}`,
    `Block category: ${mapBlockTypeToCategory(item.blockType)}`,
    isManualStop ? `Operator: ${item.operator.trim() || 'Unknown'}` : '',
    isManualStop && item.price ? `Price: ${item.price}` : '',
    isManualStop ? `Tour duration: ${manualTourDurationLabel}` : '',
    isManualStop && formattedManualStartingPoint ? `Starting point: ${formattedManualStartingPoint}` : '',
    isManualStop && item.keyLocations.length > 0 ? `Key locations: ${buildManualKeyLocationContext(item, relatedByBlockType)}` : '',
    isManualStop && item.url.trim() ? `Booking URL: ${item.url.trim()}` : '',
    !isManualStop ? `Media mode: ${item.mediaMode}` : '',
  ].filter(Boolean).join('\n')

  return {
    targetId: `${item.id}_blurb`,
    fieldType: 'blurb',
    category: mapBlockTypeToCategory(item.blockType),
    displayName: displayName || 'Stop blurb',
    researchSubject: displayName || 'Tour agency stop',
    locationLabel: articleLocationLabel,
    currentContent: item.blurbMarkdown,
    supportingContext,
    angle: resolveItineraryAngleForBlockType(item.blockType, item.angle),
  }
}

/**
 * Why a stop is not yet eligible for auto-write, or undefined if it is.
 * Mirrors single-type angle gating (ADR 0010): a stop whose category has an
 * angle pool must have an angle selected. Pool-less stops (`key-location`,
 * `tour-agency`) and single-angle nightlife are always eligible.
 */
export function getItineraryStopAngleDisabledReason(
  item: ItineraryItemBlock,
): string | undefined {
  if (getItineraryAngleOptions(item.blockType).length === 0) return undefined
  if (resolveItineraryAngleForBlockType(item.blockType, item.angle) === null) {
    return 'Select a blurb angle before generating'
  }
  return undefined
}

export function getItineraryAutoWriteTargetIds(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string[] {
  const targetIds: string[] = []
  if (!draft.header.introMarkdown.trim()) {
    targetIds.push(getItineraryIntroTargetId(draft))
  }

  getItineraryBlocksInArticleOrder(draft).forEach((item) => {
    if (item.blurbMarkdown.trim()) return
    if (!isManualItineraryBlockType(item.blockType)) {
      if (!item.item) return
      const relatedOptions = relatedByBlockType[item.blockType] || []
      const relatedItem = relatedOptions.find((entry) => entry.id === item.item)
      if (!relatedItem) return
    } else if (!item.title.trim() && !item.operator.trim()) {
      return
    }
    // Skip-with-reason: pooled-category stops need an angle before auto-write.
    if (getItineraryStopAngleDisabledReason(item)) return
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

  getItineraryBlocksInArticleOrder(draft).forEach((item) => {
    let target: GenerateListicleContentTarget | null = null

    if (isManualItineraryBlockType(item.blockType)) {
      target = buildStopTarget(draft, item, relatedByBlockType, articleLocationLabel)
    } else {
      if (!item.item) return
      const relatedOptions = relatedByBlockType[item.blockType] || []
      const relatedItem = relatedOptions.find((entry) => entry.id === item.item)
      if (!relatedItem) return
      target = {
        ...buildStopTarget(draft, item, relatedByBlockType, articleLocationLabel),
        displayName: relatedItem.title,
        researchSubject: relatedItem.title,
        locationLabel: relatedItem.location?.trim() || articleLocationLabel,
        payloadDocId: String(relatedItem.id),
        payloadCollection: mapBlockTypeToPayloadCollection(item.blockType),
        supportingContext: [
          `Article title: ${draft.title.trim()}`,
          `Block category: ${mapBlockTypeToCategory(item.blockType)}`,
          relatedItem.location?.trim() ? `Known item location: ${relatedItem.location.trim()}` : '',
          `Media mode: ${item.mediaMode}`,
        ].filter(Boolean).join('\n'),
      }
    }

    if (!target) return
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
    listTone: draft.listTone,
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
    days: draft.days.map((day) => ({
      ...day,
      whereStaying: day.whereStaying.map((item) => {
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
      items: day.items.map((item) => {
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
    })),
  }
}
