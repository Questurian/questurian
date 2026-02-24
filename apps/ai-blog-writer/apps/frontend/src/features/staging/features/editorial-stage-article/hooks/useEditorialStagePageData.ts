import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Location, MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import type { EditorialStageArticleApi } from '../types'
import { DEFAULT_EDITOR_MODEL_NAME, resolveEditorModelName } from '../constants'
import { extractEditorialBlocks } from '../editorial-markdown.service'
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
  removeStagedArticle,
  saveAllStagedArticles,
  upsertStagedArticle,
} from '../services/editorial-stage-storage.service'
import { mergeMediaAssetLists } from '../media-utils'

type UseEditorialStagePageDataParams = {
  storageKey: string
  stageArticlePath: string
  stagePath: string
  token: string | null | undefined
  api: Pick<EditorialStageArticleApi, 'fetchResult' | 'fetchLocations' | 'fetchMediaAssets'>
}

export function useEditorialStagePageData({
  storageKey,
  stageArticlePath,
  stagePath,
  token,
  api,
}: UseEditorialStagePageDataParams) {
  const { fetchResult, fetchLocations, fetchMediaAssets } = api
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const urlRunId = searchParams.get('runId') || ''
  const urlTitle = searchParams.get('title') || ''
  const urlContent = searchParams.get('content') || ''
  const urlType = searchParams.get('type') || ''
  const stagedId = searchParams.get('stagedId') || ''

  const [locations, setLocations] = useState<Location[]>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stagedArticle, setStagedArticle] = useState<StagedArticle | null>(null)

  useEffect(() => {
    if (!urlRunId && !stagedId) return

    let isCancelled = false

    const loadStagedArticle = async () => {
      try {
        const allStaged = getAllStagedArticles(storageKey)

        if (stagedId) {
          const existingIndex = allStaged.findIndex((candidate) => candidate.id === stagedId)
          const existing = existingIndex >= 0 ? allStaged[existingIndex] : null
          if (existing) {
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
            )
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
                : fallbackEditorialBlocks
            )
            const normalizedExisting = {
              ...existing,
              originalContent: originalContentForReset,
              blocks: normalizedBlocks,
              content: composeArticleMarkdown(normalizedBlocks, normalizedEditorialBlocks),
              editorialBlocks: normalizedEditorialBlocks,
              editorModelName: resolveEditorModelName(existing.editorModelName),
            }

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            const blocksChanged = JSON.stringify(existing.blocks) !== JSON.stringify(normalizedBlocks)
            const editorialChanged = JSON.stringify(existing.editorialBlocks || []) !== JSON.stringify(normalizedEditorialBlocks)
            const contentChanged = existing.content !== normalizedExisting.content
            const modelChanged = existing.editorModelName !== normalizedExisting.editorModelName
            if (blocksChanged || editorialChanged || contentChanged || modelChanged) {
              allStaged[existingIndex] = normalizedExisting
              saveAllStagedArticles(storageKey, allStaged)
            }
          } else if (!isCancelled) {
            setError('Staged article not found')
          }
        } else if (urlRunId) {
          const existingIndex = allStaged.findIndex((candidate) => candidate.runId === urlRunId)
          const existing = existingIndex >= 0 ? allStaged[existingIndex] : null
          if (existing) {
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
            )
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
                : fallbackEditorialBlocks
            )
            const normalizedExisting = {
              ...existing,
              originalContent: originalContentForReset,
              blocks: normalizedBlocks,
              content: composeArticleMarkdown(normalizedBlocks, normalizedEditorialBlocks),
              editorialBlocks: normalizedEditorialBlocks,
              editorModelName: resolveEditorModelName(existing.editorModelName),
            }

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            const blocksChanged = JSON.stringify(existing.blocks) !== JSON.stringify(normalizedBlocks)
            const editorialChanged = JSON.stringify(existing.editorialBlocks || []) !== JSON.stringify(normalizedEditorialBlocks)
            const contentChanged = existing.content !== normalizedExisting.content
            const modelChanged = existing.editorModelName !== normalizedExisting.editorModelName
            if (blocksChanged || editorialChanged || contentChanged || modelChanged) {
              allStaged[existingIndex] = normalizedExisting
              saveAllStagedArticles(storageKey, allStaged)
            }

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
              editorModelName: DEFAULT_EDITOR_MODEL_NAME,
              lexicalConverted: false,
              publishedToPayload: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }

            saveAllStagedArticles(storageKey, [...allStaged, newStaged])

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
  ])

  useEffect(() => {
    if (!token) return

    const loadData = async () => {
      try {
        const [locationsRes, mediaRes] = await Promise.all([
          fetchLocations(token, { limit: 200 }),
          fetchMediaAssets(token, { limit: 50, mimeType: 'image/' }),
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
      const updated = { ...previous, ...updates, updatedAt: new Date().toISOString() }

      updated.content = composeArticleMarkdown(
        updated.blocks || [],
        updated.editorialBlocks || []
      )

      upsertStagedArticle(storageKey, updated)

      return updated
    })
  }, [storageKey])

  const handleDelete = useCallback(() => {
    if (!stagedArticle) return
    if (!confirm('Delete this staged article?')) return

    removeStagedArticle(storageKey, stagedArticle.id)
    navigate(stagePath)
  }, [navigate, stagePath, stagedArticle, storageKey])

  const mergeMediaAssetsIntoState = useCallback((assets: MediaAsset[]) => {
    setMediaAssets((existingAssets) => mergeMediaAssetLists(existingAssets, assets))
  }, [])

  return {
    locations,
    mediaAssets,
    isLoading,
    error,
    stagedArticle,
    updateStagedArticle,
    handleDelete,
    mergeMediaAssetsIntoState,
  }
}
