import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import type { DebugResponse } from '../../api'
import {
  getStage3Data,
  getStage4Data,
  getStageEditorialAugmentationData,
} from '../../services/stage-data.selectors'
import type { LexicalCopyStatus } from '../../types/youtube2blog.types'
import { removeTitleFromArticle } from '../../utils/article.utils'

type FinalResultsTabProps = {
  debugData?: DebugResponse
  lexicalCopyStatus: LexicalCopyStatus
  onCopyLexical: (markdown: string) => void
}

export function FinalResultsTab({ debugData, lexicalCopyStatus, onCopyLexical }: FinalResultsTabProps) {
  const stage3Data = getStage3Data(debugData)
  const stageEditorialData = getStageEditorialAugmentationData(debugData)
  const stage4Data = getStage4Data(debugData)
  const articleContent = stageEditorialData?.augmented_content ?? stage3Data?.final_article

  return (
    <>
      <div className="payload-copy-row">
        <button
          type="button"
          className={`payload-btn payload-btn-${lexicalCopyStatus}`}
          disabled={!articleContent || lexicalCopyStatus === 'loading'}
          onClick={() => articleContent && onCopyLexical(articleContent)}
        >
          <img
            src={payloadLogoUrl}
            alt="Payload CMS Logo"
            className="payload-btn-icon"
          />
          {lexicalCopyStatus === 'loading'
            ? 'Converting...'
            : lexicalCopyStatus === 'success'
              ? 'Copied to Clipboard!'
              : lexicalCopyStatus === 'error'
                ? 'Conversion Failed'
                : 'Copy as Lexical JSON'}
        </button>
      </div>

      <div className="final-results">
        {stage4Data?.title ? (
          <div className="generated-title">
            <h2 className="title-display">{stage4Data.title}</h2>
          </div>
        ) : null}
        {articleContent ? (
          <div className="article-result">
            <div className="article-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {removeTitleFromArticle(articleContent)}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
        {!stage4Data?.title && !articleContent ? (
          <p className="placeholder">Final results are being prepared...</p>
        ) : null}
      </div>
    </>
  )
}
