import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { EditorialStageArticlePageProps } from '../../features/editorial-stage-article/types'
import { useEditorialStageArticleScreenViewModel } from '../../features/editorial-stage-article/hooks/useEditorialStageArticleScreenViewModel'
import { parseMarkdownToBlocks } from '../../features/editorial-stage-article/workflow.service'
import { ArticleExpansionModal } from '../../../../features/youtube2blog/components/ArticleExpansionModal'
import { useArticleExpansion } from '../../../../features/youtube2blog/hooks/useArticleExpansion'
import { BlockImageModal } from './BlockImageModal'
import { EditorialSidebar } from './EditorialSidebar'
import { EditorialStageLayout } from './EditorialStageLayout'
import { EditorialTimelineList } from './EditorialTimelineList'
import { FeaturedImageModal } from './FeaturedImageModal'

type EditorialStageArticleScreenProps = EditorialStageArticlePageProps & {
}

export function EditorialStageArticleScreen({
  storageKey,
  routes,
  api,
}: EditorialStageArticleScreenProps) {
  const {
    status,
    layout,
    timelineListProps,
    sidebarProps,
    featuredModalProps,
    blockModalProps,
  } = useEditorialStageArticleScreenViewModel({
    storageKey,
    routes,
    api,
  })

  const [isExpansionModalOpen, setIsExpansionModalOpen] = useState(false)
  const runId = status.stagedArticle?.runId ?? null
  const expansion = useArticleExpansion(runId)

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

  const handleDeepExpand = () => {
    if (!status.stagedArticle) return
    const article = status.stagedArticle.content
    const articleType = status.stagedArticle.originalType
    const title = status.stagedArticle.title || status.stagedArticle.originalTitle
    expansion.reset()
    expansion.startExpansion(article, articleType, title)
    setIsExpansionModalOpen(true)
  }

  const handleAcceptExpansion = (expandedMarkdown: string) => {
    if (!sidebarProps) return
    const blocks = parseMarkdownToBlocks(expandedMarkdown)
    sidebarProps.onUpdateStagedArticle({
      blocks,
      content: expandedMarkdown,
      lexicalConverted: false,
    })
    expansion.reset()
    setIsExpansionModalOpen(false)
  }

  const handleCloseExpansion = () => {
    expansion.reset()
    setIsExpansionModalOpen(false)
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
          <EditorialSidebar
            {...sidebarProps}
            onDeepExpand={handleDeepExpand}
          />
        )}
      />

      <FeaturedImageModal {...featuredModalProps} />
      <BlockImageModal {...blockModalProps} />

      <ArticleExpansionModal
        isOpen={isExpansionModalOpen}
        phase={expansion.phase}
        expandedArticle={expansion.expandedArticle}
        expansionPlan={expansion.expansionPlan}
        error={expansion.error}
        originalArticle={status.stagedArticle?.content ?? ''}
        articleType={status.stagedArticle?.originalType ?? ''}
        title={status.stagedArticle?.title || status.stagedArticle?.originalTitle || ''}
        listicleDetection={expansion.listicleDetection}
        onAccept={handleAcceptExpansion}
        onClose={handleCloseExpansion}
        onProceed={expansion.proceedWithExpansion}
      />
    </>
  )
}
