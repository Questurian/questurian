import {
  formatBatchFetchDateTime,
  getBatchJobStatusClass,
  getBatchJobStatusLabel,
} from '../utils/batchFetchPresentation';

export default function CurrentBatchJobCard({
  job,
  progress,
}) {
  if (!job) {
    return (
      <div className="empty-state">
        <p>No batch jobs yet. Start a daily fetch to create the first job.</p>
      </div>
    );
  }

  return (
    <div className="card batch-job-card">
      <div className="batch-job-header">
        <div>
          <h3>Job #{job.id}</h3>
          <span className={`status ${getBatchJobStatusClass(job.status)}`}>
            {getBatchJobStatusLabel(job.status)}
          </span>
        </div>
        <div className="batch-job-meta">
          <span>Created: {formatBatchFetchDateTime(job.created_at)}</span>
          <span>Started: {formatBatchFetchDateTime(job.started_at)}</span>
          <span>Finished: {formatBatchFetchDateTime(job.finished_at)}</span>
        </div>
      </div>

      <div className="batch-job-progress">
        <div className="batch-progress-bar">
          <span style={{ width: `${progress.percent}%` }}></span>
        </div>
        <div className="batch-progress-meta">
          <span>{progress.percent}% complete</span>
          <span>
            {progress.completed}/{progress.total} steps
          </span>
        </div>
      </div>

      <div className="batch-job-stats">
        <span className="badge">Success: {job.success_steps}</span>
        <span className="badge danger">Failed: {job.failed_steps}</span>
        <span className="badge secondary">Skipped: {job.skipped_steps}</span>
        {job.message && <span className="batch-job-message">{job.message}</span>}
      </div>
    </div>
  );
}
