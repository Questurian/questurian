import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { DebugResponse } from '../../api'
import { ArticleExpansionModal } from '../ArticleExpansionModal'
import { useArticleExpansion } from '../../hooks/useArticleExpansion'
import {
  getStage3Data,
  getStage4Data,
  getStageEditorialAugmentationData,
} from '../../services/stage-data.selectors'
import { removeTitleFromArticle } from '../../utils/article.utils'

type ArticleTabProps = {
  debugData?: DebugResponse
  runId?: string | null
}

export function ArticleTab({ debugData, runId }: ArticleTabProps) {
  const stage3Data = getStage3Data(debugData)
  const stageEditorialData = getStageEditorialAugmentationData(debugData)
  const stage4Data = getStage4Data(debugData)

  const baseArticle = stageEditorialData?.augmented_content ?? stage3Data?.final_article
  const articleType = stage3Data?.article_type ?? ''
  const title = stage4Data?.title ?? ''

  const [expandedArticle, setExpandedArticle] = useState<string | null>(null)
  const [isExpansionModalOpen, setIsExpansionModalOpen] = useState(false)

  const expansion = useArticleExpansion(runId ?? null)

  const articleContent = expandedArticle ?? baseArticle

  if (!articleContent) {
    return <p className="placeholder">No article yet. Finish Stage 3 to see results.</p>
  }

  const handleOpenExpansionModal = () => {
    expansion.reset()
    expansion.startExpansion(baseArticle ?? '', articleType, title)
    setIsExpansionModalOpen(true)
  }

  const handleAcceptExpansion = (newArticle: string) => {
    setExpandedArticle(newArticle)
    expansion.reset()
    setIsExpansionModalOpen(false)
  }

  const handleCloseModal = () => {
    expansion.reset()
    setIsExpansionModalOpen(false)
  }

  return (
    <>
      <div className="article-result">
        <div className="article-toolbar">
          {expandedArticle && (
            <span className="expansion-applied-badge">Deep Expanded</span>
          )}
          <button
            type="button"
            className="deep-expand-btn"
            onClick={handleOpenExpansionModal}
          >
            Deep Expand
          </button>
        </div>
        <div className="article-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {removeTitleFromArticle(articleContent)}
          </ReactMarkdown>
        </div>
      </div>

      <ArticleExpansionModal
        isOpen={isExpansionModalOpen}
        phase={expansion.phase}
        expandedArticle={expansion.expandedArticle}
        expansionPlan={expansion.expansionPlan}
        error={expansion.error}
        originalArticle={baseArticle ?? ''}
        articleType={articleType}
        title={title}
        listicleDetection={expansion.listicleDetection}
        onAccept={handleAcceptExpansion}
        onClose={handleCloseModal}
        onProceed={expansion.proceedWithExpansion}
      />
    </>
  )
}
