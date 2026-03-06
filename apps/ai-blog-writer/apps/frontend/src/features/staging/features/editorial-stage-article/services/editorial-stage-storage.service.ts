import type { StagedArticle } from '../../../types'
import { resolveEditorModelName } from '../constants'
import { createEmptySeoSection, normalizeSeoSection } from '../../../../shared/seo/services/seo-section.service'

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const hasMeaningfulBlockContent = (article: Pick<StagedArticle, 'blocks' | 'content'>): boolean => (
  article.blocks.some((block) => block.content.trim().length > 0) || article.content.trim().length > 0
)

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
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : nowIso,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso,
  }
}

export function getAllStagedArticles(storageKey: string): StagedArticle[] {
  const stored = localStorage.getItem(storageKey)
  if (!stored) return []

  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => normalizeStagedArticle(entry))
      .filter((entry): entry is StagedArticle => Boolean(entry))
  } catch {
    return []
  }
}

export function saveAllStagedArticles(
  storageKey: string,
  stagedArticles: StagedArticle[]
): void {
  localStorage.setItem(storageKey, JSON.stringify(stagedArticles))
}

export function upsertStagedArticle(
  storageKey: string,
  stagedArticle: StagedArticle
): void {
  const allStaged = getAllStagedArticles(storageKey)
  const index = allStaged.findIndex((candidate) => candidate.id === stagedArticle.id)
  if (index >= 0) {
    allStaged[index] = stagedArticle
  } else {
    allStaged.push(stagedArticle)
  }
  saveAllStagedArticles(storageKey, allStaged)
}

export function removeStagedArticle(
  storageKey: string,
  stagedArticleId: string
): void {
  const allStaged = getAllStagedArticles(storageKey)
  saveAllStagedArticles(
    storageKey,
    allStaged.filter((article) => article.id !== stagedArticleId)
  )
}
