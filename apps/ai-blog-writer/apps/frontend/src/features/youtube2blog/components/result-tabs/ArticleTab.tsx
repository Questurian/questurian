import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { DebugResponse } from '../../api'
import {
  getStage3Data,
  getStageEditorialAugmentationData,
} from '../../services/stage-data.selectors'
import { removeTitleFromArticle } from '../../utils/article.utils'

type ArticleTabProps = {
  debugData?: DebugResponse
}

export function ArticleTab({ debugData }: ArticleTabProps) {
  const stage3Data = getStage3Data(debugData)
  const stageEditorialData = getStageEditorialAugmentationData(debugData)
  const articleContent = stageEditorialData?.augmented_content ?? stage3Data?.final_article

  if (!articleContent) {
    return <p className="placeholder">No article yet. Finish Stage 3 to see results.</p>
  }

  return (
    <div className="article-result">
      <div className="article-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {removeTitleFromArticle(articleContent)}
        </ReactMarkdown>
      </div>
    </div>
  )
}
