import { DEFAULT_EDITOR_ASSIST_MODEL } from '../staging/api/ai/models'
import { createEmptySeoSection, normalizeSeoSection } from './builder/services/seo-section.service'
import type { SingleTypeListicleDraft } from './types'
import { normalizeLocationIds } from '../locationScope/scope'

const STORAGE_KEY = 'single_type_listicles_staged_v4_exact_neighborhoods'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

function parseDraftArray(storageKey: string): unknown[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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
    editorModelName: typeof value.editorModelName === 'string'
      ? value.editorModelName as SingleTypeListicleDraft['editorModelName']
      : DEFAULT_EDITOR_ASSIST_MODEL,
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
    items: Array.isArray(value.items) ? value.items as SingleTypeListicleDraft['items'] : [],
    seoSection: normalizeSeoSection(value.seoSection ?? createEmptySeoSection()),
    status: value.status === 'published' ? 'published' : 'draft',
    articleType: 'single-type-listicle',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso,
  }
}

export function listDrafts(): SingleTypeListicleDraft[] {
  return parseDraftArray(STORAGE_KEY)
    .map((draft, index) => normalizeStoredDraft(draft, index))
    .filter((draft): draft is SingleTypeListicleDraft => Boolean(draft))
}

export function saveDraft(draft: SingleTypeListicleDraft): void {
  const all = listDrafts()
  const index = all.findIndex((item) => item.draftId === draft.draftId)
  const next = {
    ...draft,
    updatedAt: new Date().toISOString(),
  }

  if (index >= 0) {
    all[index] = next
  } else {
    all.push(next)
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function removeDraft(draftId: string): void {
  const all = listDrafts()
  const next = all.filter((item) => item.draftId !== draftId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function findDraftByPayloadId(payloadId: number): SingleTypeListicleDraft | null {
  const all = listDrafts()
  return all.find((item) => item.payloadId === payloadId) || null
}

export function findDraftByDraftId(draftId: string): SingleTypeListicleDraft | null {
  const all = listDrafts()
  return all.find((item) => item.draftId === draftId) || null
}

export function createEmptyDraft(): SingleTypeListicleDraft {
  return {
    draftId: `stl_${Date.now()}`,
    payloadStatus: undefined,
    payloadSlug: undefined,
    payloadPublishedAt: undefined,
    payloadUpdatedAt: undefined,
    payloadAuthorName: undefined,
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
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
