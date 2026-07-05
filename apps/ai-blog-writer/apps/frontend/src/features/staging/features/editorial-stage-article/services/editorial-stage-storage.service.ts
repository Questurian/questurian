import type { DraftUserStamp, StagedArticle } from '../../../types'
import {
  clearStagedDrafts,
  deleteStagedDraft,
  fetchStagedDraft,
  fetchStagedDrafts,
  putStagedDraft,
  type PutStagedDraftOptions,
} from '../../../api/staged-drafts/staged-drafts.api'
import { resolveEditorModelName } from '../constants'
import { createEmptySeoSection, normalizeSeoSection } from '../../../../../shared/seo/services/seo-section.service'
import { normalizeSharedNeighborhoods } from '../utils/sharedNeighborhoods'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const hasMeaningfulBlockContent = (article: Pick<StagedArticle, 'blocks' | 'content'>): boolean => (
  article.blocks.some((block) => block.content.trim().length > 0) || article.content.trim().length > 0
)

const normalizeUserStamp = (value: unknown): DraftUserStamp | undefined => {
  if (!isRecord(value)) return undefined
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : undefined
  const email = typeof value.email === 'string' && value.email.trim() ? value.email : undefined
  if (!id || !email) return undefined
  return {
    id,
    email,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : undefined,
  }
}

export function normalizeStagedArticle(value: unknown): StagedArticle | null {
  if (!isRecord(value)) return null

  const nowIso = new Date().toISOString()
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : `staged_${Date.now()}`
  const title = typeof value.title === 'string' ? value.title : ''
  const content = typeof value.content === 'string' ? value.content : ''
  const blocks = Array.isArray(value.blocks) ? value.blocks as StagedArticle['blocks'] : []
  const locationId = typeof value.locationId === 'number' && Number.isFinite(value.locationId)
    ? value.locationId
    : undefined
  const sharedNeighborhoods = normalizeSharedNeighborhoods(value.sharedNeighborhoods)
  const featuredImageId = typeof value.featuredImageId === 'number' && Number.isFinite(value.featuredImageId)
    ? value.featuredImageId
    : undefined

  const derivedStep1Complete = Boolean(title.trim() && locationId)
  const derivedStep2Complete = Boolean(derivedStep1Complete && featuredImageId)
  const derivedStep3Complete = Boolean(derivedStep2Complete && hasMeaningfulBlockContent({ blocks, content }))

  return {
    id,
    runId: typeof value.runId === 'string' ? value.runId : '',
    originalTitle: typeof value.originalTitle === 'string' ? value.originalTitle : '',
    originalContent: typeof value.originalContent === 'string' ? value.originalContent : '',
    originalType: typeof value.originalType === 'string' ? value.originalType : '',
    title,
    content,
    blocks,
    editorialBlocks: Array.isArray(value.editorialBlocks) ? value.editorialBlocks as StagedArticle['editorialBlocks'] : [],
    locationId,
    sharedNeighborhoods,
    editorModelName: resolveEditorModelName(
      typeof value.editorModelName === 'string' ? value.editorModelName : undefined
    ),
    featuredImageId,
    step1_complete: typeof value.step1_complete === 'boolean' ? value.step1_complete : derivedStep1Complete,
    in_update_mode: typeof value.in_update_mode === 'boolean' ? value.in_update_mode : false,
    step2_complete: typeof value.step2_complete === 'boolean' ? value.step2_complete : derivedStep2Complete,
    step2_in_update_mode: typeof value.step2_in_update_mode === 'boolean' ? value.step2_in_update_mode : false,
    step3_complete: typeof value.step3_complete === 'boolean' ? value.step3_complete : derivedStep3Complete,
    step3_in_update_mode: typeof value.step3_in_update_mode === 'boolean' ? value.step3_in_update_mode : false,
    seoSection: normalizeSeoSection(value.seoSection ?? createEmptySeoSection()),
    syncBehavior: value.syncBehavior === 'draft-sync' ? 'draft-sync' : 'finalize',
    lexicalConverted: Boolean(value.lexicalConverted),
    lexicalData: isRecord(value.lexicalData) ? value.lexicalData : undefined,
    publishedToPayload: Boolean(value.publishedToPayload),
    payloadArticleId: typeof value.payloadArticleId === 'number' && Number.isFinite(value.payloadArticleId)
      ? value.payloadArticleId
      : undefined,
    payloadStatus: value.payloadStatus === 'published' ? 'published' : value.payloadStatus === 'draft' ? 'draft' : undefined,
    payloadSlug: typeof value.payloadSlug === 'string' && value.payloadSlug.trim() ? value.payloadSlug : undefined,
    payloadPublishedAt: typeof value.payloadPublishedAt === 'string' && value.payloadPublishedAt.trim()
      ? value.payloadPublishedAt
      : undefined,
    payloadUpdatedAt: typeof value.payloadUpdatedAt === 'string' && value.payloadUpdatedAt.trim()
      ? value.payloadUpdatedAt
      : undefined,
    payloadAuthorName: typeof value.payloadAuthorName === 'string' && value.payloadAuthorName.trim()
      ? value.payloadAuthorName
      : undefined,
    createdBy: normalizeUserStamp(value.createdBy),
    lastEditedBy: normalizeUserStamp(value.lastEditedBy),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : nowIso,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso,
  }
}

// Staged drafts are persisted server-side (keyed by `storageKey` + draft id) so
// builder "Resume" links resolve across browsers/devices. These helpers stay thin
// wrappers over the API client; `normalizeStagedArticle` still runs client-side so
// the builder always receives a fully-shaped draft regardless of what was stored.

export async function getAllStagedArticles(storageKey: string): Promise<StagedArticle[]> {
  const drafts = await fetchStagedDrafts(storageKey)
  return drafts
    .map((entry) => normalizeStagedArticle(entry))
    .filter((entry): entry is StagedArticle => Boolean(entry))
}

export async function getStagedArticle(
  storageKey: string,
  stagedArticleId: string,
): Promise<StagedArticle | null> {
  const draft = await fetchStagedDraft(storageKey, stagedArticleId)
  return draft ? normalizeStagedArticle(draft) : null
}

export async function saveAllStagedArticles(
  storageKey: string,
  stagedArticles: StagedArticle[]
): Promise<void> {
  // Callers only ever add/update drafts through this path (never rely on it to
  // delete), so an upsert-per-draft matches the previous "overwrite" semantics.
  await Promise.all(stagedArticles.map((draft) => putStagedDraft(storageKey, draft)))
}

export async function upsertStagedArticle(
  storageKey: string,
  stagedArticle: StagedArticle,
  options?: PutStagedDraftOptions,
): Promise<StagedArticle> {
  return putStagedDraft(storageKey, stagedArticle, options)
}

export async function removeStagedArticle(
  storageKey: string,
  stagedArticleId: string
): Promise<void> {
  await deleteStagedDraft(storageKey, stagedArticleId)
}

export async function clearAllStagedArticles(storageKey: string): Promise<void> {
  await clearStagedDrafts(storageKey)
}
