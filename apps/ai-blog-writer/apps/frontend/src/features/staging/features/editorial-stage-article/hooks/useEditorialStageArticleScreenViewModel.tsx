import { useMemo } from 'react'
import type { EditorialStageArticlePageProps } from '../types'
import type {
  EditorialStageArticleScreenViewModel,
  EditorialStageStatusView,
} from '../view-model/types'
import { EMPTY_STAGED_ARTICLE } from '../view-model/empty-staged-article'
import { useEditorialStageArticleMediaController } from './useEditorialStageArticleMediaController'
import { useEditorialStageArticlePublishing } from './useEditorialStageArticlePublishing'
import { useEditorialStageArticleWorkspace } from './useEditorialStageArticleWorkspace'
import { useEditorialStageLoadedArticleViews } from './useEditorialStageLoadedArticleViews'

type UseEditorialStageArticleScreenViewModelParams = EditorialStageArticlePageProps & {
}

export function useEditorialStageArticleScreenViewModel({
  storageKey,
  routes,
  api,
  syncBehavior,
}: UseEditorialStageArticleScreenViewModelParams): EditorialStageArticleScreenViewModel {
  const workspace = useEditorialStageArticleWorkspace({
    storageKey,
    routes,
    api,
    syncBehavior,
  })
  const media = useEditorialStageArticleMediaController({ api, workspace })
  const publishing = useEditorialStageArticlePublishing({
    routes,
    api,
    workspace,
    media,
  })

  const status: EditorialStageStatusView = useMemo(() => ({
    isLoading: workspace.page.isLoading,
    error: workspace.page.error,
    stagedArticle: workspace.page.stagedArticle,
    articlesPath: routes.articlesPath,
    saveConflict: workspace.page.saveConflict,
  }), [
    workspace.page.isLoading,
    workspace.page.error,
    workspace.page.stagedArticle,
    workspace.page.saveConflict,
    routes.articlesPath,
  ])

  const loadedViews = useEditorialStageLoadedArticleViews({
    stagedArticle: workspace.page.stagedArticle ?? EMPTY_STAGED_ARTICLE,
    stagePath: routes.stagePath,
    workspace,
    media,
    publishing,
  })

  if (workspace.page.isLoading || !workspace.page.stagedArticle || workspace.page.error) {
    return {
      status,
      layout: null,
      timelineListProps: null,
      sidebarProps: null,
      featuredModalProps: null,
      blockModalProps: null,
    }
  }

  return {
    status,
    ...loadedViews,
  }
}
