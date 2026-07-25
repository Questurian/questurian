import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { StagedArticle } from '../../../types'
import type { SidebarViewProps } from '../selectors'

type UseStandardArticleStageActionsParams = {
  stagedArticle?: StagedArticle
  sidebarProps: SidebarViewProps | null
  step1Issues: string[]
  step3Issues: string[]
  syncIssues: string[]
  setLocalError: Dispatch<SetStateAction<string | null>>
  setLocalResult: Dispatch<SetStateAction<string | null>>
}

export function useStandardArticleStageActions({
  stagedArticle,
  sidebarProps,
  step1Issues,
  step3Issues,
  syncIssues,
  setLocalError,
  setLocalResult,
}: UseStandardArticleStageActionsParams) {
  const setStageArticle = useCallback((updates: Partial<StagedArticle>) => {
    sidebarProps?.onUpdateStagedArticle(updates)
  }, [sidebarProps])

  const continueSetup = useCallback(() => {
    if (!stagedArticle || !sidebarProps) return
    if (step1Issues.length > 0) {
      setLocalError(step1Issues[0])
      return
    }
    if (!stagedArticle.payloadSlug?.trim()) {
      setLocalError('Slug is required before continuing.')
      return
    }
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onUpdateStagedArticle({
      step1_complete: true,
      in_update_mode: false,
      step2_complete: false,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
    })
  }, [setLocalError, setLocalResult, sidebarProps, stagedArticle, step1Issues])

  const continueFeaturedImage = useCallback(() => {
    if (!sidebarProps) return
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onUpdateStagedArticle({
      step2_complete: true,
      step2_in_update_mode: false,
    })
  }, [setLocalError, setLocalResult, sidebarProps])

  const continueContent = useCallback(() => {
    if (!sidebarProps) return
    if (step3Issues.length > 0) {
      setLocalError(step3Issues[0])
      return
    }
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onUpdateStagedArticle({
      step3_complete: true,
      step3_in_update_mode: false,
    })
  }, [setLocalError, setLocalResult, sidebarProps, step3Issues])

  const submitToPayload = useCallback((targetStatus: 'draft' | 'published') => {
    if (!sidebarProps) return
    if (syncIssues.length > 0) {
      setLocalError(syncIssues[0])
      return
    }
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onPublish(targetStatus)
  }, [setLocalError, setLocalResult, sidebarProps, syncIssues])

  return {
    setStageArticle,
    continueSetup,
    continueFeaturedImage,
    continueContent,
    submitToPayload,
  }
}
