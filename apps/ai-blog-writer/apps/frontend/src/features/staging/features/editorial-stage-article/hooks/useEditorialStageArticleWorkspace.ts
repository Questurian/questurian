import {
  useCallback,
  useMemo,
  useReducer,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { EditorialStageArticlePageProps, SupportedEditorialComponent } from '../types'
import { buildEditorialPublishAnalysis } from '../editorial-markdown.service'
import type { PublishResult } from '../selectors'
import {
  createInitialEditorialStageUiState,
  editorialStageUiReducer,
} from '../state/editorialStageUiMachine'
import { useEditorialStageBlocks } from './useEditorialStageBlocks'
import { useEditorialStagePageData } from './useEditorialStagePageData'
import { useEditorialStageTimeline } from './useEditorialStageTimeline'

type UseEditorialStageArticleWorkspaceParams = EditorialStageArticlePageProps & {
  token: string | null | undefined
}

function useSetPublishResult(
  currentResult: PublishResult,
  dispatchUi: (event: { type: 'SET_PUBLISH_RESULT'; result: PublishResult }) => void,
): Dispatch<SetStateAction<PublishResult>> {
  return useCallback((next) => {
    const result = typeof next === 'function' ? next(currentResult) : next
    dispatchUi({ type: 'SET_PUBLISH_RESULT', result })
  }, [currentResult, dispatchUi])
}

export function useEditorialStageArticleWorkspace({
  storageKey,
  routes,
  api,
  token,
  syncBehavior,
}: UseEditorialStageArticleWorkspaceParams) {
  const [uiState, dispatchUi] = useReducer(
    editorialStageUiReducer,
    undefined,
    createInitialEditorialStageUiState,
  )
  const setPublishResult = useSetPublishResult(uiState.publishResult, dispatchUi)

  const page = useEditorialStagePageData({
    storageKey,
    stageArticlePath: routes.stageArticlePath,
    stagePath: routes.stagePath,
    token,
    syncBehavior,
    api: {
      fetchResult: api.fetchResult,
      fetchLocations: api.fetchLocations,
      fetchMediaAssets: api.fetchMediaAssets,
      getArticleSyncStatus: api.getArticleSyncStatus,
      getArticleById: api.getArticleById,
    },
  })

  const timeline = useEditorialStageTimeline({
    stagedArticle: page.stagedArticle,
    updateStagedArticle: page.updateStagedArticle,
  })

  const editorialPublishAnalysis = useMemo(
    () => buildEditorialPublishAnalysis(page.stagedArticle?.editorialBlocks || []),
    [page.stagedArticle?.editorialBlocks],
  )

  const blocks = useEditorialStageBlocks({
    stagedArticle: page.stagedArticle,
    timelineItems: timeline.timelineItems,
    updateStagedArticle: page.updateStagedArticle,
    setPublishResult,
    setActiveEditingTimelineItemId: timeline.setActiveEditingTimelineItemId,
    rewriteBlockWithAi: api.rewriteBlockWithAi,
  })

  const toggleEditorialPicker = useCallback((target: string) => {
    dispatchUi({ type: 'TOGGLE_EDITORIAL_PICKER', target })
  }, [])

  const toggleImagePicker = useCallback((target: string) => {
    dispatchUi({ type: 'TOGGLE_IMAGE_PICKER', target })
  }, [])

  const { addNewEditorialBlock } = blocks
  const addEditorialFromPicker = useCallback((
    component: SupportedEditorialComponent,
    afterBlockId?: string,
    placeAfterImage?: boolean,
  ) => {
    void placeAfterImage
    addNewEditorialBlock(component, afterBlockId)
    dispatchUi({ type: 'CLOSE_EDITORIAL_PICKER' })
  }, [addNewEditorialBlock])

  return {
    page,
    timeline,
    blocks,
    editorialPublishAnalysis,
    uiState,
    dispatchUi,
    setPublishResult,
    toggleEditorialPicker,
    toggleImagePicker,
    addEditorialFromPicker,
  }
}

export type EditorialStageArticleWorkspace = ReturnType<
  typeof useEditorialStageArticleWorkspace
>
