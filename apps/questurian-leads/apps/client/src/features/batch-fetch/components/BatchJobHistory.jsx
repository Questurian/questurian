import {
  formatBatchFetchDateTime,
  getBatchJobStatusClass,
  getBatchJobStatusLabel,
} from '../utils/batchFetchPresentation';

export default function BatchJobHistory({ jobs }) {
  if (!jobs.length) return null;

  return (
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
                <span>{formatBatchFetchDateTime(job.created_at)}</span>
                <span>{job.total_steps} steps</span>
              </div>
            </div>
            <span className={`status ${getBatchJobStatusClass(job.status)}`}>
              {getBatchJobStatusLabel(job.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
