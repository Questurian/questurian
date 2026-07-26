import { useCallback, useState } from 'react'
import { resolveEditorAssistModelName } from '../../../staging/api'
import {
  composeItineraryDayBlurbsWithAi,
  composeItineraryIntroWithAi,
  generateListicleContentWithAi
} from '../../api'
import { findItineraryItemById } from '../../types'
import {
  applyItineraryGeneratedContent,
  buildItineraryGenerateListicleContentRequest,
  getItineraryAutoWriteTargetIds
} from '../services/ai-autowrite.service'
import { buildItineraryComposeDayBlurbsRequest } from '../services/compose-day-blurbs.service'
import {
  dayHasExistingBlurbs,
  getComposableDayIndexes,
  getItineraryDayBlurbComposeDisabledReason,
  getItineraryStopBlurbComposeDisabledReason,
  itineraryStopBlurbWriteStrandsNeighbor
} from '../services/day-blurb-readiness.service'
import {
  applyItineraryComposedDayBlurbs,
  buildFailedDayBlurbComposeReport
} from '../services/day-blurb-results.service'
import { resolveStopTitle } from '../utils/itineraryStopBlock.utils'
import type { ComposeStopReasonResult } from '../services/compose-stop-reason.service'
import { composeItineraryStopReason } from '../services/compose-stop-reason.service'
import {
  applyItineraryComposedIntro,
  buildItineraryComposeIntroRequest,
  getItineraryIntroComposeDisabledReason,
  getItineraryIntroTargetId
} from '../services/intro-composer.service'
import type {
  ComposeDayBlurbResult,
  ComposeDayBlurbsResponse,
  ComposeIntroStepEvent,
  ComposeItineraryIntroResponse
} from '../../../staging/api'
import type {
  ItineraryBuilderAiActionsParams,
  StopComposeChoice
} from './itineraryBuilderAiActions.types'

type Params = Pick<
  ItineraryBuilderAiActionsParams,
  | 'draft'
  | 'setDraft'
  | 'locations'
  | 'relatedByBlockType'
  | 'onError'
  | 'setResult'
>

export function useItineraryContentAiActions({
  draft,
  setDraft,
  locations,
  relatedByBlockType,
  onError,
  setResult
}: Params) {
  const [activeAiTargetId, setActiveAiTargetId] = useState<string | null>(null)
  const [isAutoWritingEmptyFields, setIsAutoWritingEmptyFields] =
    useState(false)
  const [introComposeReport, setIntroComposeReport] =
    useState<ComposeItineraryIntroResponse | null>(null)
  const [isIntroComposeReportOpen, setIsIntroComposeReportOpen] =
    useState(false)
  const [dayBlurbReport, setDayBlurbReport] =
    useState<ComposeDayBlurbsResponse | null>(null)
  const [isDayBlurbReportOpen, setIsDayBlurbReportOpen] = useState(false)
  const [isComposingDayBlurbs, setIsComposingDayBlurbs] = useState(false)
  const [stopComposeChoice, setStopComposeChoice] =
    useState<StopComposeChoice | null>(null)

  const applyGeneratedListicleContent = useCallback(
    (response: Awaited<ReturnType<typeof generateListicleContentWithAi>>) => {
      setDraft((current) => {
        if (!current) return current
        return applyItineraryGeneratedContent(current, response)
      })
    },
    [setDraft]
  )

  const buildGenerationRequest = useCallback(
    (params: {
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
        includeArticleContext: params.includeArticleContext
      })

      if (request.targets.length < 1) {
        throw new Error('Add stop details before using AI generation.')
      }

      if (params.currentContentByTargetId) {
        request.targets = request.targets.map((target) => ({
          ...target,
          currentContent:
            params.currentContentByTargetId?.[target.targetId] ??
            target.currentContent
        }))
      }

      return request
    },
    [draft, locations, relatedByBlockType]
  )

  const countGeneratedBlurbs = useCallback(
    (results: Record<string, ComposeDayBlurbResult>): number => {
      return Object.values(results).filter(
        (entry) => entry.status === 'generated' && entry.markdown?.trim()
      ).length
    },
    []
  )

  const executeDayBlurbCompose = useCallback(
    async (dayIndex: number, writeTargetIds?: string[]): Promise<void> => {
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
          writeTargetIds
        })
        const response = await composeItineraryDayBlurbsWithAi(request)
        setDayBlurbReport(response)
        setDraft((current) =>
          current
            ? applyItineraryComposedDayBlurbs(current, dayIndex, response)
            : current
        )

        const generated = countGeneratedBlurbs(response.results)
        const hasWarnings = Object.values(response.results).some(
          (entry) => entry.validation_errors.length > 0
        )
        const scope = singleStop ? 'this stop' : `Day ${dayIndex + 1}`
        setResult(
          generated > 0
            ? `Wrote ${generated} blurb${generated === 1 ? '' : 's'} for ${scope}.${hasWarnings ? ' Some need review - see report.' : ''}`
            : `No blurbs were composed for ${scope} - see report.`
        )
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to compose day blurbs with AI.'
        setDayBlurbReport(
          buildFailedDayBlurbComposeReport({
            modelName,
            errorMessage,
            durationMs: Date.now() - startedAt
          })
        )
        onError(`${errorMessage} See composer report.`)
      } finally {
        setIsComposingDayBlurbs(false)
      }
    },
    [
      countGeneratedBlurbs,
      draft,
      locations,
      onError,
      relatedByBlockType,
      setDraft,
      setResult
    ]
  )

  const autoWriteIntro = useCallback(async (): Promise<void> => {
    if (!draft) return

    const disabledReason = getItineraryIntroComposeDisabledReason(
      draft,
      relatedByBlockType
    )
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
        modelName: resolveEditorAssistModelName(draft.editorModelName)
      })
      const response = await composeItineraryIntroWithAi(request)
      setIntroComposeReport(response)
      const intro = response.intro.trim()
      if (!intro) {
        throw new Error('AI intro composition returned empty output.')
      }

      setDraft((current) =>
        current ? applyItineraryComposedIntro(current, intro) : current
      )
      setResult(
        hadIntro ? 'Intro regenerated with AI.' : 'Intro written with AI.'
      )
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Failed to write intro with AI.'
      )
    } finally {
      setActiveAiTargetId(null)
    }
  }, [draft, locations, onError, relatedByBlockType, setDraft, setResult])

  const composeSingleStopAware = useCallback(
    async (dayIndex: number, targetId: string): Promise<void> => {
      setActiveAiTargetId(targetId)
      try {
        await executeDayBlurbCompose(dayIndex, [targetId])
      } finally {
        setActiveAiTargetId(null)
      }
    },
    [executeDayBlurbCompose]
  )

  const autoWriteStopBlurb = useCallback(
    async (itemId: string): Promise<void> => {
      if (!draft) return

      const found = findItineraryItemById(draft, itemId)
      if (!found) {
        onError('Selected stop was not found.')
        return
      }
      const { dayIndex, item } = found

      const disabledReason = getItineraryStopBlurbComposeDisabledReason(
        item,
        relatedByBlockType
      )
      if (disabledReason) {
        onError(disabledReason)
        return
      }

      const targetId = `${itemId}_blurb`
      const day = draft.days[dayIndex]
      const hasOtherBlurb = [...day.whereStaying, ...day.items].some(
        (stop) => stop.id !== itemId && stop.blurbMarkdown.trim().length > 0
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
        strandsNeighbor: itineraryStopBlurbWriteStrandsNeighbor(
          draft,
          dayIndex,
          itemId,
          relatedByBlockType
        )
      })
    },
    [composeSingleStopAware, draft, onError, relatedByBlockType]
  )

  const refineStopReason = useCallback(
    async (
      itemId: string,
      roughReason: string
    ): Promise<ComposeStopReasonResult> => {
      const fallback: ComposeStopReasonResult = {
        reason: roughReason.trim(),
        fallback: true
      }
      if (!draft) return fallback
      const item = findItineraryItemById(draft, itemId)?.item
      if (!item) return fallback
      return composeItineraryStopReason({
        draft,
        item,
        roughReason,
        relatedByBlockType,
        locations,
        modelName: resolveEditorAssistModelName(draft.editorModelName)
      })
    },
    [draft, locations, relatedByBlockType]
  )

  const autoWriteEmptyFields = useCallback(async (): Promise<void> => {
    if (!draft) return

    const blurbTargetIds = getItineraryAutoWriteTargetIds(
      draft,
      relatedByBlockType
    )
    const shouldComposeIntro =
      !draft.header.introMarkdown.trim() &&
      !getItineraryIntroComposeDisabledReason(draft, relatedByBlockType)

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
            modelName: resolveEditorAssistModelName(draft.editorModelName)
          })
          const introResponse = await composeItineraryIntroWithAi(introRequest)
          setIntroComposeReport(introResponse)
          const intro = introResponse.intro.trim()
          if (intro) {
            setDraft((current) =>
              current ? applyItineraryComposedIntro(current, intro) : current
            )
            generatedCount += 1
          }
        } catch (err) {
          errors.push(
            err instanceof Error ? err.message : 'Intro composition failed.'
          )
        }
      }

      if (blurbTargetIds.length > 0) {
        try {
          const request = buildGenerationRequest({
            targetIds: blurbTargetIds,
            skipExisting: true,
            includeArticleContext: true
          })
          const response = await generateListicleContentWithAi(request)
          applyGeneratedListicleContent(response)

          generatedCount += Object.values(response.results).filter(
            (entry) => entry.status === 'generated' && entry.markdown?.trim()
          ).length
          const failedResult = Object.values(response.results).find(
            (entry) => entry.status === 'error'
          )
          if (failedResult) {
            errors.push(
              failedResult.error_message ||
                failedResult.validation_errors[0] ||
                'One or more fields failed AI generation.'
            )
          }
        } catch (err) {
          errors.push(
            err instanceof Error ? err.message : 'Failed to auto write blurbs.'
          )
        }
      }

      if (generatedCount > 0) {
        setResult(
          `Auto-wrote ${generatedCount} empty field${generatedCount === 1 ? '' : 's'}.`
        )
      } else if (errors.length < 1) {
        setResult('No empty intro or blurbs needed new AI copy.')
      }

      if (errors.length > 0) {
        onError(errors.join(' '))
      }
    } finally {
      setIsAutoWritingEmptyFields(false)
    }
  }, [
    applyGeneratedListicleContent,
    buildGenerationRequest,
    draft,
    locations,
    onError,
    relatedByBlockType,
    setDraft,
    setResult
  ])

  const composeDayBlurbs = useCallback(
    async (dayIndex: number): Promise<void> => {
      if (!draft) return

      const disabledReason = getItineraryDayBlurbComposeDisabledReason(
        draft,
        dayIndex,
        relatedByBlockType
      )
      if (disabledReason) {
        onError(disabledReason)
        return
      }
      if (
        dayHasExistingBlurbs(draft, dayIndex, relatedByBlockType) &&
        !window.confirm(
          `Day ${dayIndex + 1}'s blurbs are written as one set, so adding or changing a stop ` +
            `recomposes the whole day. Every blurb in Day ${dayIndex + 1} will be rewritten, ` +
            `including any you've hand-edited. Continue?`
        )
      ) {
        return
      }

      await executeDayBlurbCompose(dayIndex)
    },
    [draft, executeDayBlurbCompose, onError, relatedByBlockType]
  )

  const composeAllDayBlurbs = useCallback(async (): Promise<void> => {
    if (!draft) return

    const dayIndexes = getComposableDayIndexes(draft, relatedByBlockType)
    if (dayIndexes.length < 1) {
      onError('')
      setResult('No days are ready to compose.')
      return
    }
    if (
      dayIndexes.some((dayIndex) =>
        dayHasExistingBlurbs(draft, dayIndex, relatedByBlockType)
      ) &&
      !window.confirm(
        'Each day is composed as one set, so days with existing blurbs will be rewritten ' +
          "in full, including any you've hand-edited. Continue?"
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
            modelName
          })
          const response = await composeItineraryDayBlurbsWithAi(request)
          setDraft((current) =>
            current
              ? applyItineraryComposedDayBlurbs(current, dayIndex, response)
              : current
          )
          modelUsed = response.model_used
          Object.assign(mergedResults, response.results)
          mergedSteps.push(
            ...response.steps.map((step) => ({
              ...step,
              label: `Day ${dayIndex + 1} - ${step.label}`
            }))
          )
          totalGenerated += countGeneratedBlurbs(response.results)
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'composition failed'
          errors.push(`Day ${dayIndex + 1}: ${errorMessage}`)
          mergedSteps.push(
            ...buildFailedDayBlurbComposeReport({
              modelName,
              errorMessage,
              durationMs: Date.now() - startedAt,
              label: `Day ${dayIndex + 1} - Day composer request`
            }).steps
          )
          modelUsed ||= modelName
        }
      }

      if (mergedSteps.length > 0) {
        setDayBlurbReport({
          model_used: modelUsed,
          results: mergedResults,
          steps: mergedSteps
        })
      }
      if (totalGenerated > 0) {
        setResult(
          `Wrote ${totalGenerated} blurb${totalGenerated === 1 ? '' : 's'} across ${dayIndexes.length} day${dayIndexes.length === 1 ? '' : 's'}.`
        )
      }
      if (errors.length > 0) {
        onError(errors.join(' '))
      }
    } finally {
      setIsComposingDayBlurbs(false)
    }
  }, [
    countGeneratedBlurbs,
    draft,
    locations,
    onError,
    relatedByBlockType,
    setDraft,
    setResult
  ])

  return {
    activeAiTargetId,
    isAutoWritingEmptyFields,
    introComposeReport,
    isIntroComposeReportOpen,
    setIsIntroComposeReportOpen,
    dayBlurbReport,
    isDayBlurbReportOpen,
    setIsDayBlurbReportOpen,
    isComposingDayBlurbs,
    stopComposeChoice,
    setStopComposeChoice,
    autoWriteIntro,
    composeSingleStopAware,
    executeDayBlurbCompose,
    autoWriteStopBlurb,
    refineStopReason,
    autoWriteEmptyFields,
    composeDayBlurbs,
    composeAllDayBlurbs
  }
}
