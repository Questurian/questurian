import { DebugPanel } from '../components/DebugPanel'
import { HeroHeader } from '../components/HeroHeader'
import { ResultsPanel } from '../components/ResultsPanel'
import { StatusPanel } from '../components/StatusPanel'
import { UploadPanel } from '../components/UploadPanel'
import { useLexicalCopy } from '../hooks/useLexicalCopy'
import { useYouTube2BlogRun } from '../hooks/useYouTube2BlogRun'

export default function YouTube2BlogPage() {
  const run = useYouTube2BlogRun()
  const lexicalCopy = useLexicalCopy()

  return (
    <div className="page">
      <HeroHeader activeBadge={run.activeBadge} />

      <main className="layout">
        {!run.activeRunId ? (
          <UploadPanel
            youtubeUrl={run.youtubeUrl}
            selectedModel={run.selectedModel}
            runIds={run.runIds}
            activeRunId={run.activeRunId}
            startPending={run.startPending}
            clearPending={run.clearPending}
            startError={run.startError}
            onYoutubeUrlChange={run.setYoutubeUrl}
            onModelChange={run.setSelectedModel}
            onSubmit={run.handleSubmit}
            onClear={run.clear}
            onSelectRun={run.setActiveRunId}
          />
        ) : run.activeStatus && run.activeStatus.state !== 'completed' ? (
          <section>
            <StatusPanel
              status={run.activeStatus}
              runInputType={run.activeRunInputType}
            />
          </section>
        ) : (
          <ResultsPanel
            resultTab={run.resultTab}
            setResultTab={run.setResultTab}
            debugData={run.debugData}
            lexicalCopyStatus={lexicalCopy.status}
            onCopyLexical={lexicalCopy.copy}
          />
        )}

        {run.activeRunId && run.activeStatus?.state === 'completed' ? (
          <DebugPanel
            showDebug={run.showDebug}
            onToggleDebug={run.toggleDebug}
            debugData={run.debugData}
          />
        ) : null}
      </main>
    </div>
  )
}
