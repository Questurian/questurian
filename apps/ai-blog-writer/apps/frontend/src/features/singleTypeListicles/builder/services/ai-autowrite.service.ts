import { findLocationByKey } from '../../../../shared/locationScope/scope'
import type {
  GenerateListicleContentRequest,
  GenerateListicleContentResponse,
  GenerateListicleContentTarget,
  ListicleWriterCategory,
} from '../../../staging/api'
import type {
  ListicleBlockType,
  LocationOption,
  RelatedItemOption,
  SingleTypeListicleDraft,
} from '../../types'
import { buildListicleAiArticleContext, getListicleAiArticleTitle } from './ai-rewrite.service'

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
  draft: SingleTypeListicleDraft,
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

function mapBlockTypeToCategory(blockType: ListicleBlockType): ListicleWriterCategory {
  switch (blockType) {
    case 'data-accommodations':
      return 'accommodations'
    case 'data-attractions':
      return 'attractions'
    case 'data-nightlife':
      return 'nightlife'
    case 'data-dining':
    default:
      return 'dining'
  }
}

function mapBlockTypeToPayloadCollection(
  blockType: ListicleBlockType,
): 'dining' | 'accommodations' | 'attractions' | 'nightlife' {
  switch (blockType) {
    case 'data-accommodations':
      return 'accommodations'
    case 'data-attractions':
      return 'attractions'
    case 'data-nightlife':
      return 'nightlife'
    case 'data-dining':
    default:
      return 'dining'
  }
}

export function getSingleTypeIntroTargetId(draft: SingleTypeListicleDraft): string {
  return `${draft.draftId}${INTRO_TARGET_ID_SUFFIX}`
}

function buildIntroTarget(
  draft: SingleTypeListicleDraft,
  relatedItems: RelatedItemOption[],
  articleLocationLabel: string,
): GenerateListicleContentTarget {
  const selectedTitles = draft.items
    .map((item) => relatedItems.find((entry) => entry.id === item.item)?.title?.trim() || '')
    .filter(Boolean)

  const supportingContext = [
    `Listicle type: ${draft.listicleType || 'unknown'}`,
    draft.targetItemCount > 0 ? `Target item count: ${draft.targetItemCount}` : '',
    selectedTitles.length > 0 ? `Selected venues: ${selectedTitles.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  return {
    targetId: getSingleTypeIntroTargetId(draft),
    fieldType: 'intro',
    currentContent: draft.header.introMarkdown,
    locationLabel: articleLocationLabel,
    supportingContext,
  }
}

function buildItemTarget(
  draft: SingleTypeListicleDraft,
  relatedItem: RelatedItemOption,
  item: SingleTypeListicleDraft['items'][number],
  articleLocationLabel: string,
): GenerateListicleContentTarget {
  const supportingContext = [
    `Article title: ${draft.title.trim()}`,
    `Listicle type: ${draft.listicleType || 'unknown'}`,
    relatedItem.location?.trim() ? `Known item location: ${relatedItem.location.trim()}` : '',
    relatedItem.idealFor?.length ? `Ideal for: ${relatedItem.idealFor.join(', ')}` : '',
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
    payloadDocId: relatedItem.id ? String(relatedItem.id) : undefined,
    payloadCollection: mapBlockTypeToPayloadCollection(item.blockType),
    angle: item.angle ?? null,
  }
}

export function getSingleTypeAutoWriteTargetIds(
  draft: SingleTypeListicleDraft,
  relatedItems: RelatedItemOption[],
): string[] {
  const targetIds: string[] = []
  if (!draft.header.introMarkdown.trim()) {
    targetIds.push(getSingleTypeIntroTargetId(draft))
  }

  draft.items.forEach((item) => {
    if (item.blurbMarkdown.trim()) return
    if (!item.item) return
    const relatedItem = relatedItems.find((entry) => entry.id === item.item)
    if (!relatedItem) return
    targetIds.push(`${item.id}_blurb`)
  })

  return targetIds
}

export function buildSingleTypeGenerateListicleContentRequest(params: {
  draft: SingleTypeListicleDraft
  relatedItems: RelatedItemOption[]
  locations: LocationOption[]
  targetIds: string[]
  modelName: SingleTypeListicleDraft['editorModelName']
  customInstruction?: string
  skipExisting?: boolean
  includeArticleContext?: boolean
}): GenerateListicleContentRequest {
  const {
    draft,
    relatedItems,
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

  const introTarget = buildIntroTarget(draft, relatedItems, articleLocationLabel)
  if (targetIdSet.has(introTarget.targetId)) {
    targets.push(introTarget)
  }

  draft.items.forEach((item) => {
    if (!item.item) return
    const relatedItem = relatedItems.find((entry) => entry.id === item.item)
    if (!relatedItem) return
    const target = buildItemTarget(draft, relatedItem, item, articleLocationLabel)
    if (targetIdSet.has(target.targetId)) {
      targets.push(target)
    }
  })

  return {
    articleTitle: getListicleAiArticleTitle(draft),
    articleType: 'single-type-listicle',
    locationLabel: articleLocationLabel,
    articleContext: includeArticleContext ? buildListicleAiArticleContext(draft, relatedItems) : undefined,
    modelName,
    customInstruction,
    skipExisting,
    listTone: draft.listTone,
    targets,
  }
}

export function applySingleTypeListicleGeneratedContent(
  draft: SingleTypeListicleDraft,
  response: GenerateListicleContentResponse,
): SingleTypeListicleDraft {
  const introTargetId = getSingleTypeIntroTargetId(draft)
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
