import type { usePrompt2BlogPipelineRun } from '../hooks/usePrompt2BlogPipelineRun'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import type { PipelineStepStatus } from '../pipeline-run.types'
import {
  getPipelineStepStatus,
  PIPELINE_STAGE_LABELS,
  PROMPT2BLOG_STAGE_ORDERS,
} from '../pipeline-status'
import type { Prompt2BlogResumePlan } from '../../types/pipeline.types'
import { NeedsResearchResult } from './NeedsResearchResult'
import { PipelineResult } from './PipelineResult'
import { PipelineV3Result } from './PipelineV3Result'

interface PipelinePanelProps {
  run: ReturnType<typeof usePrompt2BlogPipelineRun>
  onBackToResearch: () => void
  onBackToDirection?: () => void
  onOpenCleanupModal: () => void
  onReset: () => void
  submissionBlockedReason?: string | null
}

export function PipelinePanel({
  run,
  onBackToResearch,
  onBackToDirection,
  onOpenCleanupModal,
  onReset,
  submissionBlockedReason,
}: PipelinePanelProps) {
  const {
    canOpenCleanupModal,
    dismissNeedsResearch,
    error,
    hasStartedRun,
    isLoading,
    loadingLabel,
    needsResearch,
    pipelineDebugData,
    pipelineLogs,
    pipelineResult,
    pipelineStatus,
    pipelineVersion,
    resumePlan,
    showPipelineDebug,
    sourceStep,
    stageArticleUrl,
    togglePipelineDebug,
  } = run
  const stageOrder = PROMPT2BLOG_STAGE_ORDERS[pipelineVersion]

  return (
    <section className="p2b-panel">
      <div className="p2b-panel-header">
        <h2>Pipeline</h2>
        <p>Run status and logs.</p>
      </div>
      <div className="p2b-panel-body">
        <div className="p2b-button-row">
          <button
            type="button"
            className="p2b-synthesize-btn"
            disabled={Boolean(submissionBlockedReason)}
            onClick={() => void run.run()}
          >
            Run Prompt2Blog Pipeline
          </button>
          {resumePlan?.resumable && (
            <button
              type="button"
              className="p2b-synthesize-btn"
              disabled={isLoading}
              onClick={() => run.resume()}
            >
              Resume Run
            </button>
          )}
          <button type="button" className="p2b-rerun-btn" onClick={onReset}>
            Reset Run
          </button>
        </div>
        {resumePlan && <ResumeNotice plan={resumePlan} />}
        {submissionBlockedReason && (
          <p className="p2b-field-hint" role="status">
            {submissionBlockedReason}
          </p>
        )}

        <div className="p2b-progress-grid">
          {stageOrder.map(step => (
            <PipelineStageItem
              key={step}
              action={
                step === CLEANUP_STAGE_KEY && canOpenCleanupModal ? onOpenCleanupModal : undefined
              }
              label={PIPELINE_STAGE_LABELS[step]}
              status={getPipelineStepStatus(step, pipelineStatus, stageOrder, hasStartedRun)}
            />
          ))}
          {pipelineStatus?.stage === 'unknown' && (
            <PipelineStageItem
              label={
                pipelineStatus.raw_stage ? `Unknown: ${pipelineStatus.raw_stage}` : 'Unknown stage'
              }
              status={pipelineStatus.state === 'failed' ? 'failed' : 'running'}
            />
          )}
        </div>

        {pipelineLogs.length > 0 && (
          <div className="p2b-raw-json">
            <pre>
              {pipelineLogs
                .map(log => `[${log.at}] ${log.level.toUpperCase()}: ${log.message}`)
                .join('\n')}
            </pre>
          </div>
        )}

        {needsResearch && (
          <NeedsResearchResult
            result={needsResearch}
            onBackToResearch={onBackToResearch}
            onBackToDirection={onBackToDirection}
            onDismiss={dismissNeedsResearch}
          />
        )}

        {sourceStep === 'pipeline_complete' && pipelineResult && (
          pipelineResult.version === 'v3' ? (
            <PipelineV3Result
              debugData={pipelineDebugData}
              result={pipelineResult.payload}
              showDebug={showPipelineDebug}
              stageArticleUrl={stageArticleUrl}
              onToggleDebug={togglePipelineDebug}
            />
          ) : (
            <PipelineResult
              debugData={pipelineDebugData}
              result={pipelineResult.payload}
              showDebug={showPipelineDebug}
              stageArticleUrl={stageArticleUrl}
              onToggleDebug={togglePipelineDebug}
            />
          )
        )}
      </div>

      {error && <div className="p2b-error">{error}</div>}
      {isLoading && (
        <div className="p2b-loading">
          <div className="p2b-spinner" />
          <span>{loadingLabel}</span>
        </div>
      )}
    </section>
  )
}

/**
 * What the operator needs before deciding: what is already written, what it
 * cost, and -- when the run cannot be picked back up -- why not. Without the
 * "why not" a missing button is indistinguishable from a broken page.
 */
function ResumeNotice({ plan }: { plan: Prompt2BlogResumePlan }) {
  const alreadyDone = plan.completed_stages.length
  const spent = plan.tokens_already_spent

  if (!plan.resumable) {
    return (
      <p className="p2b-field-hint" role="status">
        {RESUME_REFUSAL_HINTS[plan.reason] || 'This run cannot be continued; start a new one.'}
      </p>
    )
  }

  const resumeStageLabel =
    PIPELINE_STAGE_LABELS[plan.resume_from_stage as keyof typeof PIPELINE_STAGE_LABELS]
    || plan.resume_from_stage

  return (
    <p className="p2b-field-hint" role="status">
      {alreadyDone} stage{alreadyDone === 1 ? '' : 's'} are already written and saved
      {typeof spent === 'number' && spent > 0
        ? ` (${spent.toLocaleString()} tokens spent so far)`
        : ''}
      {`. Resuming continues at "${resumeStageLabel}" and pays only for what is left.`}
      {plan.resume_count > 0
        && ` Resumed ${plan.resume_count} of ${plan.resume_attempts_allowed} times.`}
    </p>
  )
}

const RESUME_REFUSAL_HINTS: Record<string, string> = {
  no_snapshot:
    'This run stopped before it finished a single stage, so there is nothing saved to '
    + 'continue from. Start a new run.',
  resume_limit_reached:
    'This run has been resumed as many times as it is allowed. Whatever keeps failing is '
    + 'not something resuming can fix.',
  commission_mismatch:
    'The saved work does not match the commission this run started with, so it is not safe '
    + 'to continue. Start a new run.',
  snapshot_version_unsupported:
    'The saved work was written by an older version of the pipeline. Start a new run.',
  snapshot_unreadable: 'The saved work does not say where to continue from. Start a new run.',
  run_already_finished: 'This run had already produced its article.',
}

function PipelineStageItem({
  action,
  label,
  status,
}: {
  action?: () => void
  label: string
  status: PipelineStepStatus
}) {
  const className = `p2b-progress-item p2b-progress-item--${status}${
    action ? ' p2b-progress-item--interactive' : ''
  }`
  const content = (
    <>
      <strong>{label}</strong>
      <span>{status}</span>
      {action && <small>View details</small>}
    </>
  )

  if (action) {
    return (
      <button
        type="button"
        className={className}
        onClick={action}
        aria-label="View clean source material details"
      >
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
