import { DEFAULT_EDITOR_ASSIST_MODEL, resolveEditorAssistModelName } from '../../shared/api/ai/models'
import { createDraftStorage } from '../../shared/builder/storage/createDraftStorage'
import { createEmptySeoSection, normalizeSeoSection } from './builder/services/seo-section.service'
import type { ListicleItemBlock, SingleTypeListicleDraft } from './types'
import { DEFAULT_LIST_TONE, resolveListTone, resolveListicleAngleForBlockType } from './types'
import { normalizeLocationIds } from '../../shared/locationScope/scope'

const STORAGE_KEY = 'single_type_listicles_staged_v4_exact_neighborhoods'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

/**
 * Coerce items pulled from localStorage. Nightlife items with legacy
 * angle values (room-feel, order-timing-tip) or null get normalized to
 * best-for-night per ADR 0008. Non-nightlife items are passed through.
 */
function coerceStoredItems(items: unknown[]): ListicleItemBlock[] {
  return items.map((entry) => {
    if (!isRecord(entry)) return entry as ListicleItemBlock
    const blockType = entry.blockType as ListicleItemBlock['blockType'] | undefined
    const tours = Array.isArray(entry.tours)
      ? entry.tours.filter((tourId): tourId is number => typeof tourId === 'number')
      : []
    if (blockType === 'data-nightlife') {
      return {
        ...(entry as ListicleItemBlock),
        tours,
        angle: resolveListicleAngleForBlockType(blockType, entry.angle),
      }
    }
    return {
      ...(entry as ListicleItemBlock),
      tours,
    }
  })
}

function normalizeStoredDraft(value: unknown, index: number): SingleTypeListicleDraft | null {
  if (!isRecord(value)) return null

  const nowIso = new Date().toISOString()
  const fallbackDraftId = `stl_migrated_${Date.now()}_${index}`
  const header = isRecord(value.header) ? value.header : {}

  return {
    draftId: typeof value.draftId === 'string' && value.draftId.trim() ? value.draftId : fallbackDraftId,
    payloadId: typeof value.payloadId === 'number' ? value.payloadId : undefined,
    payloadStatus: value.payloadStatus === 'published' ? 'published' : value.payloadStatus === 'draft' ? 'draft' : undefined,
    payloadSlug: typeof value.payloadSlug === 'string' && value.payloadSlug.trim() ? value.payloadSlug : undefined,
    payloadPublishedAt: typeof value.payloadPublishedAt === 'string' && value.payloadPublishedAt.trim() ? value.payloadPublishedAt : undefined,
    payloadUpdatedAt: typeof value.payloadUpdatedAt === 'string' && value.payloadUpdatedAt.trim() ? value.payloadUpdatedAt : undefined,
    payloadAuthorName: typeof value.payloadAuthorName === 'string' && value.payloadAuthorName.trim() ? value.payloadAuthorName : undefined,
    editorModelName: resolveEditorAssistModelName(
      typeof value.editorModelName === 'string' ? value.editorModelName : undefined,
    ),
    listTone: resolveListTone(value.listTone),
    title: typeof value.title === 'string' ? value.title : '',
    location: typeof value.location === 'string' ? value.location : '',
    locationRef: typeof value.locationRef === 'number' ? value.locationRef : null,
    sharedNeighborhoods: normalizeLocationIds(value.sharedNeighborhoods),
    listicleType:
      value.listicleType === 'dining'
      || value.listicleType === 'accommodations'
      || value.listicleType === 'attractions'
      || value.listicleType === 'nightlife'
        ? value.listicleType
        : '',
    targetItemCount: typeof value.targetItemCount === 'number' ? value.targetItemCount : 0,
    step1_complete: Boolean(value.step1_complete),
    in_update_mode: Boolean(value.in_update_mode),
    step2_complete: Boolean(value.step2_complete),
    step2_in_update_mode: Boolean(value.step2_in_update_mode),
    step3_complete: Boolean(value.step3_complete),
    step3_in_update_mode: Boolean(value.step3_in_update_mode),
    header: {
      introMarkdown: typeof header.introMarkdown === 'string' ? header.introMarkdown : '',
      introLexical: isRecord(header.introLexical) ? header.introLexical : undefined,
      introJsonText: typeof header.introJsonText === 'string' ? header.introJsonText : '',
      featuredImage: typeof header.featuredImage === 'number' ? header.featuredImage : null,
    },
    items: Array.isArray(value.items) ? coerceStoredItems(value.items) : [],
    seoSection: normalizeSeoSection(value.seoSection ?? createEmptySeoSection()),
    status: value.status === 'published' ? 'published' : 'draft',
    articleType: 'single-type-listicle',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso,
  }
}

const storage = createDraftStorage<SingleTypeListicleDraft>({
  storageKey: STORAGE_KEY,
  normalizeStoredDraft,
})

export const listDrafts = storage.listDrafts
export const saveDraft = storage.saveDraft
export const removeDraft = storage.removeDraft
export const findDraftByPayloadId = storage.findDraftByPayloadId
export const findDraftByDraftId = storage.findDraftByDraftId

export function createEmptyDraft(): SingleTypeListicleDraft {
  return {
    draftId: `stl_${Date.now()}`,
    payloadStatus: undefined,
    payloadSlug: undefined,
    payloadPublishedAt: undefined,
    payloadUpdatedAt: undefined,
    payloadAuthorName: undefined,
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    listTone: DEFAULT_LIST_TONE,
    title: '',
    location: '',
    locationRef: null,
    sharedNeighborhoods: [],
    listicleType: '',
    targetItemCount: 0,
    step1_complete: false,
    in_update_mode: false,
    step2_complete: false,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: {
      introMarkdown: '',
      introJsonText: '',
      featuredImage: null,
    },
    items: [],
    seoSection: createEmptySeoSection(),
    status: 'draft',
    articleType: 'single-type-listicle',
    updatedAt: new Date().toISOString(),
  }
}
