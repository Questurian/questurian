import type { useUrl2BlogRun } from '../hooks/useUrl2BlogRun'

type ProcessingPanelProps = { run: ReturnType<typeof useUrl2BlogRun> }

export function ProcessingPanel({ run }: ProcessingPanelProps) {
  const {
    activeRunId,
    activeStatus,
    liveStageLabel,
    processingSteps,
    statusQuery,
    statusErrorMessage,
  } = run.pipeline

  return (
    <section className="url2blog-panel u2b-wizard-panel u2b-processing-panel">
      <div className="u2b-processing-content">
        <div className="u2b-pipeline-progress-centered">
          <h3>Pipeline Progress</h3>
          <p className={`u2b-live-status ${activeStatus?.state ?? 'running'}`}>
            {activeStatus?.state ?? 'running'}{activeRunId ? ` • ${activeRunId}` : ''}
          </p>
          <div className="u2b-stage-checklist">
            {processingSteps.map((step) => (
              <div key={step.key} className={`u2b-stage-item ${step.state}`}>
                <div className="u2b-stage-dot" />
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="u2b-processing-message">Current step: {liveStageLabel}</p>
        {statusQuery.isError ? <p className="url2blog-error">
          Live status polling failed. {statusQuery.error instanceof Error ? statusQuery.error.message : ''}
        </p> : null}
        {statusErrorMessage ? <p className="url2blog-error">{statusErrorMessage}</p> : null}
      </div>
    </section>
  )
}
