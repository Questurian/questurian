import { useMemo } from 'react';
import { useBatchFetchCurrent, useBatchFetchJobs, useStartBatchFetch } from '../hooks';
import { useDialog } from '../providers/DialogProvider';

function normalizeDate(value) {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatDateTime(value) {
  const date = normalizeDate(value);
  return date ? date.toLocaleString() : value || '-';
}

function getJobStatusLabel(status) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed_with_errors':
      return 'Completed (with errors)';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status || 'Unknown';
  }
}

function getJobStatusClass(status) {
  switch (status) {
    case 'queued':
      return 'pending';
    case 'running':
      return 'running';
    case 'completed_with_errors':
      return 'warning';
    case 'completed':
      return 'success';
    case 'failed':
      return 'failed';
    default:
      return '';
  }
}

function getStepStatusClass(status) {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'skipped':
      return 'skipped';
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    default:
      return '';
  }
}

function formatStepSummary(step) {
  if (step.status === 'skipped') {
    return step.skip_reason || 'Skipped.';
  }
  if (step.status === 'failed') {
    return step.error_message || 'Failed.';
  }
  if (!step.result_json) {
    return step.error_message || 'Completed.';
  }
  try {
    const result = JSON.parse(step.result_json);
    if (result?.lead_count !== undefined) {
      const base = `Leads: ${result.lead_count}`;
      return step.error_message ? `${base} - ${step.error_message}` : base;
    }
    if (result?.post_count !== undefined) {
      const base = `Posts: ${result.post_count}`;
      return step.error_message ? `${base} - ${step.error_message}` : base;
    }
    if (result?.status) {
      const base = `Status: ${result.status}`;
      return step.error_message ? `${base} - ${step.error_message}` : base;
    }
  } catch (err) {
    return step.error_message || 'Completed.';
  }
  return step.error_message || 'Completed.';
}

function getStepLabel(step) {
  const source = step.source_type?.replace('_', ' ') || 'source';
  let labelName = step.source_name || '';
  if (labelName && step.source_type === 'instagram' && !labelName.startsWith('@')) {
    labelName = `@${labelName}`;
  }
  const name = labelName ? ` - ${labelName}` : '';
  return `${source}${name}`;
}

export default function BatchFetch() {
  const dialog = useDialog();
  const currentJobQuery = useBatchFetchCurrent();
  const jobsQuery = useBatchFetchJobs({ limit: 10, offset: 0 });
  const startBatchFetch = useStartBatchFetch();

  const currentJob = currentJobQuery.data;
  const jobs = jobsQuery.data || [];
  const isLoading = currentJobQuery.isLoading || jobsQuery.isLoading;
  const error = currentJobQuery.error || jobsQuery.error;

  const isJobRunning = currentJob && ['queued', 'running'].includes(currentJob.status);

  const progress = useMemo(() => {
    if (!currentJob) {
      return { percent: 0, total: 0, completed: 0 };
    }
    const total = currentJob.total_steps || currentJob.steps?.length || 0;
    const completed = currentJob.completed_steps || 0;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { percent, total, completed };
  }, [currentJob]);

  async function handleStart(force = false) {
    const message = force
      ? 'Force run now? This will ignore the 24-hour skip window (inactive feeds still skip). Instagram calls will be spaced out by 5-10 seconds.'
      : 'Run daily fetch now? Instagram calls will be spaced out by 5-10 seconds and sources fetched in the last 24 hours will be skipped.';
    const confirmed = await dialog.confirm(message);
    if (!confirmed) return;

    try {
      await startBatchFetch.mutateAsync(force ? { force: true } : {});
      await dialog.alert('Batch fetch started. You can leave this page open to watch progress.');
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  if (isLoading) return <div className="loading">Loading batch fetch status...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Daily Fetch</h1>
          <p className="page-subtitle">
            Runs RSS, Instagram, YouTube, El Comercio, and Diario Correo fetches in one batch.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="button success"
            onClick={() => handleStart(false)}
            disabled={startBatchFetch.isPending || isJobRunning}
          >
            {startBatchFetch.isPending ? 'Starting...' : isJobRunning ? 'Job Running' : 'Start Daily Fetch'}
          </button>
          <button
            className="button warning"
            onClick={() => handleStart(true)}
            disabled={startBatchFetch.isPending || isJobRunning}
          >
            Force Run
          </button>
        </div>
      </div>

      {isJobRunning && <span className="badge">Live updates every 5s</span>}

      {error && <div className="error">{error.message}</div>}

      {currentJob ? (
        <div className="card batch-job-card">
          <div className="batch-job-header">
            <div>
              <h3>Job #{currentJob.id}</h3>
              <span className={`status ${getJobStatusClass(currentJob.status)}`}>
                {getJobStatusLabel(currentJob.status)}
              </span>
            </div>
            <div className="batch-job-meta">
              <span>Created: {formatDateTime(currentJob.created_at)}</span>
              <span>Started: {formatDateTime(currentJob.started_at)}</span>
              <span>Finished: {formatDateTime(currentJob.finished_at)}</span>
            </div>
          </div>

          <div className="batch-job-progress">
            <div className="batch-progress-bar">
              <span style={{ width: `${progress.percent}%` }}></span>
            </div>
            <div className="batch-progress-meta">
              <span>{progress.percent}% complete</span>
              <span>{progress.completed}/{progress.total} steps</span>
            </div>
          </div>

          <div className="batch-job-stats">
            <span className="badge">Success: {currentJob.success_steps}</span>
            <span className="badge danger">Failed: {currentJob.failed_steps}</span>
            <span className="badge secondary">Skipped: {currentJob.skipped_steps}</span>
            {currentJob.message && <span className="batch-job-message">{currentJob.message}</span>}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No batch jobs yet. Start a daily fetch to create the first job.</p>
        </div>
      )}

      {currentJob?.steps?.length > 0 && (
        <div className="table-container batch-steps-table">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {currentJob.steps.map((step) => (
                <tr key={step.id}>
                  <td>{getStepLabel(step)}</td>
                  <td>
                    <span className={`status ${getStepStatusClass(step.status)}`}>
                      {step.status}
                    </span>
                  </td>
                  <td>{formatDateTime(step.started_at)}</td>
                  <td>{formatDateTime(step.finished_at)}</td>
                  <td className={step.status === 'failed' ? 'error-text' : ''}>
                    {formatStepSummary(step)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="card batch-job-history">
          <div className="batch-job-history-header">
            <h3>Recent Jobs</h3>
            <span className="badge">Last {jobs.length}</span>
          </div>
          <div className="batch-job-history-list">
            {jobs.map((job) => (
              <div key={job.id} className="batch-job-history-item">
                <div>
                  <strong>Job #{job.id}</strong>
                  <div className="batch-job-history-meta">
                    <span>{formatDateTime(job.created_at)}</span>
                    <span>{job.total_steps} steps</span>
                  </div>
                </div>
                <span className={`status ${getJobStatusClass(job.status)}`}>
                  {getJobStatusLabel(job.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
