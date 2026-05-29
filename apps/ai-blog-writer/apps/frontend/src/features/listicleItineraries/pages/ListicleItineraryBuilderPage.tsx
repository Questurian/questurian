import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resolveEditorAssistModelName } from '../../staging/api'
import { useAuth } from '../../auth'
import { generateSocialImageFromFeatured as requestGenerateSocialImageFromFeatured } from '../../../shared/images'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderHero } from '../../../shared/builder/components/BuilderHero'
import { BuilderPublishPanel } from '../builder/components/BuilderPublishPanel'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { BuilderStopsPanel } from '../builder/components/BuilderStopsPanel'
import { useBuilderAutosave } from '../../../shared/builder/hooks/useBuilderAutosave'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useItinerarySubmit } from '../builder/hooks/useItinerarySubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import { saveDraft } from '../storage'
import {
  applyItineraryGeneratedContent,
  buildItineraryGenerateListicleContentRequest,
  getItineraryAutoWriteTargetIds,
  getItineraryIntroTargetId,
} from '../builder/services/ai-autowrite.service'
import {
  buildItineraryAiArticleContext,
  getItineraryAiArticleTitle,
} from '../builder/services/ai-rewrite.service'
import {
  applySeoAiPatch,
  buildSeoAiPrompt,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
} from '../builder/services/seo-ai.service'
import type { SeoAiTarget } from '../builder/services/seo-ai.service'
import {
  buildListicleItineraryStructuredDataTemplate,
  serializeStructuredDataTemplate,
} from '../builder/services/structured-data-template.service'
import { getItinerarySchemaPublisherConfig } from '../builder/services/schema-config.service'
import { buildItineraryDraftSyncSignature } from '../builder/utils/itinerary-draft-sync-signature'
import { fetchItineraryById, generateListicleContentWithAi, generateTitleWithAi, rewriteBlockWithAi } from '../api'
import { payloadDocToDraft } from '../builder/mappers/itinerary-draft.mapper'
import { generateItinerary } from '../builder/services/autobuild.api'
import { applyAutobuildPlanToDraft } from '../builder/mappers/autobuild-plan.mapper'
import { findItineraryItemById, type ListicleItineraryDraft } from '../types'
import { buildArticleOgUrl } from '../../../shared/seo/utils/buildArticleOgUrl'
import '../styles.css'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

const schemaPublisherConfig = getItinerarySchemaPublisherConfig()

export default function ListicleItineraryBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')

  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)
  const [activeAiTargetId, setActiveAiTargetId] = useState<string | null>(null)
  const [isAutoWritingEmptyFields, setIsAutoWritingEmptyFields] = useState(false)
  const [isRevertingToPayload, setIsRevertingToPayload] = useState(false)
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [hasLocalChanges, setHasLocalChanges] = useState(false)
  const syncedBaselineRef = useRef<string | null>(null)
  const bootstrappedDraftKeyRef = useRef<string | null>(null)
  const ignoreDirtyUntilRef = useRef(0)

  const onError = useCallback((message: string) => {
    setError(message || null)
  }, [])

  const {
    draft,
    setDraft,
    isLoading,
    locations,
    mediaAssets,
    instagramPosts,
  } = useBuilderBootstrap({
    token,
    payloadIdParam,
    draftIdParam,
    setSearchParams,
    onError,
  })

  useEffect(() => {
    if (!draft) return
    if (activeDayIndex >= draft.dayCount) {
      setActiveDayIndex(Math.max(0, draft.dayCount - 1))
    }
  }, [draft, activeDayIndex])

  const saveAutosaveDraft = useCallback((nextDraft: ListicleItineraryDraft) => {
    saveDraft({
      ...nextDraft,
      hasLocalChanges,
    })
  }, [hasLocalChanges])

  useBuilderAutosave(draft, saveAutosaveDraft)

  const isSynced = Boolean(draft?.payloadId)
  const draftSyncSignature = useMemo(
    () => (draft ? buildItineraryDraftSyncSignature(draft) : null),
    [draft],
  )
  const routeKey = `${payloadIdParam ?? ''}:${draftIdParam ?? ''}`

  useEffect(() => {
    syncedBaselineRef.current = null
    bootstrappedDraftKeyRef.current = null
    ignoreDirtyUntilRef.current = 0
    setHasLocalChanges(false)
  }, [routeKey])

  useEffect(() => {
    if (isLoading || !draft || !draftSyncSignature) return

    if (!draft.payloadId) {
      syncedBaselineRef.current = draftSyncSignature
      bootstrappedDraftKeyRef.current = `local:${draft.draftId}`
      setHasLocalChanges(false)
      return
    }

    const draftKey = `${routeKey}:${draft.draftId}:${draft.payloadId}`
    if (bootstrappedDraftKeyRef.current !== draftKey) {
      bootstrappedDraftKeyRef.current = draftKey
      syncedBaselineRef.current = draft.payloadSyncBaseline || draftSyncSignature
    }

    if (Date.now() < ignoreDirtyUntilRef.current) {
      syncedBaselineRef.current = draftSyncSignature
      setHasLocalChanges(false)
      if (draft.hasLocalChanges) {
        setDraft((current) => (
          current && current.draftId === draft.draftId
            ? { ...current, hasLocalChanges: false, payloadSyncBaseline: draftSyncSignature }
            : current
        ))
      }
      return
    }

    const baseline = syncedBaselineRef.current || draftSyncSignature
    const nextHasLocalChanges = baseline !== draftSyncSignature
      || (!draft.payloadSyncBaseline && Boolean(draft.hasLocalChanges))
    setHasLocalChanges(nextHasLocalChanges)

    if (nextHasLocalChanges !== Boolean(draft.hasLocalChanges)) {
      setDraft((current) => (
        current && current.draftId === draft.draftId
          ? { ...current, hasLocalChanges: nextHasLocalChanges }
          : current
      ))
    }
  }, [draft, draftSyncSignature, isLoading, routeKey, setDraft])

  const { isLoadingRelated, relatedByBlockType } = useRelatedItems({
    token,
    location: draft?.location,
    sharedNeighborhoods: draft?.sharedNeighborhoods,
    locations,
    onError,
  })

  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
    relatedByBlockType,
    navigate,
    setSearchParams,
    onError,
    setResult,
  })

  const onSyncResult = useCallback((message: string | null) => {
    setResult(message)
    if (message) {
      ignoreDirtyUntilRef.current = Date.now() + 1500
      setHasLocalChanges(false)
    }
  }, [])

  const { isSaving, submit } = useItinerarySubmit({
    token,
    draft,
    setDraft,
    selectedLocationRefId: actions.selectedLocationRefId,
    relatedByBlockType,
    mediaAssets,
    instagramPosts,
    setSearchParams,
    onError,
    setResult: onSyncResult,
  })

  const progress = useBuilderProgress({ draft })
  const isStep1Locked = draft?.step1_complete && !draft?.in_update_mode
  const isStep2Locked = draft?.step2_complete && !draft?.step2_in_update_mode
  const isStep3Locked = draft?.step3_complete && !draft?.step3_in_update_mode
  const isStep4Ready = Boolean(isStep1Locked && isStep2Locked && isStep3Locked)
  const canonicalStructuredData = useMemo(() => {
    if (!draft || !isStep4Ready) return ''
    return serializeStructuredDataTemplate(
      buildListicleItineraryStructuredDataTemplate({
        draft,
        relatedByBlockType,
        mediaAssets,
        instagramPosts,
        publisherConfig: schemaPublisherConfig,
      }),
    )
  }, [draft, instagramPosts, isStep4Ready, mediaAssets, relatedByBlockType])

  useEffect(() => {
    if (!draft || !isStep4Ready || !canonicalStructuredData) return
    if (isSynced && !hasLocalChanges) return

    setDraft((current) => {
      if (!current) return current
      const existingStructuredData = current.seoSection.structuredData.trim()
      if (existingStructuredData === canonicalStructuredData) {
        return current
      }

      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          structuredData: canonicalStructuredData,
        },
      }
    })
  }, [canonicalStructuredData, draft, hasLocalChanges, isStep4Ready, isSynced, setDraft])

  const saveLocalDraft = useCallback(async (): Promise<void> => {
    if (!draft) return
    saveDraft({
      ...draft,
      hasLocalChanges: Boolean(draft.payloadId) || draft.hasLocalChanges,
    })
    if (draft.payloadId) {
      setHasLocalChanges(true)
    }
    setError(null)
    setResult('Saved local draft in this browser only (not synced to Payload).')
  }, [draft])

  const revertToPayloadVersion = useCallback(async (): Promise<void> => {
    if (!draft?.payloadId) return
    if (!token) {
      onError('You must be logged in to reload from Payload.')
      return
    }

    const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'
    const confirmed = window.confirm(
      isPublishedPayload
        ? 'Discard local staged changes and reload the current published Payload version? Payload will not be changed.'
        : 'Discard local staged changes and reload the current Payload draft? Payload will not be changed.',
    )
    if (!confirmed) return

    onError('')
    setResult(null)
    setIsRevertingToPayload(true)

    try {
      const doc = await fetchItineraryById(draft.payloadId, token)
      const nextDraft = payloadDocToDraft(doc, draft.draftId)
      nextDraft.editorModelName = draft.editorModelName
      nextDraft.hasLocalChanges = false

      ignoreDirtyUntilRef.current = Date.now() + 1500
      setHasLocalChanges(false)
      setDraft(nextDraft)
      saveDraft(nextDraft)
      setResult(isPublishedPayload ? 'Reverted to last published Payload version.' : 'Reverted to current Payload draft.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reload from Payload.')
    } finally {
      setIsRevertingToPayload(false)
    }
  }, [draft, onError, setDraft, token])

  const generateDraftTitleWithAi = useCallback(async ({ prompt }: { prompt: string }): Promise<string> => {
    if (!draft) {
      throw new Error('Draft is not loaded yet.')
    }

    const response = await generateTitleWithAi({
      currentTitle: draft.title.trim(),
      prompt: prompt.trim(),
      modelName: resolveEditorAssistModelName(draft.editorModelName),
    })

    const title = response.title?.trim()
    if (!title) {
      throw new Error('AI returned an empty title.')
    }

    return title
  }, [draft])

  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false)
  const [isGeneratingItinerary, setIsGeneratingItinerary] = useState(false)

  const applySlugAndOgUrl = useCallback((slug: string) => {
    const location = locations.find((l) => l.locationKey === draft?.location)
    const newUrl = slug.trim() && location?.country
      ? buildArticleOgUrl(location.country, location.city, 'itinerary', slug.trim())
      : undefined
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        payloadSlug: slug,
        updatedAt: new Date().toISOString(),
        ...(newUrl ? {
          seoSection: {
            ...current.seoSection,
            openGraph: { ...current.seoSection.openGraph, url: newUrl },
          },
        } : {}),
      }
    })
  }, [draft?.location, locations, setDraft])

  const handleGenerateSlugWithAi = useCallback(async () => {
    if (!draft?.title.trim()) return
    setIsGeneratingSlug(true)
    try {
      const response = await rewriteBlockWithAi({
        prompt: `Generate a clean SEO-friendly URL slug for this article title:\n\nTitle: ${draft.title.trim()}\n\nRules:\n- Think like a real user searching Google.\n- Keep the most important search keywords.\n- Remove filler words like "the," "a," "an," "in," "of," "to," and "for" unless they are needed.\n- Keep it short, readable, and specific.\n- Use lowercase only.\n- Use hyphens between words.\n- Do not keyword-stuff.\n- Do not add words that are not strongly related to the title.\n- Prefer search-intent wording over matching the title exactly.\n- Return only the slug, no explanation.\n\nExample:\nTitle: The Best Steakhouses in Las Vegas\nSlug: best-steakhouses-las-vegas`,
        blockContent: draft.title.trim(),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        articleTitle: draft.title.trim(),
      })
      const slug = response.rewritten_content?.trim()
      if (slug) applySlugAndOgUrl(slug)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate slug with AI.')
    } finally {
      setIsGeneratingSlug(false)
    }
  }, [draft, onError, applySlugAndOgUrl])

  const handleGenerateItinerary = useCallback(async () => {
    if (!draft) return
    const brief = (draft.generationBrief || '').trim()
    if (!draft.location || !draft.title.trim() || !brief) return
    if (!token) {
      onError('You must be signed in to generate an itinerary.')
      return
    }
    const hasExistingStops = draft.days.some((day) => day.items.length > 0 || day.whereStaying.length > 0)
    if (hasExistingStops && !window.confirm('This will replace the current stops with a freshly generated plan. Continue?')) {
      return
    }

    setIsGeneratingItinerary(true)
    setError(null)
    setResult(null)
    try {
      const plan = await generateItinerary({
        location: draft.location,
        title: draft.title.trim(),
        brief,
        dayCount: draft.dayCount,
        payloadToken: token,
        sharedNeighborhoods: draft.sharedNeighborhoods,
        modelName: resolveEditorAssistModelName(draft.editorModelName),
      })
      setDraft((current) => (current ? applyAutobuildPlanToDraft(current, plan) : current))
      const filled = plan.days.reduce((sum, day) => sum + day.items.length, 0)
      setResult(
        `Generated ${filled} stop${filled === 1 ? '' : 's'} across ${plan.days.length} day${plan.days.length === 1 ? '' : 's'}.`
        + (plan.notes.length ? ` Notes: ${plan.notes.join(' ')}` : ''),
      )
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate itinerary.')
    } finally {
      setIsGeneratingItinerary(false)
    }
  }, [draft, token, onError, setDraft])

  const handleAutoFillOgUrl = useCallback(() => {
    if (!draft) return
    const slug = draft.payloadSlug?.trim()
    const location = locations.find((l) => l.locationKey === draft.location)
    if (!slug || !location?.country) return
    const url = buildArticleOgUrl(location.country, location.city, 'itinerary', slug)
    if (!url) return
    setDraft((current) => {
      if (!current) return current
      return { ...current, seoSection: { ...current.seoSection, openGraph: { ...current.seoSection.openGraph, url } } }
    })
  }, [draft, locations, setDraft])

  const applyGeneratedListicleContent = useCallback((response: Awaited<ReturnType<typeof generateListicleContentWithAi>>) => {
    setDraft((current) => {
      if (!current) return current
      return applyItineraryGeneratedContent(current, response)
    })
  }, [setDraft])

  const buildGenerationRequest = useCallback((params: {
    targetIds: string[]
    customInstruction?: string
    skipExisting?: boolean
    includeArticleContext?: boolean
    currentContentByTargetId?: Record<string, string>
  }) => {
    if (!draft) {
      throw new Error('Draft is not loaded yet.')
    }

    const request = buildItineraryGenerateListicleContentRequest({
      draft,
      relatedByBlockType,
      locations,
      targetIds: params.targetIds,
      modelName: resolveEditorAssistModelName(draft.editorModelName),
      customInstruction: params.customInstruction,
      skipExisting: params.skipExisting,
      includeArticleContext: params.includeArticleContext,
    })

    if (request.targets.length < 1) {
      throw new Error('Add stop details before using AI generation.')
    }

    if (params.currentContentByTargetId) {
      request.targets = request.targets.map((target) => ({
        ...target,
        currentContent: params.currentContentByTargetId?.[target.targetId] ?? target.currentContent,
      }))
    }

    return request
  }, [draft, locations, relatedByBlockType])

  const runSingleTargetGeneration = useCallback(async (params: {
    targetId: string
    currentContent?: string
    customInstruction?: string
    includeArticleContext?: boolean
  }): Promise<string> => {
    const request = buildGenerationRequest({
      targetIds: [params.targetId],
      customInstruction: params.customInstruction,
      includeArticleContext: params.includeArticleContext,
      currentContentByTargetId: params.currentContent
        ? { [params.targetId]: params.currentContent }
        : undefined,
    })

    const response = await generateListicleContentWithAi(request)
    const targetResult = response.results[params.targetId]

    if (!targetResult) {
      throw new Error('AI generation returned no result for the requested field.')
    }

    if (targetResult.status === 'generated' && targetResult.markdown?.trim()) {
      return targetResult.markdown.trim()
    }

    if (targetResult.status === 'skipped' && targetResult.markdown?.trim()) {
      return targetResult.markdown.trim()
    }

    throw new Error(
      targetResult.error_message
      || targetResult.validation_errors[0]
      || 'AI generation failed for this field.',
    )
  }, [buildGenerationRequest])

  const rewriteDraftBlockWithAi = useCallback(async (input: AiRewriteInput): Promise<string> => {
    return runSingleTargetGeneration({
      targetId: input.blockId,
      currentContent: input.currentContent,
      customInstruction: input.prompt.trim(),
      includeArticleContext: input.includeWholeArticleContext,
    })
  }, [runSingleTargetGeneration])

  const autoWriteIntro = useCallback(async (): Promise<void> => {
    if (!draft) return

    const targetId = getItineraryIntroTargetId(draft)
    onError('')
    setResult(null)
    setActiveAiTargetId(targetId)

    try {
      const markdown = await runSingleTargetGeneration({
        targetId,
        currentContent: draft.header.introMarkdown,
        includeArticleContext: true,
      })

      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          header: {
            ...current.header,
            introMarkdown: markdown,
            introJsonText: '',
          },
        }
      })
      setResult(draft.header.introMarkdown.trim() ? 'Intro regenerated with AI.' : 'Intro written with AI.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to write intro with AI.')
    } finally {
      setActiveAiTargetId(null)
    }
  }, [draft, onError, runSingleTargetGeneration, setDraft])

  const autoWriteStopBlurb = useCallback(async (itemId: string): Promise<void> => {
    if (!draft) return

    const found = findItineraryItemById(draft, itemId)
    const item = found?.item
    if (!item) {
      onError('Selected stop was not found.')
      return
    }

    const targetId = `${itemId}_blurb`
    onError('')
    setResult(null)
    setActiveAiTargetId(targetId)

    try {
      const markdown = await runSingleTargetGeneration({
        targetId,
        currentContent: item.blurbMarkdown,
        includeArticleContext: true,
      })

      actions.updateItem(itemId, (current) => ({
        ...current,
        blurbMarkdown: markdown,
        blurbJsonText: '',
      }))
      setResult(item.blurbMarkdown.trim() ? 'Stop blurb regenerated with AI.' : 'Stop blurb written with AI.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to write stop blurb with AI.')
    } finally {
      setActiveAiTargetId(null)
    }
  }, [actions, draft, onError, runSingleTargetGeneration])

  const autoWriteEmptyFields = useCallback(async (): Promise<void> => {
    if (!draft) return

    const targetIds = getItineraryAutoWriteTargetIds(draft, relatedByBlockType)
    if (targetIds.length < 1) {
      onError('')
      setResult('No empty intro or blurbs to auto write.')
      return
    }

    onError('')
    setResult(null)
    setIsAutoWritingEmptyFields(true)

    try {
      const request = buildGenerationRequest({
        targetIds,
        skipExisting: true,
        includeArticleContext: true,
      })
      const response = await generateListicleContentWithAi(request)
      applyGeneratedListicleContent(response)

      const generatedCount = Object.values(response.results)
        .filter((entry) => entry.status === 'generated' && entry.markdown?.trim())
        .length
      const failedResult = Object.values(response.results).find((entry) => entry.status === 'error')

      if (generatedCount > 0) {
        setResult(`Auto-wrote ${generatedCount} empty field${generatedCount === 1 ? '' : 's'}.`)
      } else {
        setResult('No empty intro or blurbs needed new AI copy.')
      }

      if (failedResult) {
        onError(
          failedResult.error_message
          || failedResult.validation_errors[0]
          || 'One or more fields failed AI generation.',
        )
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to auto write empty fields.')
    } finally {
      setIsAutoWritingEmptyFields(false)
    }
  }, [applyGeneratedListicleContent, buildGenerationRequest, draft, onError, relatedByBlockType])

  const generateSeoWithAi = useCallback(async (target: SeoAiTarget = 'all'): Promise<void> => {
    if (!draft) return

    const articleContext = buildItineraryAiArticleContext(draft).trim()
    const articleTitle = getItineraryAiArticleTitle(draft).trim()
    const structuredDataTemplate = canonicalStructuredData
    const hasSourceContent = Boolean(draft.title.trim() || articleContext)
    if (!hasSourceContent) {
      onError('Add article content before generating SEO with AI.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoTarget(target)

    try {
      const response = await rewriteBlockWithAi({
        prompt: buildSeoAiPrompt({
          articleType: 'listicle-itinerary',
          location: draft.location,
          target,
          structuredDataTemplate: target === 'structuredData'
            ? structuredDataTemplate
            : undefined,
        }),
        blockContent: buildSeoAiSeed(draft.seoSection),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        articleTitle,
        articleContext: articleContext || undefined,
      })

      const aiText = response.rewritten_content?.trim()
      if (!aiText) {
        throw new Error('AI returned empty SEO content.')
      }

      const seoPatch = parseSeoAiPatch(aiText)
      setDraft((current) => {
        if (!current) return current
        const patchedSeo = applySeoAiPatch(current.seoSection, seoPatch, target)
        return {
          ...current,
          seoSection: target === 'all'
            ? {
                ...patchedSeo,
                structuredData: current.seoSection.structuredData,
              }
            : patchedSeo,
        }
      })

      if (target === 'all') {
        setResult('SEO fields generated with AI (images and structured data unchanged).')
      } else {
        setResult(`${getSeoAiTargetLabel(target)} generated with AI (images unchanged).`)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate SEO with AI.')
    } finally {
      setIsGeneratingSeoTarget(null)
    }
  }, [canonicalStructuredData, draft, onError, setDraft])

  const regenerateStructuredDataFromTemplate = useCallback(() => {
    if (!canonicalStructuredData) return
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          structuredData: canonicalStructuredData,
        },
      }
    })
    setResult('Structured data regenerated from the itinerary template.')
    onError('')
  }, [canonicalStructuredData, onError, setDraft])

  const generateSeoImageFromFeatured = useCallback(async (): Promise<void> => {
    if (!draft) return

    const featuredAssetId = draft.header.featuredImage
    if (!featuredAssetId) {
      onError('Select a featured image in Step 2 before generating social image URLs.')
      return
    }

    if (!token) {
      onError('You must be logged in to generate social image URLs.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoImage(true)

    try {
      const response = await requestGenerateSocialImageFromFeatured(featuredAssetId, token)
      const bunnyUrl = response.generatedImageUrl.trim()
      if (!bunnyUrl) {
        throw new Error('Generated social image is missing Bunny URL.')
      }

      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          seoSection: {
            ...current.seoSection,
            openGraph: {
              ...current.seoSection.openGraph,
              imageUrl: bunnyUrl,
            },
            twitterCard: {
              ...current.seoSection.twitterCard,
              imageUrl: bunnyUrl,
            },
          },
        }
      })

      setResult('Social image generated from featured image. Bunny URL applied to OG and Twitter.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate social image from featured image.')
    } finally {
      setIsGeneratingSeoImage(false)
    }
  }, [draft, onError, setDraft, token])

  if (isLoading || !draft) {
    return (
      <div className="stl-page">
        {!isLoading && error
          ? <p className="stl-error">{error}</p>
          : <p className="stl-placeholder">Loading builder...</p>}
      </div>
    )
  }

  const isStep1LockedView = draft.step1_complete && !draft.in_update_mode
  const isStep2LockedView = draft.step2_complete && !draft.step2_in_update_mode
  const isStep3LockedView = draft.step3_complete && !draft.step3_in_update_mode
  const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'
  const syncTargetStatus = isPublishedPayload ? 'published' : 'draft'

  return (
    <div className="stl-page">
      <BuilderHero
        eyebrow="Listicle Itinerary Builder"
        newTitle="New Itinerary"
        payloadId={draft.payloadId}
        lede="Field-by-field and block-by-block editor for Payload `listicle-itineraries`."
        backHref="/listicle-itineraries"
        onDiscardLocalDraft={actions.handleDiscardLocalDraft}
      />

      <div className="stl-builder-layout">
        <main className="stl-builder-main">
          {error ? <p className="stl-error">{error}</p> : null}
          {result ? <p className="stl-success">{result}</p> : null}

          {isSynced && hasLocalChanges ? (
            <div className="stl-out-of-sync-banner" role="status">
              <span className="stl-out-of-sync-banner__dot" aria-hidden="true" />
              <span className="stl-out-of-sync-banner__text">
                Out of sync — you have local changes. Sync to Payload to apply them to the {isPublishedPayload ? 'live published' : 'Payload'} itinerary.
              </span>
              <button
                type="button"
                className="stl-btn stl-out-of-sync-banner__btn"
                onClick={() => void submit(syncTargetStatus)}
                disabled={isSaving}
              >
                {isSaving ? 'Syncing...' : isPublishedPayload ? 'Update Published' : 'Save & Sync'}
              </button>
            </div>
          ) : null}

          <BuilderSetupPanel
            draft={draft}
            locations={locations}
            isSynced={isSynced}
            onContinue={actions.handleContinue}
            onUpdateSetup={actions.handleUpdateSetup}
            onSaveSetup={actions.handleSaveSetup}
            onCancelUpdateSetup={actions.cancelUpdateSetup}
            updateDraft={actions.updateDraft}
            onTitleAiGenerate={generateDraftTitleWithAi}
            onSlugChange={applySlugAndOgUrl}
            onGenerateSlugWithAi={handleGenerateSlugWithAi}
            isGeneratingSlug={isGeneratingSlug}
            onGenerateItinerary={handleGenerateItinerary}
            isGeneratingItinerary={isGeneratingItinerary}
          />

          {(isStep1LockedView || isSynced) ? (
            <BuilderHeaderPanel
              draft={draft}
              token={token ?? null}
              locationRef={actions.selectedLocationRefId}
              mediaAssets={mediaAssets}
              updateHeader={actions.updateHeader}
              onIntroAiAutoWrite={autoWriteIntro}
              onIntroAiRewrite={rewriteDraftBlockWithAi}
              isIntroAiGenerating={activeAiTargetId === getItineraryIntroTargetId(draft)}
              isLocked={isStep2LockedView}
              isSynced={isSynced}
              onContinueStep2={actions.handleContinueStep2}
              onUpdateStep2={actions.handleUpdateStep2}
              onSaveStep2={actions.handleSaveStep2}
              onCancelStep2Update={actions.cancelUpdateStep2}
            />
          ) : null}

          {(isStep1LockedView && isStep2LockedView) || isSynced ? (
            <>
              {draft.dayCount > 1 ? (
                <div className="stl-day-tabs" role="tablist" aria-label="Itinerary days">
                  {Array.from({ length: draft.dayCount }, (_, dayTabIndex) => (
                    <button
                      key={draft.days[dayTabIndex]?.id ?? `day_tab_${dayTabIndex}`}
                      type="button"
                      className={activeDayIndex === dayTabIndex ? 'stl-day-tab stl-day-tab--active' : 'stl-day-tab'}
                      role="tab"
                      aria-selected={activeDayIndex === dayTabIndex}
                      onClick={() => setActiveDayIndex(dayTabIndex)}
                    >
                      Day {dayTabIndex + 1}
                    </button>
                  ))}
                </div>
              ) : null}
              <BuilderStopsPanel
                draft={draft}
                activeDayIndex={activeDayIndex}
                token={token ?? null}
                locationRef={actions.selectedLocationRefId}
                mediaAssets={mediaAssets}
                instagramPosts={instagramPosts}
                isLoadingRelated={isLoadingRelated}
                relatedByBlockType={relatedByBlockType}
                onAddWhereStaying={() => actions.addWhereStayingItem(activeDayIndex)}
                onAddItem={() => actions.addItem(activeDayIndex)}
                onMoveItem={actions.moveItem}
                onRemoveItem={actions.removeItem}
                onUpdateItem={actions.updateItem}
                onStopBlurbAiAutoWrite={autoWriteStopBlurb}
                onStopBlurbAiRewrite={async (_itemId, input) => rewriteDraftBlockWithAi(input)}
                activeAiItemId={activeAiTargetId?.endsWith('_blurb') ? activeAiTargetId.replace(/_blurb$/, '') : null}
                isLocked={isStep3LockedView}
                isSynced={isSynced}
                onContinueStep3={actions.handleContinueStep3}
                onUpdateStep3={actions.handleUpdateStep3}
                onSaveStep3={actions.handleSaveStep3}
                onCancelStep3Update={actions.cancelUpdateStep3}
              />
            </>
          ) : null}

          {(isStep1LockedView && isStep2LockedView && isStep3LockedView) || isSynced ? (
            <BuilderSeoPanel
              draft={draft}
              setDraft={setDraft}
              onGenerateSeoWithAi={generateSeoWithAi}
              isGeneratingSeoTarget={isGeneratingSeoTarget}
              onGenerateSeoImageFromFeatured={generateSeoImageFromFeatured}
              isGeneratingSeoImage={isGeneratingSeoImage}
              onRegenerateStructuredData={regenerateStructuredDataFromTemplate}
              canRegenerateStructuredData={Boolean(canonicalStructuredData)}
              onAutoFillOgUrl={handleAutoFillOgUrl}
            />
          ) : null}

          {(isStep1LockedView && isStep2LockedView && isStep3LockedView) || isSynced ? (
            <BuilderPublishPanel
              draft={draft}
              isSaving={isSaving}
              onSaveLocalDraft={saveLocalDraft}
              onSyncToPayload={() => submit(syncTargetStatus)}
            />
          ) : null}
        </main>

        <BuilderSidebar
          completionPercent={progress.completionPercent}
          draft={draft}
          isSetupReady={progress.isSetupReady}
          editorModelName={draft.editorModelName}
          onEditorModelChange={actions.setEditorModelName}
          isSaving={isSaving}
          isRevertingToPayload={isRevertingToPayload}
          isAutoWritingEmptyFields={isAutoWritingEmptyFields}
          canAutoWriteEmptyFields={Boolean((isSynced || (isStep1LockedView && isStep2LockedView)) && getItineraryAutoWriteTargetIds(draft, relatedByBlockType).length > 0)}
          stepIssues={progress.stepIssues}
          onAutoWriteEmptyFields={autoWriteEmptyFields}
          onSaveLocalDraft={saveLocalDraft}
          onRevertToPayload={revertToPayloadVersion}
          onSyncToPayload={() => submit(syncTargetStatus)}
        />
      </div>
    </div>
  )
}
