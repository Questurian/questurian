import type { useUrl2BlogRun } from '../hooks/useUrl2BlogRun'

type ProcessingPanelProps = { run: ReturnType<typeof useUrl2BlogRun> }

export function ProcessingPanel({ run }: ProcessingPanelProps) {
  return (
    <section className="url2blog-panel u2b-wizard-panel u2b-processing-panel">
      <div className="u2b-processing-content">
        <div className="u2b-pipeline-progress-centered">
          <h3>Pipeline Progress</h3>
          <p className={`u2b-live-status ${run.activeStatus?.state ?? 'running'}`}>
            {run.activeStatus?.state ?? 'running'}{run.activeRunId ? ` • ${run.activeRunId}` : ''}
          </p>
          <div className="u2b-stage-checklist">
            {run.processingSteps.map((step) => (
              <div key={step.key} className={`u2b-stage-item ${step.state}`}>
                <div className="u2b-stage-dot" />
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="u2b-processing-message">Current step: {run.liveStageLabel}</p>
        {run.statusQuery.isError ? <p className="url2blog-error">
          Live status polling failed. {run.statusQuery.error instanceof Error ? run.statusQuery.error.message : ''}
        </p> : null}
        {run.statusErrorMessage ? <p className="url2blog-error">{run.statusErrorMessage}</p> : null}
      </div>
    </section>
  )
}
