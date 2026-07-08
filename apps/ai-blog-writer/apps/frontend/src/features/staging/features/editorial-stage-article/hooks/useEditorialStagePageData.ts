import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Location, MediaAsset } from '../../../api'
import type { DraftUserStamp, StagedArticle } from '../../../types'
import { useAuth } from '../../../../auth'
import { createEmptySeoSection } from '../../../../../shared/seo/services/seo-section.service'
import { getSchemaPublisherConfig } from '../../../../../shared/seo/services/schema-publisher-config.service'
import type { EditorialStageArticleApi } from '../types'
import { DEFAULT_EDITOR_MODEL_NAME, resolveEditorModelName } from '../constants'
import { extractEditorialBlocks, getEditorialBlockBody } from '../editorial-markdown.service'
import {
  attachEditorialBlocksToContentBlocks,
  composeArticleMarkdown,
  fetchEditorialBlocksFromRun,
  hasMeaningfulEditorialPlacement,
  migrateEditorialBlocksForStandaloneMedia,
  normalizeBlocks,
  parseMarkdownToBlocksDetailed,
} from '../workflow.service'
import {
  getAllStagedArticles,
  getStagedArticle,
  removeStagedArticle,
  upsertStagedArticle,
} from '../services/editorial-stage-storage.service'
import {
  StagedDraftSaveQueue,
  type StagedDraftConflict,
} from '../services/staged-draft-save-queue'
import { buildPayloadArticleMetadataPatch } from '../services/payload-article-metadata.service'
import { mergeMediaAssetLists } from '../media-utils'
import { refreshDraftPayloadSyncState } from '../../../../../shared/payloadSync/draftPayloadSync'
import {
  buildStagedArticlePayloadComparableShape,
  hasPayloadArticleIdentity,
} from '../services/staged-article-payload-sync.service'

const MEDIA_ASSET_PAGE_LIMIT = 200

type UseEditorialStagePageDataParams = {
  storageKey: string
  stageArticlePath: string
  stagePath: string
  token: string | null | undefined
  syncBehavior?: 'finalize' | 'draft-sync'
  api: Pick<EditorialStageArticleApi, 'fetchResult' | 'fetchLocations' | 'fetchMediaAssets' | 'getArticleSyncStatus' | 'getArticleById'>
}

export function useEditorialStagePageData({
  storageKey,
  stageArticlePath,
  stagePath,
  token,
  syncBehavior = 'finalize',
  api,
}: UseEditorialStagePageDataParams) {
  const { fetchResult, fetchLocations, fetchMediaAssets, getArticleSyncStatus, getArticleById } = api
  const schemaPublisherConfig = getSchemaPublisherConfig()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const urlRunId = searchParams.get('runId') || ''
  const urlTitle = searchParams.get('title') || ''
  const urlContent = searchParams.get('content') || ''
  const urlType = searchParams.get('type') || ''
  const stagedId = searchParams.get('stagedId') || ''

  const { user } = useAuth()

  const [locations, setLocations] = useState<Location[]>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stagedArticle, setStagedArticle] = useState<StagedArticle | null>(null)
  const [saveConflict, setSaveConflict] = useState<StagedDraftConflict | null>(null)

  const saveQueueRef = useRef<StagedDraftSaveQueue | null>(null)
  const userStampRef = useRef<DraftUserStamp | null>(null)
  userStampRef.current = user?.id && user.email
    ? {
        id: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      }
    : null

  const createSaveQueue = useCallback((initialServerUpdatedAt: string | null) => {
    saveQueueRef.current = new StagedDraftSaveQueue({
      storageKey,
      initialServerUpdatedAt,
      onConflict: (conflict) => setSaveConflict(conflict),
      onError: (saveError) => {
        console.warn('Staged draft save failed; will retry on next change', saveError)
      },
    })
    return saveQueueRef.current
  }, [storageKey])

  useEffect(() => () => {
    // Best-effort flush of a pending debounced save when leaving the page.
    void saveQueueRef.current?.flush()
  }, [])

  const normalizeLoadedArticle = useCallback(async (existing: StagedArticle): Promise<StagedArticle> => {
    const extractedFromContent = extractEditorialBlocks(existing.content)
    const extractedFromOriginal = extractEditorialBlocks(existing.originalContent || existing.content)
    const contentForParsing = extractedFromContent.bodyMarkdown || existing.content
    const originalContentForReset = extractedFromOriginal.bodyMarkdown || contentForParsing
    const parsedDetails = parseMarkdownToBlocksDetailed(contentForParsing)
    const normalizedBlocksResult =
      existing.blocks?.length
        ? normalizeBlocks(existing.blocks, contentForParsing)
        : {
            blocks: parsedDetails.blocks,
            mediaBlockIdByLegacyAnchorId: new Map<string, string>(),
          }
    const normalizedBlocks = normalizedBlocksResult.blocks
    const existingEditorialBlocks = migrateEditorialBlocksForStandaloneMedia(
      existing.editorialBlocks || [],
      normalizedBlocksResult.mediaBlockIdByLegacyAnchorId
    ).filter((block) => getEditorialBlockBody(block.markdown).trim().length > 0)
    const hasMeaningfulExistingPlacement = hasMeaningfulEditorialPlacement(
      existingEditorialBlocks,
      normalizedBlocks
    )
    let fallbackEditorialBlocks = extractedFromContent.editorialBlocks

    if (!hasMeaningfulExistingPlacement && existing.runId) {
      const runEditorialBlocks = await fetchEditorialBlocksFromRun(
        existing.runId,
        fetchResult
      )
      if (runEditorialBlocks.length > 0) {
        fallbackEditorialBlocks = runEditorialBlocks
      }
    }

    const normalizedEditorialBlocks = attachEditorialBlocksToContentBlocks(
      normalizedBlocks,
      parsedDetails.ranges,
      hasMeaningfulExistingPlacement
        ? existingEditorialBlocks
        : fallbackEditorialBlocks,
      hasMeaningfulExistingPlacement
    )

    let payloadMetadataPatch: Partial<StagedArticle> = {}

    if (existing.payloadArticleId && token && getArticleById) {
      try {
        const payloadDoc = await getArticleById(existing.payloadArticleId, token)
        payloadMetadataPatch = buildPayloadArticleMetadataPatch({
          doc: payloadDoc,
          fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
        })
      } catch {
        // Ignore payload metadata hydration errors during bootstrap.
      }
    }

    const normalizedArticle: StagedArticle = {
      ...existing,
      ...payloadMetadataPatch,
      originalContent: originalContentForReset,
      blocks: normalizedBlocks,
      content: composeArticleMarkdown(normalizedBlocks, normalizedEditorialBlocks),
      editorialBlocks: normalizedEditorialBlocks,
      editorModelName: resolveEditorModelName(existing.editorModelName),
      syncBehavior,
    }

    return refreshDraftPayloadSyncState(
      normalizedArticle,
      buildStagedArticlePayloadComparableShape,
      {
        hasPayloadIdentity: hasPayloadArticleIdentity,
        missingBaselineIsUnsynced: true,
      },
    )
  }, [fetchResult, getArticleById, schemaPublisherConfig.defaultAuthorName, syncBehavior, token])

  useEffect(() => {
    if (!urlRunId && !stagedId) return

    let isCancelled = false

    const persistIfNormalizationChanged = async (
      existing: StagedArticle,
      normalizedExisting: StagedArticle,
    ) => {
      const blocksChanged = JSON.stringify(existing.blocks) !== JSON.stringify(normalizedExisting.blocks)
      const editorialChanged = JSON.stringify(existing.editorialBlocks || []) !== JSON.stringify(normalizedExisting.editorialBlocks || [])
      const contentChanged = existing.content !== normalizedExisting.content
      const modelChanged = existing.editorModelName !== normalizedExisting.editorModelName
      const syncBehaviorChanged = existing.syncBehavior !== normalizedExisting.syncBehavior
      if (blocksChanged || editorialChanged || contentChanged || modelChanged || syncBehaviorChanged) {
        await saveQueueRef.current?.saveNow(normalizedExisting)
      }
    }

    const loadStagedArticle = async () => {
      try {
        if (stagedId) {
          const existing = await getStagedArticle(storageKey, stagedId)
          if (existing) {
            createSaveQueue(existing.updatedAt)
            const normalizedExisting = await normalizeLoadedArticle(existing)

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            await persistIfNormalizationChanged(existing, normalizedExisting)
          } else if (!isCancelled) {
            setError('Staged article not found')
          }
        } else if (urlRunId) {
          const allStaged = await getAllStagedArticles(storageKey)
          const existing = allStaged.find((candidate) => candidate.runId === urlRunId) ?? null
          if (existing) {
            createSaveQueue(existing.updatedAt)
            const normalizedExisting = await normalizeLoadedArticle(existing)

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            await persistIfNormalizationChanged(existing, normalizedExisting)

            navigate(`${stageArticlePath}?stagedId=${existing.id}`, {
              replace: true,
            })
          } else {
            let markdown = urlContent
            if (!markdown) {
              const result = await fetchResult(urlRunId)
              markdown = result.markdown || ''
            }

            if (!markdown.trim()) {
              if (!isCancelled) {
                setError('Unable to load article content for staging')
              }
              return
            }

            const extracted = extractEditorialBlocks(markdown)
            const parsedDetails = parseMarkdownToBlocksDetailed(extracted.bodyMarkdown)
            const blocks = parsedDetails.blocks
            const editorialBlocks = attachEditorialBlocksToContentBlocks(
              blocks,
              parsedDetails.ranges,
              extracted.editorialBlocks
            )
            const newStaged: StagedArticle = {
              id: `staged_${Date.now()}`,
              runId: urlRunId,
              originalTitle: urlTitle,
              originalContent: extracted.bodyMarkdown,
              originalType: urlType,
              title: urlTitle,
              content: composeArticleMarkdown(blocks, editorialBlocks),
              blocks,
              editorialBlocks,
              sharedNeighborhoods: [],
              editorModelName: DEFAULT_EDITOR_MODEL_NAME,
              step1_complete: false,
              in_update_mode: false,
              step2_complete: false,
              step2_in_update_mode: false,
              step3_complete: false,
              step3_in_update_mode: false,
              seoSection: createEmptySeoSection(),
              syncBehavior,
              lexicalConverted: false,
              publishedToPayload: false,
              payloadStatus: undefined,
              payloadSlug: undefined,
              payloadPublishedAt: undefined,
              payloadUpdatedAt: undefined,
              payloadAuthorName: undefined,
              createdBy: userStampRef.current ?? undefined,
              lastEditedBy: userStampRef.current ?? undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }

            // Persist to the server before navigating so the ?stagedId link
            // resolves on the next load (avoids the "Article not found" race).
            const savedNewStaged = await upsertStagedArticle(storageKey, newStaged)
            createSaveQueue(savedNewStaged.updatedAt)

            if (!isCancelled) {
              setStagedArticle(newStaged)
            }
            navigate(`${stageArticlePath}?stagedId=${newStaged.id}`, {
              replace: true,
            })
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load staged article')
        }
      }
    }

    void loadStagedArticle()
    return () => {
      isCancelled = true
    }
  }, [
    urlRunId,
    stagedId,
    urlTitle,
    urlContent,
    urlType,
    navigate,
    storageKey,
    stageArticlePath,
    fetchResult,
    normalizeLoadedArticle,
    syncBehavior,
    createSaveQueue,
  ])

  useEffect(() => {
    if (!getArticleSyncStatus || !stagedArticle?.runId) return

    let isCancelled = false

    const hydrateSyncStatus = async () => {
      try {
        const syncStatus = await getArticleSyncStatus(stagedArticle.runId)
        if (isCancelled || !syncStatus.synced_to_payload || !syncStatus.payload_article_id) return

        const payloadMetadataPatch: Partial<StagedArticle> = (
          token && getArticleById
            ? await getArticleById(syncStatus.payload_article_id, token)
              .then((payloadDoc) => buildPayloadArticleMetadataPatch({
                doc: payloadDoc,
                fallbackAuthorName: schemaPublisherConfig.defaultAuthorName,
              }))
              .catch(() => ({}))
            : {}
        )

        setStagedArticle((previous) => {
          if (!previous) return previous
          if (
            previous.payloadArticleId === syncStatus.payload_article_id
            && previous.publishedToPayload
            && Object.keys(payloadMetadataPatch).length === 0
          ) {
            return previous
          }

          const updated = {
            ...previous,
            ...payloadMetadataPatch,
            payloadArticleId: syncStatus.payload_article_id ?? undefined,
            publishedToPayload: true,
            payloadStatus: payloadMetadataPatch.payloadStatus ?? previous.payloadStatus ?? 'draft',
            updatedAt: previous.updatedAt,
          }

          const refreshed = refreshDraftPayloadSyncState(
            updated,
            buildStagedArticlePayloadComparableShape,
            {
              hasPayloadIdentity: hasPayloadArticleIdentity,
              missingBaselineIsUnsynced: true,
            },
          )

          void saveQueueRef.current?.saveNow(refreshed)
          return refreshed
        })
      } catch {
        // Ignore sync-status bootstrap errors so staging still loads offline/local state.
      }
    }

    void hydrateSyncStatus()

    return () => {
      isCancelled = true
    }
  }, [getArticleById, getArticleSyncStatus, schemaPublisherConfig.defaultAuthorName, stagedArticle?.runId, storageKey, token])

  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      setError('Authentication required to load locations and media assets. Please sign in again.')
      return
    }

    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const [locationsRes, mediaRes] = await Promise.all([
          fetchLocations(token, { limit: 200 }),
          fetchMediaAssets(token, { limit: MEDIA_ASSET_PAGE_LIMIT, page: 1, mimeType: 'image/' }),
        ])

        setLocations(locationsRes.docs || [])
        setMediaAssets(mediaRes.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [token, fetchLocations, fetchMediaAssets])

  const updateStagedArticle = useCallback((updates: Partial<StagedArticle>) => {
    setStagedArticle((previous) => {
      if (!previous) return null
      const updated = {
        ...previous,
        ...updates,
        lastEditedBy: userStampRef.current ?? previous.lastEditedBy,
        updatedAt: new Date().toISOString(),
      }

      updated.content = composeArticleMarkdown(
        updated.blocks || [],
        updated.editorialBlocks || []
      )
      const refreshed = refreshDraftPayloadSyncState(
        updated,
        buildStagedArticlePayloadComparableShape,
        {
          hasPayloadIdentity: hasPayloadArticleIdentity,
          missingBaselineIsUnsynced: true,
        },
      )

      // Debounced + serialized: one PUT per typing pause, carrying the last
      // server timestamp so concurrent edits surface as a conflict, not a
      // silent overwrite. Re-invocation (StrictMode) just replaces the snapshot.
      saveQueueRef.current?.schedule(refreshed)

      return refreshed
    })
  }, [])

  const handleDelete = useCallback(async () => {
    if (!stagedArticle) return
    if (!confirm('Delete this staged article?')) return

    await removeStagedArticle(storageKey, stagedArticle.id)
    navigate(stagePath)
  }, [navigate, stagePath, stagedArticle, storageKey])

  const mergeMediaAssetsIntoState = useCallback((assets: MediaAsset[]) => {
    setMediaAssets((existingAssets) => mergeMediaAssetLists(existingAssets, assets))
  }, [])

  const flushStagedArticleSaves = useCallback(async () => {
    await saveQueueRef.current?.flush()
  }, [])

  return {
    locations,
    mediaAssets,
    isLoading,
    error,
    stagedArticle,
    saveConflict,
    updateStagedArticle,
    flushStagedArticleSaves,
    handleDelete,
    mergeMediaAssetsIntoState,
  }
}
