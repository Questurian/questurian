import { DebugPanel } from '../components/DebugPanel'
import { HeroHeader } from '../components/HeroHeader'
import { ResultsPanel } from '../components/ResultsPanel'
import { StatusPanel } from '../components/StatusPanel'
import { UploadPanel } from '../components/UploadPanel'
import { useCsvDropzone } from '../hooks/useCsvDropzone'
import { useLexicalCopy } from '../hooks/useLexicalCopy'
import { useYouTube2BlogRun } from '../hooks/useYouTube2BlogRun'

export default function YouTube2BlogPage() {
  const run = useYouTube2BlogRun()
  const lexicalCopy = useLexicalCopy()
  const dropzone = useCsvDropzone({ onFileSelected: run.setSelectedFile })

  return (
    <div className="page">
      <HeroHeader activeBadge={run.activeBadge} />

      <main className="layout">
        {!run.activeRunId ? (
          <UploadPanel
            selectedFile={run.selectedFile}
            isDragOver={dropzone.isDragOver}
            runIds={run.runIds}
            activeRunId={run.activeRunId}
            uploadPending={run.uploadPending}
            clearPending={run.clearPending}
            uploadError={run.uploadError}
            onSubmit={run.handleSubmit}
            onClear={run.clear}
            onSelectRun={run.setActiveRunId}
            onFileSelect={dropzone.handleFileSelect}
            onDragOver={dropzone.handleDragOver}
            onDragLeave={dropzone.handleDragLeave}
            onDrop={dropzone.handleDrop}
          />
        ) : run.activeStatus && run.activeStatus.state !== 'completed' ? (
          <section>
            <StatusPanel status={run.activeStatus} />
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
