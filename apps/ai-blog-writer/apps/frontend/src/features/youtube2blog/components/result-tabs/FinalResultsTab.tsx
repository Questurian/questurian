import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import type { DebugResponse } from '../../api'
import { getStage3Data, getStage4Data } from '../../services/stage-data.selectors'
import type { LexicalCopyStatus } from '../../types/youtube2blog.types'
import { removeTitleFromArticle } from '../../utils/article.utils'

type FinalResultsTabProps = {
  debugData?: DebugResponse
  lexicalCopyStatus: LexicalCopyStatus
  onCopyLexical: (markdown: string) => void
}

export function FinalResultsTab({ debugData, lexicalCopyStatus, onCopyLexical }: FinalResultsTabProps) {
  const stage3Data = getStage3Data(debugData)
  const stage4Data = getStage4Data(debugData)
  const markdown = stage3Data?.final_article

  return (
    <>
      <div className="payload-copy-row">
        <button
          type="button"
          className={`payload-btn payload-btn-${lexicalCopyStatus}`}
          disabled={!markdown || lexicalCopyStatus === 'loading'}
          onClick={() => markdown && onCopyLexical(markdown)}
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
        {stage3Data?.final_article ? (
          <div className="article-result">
            <div className="article-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {removeTitleFromArticle(stage3Data.final_article)}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
        {!stage4Data?.title && !stage3Data?.final_article ? (
          <p className="placeholder">Final results are being prepared...</p>
        ) : null}
      </div>
    </>
  )
}
