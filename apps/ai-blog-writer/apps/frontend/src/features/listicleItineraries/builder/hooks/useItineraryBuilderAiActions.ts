import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useState } from 'react'
import { resolveEditorAssistModelName } from '../../../staging/api'
import { generateSocialImageFromFeatured as requestGenerateSocialImageFromFeatured } from '../../../../shared/images'
import { buildArticleOgUrl } from '../../../../shared/seo/utils/buildArticleOgUrl'
import { formatLocationLabel } from '../../../../shared/locationScope/labels'
import {
  composeItineraryBriefWithAi,
  composeItineraryDayBlurbsWithAi,
  composeItineraryIntroWithAi,
  generateListicleContentWithAi,
  generateSeoMetadataWithAi,
  rewriteBlockWithAi,
} from '../../api'
import {
  findItineraryItemById,
  type ItineraryBlockType,
  type ListicleItineraryDraft,
  type LocationOption,
  type RelatedItemOption,
  type TravelerProfile,
} from '../../types'
import { applyAutobuildPlanToDraft } from '../mappers/autobuild-plan.mapper'
import {
  applyItineraryGeneratedContent,
  buildItineraryGenerateListicleContentRequest,
  getItineraryAutoWriteTargetIds,
} from '../services/ai-autowrite.service'
import {
  buildItineraryAiArticleContext,
  getItineraryAiArticleTitle,
} from '../services/ai-rewrite.service'
import { generateItinerary, type AutobuildResponse } from '../services/autobuild.api'
import {
  applyItineraryComposedDayBlurbs,
  buildFailedDayBlurbComposeReport,
  buildItineraryComposeDayBlurbsRequest,
  dayHasExistingBlurbs,
  getComposableDayIndexes,
  getItineraryDayBlurbComposeDisabledReason,
  getItineraryStopBlurbComposeDisabledReason,
  itineraryStopBlurbWriteStrandsNeighbor,
  resolveStopTitle,
} from '../services/compose-day-blurbs.service'
import type { ComposeStopReasonResult } from '../services/compose-stop-reason.service'
import { composeItineraryStopReason } from '../services/compose-stop-reason.service'
import {
  applyItineraryComposedIntro,
  buildItineraryComposeIntroRequest,
  getItineraryIntroComposeDisabledReason,
  getItineraryIntroTargetId,
} from '../services/intro-composer.service'
import {
  applySeoAiPatch,
  buildSeoAiPrompt,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
  type SeoAiTarget,
} from '../services/seo-ai.service'
import { DEFAULT_DAY_SHELL_ID, getDayShellTemplate } from '../constants/day-shells.constants'
import type {
  ComposeDayBlurbResult,
  ComposeDayBlurbsResponse,
  ComposeIntroStepEvent,
  ComposeItineraryIntroResponse,
} from '../../../staging/api'

type StopComposeChoice = {
  itemId: string
  dayIndex: number
  targetId: string
  stopTitle: string
  strandsNeighbor: boolean
}

type UseItineraryBuilderAiActionsParams = {
  token?: string | null
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  locations: LocationOption[]
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  canonicalStructuredData: string
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

export function useItineraryBuilderAiActions({
  token,
  draft,
  setDraft,
  locations,
  relatedByBlockType,
  canonicalStructuredData,
  onError,
  setResult,
}: UseItineraryBuilderAiActionsParams) {
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)
  const [activeAiTargetId, setActiveAiTargetId] = useState<string | null>(null)
  const [isAutoWritingEmptyFields, setIsAutoWritingEmptyFields] = useState(false)
  const [autobuildReport, setAutobuildReport] = useState<AutobuildResponse | null>(null)
  const [isAutobuildReportOpen, setIsAutobuildReportOpen] = useState(false)
  const [introComposeReport, setIntroComposeReport] = useState<ComposeItineraryIntroResponse | null>(null)
  const [isIntroComposeReportOpen, setIsIntroComposeReportOpen] = useState(false)
  const [dayBlurbReport, setDayBlurbReport] = useState<ComposeDayBlurbsResponse | null>(null)
  const [isDayBlurbReportOpen, setIsDayBlurbReportOpen] = useState(false)
  const [isComposingDayBlurbs, setIsComposingDayBlurbs] = useState(false)
  const [stopComposeChoice, setStopComposeChoice] = useState<StopComposeChoice | null>(null)
  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false)
  const [isGeneratingItinerary, setIsGeneratingItinerary] = useState(false)

  const composeTravelerBrief = useCallback(async (profile: TravelerProfile): Promise<string> => {
    if (!draft) {
      throw new Error('Draft is not loaded yet.')
    }
    const location = locations.find((entry) => entry.locationKey === draft.location)
    const response = await composeItineraryBriefWithAi({
      travelerTypes: profile.travelerTypes,
      motivations: profile.motivations,
      interests: profile.interests,
      budget: profile.budget || undefined,
      accommodations: profile.accommodations,
      practicalNeeds: profile.practicalNeeds,
      notes: profile.notes.trim() || undefined,
      locationLabel: location ? formatLocationLabel(location) : undefined,
      dayCount: draft.dayCount,
      articleTitle: draft.title.trim() || undefined,
      modelName: resolveEditorAssistModelName(draft.editorModelName),
    })
    const brief = response.brief?.trim()
    if (!brief) {
      throw new Error('AI returned an empty brief.')
    }
    return brief
  }, [draft, locations])

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
    if (!draft.title.trim() || !draft.location) {
      onError('Add a title and location before using the AI Autobuild brief.')
      return
    }
    const brief = (draft.generationBrief || '').trim()
    if (!brief) return
    if (!token) {
      onError('You must be signed in to generate an itinerary.')
      return
    }
    const hasExistingStops = draft.days.some((day) => day.items.length > 0 || day.whereStaying.length > 0)
    if (hasExistingStops && !window.confirm('This will replace the current stops with a freshly generated plan. Continue?')) {
      return
    }

    setIsGeneratingItinerary(true)
    onError('')
    setResult(null)
    setAutobuildReport(null)
    setIsAutobuildReportOpen(false)
    try {
      const plan = await generateItinerary({
        location: draft.location,
        title: draft.title.trim(),
        brief,
        dayCount: draft.dayCount,
        payloadToken: token,
        sharedNeighborhoods: draft.sharedNeighborhoods,
        dayShells: draft.days.map((day, dayIndex) => ({
          dayIndex,
          shell: getDayShellTemplate(
            draft.dayShellSelections?.find((entry) => entry.dayId === day.id)?.shellId ?? DEFAULT_DAY_SHELL_ID,
            draft.customDayShells,
          ),
        })),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        includeLodging: draft.includeLodging !== false,
      })
      setDraft((current) => (current ? applyAutobuildPlanToDraft(current, plan) : current))
      const filled = plan.days.reduce((sum, day) => sum + day.items.length, 0)
      const issueCount = plan.slot_issues?.length ?? 0
      setResult(
        `Generated ${filled} stop${filled === 1 ? '' : 's'} across ${plan.days.length} day${plan.days.length === 1 ? '' : 's'}.`
        + (issueCount ? ` ${issueCount} shell slot${issueCount === 1 ? '' : 's'} need manual picks.` : '')
        + (plan.notes.length ? ` Notes: ${plan.notes.join(' ')}` : ''),
      )
      setAutobuildReport(plan)
      const hasIssues = issueCount > 0 || plan.steps.some((step) => step.status !== 'ok')
      if (hasIssues) {
        setIsAutobuildReportOpen(true)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate itinerary.')
    } finally {
      setIsGeneratingItinerary(false)
    }
  }, [draft, token, onError, setDraft, setResult])

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

  const countGeneratedBlurbs = useCallback((results: Record<string, ComposeDayBlurbResult>): number => {
    return Object.values(results).filter((entry) => entry.status === 'generated' && entry.markdown?.trim()).length
  }, [])

  const executeDayBlurbCompose = useCallback(async (
    dayIndex: number,
    writeTargetIds?: string[],
  ): Promise<void> => {
    if (!draft) return

    onError('')
    setResult(null)
    setIsComposingDayBlurbs(true)

    const singleStop = writeTargetIds?.length === 1
    const modelName = resolveEditorAssistModelName(draft.editorModelName)
    const startedAt = Date.now()
    try {
      const request = buildItineraryComposeDayBlurbsRequest({
        draft,
        dayIndex,
        relatedByBlockType,
        locations,
        modelName,
        writeTargetIds,
      })
      const response = await composeItineraryDayBlurbsWithAi(request)
      setDayBlurbReport(response)
      setDraft((current) => (current ? applyItineraryComposedDayBlurbs(current, dayIndex, response) : current))

      const generated = countGeneratedBlurbs(response.results)
      const hasWarnings = Object.values(response.results).some((entry) => entry.validation_errors.length > 0)
      const scope = singleStop ? 'this stop' : `Day ${dayIndex + 1}`
      setResult(
        generated > 0
          ? `Wrote ${generated} blurb${generated === 1 ? '' : 's'} for ${scope}.${hasWarnings ? ' Some need review - see report.' : ''}`
          : `No blurbs were composed for ${scope} - see report.`,
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to compose day blurbs with AI.'
      setDayBlurbReport(buildFailedDayBlurbComposeReport({
        modelName,
        errorMessage,
        durationMs: Date.now() - startedAt,
      }))
      onError(`${errorMessage} See composer report.`)
    } finally {
      setIsComposingDayBlurbs(false)
    }
  }, [countGeneratedBlurbs, draft, locations, onError, relatedByBlockType, setDraft, setResult])

  const autoWriteIntro = useCallback(async (): Promise<void> => {
    if (!draft) return

    const disabledReason = getItineraryIntroComposeDisabledReason(draft, relatedByBlockType)
    if (disabledReason) {
      onError(disabledReason)
      return
    }

    const hadIntro = draft.header.introMarkdown.trim()
    onError('')
    setResult(null)
    setActiveAiTargetId(getItineraryIntroTargetId(draft))

    try {
      const request = buildItineraryComposeIntroRequest({
        draft,
        relatedByBlockType,
        locations,
        modelName: resolveEditorAssistModelName(draft.editorModelName),
      })
      const response = await composeItineraryIntroWithAi(request)
      setIntroComposeReport(response)
      const intro = response.intro.trim()
      if (!intro) {
        throw new Error('AI intro composition returned empty output.')
      }

      setDraft((current) => (current ? applyItineraryComposedIntro(current, intro) : current))
      setResult(hadIntro ? 'Intro regenerated with AI.' : 'Intro written with AI.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to write intro with AI.')
    } finally {
      setActiveAiTargetId(null)
    }
  }, [draft, locations, onError, relatedByBlockType, setDraft, setResult])

  const composeSingleStopAware = useCallback(async (dayIndex: number, targetId: string): Promise<void> => {
    setActiveAiTargetId(targetId)
    try {
      await executeDayBlurbCompose(dayIndex, [targetId])
    } finally {
      setActiveAiTargetId(null)
    }
  }, [executeDayBlurbCompose])

  const autoWriteStopBlurb = useCallback(async (itemId: string): Promise<void> => {
    if (!draft) return

    const found = findItineraryItemById(draft, itemId)
    if (!found) {
      onError('Selected stop was not found.')
      return
    }
    const { dayIndex, item } = found

    const disabledReason = getItineraryStopBlurbComposeDisabledReason(draft, item, relatedByBlockType)
    if (disabledReason) {
      onError(disabledReason)
      return
    }

    const targetId = `${itemId}_blurb`
    const day = draft.days[dayIndex]
    const hasOtherBlurb = [...day.whereStaying, ...day.items].some(
      (stop) => stop.id !== itemId && stop.blurbMarkdown.trim().length > 0,
    )

    if (!hasOtherBlurb) {
      await composeSingleStopAware(dayIndex, targetId)
      return
    }

    setStopComposeChoice({
      itemId,
      dayIndex,
      targetId,
      stopTitle: resolveStopTitle(item, relatedByBlockType) || 'this stop',
      strandsNeighbor: itineraryStopBlurbWriteStrandsNeighbor(draft, dayIndex, itemId, relatedByBlockType),
    })
  }, [composeSingleStopAware, draft, onError, relatedByBlockType])

  const refineStopReason = useCallback(
    async (itemId: string, roughReason: string): Promise<ComposeStopReasonResult> => {
      const fallback: ComposeStopReasonResult = { reason: roughReason.trim(), fallback: true }
      if (!draft) return fallback
      const item = findItineraryItemById(draft, itemId)?.item
      if (!item) return fallback
      return composeItineraryStopReason({
        draft,
        item,
        roughReason,
        relatedByBlockType,
        locations,
        modelName: resolveEditorAssistModelName(draft.editorModelName),
      })
    },
    [draft, locations, relatedByBlockType],
  )

  const autoWriteEmptyFields = useCallback(async (): Promise<void> => {
    if (!draft) return

    const blurbTargetIds = getItineraryAutoWriteTargetIds(draft, relatedByBlockType)
    const shouldComposeIntro = !draft.header.introMarkdown.trim()
      && !getItineraryIntroComposeDisabledReason(draft, relatedByBlockType)

    if (blurbTargetIds.length < 1 && !shouldComposeIntro) {
      onError('')
      setResult('No empty intro or blurbs to auto write.')
      return
    }

    onError('')
    setResult(null)
    setIsAutoWritingEmptyFields(true)

    let generatedCount = 0
    const errors: string[] = []

    try {
      if (shouldComposeIntro) {
        try {
          const introRequest = buildItineraryComposeIntroRequest({
            draft,
            relatedByBlockType,
            locations,
            modelName: resolveEditorAssistModelName(draft.editorModelName),
          })
          const introResponse = await composeItineraryIntroWithAi(introRequest)
          setIntroComposeReport(introResponse)
          const intro = introResponse.intro.trim()
          if (intro) {
            setDraft((current) => (current ? applyItineraryComposedIntro(current, intro) : current))
            generatedCount += 1
          }
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Intro composition failed.')
        }
      }

      if (blurbTargetIds.length > 0) {
        try {
          const request = buildGenerationRequest({
            targetIds: blurbTargetIds,
            skipExisting: true,
            includeArticleContext: true,
          })
          const response = await generateListicleContentWithAi(request)
          applyGeneratedListicleContent(response)

          generatedCount += Object.values(response.results)
            .filter((entry) => entry.status === 'generated' && entry.markdown?.trim())
            .length
          const failedResult = Object.values(response.results).find((entry) => entry.status === 'error')
          if (failedResult) {
            errors.push(
              failedResult.error_message
              || failedResult.validation_errors[0]
              || 'One or more fields failed AI generation.',
            )
          }
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Failed to auto write blurbs.')
        }
      }

      if (generatedCount > 0) {
        setResult(`Auto-wrote ${generatedCount} empty field${generatedCount === 1 ? '' : 's'}.`)
      } else if (errors.length < 1) {
        setResult('No empty intro or blurbs needed new AI copy.')
      }

      if (errors.length > 0) {
        onError(errors.join(' '))
      }
    } finally {
      setIsAutoWritingEmptyFields(false)
    }
  }, [applyGeneratedListicleContent, buildGenerationRequest, draft, locations, onError, relatedByBlockType, setDraft, setResult])

  const composeDayBlurbs = useCallback(async (dayIndex: number): Promise<void> => {
    if (!draft) return

    const disabledReason = getItineraryDayBlurbComposeDisabledReason(draft, dayIndex, relatedByBlockType)
    if (disabledReason) {
      onError(disabledReason)
      return
    }
    if (
      dayHasExistingBlurbs(draft, dayIndex, relatedByBlockType)
      && !window.confirm(
        `Day ${dayIndex + 1}'s blurbs are written as one set, so adding or changing a stop `
        + `recomposes the whole day. Every blurb in Day ${dayIndex + 1} will be rewritten, `
        + `including any you've hand-edited. Continue?`,
      )
    ) {
      return
    }

    await executeDayBlurbCompose(dayIndex)
  }, [draft, executeDayBlurbCompose, onError, relatedByBlockType])

  const composeAllDayBlurbs = useCallback(async (): Promise<void> => {
    if (!draft) return

    const dayIndexes = getComposableDayIndexes(draft, relatedByBlockType)
    if (dayIndexes.length < 1) {
      onError('')
      setResult('No days are ready to compose.')
      return
    }
    if (
      dayIndexes.some((dayIndex) => dayHasExistingBlurbs(draft, dayIndex, relatedByBlockType))
      && !window.confirm(
        'Each day is composed as one set, so days with existing blurbs will be rewritten '
        + 'in full, including any you\'ve hand-edited. Continue?',
      )
    ) {
      return
    }

    onError('')
    setResult(null)
    setIsComposingDayBlurbs(true)

    const mergedSteps: ComposeIntroStepEvent[] = []
    const mergedResults: Record<string, ComposeDayBlurbResult> = {}
    const errors: string[] = []
    let modelUsed = ''
    let totalGenerated = 0

    try {
      for (const dayIndex of dayIndexes) {
        const modelName = resolveEditorAssistModelName(draft.editorModelName)
        const startedAt = Date.now()
        try {
          const request = buildItineraryComposeDayBlurbsRequest({
            draft,
            dayIndex,
            relatedByBlockType,
            locations,
            modelName,
          })
          const response = await composeItineraryDayBlurbsWithAi(request)
          setDraft((current) => (current ? applyItineraryComposedDayBlurbs(current, dayIndex, response) : current))
          modelUsed = response.model_used
          Object.assign(mergedResults, response.results)
          mergedSteps.push(
            ...response.steps.map((step) => ({ ...step, label: `Day ${dayIndex + 1} - ${step.label}` })),
          )
          totalGenerated += countGeneratedBlurbs(response.results)
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'composition failed'
          errors.push(`Day ${dayIndex + 1}: ${errorMessage}`)
          mergedSteps.push(...buildFailedDayBlurbComposeReport({
            modelName,
            errorMessage,
            durationMs: Date.now() - startedAt,
            label: `Day ${dayIndex + 1} - Day composer request`,
          }).steps)
          modelUsed ||= modelName
        }
      }

      if (mergedSteps.length > 0) {
        setDayBlurbReport({ model_used: modelUsed, results: mergedResults, steps: mergedSteps })
      }
      if (totalGenerated > 0) {
        setResult(`Wrote ${totalGenerated} blurb${totalGenerated === 1 ? '' : 's'} across ${dayIndexes.length} day${dayIndexes.length === 1 ? '' : 's'}.`)
      }
      if (errors.length > 0) {
        onError(errors.join(' '))
      }
    } finally {
      setIsComposingDayBlurbs(false)
    }
  }, [countGeneratedBlurbs, draft, locations, onError, relatedByBlockType, setDraft, setResult])

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
      const response = await generateSeoMetadataWithAi({
        prompt: buildSeoAiPrompt({
          articleType: 'listicle-itinerary',
          location: draft.location,
          target,
          structuredDataTemplate: target === 'structuredData'
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

      const seoPatch = parseSeoAiPatch(JSON.stringify(response.seo_patch))
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
  }, [canonicalStructuredData, draft, onError, setDraft, setResult])

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
  }, [canonicalStructuredData, onError, setDraft, setResult])

  const generateSeoImageFromFeatured = useCallback(async (): Promise<void> => {
    if (!draft) return

    const featuredMediaSetId = draft.header.featuredMediaSet ?? null
    const featuredAssetId = draft.header.featuredImage
    if (!featuredMediaSetId && !featuredAssetId) {
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
      const response = await requestGenerateSocialImageFromFeatured(
        featuredMediaSetId
          ? { featuredMediaSetId }
          : { featuredAssetId: featuredAssetId as number },
        token,
      )
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
  }, [draft, onError, setDraft, setResult, token])

  return {
    isGeneratingSeoTarget,
    isGeneratingSeoImage,
    activeAiTargetId,
    isAutoWritingEmptyFields,
    autobuildReport,
    isAutobuildReportOpen,
    setIsAutobuildReportOpen,
    introComposeReport,
    isIntroComposeReportOpen,
    setIsIntroComposeReportOpen,
    dayBlurbReport,
    isDayBlurbReportOpen,
    setIsDayBlurbReportOpen,
    isComposingDayBlurbs,
    stopComposeChoice,
    setStopComposeChoice,
    isGeneratingSlug,
    isGeneratingItinerary,
    composeTravelerBrief,
    applySlugAndOgUrl,
    handleGenerateSlugWithAi,
    handleGenerateItinerary,
    handleAutoFillOgUrl,
    autoWriteIntro,
    composeSingleStopAware,
    executeDayBlurbCompose,
    autoWriteStopBlurb,
    refineStopReason,
    autoWriteEmptyFields,
    composeDayBlurbs,
    composeAllDayBlurbs,
    generateSeoWithAi,
    regenerateStructuredDataFromTemplate,
    generateSeoImageFromFeatured,
  }
}
