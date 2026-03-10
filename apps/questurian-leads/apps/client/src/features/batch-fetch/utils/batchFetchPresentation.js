export function normalizeBatchFetchDate(value) {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function formatBatchFetchDateTime(value) {
  const date = normalizeBatchFetchDate(value);
  return date ? date.toLocaleString() : value || '-';
}

export function getBatchJobStatusLabel(status) {
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

export function getBatchJobStatusClass(status) {
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

export function getBatchStepStatusClass(status) {
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

export function formatBatchStepSummary(step) {
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

    if (
      result?.post_count !== undefined &&
      result?.new_post_count !== undefined &&
      result?.existing_post_count !== undefined
    ) {
      const base = `Posts: ${result.post_count} new, ${result.existing_post_count} existing, ${result.invalid_post_count ?? 0} invalid`;
      return step.error_message ? `${base} - ${step.error_message}` : base;
    }

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
  } catch {
    return step.error_message || 'Completed.';
  }

  return step.error_message || 'Completed.';
}

export function getBatchStepLabel(step) {
  const source = step.source_type?.replace('_', ' ') || 'source';
  let labelName = step.source_name || '';

  if (labelName && step.source_type === 'instagram' && !labelName.startsWith('@')) {
    labelName = `@${labelName}`;
  }

  const name = labelName ? ` - ${labelName}` : '';
  return `${source}${name}`;
}
