import {
  formatBatchFetchDateTime,
  formatBatchStepSummary,
  getBatchStepLabel,
  getBatchStepStatusClass,
} from '../utils/batchFetchPresentation';

export default function BatchStepsTable({ steps }) {
  if (!steps?.length) return null;

  return (
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
          {steps.map((step) => (
            <tr key={step.id}>
              <td>{getBatchStepLabel(step)}</td>
              <td>
                <span className={`status ${getBatchStepStatusClass(step.status)}`}>
                  {step.status}
                </span>
              </td>
              <td>{formatBatchFetchDateTime(step.started_at)}</td>
              <td>{formatBatchFetchDateTime(step.finished_at)}</td>
              <td className={step.status === 'failed' ? 'error-text' : ''}>
                {formatBatchStepSummary(step)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
