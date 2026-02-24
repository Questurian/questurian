import type {
  BlockModalViewProps,
  FeaturedModalViewProps,
  SidebarViewProps,
  TimelineListViewProps,
} from '../selectors'
import type { StagedArticle } from '../../../types'

export type EditorialStageLayoutView = {
  stagedArticle: StagedArticle
  stagePath: string
  hasMissingFeaturedImage: boolean
  isConverting: boolean
  onResetToOriginalBlocks: () => void
  onDelete: () => void
  onUpdateTitle: (title: string) => void
}

export type EditorialStageStatusView = {
  isLoading: boolean
  error: string | null
  stagedArticle: StagedArticle | null
  articlesPath: string
}

export type EditorialStageArticleScreenViewModel = {
  status: EditorialStageStatusView
  layout: EditorialStageLayoutView | null
  timelineListProps: TimelineListViewProps | null
  sidebarProps: SidebarViewProps | null
  featuredModalProps: FeaturedModalViewProps | null
  blockModalProps: BlockModalViewProps | null
}
