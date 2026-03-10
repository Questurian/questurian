import { useMemo } from 'react';
import {
  useBatchFetchCurrent,
  useBatchFetchJobs,
} from '../../../hooks';

export function useBatchFetchPageData() {
  const currentJobQuery = useBatchFetchCurrent();
  const jobsQuery = useBatchFetchJobs({ limit: 10, offset: 0 });

  const currentJob = currentJobQuery.data;
  const jobs = jobsQuery.data || [];
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

  return {
    currentJob,
    error: currentJobQuery.error || jobsQuery.error,
    isJobRunning,
    isLoading: currentJobQuery.isLoading || jobsQuery.isLoading,
    jobs,
    progress,
  };
}
