import { Link } from 'react-router-dom'
import {
  useEditorialStageBlockModalProps,
  useEditorialStageFeaturedModalProps,
  useEditorialStageLayoutView,
  useEditorialStageSidebarProps,
  useEditorialStageStatus,
  useEditorialStageTimelineListProps,
} from '../../features/editorial-stage-article/context/useEditorialStageArticleContext'
import { BlockImageModal } from './BlockImageModal'
import { EditorialSidebar } from './EditorialSidebar'
import { EditorialStageLayout } from './EditorialStageLayout'
import { EditorialTimelineList } from './EditorialTimelineList'
import { FeaturedImageModal } from './FeaturedImageModal'

export function EditorialStageArticleScreen() {
  const status = useEditorialStageStatus()
  const layout = useEditorialStageLayoutView()
  const timelineListProps = useEditorialStageTimelineListProps()
  const sidebarProps = useEditorialStageSidebarProps()
  const featuredModalProps = useEditorialStageFeaturedModalProps()
  const blockModalProps = useEditorialStageBlockModalProps()

  if (status.isLoading || !status.stagedArticle) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-loading">
          <div className="stage-article-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (status.error || !layout || !timelineListProps || !sidebarProps || !featuredModalProps || !blockModalProps) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-error">
          <h2>Error</h2>
          <p>{status.error || 'Failed to load staged article view.'}</p>
          <Link to={status.articlesPath} className="stage-article-btn">Back to Articles</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <EditorialStageLayout
        stagedArticle={layout.stagedArticle}
        stagePath={layout.stagePath}
        hasMissingFeaturedImage={layout.hasMissingFeaturedImage}
        isConverting={layout.isConverting}
        onResetToOriginalBlocks={layout.onResetToOriginalBlocks}
        onDelete={layout.onDelete}
        onUpdateTitle={layout.onUpdateTitle}
        mainContent={(
          <EditorialTimelineList {...timelineListProps} />
        )}
        sidebarContent={(
          <EditorialSidebar {...sidebarProps} />
        )}
      />

      <FeaturedImageModal {...featuredModalProps} />
      <BlockImageModal {...blockModalProps} />
    </>
  )
}
