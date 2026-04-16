import type { DebugResponse } from '../api'
import type { LexicalCopyStatus, ResultTab } from '../types/youtube2blog.types'
import { ArticleTab } from './result-tabs/ArticleTab'
import { ClassificationTab } from './result-tabs/ClassificationTab'
import { FinalResultsTab } from './result-tabs/FinalResultsTab'
import { TitleTab } from './result-tabs/TitleTab'
import { TranscriptTab } from './result-tabs/TranscriptTab'

type ResultsPanelProps = {
  resultTab: ResultTab
  setResultTab: (tab: ResultTab) => void
  debugData?: DebugResponse
  lexicalCopyStatus: LexicalCopyStatus
  onCopyLexical: (markdown: string) => void
  runId?: string | null
}

export function ResultsPanel({
  resultTab,
  setResultTab,
  debugData,
  lexicalCopyStatus,
  onCopyLexical,
  runId,
}: ResultsPanelProps) {
  return (
    <section className="panel result">
      <div className="result-tabs">
        <button
          type="button"
          className={`result-tab ${resultTab === 'final' ? 'active' : ''}`}
          onClick={() => setResultTab('final')}
        >
          Final Results
        </button>
        <button
          type="button"
          className={`result-tab ${resultTab === 'transcript' ? 'active' : ''}`}
          onClick={() => setResultTab('transcript')}
        >
          Transcript
        </button>
        <button
          type="button"
          className={`result-tab ${resultTab === 'classification' ? 'active' : ''}`}
          onClick={() => setResultTab('classification')}
        >
          Classification
        </button>
        <button
          type="button"
          className={`result-tab ${resultTab === 'article' ? 'active' : ''}`}
          onClick={() => setResultTab('article')}
        >
          Article
        </button>
        <button
          type="button"
          className={`result-tab ${resultTab === 'title' ? 'active' : ''}`}
          onClick={() => setResultTab('title')}
        >
          Title
        </button>
      </div>

      <div className="panel-body">
        {resultTab === 'final' ? (
          <FinalResultsTab
            debugData={debugData}
            lexicalCopyStatus={lexicalCopyStatus}
            onCopyLexical={onCopyLexical}
          />
        ) : null}
        {resultTab === 'transcript' ? <TranscriptTab debugData={debugData} /> : null}
        {resultTab === 'classification' ? <ClassificationTab debugData={debugData} /> : null}
        {resultTab === 'article' ? <ArticleTab debugData={debugData} runId={runId} /> : null}
        {resultTab === 'title' ? <TitleTab debugData={debugData} /> : null}
      </div>
    </section>
  )
}
