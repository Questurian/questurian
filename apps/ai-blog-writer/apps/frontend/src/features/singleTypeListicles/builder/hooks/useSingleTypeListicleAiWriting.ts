import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { resolveEditorAssistModelName } from '../../../staging/api'
import { generateListicleContentWithAi } from '../../api'
import type {
  LocationOption,
  RelatedItemOption,
  SingleTypeListicleDraft,
} from '../../types'
import {
  applySingleTypeListicleGeneratedContent,
  buildSingleTypeGenerateListicleContentRequest,
  getSingleTypeAutoWriteTargetIds,
  getSingleTypeIntroDisabledReason,
  getSingleTypeIntroTargetId,
} from '../services/ai-autowrite.service'
import {
  AUTO_WRITE_EMPTY_FIELDS_JOB_ID,
  useAiJobQueue,
} from './useAiJobQueue'

type UseSingleTypeListicleAiWritingParams = {
  draft: SingleTypeListicleDraft | null
  relatedItems: RelatedItemOption[]
  locations: LocationOption[]
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

export function useSingleTypeListicleAiWriting({
  draft,
  relatedItems,
  locations,
  setDraft,
  onError,
  setResult,
}: UseSingleTypeListicleAiWritingParams) {
  const draftRef = useRef(draft)
  const relatedItemsRef = useRef(relatedItems)
  const locationsRef = useRef(locations)
  const jobs = useAiJobQueue()

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    relatedItemsRef.current = relatedItems
  }, [relatedItems])

  useEffect(() => {
    locationsRef.current = locations
  }, [locations])

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
    jobs.recordResponseSteps(response)
    const targetResult = response.results[params.targetId]

    if (!targetResult) {
      throw new Error('AI generation returned no result for the requested field.')
    }

    if (
      (targetResult.status === 'generated' || targetResult.status === 'skipped')
      && targetResult.markdown?.trim()
    ) {
      return targetResult.markdown.trim()
    }

    throw new Error(
      targetResult.error_message
      || targetResult.validation_errors[0]
      || 'AI generation failed for this field.',
    )
  }, [buildGenerationRequest, jobs])

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
    jobs.openInspect(targetId, 'Intro', true)
    jobs.markVisualState(targetId, 'queued')

    jobs.enqueueTask({
      id: targetId,
      run: async () => {
        const draftForRun = draftRef.current
        if (!draftForRun || draftForRun.draftId !== draftId) return

        onError('')
        jobs.markVisualState(targetId, 'running')

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
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to write intro with AI.')
        } finally {
          jobs.clearVisualState(targetId)
        }
      },
    })
  }, [jobs, onError, runSingleTargetGeneration, setDraft, setResult])

  const autoWriteItemBlurb = useCallback(async (itemId: string): Promise<void> => {
    const currentDraft = draftRef.current
    if (!currentDraft) return

    const draftId = currentDraft.draftId
    const targetId = `${itemId}_blurb`
    const itemIndex = currentDraft.items.findIndex((entry) => entry.id === itemId)
    const itemLabel = itemIndex >= 0 ? `Item ${itemIndex + 1} blurb` : 'Item blurb'

    onError('')
    setResult(null)
    jobs.openInspect(targetId, itemLabel, true)
    jobs.markVisualState(targetId, 'queued')

    jobs.enqueueTask({
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
        jobs.markVisualState(targetId, 'running')

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
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to write item blurb with AI.')
        } finally {
          jobs.clearVisualState(targetId)
        }
      },
    })
  }, [jobs, onError, runSingleTargetGeneration, setDraft, setResult])

  const autoWriteEmptyFields = useCallback(async (): Promise<void> => {
    const currentDraft = draftRef.current
    if (!currentDraft) return

    const draftId = currentDraft.draftId

    onError('')
    setResult(null)
    jobs.markVisualState(AUTO_WRITE_EMPTY_FIELDS_JOB_ID, 'queued')

    jobs.enqueueTask({
      id: AUTO_WRITE_EMPTY_FIELDS_JOB_ID,
      run: async () => {
        const draftForRun = draftRef.current
        if (!draftForRun || draftForRun.draftId !== draftId) return

        const targetIds = getSingleTypeAutoWriteTargetIds(draftForRun, relatedItemsRef.current)

        onError('')
        jobs.markVisualState(AUTO_WRITE_EMPTY_FIELDS_JOB_ID, 'running')

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
          jobs.recordResponseSteps(response)

          if (draftRef.current?.draftId !== draftId) return

          setDraft((current) => {
            if (!current || current.draftId !== draftId) return current
            return applySingleTypeListicleGeneratedContent(current, response)
          })

          const generatedCount = Object.values(response.results)
            .filter((entry) => entry.status === 'generated' && entry.markdown?.trim())
            .length
          const failedResult = Object.values(response.results).find((entry) => entry.status === 'error')

          setResult(
            generatedCount > 0
              ? `Auto-wrote ${generatedCount} empty field${generatedCount === 1 ? '' : 's'}.`
              : 'No empty intro or blurbs needed new AI copy.',
          )

          if (failedResult) {
            onError(
              failedResult.error_message
              || failedResult.validation_errors[0]
              || 'One or more fields failed AI generation.',
            )
          }
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to auto write empty fields.')
        } finally {
          jobs.clearVisualState(AUTO_WRITE_EMPTY_FIELDS_JOB_ID)
        }
      },
    })
  }, [buildGenerationRequest, jobs, onError, setDraft, setResult])

  const introTargetId = draft ? getSingleTypeIntroTargetId(draft) : ''
  const introVisualState = jobs.visualStateById[introTargetId]
    ?? (
      jobs.activeTaskId === introTargetId
        ? 'running'
        : jobs.queuedTaskIds.includes(introTargetId)
          ? 'queued'
          : undefined
    )
  const bulkVisualState = jobs.visualStateById[AUTO_WRITE_EMPTY_FIELDS_JOB_ID]
    ?? (
      jobs.activeTaskId === AUTO_WRITE_EMPTY_FIELDS_JOB_ID
        ? 'running'
        : jobs.queuedTaskIds.includes(AUTO_WRITE_EMPTY_FIELDS_JOB_ID)
          ? 'queued'
          : undefined
    )

  return {
    autoWriteIntro,
    autoWriteItemBlurb,
    autoWriteEmptyFields,
    openInspect: jobs.openInspect,
    closeInspect: jobs.closeInspect,
    inspectTarget: jobs.inspectTarget,
    stepsByTargetId: jobs.stepsByTargetId,
    visualStateById: jobs.visualStateById,
    introTargetId,
    introAiDisabledReason: draft ? getSingleTypeIntroDisabledReason(draft) : null,
    isIntroAiGenerating: jobs.activeTaskId === introTargetId,
    introAiQueueCount: introVisualState === 'queued'
      ? Math.max(1, jobs.queuedTaskIds.filter((jobId) => jobId === introTargetId).length)
      : 0,
    introAiStatus: introVisualState === 'running'
      ? 'Waiting for AI response...'
      : introVisualState === 'queued'
        ? 'Queued. Waiting for earlier AI response...'
        : null,
    runningAiItemId: Object.entries(jobs.visualStateById)
      .find(([jobId, state]) => state === 'running' && jobId.endsWith('_blurb'))?.[0]
      ?.replace(/_blurb$/, '') ?? null,
    queuedAiItemIds: Object.entries(jobs.visualStateById)
      .filter(([jobId, state]) => state === 'queued' && jobId.endsWith('_blurb'))
      .map(([jobId]) => jobId.replace(/_blurb$/, '')),
    isAutoWritingEmptyFields: bulkVisualState === 'running',
    autoWriteEmptyFieldsQueueCount: bulkVisualState === 'queued'
      ? Math.max(
          1,
          jobs.queuedTaskIds.filter((jobId) => jobId === AUTO_WRITE_EMPTY_FIELDS_JOB_ID).length,
        )
      : 0,
    autoWriteEmptyFieldsStatus: bulkVisualState === 'running'
      ? 'Waiting for AI response...'
      : bulkVisualState === 'queued'
        ? 'Queued. Waiting for earlier AI response...'
        : null,
  }
}
