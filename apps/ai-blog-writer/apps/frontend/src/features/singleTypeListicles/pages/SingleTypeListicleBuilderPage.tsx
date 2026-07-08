import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type {
  GenerateListicleContentResponse,
  ListicleStepEvent,
} from '../../staging/api'
import { resolveEditorAssistModelName } from '../../staging/api'
import { useAuth } from '../../auth'
import {
  generateSocialImageFromFeatured as requestGenerateSocialImageFromFeatured,
  uploadSocialImage as requestUploadSocialImage,
} from '../../../shared/images'
import { BuilderHeaderPanel } from '../builder/components/BuilderHeaderPanel'
import { BuilderHero } from '../../../shared/builder/components/BuilderHero'
import { BuilderItemsPanel } from '../builder/components/BuilderItemsPanel'
import { InspectListicleRunModal } from '../builder/components/InspectListicleRunModal'
import { BuilderSeoPanel } from '../builder/components/BuilderSeoPanel'
import { BuilderSetupPanel } from '../builder/components/BuilderSetupPanel'
import { BuilderSidebar } from '../builder/components/BuilderSidebar'
import { useBuilderAutosave } from '../../../shared/builder/hooks/useBuilderAutosave'
import { useDraftPayloadSyncState } from '../../../shared/payloadSync/useDraftPayloadSyncState'
import { useBuilderBootstrap } from '../builder/hooks/useBuilderBootstrap'
import { useBuilderDraftActions } from '../builder/hooks/useBuilderDraftActions'
import { useBuilderProgress } from '../builder/hooks/useBuilderProgress'
import { useListicleSubmit } from '../builder/hooks/useListicleSubmit'
import { useRelatedItems } from '../builder/hooks/useRelatedItems'
import { useSerialTaskQueue } from '../../../shared/hooks/useSerialTaskQueue'
import {
  applySingleTypeListicleGeneratedContent,
  buildSingleTypeGenerateListicleContentRequest,
  getSingleTypeAutoWriteTargetIds,
  getSingleTypeIntroDisabledReason,
  getSingleTypeIntroTargetId,
} from '../builder/services/ai-autowrite.service'
import {
  buildListicleAiArticleContext,
  getListicleAiArticleTitle,
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
  validateOgSocialImageFile,
} from '../builder/services/seo-social-image-upload.service'
import {
  buildSingleTypeListicleStructuredDataTemplate,
  serializeStructuredDataTemplate,
} from '../builder/services/structured-data-template.service'
import { generateListicleContentWithAi, generateSeoMetadataWithAi, generateTitleWithAi, rewriteBlockWithAi } from '../api'
import { saveDraft } from '../storage'
import { buildArticleOgUrl } from '../../../shared/seo/utils/buildArticleOgUrl'
import { buildSingleTypeListicleDraftComparableShape } from '../builder/utils/single-type-listicle-draft-sync-signature'
import '../styles.css'

const AUTO_WRITE_EMPTY_FIELDS_JOB_ID = '__auto_write_empty_fields__'
type AiJobVisualState = 'queued' | 'running'

export default function SingleTypeListicleBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')

  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)
  const [isUploadingOgImage, setIsUploadingOgImage] = useState(false)
  const [aiJobVisualStateById, setAiJobVisualStateById] = useState<Record<string, AiJobVisualState>>({})
  const [stepsByTargetId, setStepsByTargetId] = useState<Record<string, ListicleStepEvent[]>>({})
  const [inspectTarget, setInspectTarget] = useState<
    { targetId: string; label: string; openedAutomatically: boolean } | null
  >(null)
  const lastAutoStructuredDataRef = useRef<string>('')
  const aiJobClearTimersRef = useRef<Record<string, number>>({})

  const recordResponseSteps = useCallback((response: GenerateListicleContentResponse) => {
    setStepsByTargetId((prev) => {
      const next = { ...prev }
      for (const [targetId, entry] of Object.entries(response.results)) {
        if (entry?.steps && entry.steps.length > 0) {
          next[targetId] = entry.steps
        }
      }
      return next
    })
  }, [])

  const openInspect = useCallback(
    (targetId: string, label: string, openedAutomatically = false) => {
      setStepsByTargetId((prev) => {
        if (!openedAutomatically) return prev
        // Clear stale steps so the new run animates from the beginning.
        if (!(targetId in prev)) return prev
        const next = { ...prev }
        delete next[targetId]
        return next
      })
      setInspectTarget({ targetId, label, openedAutomatically })
    },
    [],
  )

  const closeInspect = useCallback(() => {
    setInspectTarget(null)
  }, [])

  const onError = useCallback((message: string) => {
    setError(message || null)
  }, [])

  const {
    draft,
    setDraft,
    isLoading,
    locations,
    mediaAssets,
  } = useBuilderBootstrap({
    token,
    payloadIdParam,
    draftIdParam,
    setSearchParams,
    onError,
  })

  useBuilderAutosave(draft, saveDraft)

  const isSynced = Boolean(draft?.payloadId)
  const { hasUnsyncedPayloadChanges } = useDraftPayloadSyncState({
    draft,
    setDraft,
    isLoading,
    routeKey: `${payloadIdParam ?? ''}:${draftIdParam ?? ''}`,
    buildComparableShape: buildSingleTypeListicleDraftComparableShape,
    initializeMissingBaselineAsSynced: true,
  })

  const { relatedItems, isLoadingRelated } = useRelatedItems({ token, draft, locations, onError })
  const draftRef = useRef(draft)
  const relatedItemsRef = useRef(relatedItems)
  const locationsRef = useRef(locations)
  const {
    activeTaskId: activeAiWriteJobId,
    queuedTaskIds: queuedAiWriteJobIds,
    enqueueTask: enqueueAiWriteTask,
  } = useSerialTaskQueue<string>()

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    relatedItemsRef.current = relatedItems
  }, [relatedItems])

  useEffect(() => {
    locationsRef.current = locations
  }, [locations])

  useEffect(() => {
    return () => {
      Object.values(aiJobClearTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      aiJobClearTimersRef.current = {}
    }
  }, [])

  const markAiJobVisualState = useCallback((jobId: string, state: AiJobVisualState) => {
    const existingTimer = aiJobClearTimersRef.current[jobId]
    if (existingTimer) {
      window.clearTimeout(existingTimer)
      delete aiJobClearTimersRef.current[jobId]
    }

    setAiJobVisualStateById((current) => ({
      ...current,
      [jobId]: state,
    }))
  }, [])

  const clearAiJobVisualState = useCallback((jobId: string) => {
    const existingTimer = aiJobClearTimersRef.current[jobId]
    if (existingTimer) {
      window.clearTimeout(existingTimer)
    }

    aiJobClearTimersRef.current[jobId] = window.setTimeout(() => {
      setAiJobVisualStateById((current) => {
        const next = { ...current }
        delete next[jobId]
        return next
      })
      delete aiJobClearTimersRef.current[jobId]
    }, 900)
  }, [])

  const actions = useBuilderDraftActions({
    draft,
    setDraft,
    locations,
    relatedItems,
    navigate,
    setSearchParams,
    onError,
    setResult,
  })

  const onSyncResult = useCallback((message: string | null) => {
    setResult(message)
  }, [])

  const { isSaving, submit } = useListicleSubmit({
    token,
    draft,
    relatedItems,
    selectedLocationRefId: actions.selectedLocationRefId,
    setDraft,
    setSearchParams,
    onError,
    onResult: onSyncResult,
  })

  const progress = useBuilderProgress(draft)
  const isStep1Locked = Boolean(draft?.step1_complete && !draft?.in_update_mode)
  const isStep2Locked = Boolean(draft?.step2_complete && !draft?.step2_in_update_mode)
  const isStep3Locked = Boolean(draft?.step3_complete && !draft?.step3_in_update_mode)
  const isStep4Ready = isStep1Locked && isStep2Locked && isStep3Locked

  useEffect(() => {
    if (!draft || !isStep4Ready) return

    const nextStructuredData = serializeStructuredDataTemplate(
      buildSingleTypeListicleStructuredDataTemplate({
        draft,
        relatedItems,
      }),
    )

    setDraft((current) => {
      if (!current) return current

      const existingStructuredData = current.seoSection.structuredData.trim()
      const lastAutoStructuredData = lastAutoStructuredDataRef.current.trim()
      const hasAutoGeneratedBefore = Boolean(lastAutoStructuredData)
      const isAutoManaged = (
        (!existingStructuredData && !hasAutoGeneratedBefore)
        || existingStructuredData === lastAutoStructuredData
        || existingStructuredData === nextStructuredData
      )

      if (!isAutoManaged) {
        return current
      }

      if (existingStructuredData === nextStructuredData) {
        lastAutoStructuredDataRef.current = nextStructuredData
        return current
      }

      lastAutoStructuredDataRef.current = nextStructuredData
      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          structuredData: nextStructuredData,
        },
      }
    })
  }, [draft, isStep4Ready, relatedItems, setDraft])

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

  const applySlugAndOgUrl = useCallback((slug: string) => {
    const location = locations.find((l) => l.locationKey === draft?.location)
    const newUrl = slug.trim() && location?.country
      ? buildArticleOgUrl(location.country, location.city, 'maps', slug.trim())
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
      setError(err instanceof Error ? err.message : 'Failed to generate slug with AI.')
    } finally {
      setIsGeneratingSlug(false)
    }
  }, [draft, applySlugAndOgUrl])

  const handleAutoFillOgUrl = useCallback(() => {
    if (!draft) return
    const slug = draft.payloadSlug?.trim()
    const location = locations.find((l) => l.locationKey === draft.location)
    if (!slug || !location?.country) return
    const url = buildArticleOgUrl(location.country, location.city, 'maps', slug)
    if (!url) return
    setDraft((current) => {
      if (!current) return current
      return { ...current, seoSection: { ...current.seoSection, openGraph: { ...current.seoSection.openGraph, url } } }
    })
  }, [draft, locations, setDraft])

  const buildGenerationRequest = useCallback((params: {
    targetIds: string[]
    customInstruction?: string
    skipExisting?: boolean
    includeArticleContext?: boolean
    currentContentByTargetId?: Record<string, string>
  }) => {
    const currentDraft = draftRef.current
    if (!currentDraft) {
      throw new Error('Draft is not loaded yet.')
    }

    const request = buildSingleTypeGenerateListicleContentRequest({
      draft: currentDraft,
      relatedItems: relatedItemsRef.current,
      locations: locationsRef.current,
      targetIds: params.targetIds,
      modelName: resolveEditorAssistModelName(currentDraft.editorModelName),
      customInstruction: params.customInstruction,
      skipExisting: params.skipExisting,
      includeArticleContext: params.includeArticleContext,
    })

    if (request.targets.length < 1) {
      throw new Error('Select related items before using AI generation.')
    }

    if (params.currentContentByTargetId) {
      request.targets = request.targets.map((target) => ({
        ...target,
        currentContent: params.currentContentByTargetId?.[target.targetId] ?? target.currentContent,
      }))
    }

    return request
  }, [])

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
    recordResponseSteps(response)
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
  }, [buildGenerationRequest, recordResponseSteps])

  const autoWriteIntro = useCallback(async (): Promise<void> => {
    const currentDraft = draftRef.current
    if (!currentDraft) return
    const disabledReason = getSingleTypeIntroDisabledReason(currentDraft)
    if (disabledReason) {
      onError(disabledReason)
      return
    }

    const draftId = currentDraft.draftId
    const targetId = getSingleTypeIntroTargetId(currentDraft)

    onError('')
    setResult(null)
    openInspect(targetId, 'Intro', true)
    markAiJobVisualState(targetId, 'queued')

    enqueueAiWriteTask({
      id: targetId,
      run: async () => {
        const draftForRun = draftRef.current
        if (!draftForRun || draftForRun.draftId !== draftId) return

        onError('')
        markAiJobVisualState(targetId, 'running')

        try {
          const hadExistingIntro = Boolean(draftForRun.header.introMarkdown.trim())
          const markdown = await runSingleTargetGeneration({
            targetId: getSingleTypeIntroTargetId(draftForRun),
            currentContent: draftForRun.header.introMarkdown,
            includeArticleContext: true,
          })

          if (draftRef.current?.draftId !== draftId) return

          setDraft((current) => {
            if (!current || current.draftId !== draftId) return current
            return {
              ...current,
              header: {
                ...current.header,
                introMarkdown: markdown,
                introJsonText: '',
              },
            }
          })
          setResult(hadExistingIntro ? 'Intro regenerated with AI.' : 'Intro written with AI.')
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Failed to write intro with AI.')
        } finally {
          clearAiJobVisualState(targetId)
        }
      },
    })
  }, [clearAiJobVisualState, enqueueAiWriteTask, markAiJobVisualState, onError, openInspect, runSingleTargetGeneration, setDraft])

  const autoWriteItemBlurb = useCallback(async (itemId: string): Promise<void> => {
    const currentDraft = draftRef.current
    if (!currentDraft) return

    const draftId = currentDraft.draftId
    const targetId = `${itemId}_blurb`
    const itemIndex = currentDraft.items.findIndex((entry) => entry.id === itemId)
    const itemLabel = itemIndex >= 0 ? `Item ${itemIndex + 1} blurb` : 'Item blurb'

    onError('')
    setResult(null)
    openInspect(targetId, itemLabel, true)
    markAiJobVisualState(targetId, 'queued')

    enqueueAiWriteTask({
      id: targetId,
      run: async () => {
        const draftForRun = draftRef.current
        if (!draftForRun || draftForRun.draftId !== draftId) return

        const item = draftForRun.items.find((entry) => entry.id === itemId)
        if (!item) {
          onError('Selected item was not found.')
          return
        }

        onError('')
        markAiJobVisualState(targetId, 'running')

        try {
          const hadExistingBlurb = Boolean(item.blurbMarkdown.trim())
          const markdown = await runSingleTargetGeneration({
            targetId,
            currentContent: item.blurbMarkdown,
            includeArticleContext: true,
          })

          if (draftRef.current?.draftId !== draftId) return

          setDraft((current) => {
            if (!current || current.draftId !== draftId) return current
            return {
              ...current,
              items: current.items.map((currentItem) => (
                currentItem.id === itemId
                  ? {
                      ...currentItem,
                      blurbMarkdown: markdown,
                      blurbJsonText: '',
                    }
                  : currentItem
              )),
            }
          })
          setResult(hadExistingBlurb ? 'Item blurb regenerated with AI.' : 'Item blurb written with AI.')
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Failed to write item blurb with AI.')
        } finally {
          clearAiJobVisualState(targetId)
        }
      },
    })
  }, [clearAiJobVisualState, enqueueAiWriteTask, markAiJobVisualState, onError, openInspect, runSingleTargetGeneration, setDraft])

  const autoWriteEmptyFields = useCallback(async (): Promise<void> => {
    const currentDraft = draftRef.current
    if (!currentDraft) return

    const draftId = currentDraft.draftId

    onError('')
    setResult(null)
    markAiJobVisualState(AUTO_WRITE_EMPTY_FIELDS_JOB_ID, 'queued')

    enqueueAiWriteTask({
      id: AUTO_WRITE_EMPTY_FIELDS_JOB_ID,
      run: async () => {
        const draftForRun = draftRef.current
        if (!draftForRun || draftForRun.draftId !== draftId) return

        const targetIds = getSingleTypeAutoWriteTargetIds(draftForRun, relatedItemsRef.current)

        onError('')
        markAiJobVisualState(AUTO_WRITE_EMPTY_FIELDS_JOB_ID, 'running')

        if (targetIds.length < 1) {
          setResult('No empty intro or blurbs to auto write.')
          return
        }

        try {
          const request = buildGenerationRequest({
            targetIds,
            skipExisting: true,
            includeArticleContext: true,
          })
          const response = await generateListicleContentWithAi(request)
          recordResponseSteps(response)

          if (draftRef.current?.draftId !== draftId) return

          setDraft((current) => {
            if (!current || current.draftId !== draftId) return current
            return applySingleTypeListicleGeneratedContent(current, response)
          })

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
          clearAiJobVisualState(AUTO_WRITE_EMPTY_FIELDS_JOB_ID)
        }
      },
    })
  }, [buildGenerationRequest, clearAiJobVisualState, enqueueAiWriteTask, markAiJobVisualState, onError, recordResponseSteps, setDraft])

  const saveLocalDraft = useCallback(async (): Promise<void> => {
    if (!draft) return
    saveDraft(draft)
    setError(null)
    setResult('Saved local draft')
  }, [draft])

  const generateSeoWithAi = useCallback(async (target: SeoAiTarget = 'all'): Promise<void> => {
    if (!draft) return

    const articleContext = buildListicleAiArticleContext(draft, relatedItems).trim()
    const articleTitle = getListicleAiArticleTitle(draft).trim()
    const structuredDataTemplate = serializeStructuredDataTemplate(
      buildSingleTypeListicleStructuredDataTemplate({
        draft,
        relatedItems,
      }),
    )
    const hasSourceContent = Boolean(draft.title.trim() || articleContext)
    if (!hasSourceContent) {
      onError('Add article content before generating SEO with AI.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoTarget(target)

    try {
      const response = await generateSeoMetadataWithAi({
        prompt: buildSeoAiPrompt({
          articleType: draft.listicleType
            ? `single-type-listicle (${draft.listicleType})`
            : 'single-type-listicle',
          location: draft.location,
          target,
          structuredDataTemplate: target === 'structuredData' || target === 'all'
            ? structuredDataTemplate
            : undefined,
        }),
        seed: buildSeoAiSeed(draft.seoSection),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        articleTitle,
        articleContext: articleContext || undefined,
      })

      if (!response.seo_patch || Object.keys(response.seo_patch).length === 0) {
        throw new Error('AI returned an empty SEO patch.')
      }

      // The patch arrives schema-validated from the forced tool call; parse
      // still applies length clipping and URL validation.
      const seoPatch = parseSeoAiPatch(JSON.stringify(response.seo_patch))
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          seoSection: applySeoAiPatch(current.seoSection, seoPatch, target),
        }
      })

      if (target === 'all') {
        setResult('SEO fields generated with AI (images unchanged).')
      } else {
        setResult(`${getSeoAiTargetLabel(target)} generated with AI (images unchanged).`)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate SEO with AI.')
    } finally {
      setIsGeneratingSeoTarget(null)
    }
  }, [draft, onError, relatedItems, setDraft])

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

  const uploadOgImageFile = useCallback(async (file: File): Promise<void> => {
    if (!draft) return

    const fileIssue = validateOgSocialImageFile(file)
    if (fileIssue) {
      onError(fileIssue)
      throw new Error(fileIssue)
    }

    if (!token) {
      const message = 'You must be logged in to upload social image URLs.'
      onError(message)
      throw new Error(message)
    }

    const locationRef = actions.selectedLocationRefId ?? draft.locationRef
    if (!locationRef || locationRef < 1) {
      const message = 'Select a location in Step 1 before uploading social images.'
      onError(message)
      throw new Error(message)
    }

    onError('')
    setResult(null)
    setIsUploadingOgImage(true)

    try {
      const articleTitle = draft.title.trim() || 'Untitled listicle'
      const uploadResponse = await requestUploadSocialImage(
        file,
        `Social share image for ${articleTitle}`,
        locationRef,
        token,
        'Questurian Creative',
      )

      const bunnyUrl = uploadResponse.generatedImageUrl.trim()
      if (!bunnyUrl) {
        throw new Error('Uploaded social image is missing Bunny URL.')
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

      setResult('Custom OG image uploaded and applied to OG and Twitter image fields.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload OG image.'
      onError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setIsUploadingOgImage(false)
    }
  }, [actions.selectedLocationRefId, draft, onError, setDraft, token])

  if (isLoading || !draft) {
    return (
      <div className="stl-page stl-single-type-page">
        {!isLoading && error
          ? <p className="stl-error">{error}</p>
          : <p className="stl-placeholder">Loading builder...</p>}
      </div>
    )
  }

  const introTargetId = getSingleTypeIntroTargetId(draft)
  const introAiDisabledReason = getSingleTypeIntroDisabledReason(draft)
  const introVisualState = aiJobVisualStateById[introTargetId]
    ?? (activeAiWriteJobId === introTargetId ? 'running' : queuedAiWriteJobIds.includes(introTargetId) ? 'queued' : undefined)
  const queuedIntroAiCount = introVisualState === 'queued'
    ? Math.max(1, queuedAiWriteJobIds.filter((jobId) => jobId === introTargetId).length)
    : 0

  const queuedAiItemIds = Object.entries(aiJobVisualStateById)
    .filter(([jobId, state]) => state === 'queued' && jobId.endsWith('_blurb'))
    .map(([jobId]) => jobId.replace(/_blurb$/, ''))
  const runningAiItemId = Object.entries(aiJobVisualStateById)
    .find(([jobId, state]) => state === 'running' && jobId.endsWith('_blurb'))?.[0]
    ?.replace(/_blurb$/, '')

  const bulkVisualState = aiJobVisualStateById[AUTO_WRITE_EMPTY_FIELDS_JOB_ID]
    ?? (activeAiWriteJobId === AUTO_WRITE_EMPTY_FIELDS_JOB_ID ? 'running' : queuedAiWriteJobIds.includes(AUTO_WRITE_EMPTY_FIELDS_JOB_ID) ? 'queued' : undefined)
  const autoWriteEmptyFieldsQueueCount = bulkVisualState === 'queued'
    ? Math.max(1, queuedAiWriteJobIds.filter((jobId) => jobId === AUTO_WRITE_EMPTY_FIELDS_JOB_ID).length)
    : 0

  const introAiStatus = introVisualState === 'running'
    ? 'Waiting for AI response...'
    : introVisualState === 'queued'
      ? 'Queued. Waiting for earlier AI response...'
      : null
  const autoWriteEmptyFieldsStatus = bulkVisualState === 'running'
    ? 'Waiting for AI response...'
    : bulkVisualState === 'queued'
      ? 'Queued. Waiting for earlier AI response...'
      : null

  return (
    <div className="stl-page stl-single-type-page">
      <BuilderHero
        eyebrow="Single Type Listicle Builder"
        newTitle="New Listicle"
        payloadId={draft.payloadId}
        lede="Field-by-field and block-by-block editor for Payload `single-type-listicles`."
        backHref="/single-type-listicles"
        onDiscardLocalDraft={actions.handleDiscardLocalDraft}
      />

      <div className="stl-builder-layout">
        <main className="stl-builder-main">
          {error ? <p className="stl-error">{error}</p> : null}
          {result ? <p className="stl-success">{result}</p> : null}

          {isSynced && hasUnsyncedPayloadChanges ? (
            <div className="stl-out-of-sync-banner" role="status">
              <span className="stl-out-of-sync-banner__dot" aria-hidden="true" />
              <span className="stl-out-of-sync-banner__text">
                Out of sync — you have local changes. Sync to Payload to apply them to the live article.
              </span>
              <button
                type="button"
                className="stl-btn stl-out-of-sync-banner__btn"
                onClick={() => void submit('draft')}
                disabled={isSaving}
              >
                {isSaving ? 'Syncing...' : 'Save & Sync'}
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
            setTargetItemCount={actions.setTargetItemCount}
            onTitleAiGenerate={generateDraftTitleWithAi}
            onSlugChange={applySlugAndOgUrl}
            onGenerateSlugWithAi={handleGenerateSlugWithAi}
            isGeneratingSlug={isGeneratingSlug}
          />

          {(isStep1Locked || isSynced) ? (
            <BuilderHeaderPanel
              draft={draft}
              token={token}
              locationRef={actions.selectedLocationRefId ?? draft.locationRef}
              mediaAssets={mediaAssets}
              updateHeader={actions.updateHeader}
              onIntroAiAutoWrite={autoWriteIntro}
              isIntroAiGenerating={activeAiWriteJobId === introTargetId}
              introAiQueueCount={queuedIntroAiCount}
              introAiStatus={introAiStatus}
              introAiDisabledReason={introAiDisabledReason}
              onIntroInspect={() => openInspect(introTargetId, 'Intro')}
              introHasInspectableSteps={Boolean(stepsByTargetId[introTargetId]?.length)}
              isLocked={isStep2Locked}
              isSynced={isSynced}
              onContinueStep2={actions.handleContinueStep2}
              onUpdateStep2={actions.handleUpdateStep2}
              onSaveStep2={actions.handleSaveStep2}
              onCancelStep2Update={actions.cancelUpdateStep2}
            />
          ) : null}

          {(isStep1Locked && isStep2Locked) || isSynced ? (
            <BuilderItemsPanel
              draft={draft}
              relatedItems={relatedItems}
              isLoadingRelated={isLoadingRelated}
              moveItem={actions.moveItem}
              removeItem={actions.removeItem}
              updateItem={actions.updateItem}
              onItemBlurbAiAutoWrite={autoWriteItemBlurb}
              onItemBlurbInspect={(itemId, index) =>
                openInspect(`${itemId}_blurb`, `Item ${index + 1} blurb`)
              }
              hasInspectableStepsByItemId={Object.fromEntries(
                draft.items.map((entry) => [
                  entry.id,
                  Boolean(stepsByTargetId[`${entry.id}_blurb`]?.length),
                ]),
              )}
              activeAiItemId={runningAiItemId ?? null}
              queuedAiItemIds={queuedAiItemIds}
              isLocked={isStep3Locked}
              isSynced={isSynced}
              onContinueStep3={actions.handleContinueStep3}
              onUpdateStep3={actions.handleUpdateStep3}
              onSaveStep3={actions.handleSaveStep3}
              onCancelStep3Update={actions.cancelUpdateStep3}
            />
          ) : null}

          {(isStep1Locked && isStep2Locked && isStep3Locked) || isSynced ? (
            <BuilderSeoPanel
              draft={draft}
              setDraft={setDraft}
              onGenerateSeoWithAi={generateSeoWithAi}
              isGeneratingSeoTarget={isGeneratingSeoTarget}
              onGenerateSeoImageFromFeatured={generateSeoImageFromFeatured}
              isGeneratingSeoImage={isGeneratingSeoImage}
              onUploadOgImageFile={uploadOgImageFile}
              isUploadingOgImage={isUploadingOgImage}
              onAutoFillOgUrl={handleAutoFillOgUrl}
            />
          ) : null}
        </main>

        <BuilderSidebar
          draft={draft}
          completionPercent={progress.completionPercent}
          isSetupReady={progress.isSetupReady}
          hasTargetCount={progress.hasTargetCount}
          stepIssues={progress.stepIssues}
          editorModelName={draft.editorModelName}
          onEditorModelChange={actions.setEditorModelName}
          isSaving={isSaving}
          isAutoWritingEmptyFields={bulkVisualState === 'running'}
          autoWriteEmptyFieldsQueueCount={autoWriteEmptyFieldsQueueCount}
          autoWriteEmptyFieldsStatus={autoWriteEmptyFieldsStatus}
          canAutoWriteEmptyFields={(isSynced || (isStep1Locked && isStep2Locked)) && getSingleTypeAutoWriteTargetIds(draft, relatedItems).length > 0}
          onAutoWriteEmptyFields={autoWriteEmptyFields}
          onSaveLocalDraft={saveLocalDraft}
          onSyncToPayload={() => submit('draft')}
        />
      </div>

      <InspectListicleRunModal
        isOpen={Boolean(inspectTarget)}
        onClose={closeInspect}
        targetLabel={inspectTarget?.label ?? ''}
        steps={inspectTarget ? stepsByTargetId[inspectTarget.targetId] : undefined}
        isRunning={
          inspectTarget ? aiJobVisualStateById[inspectTarget.targetId] === 'running' : false
        }
        autoCloseOnCompletion={inspectTarget?.openedAutomatically ?? false}
      />
    </div>
  )
}
