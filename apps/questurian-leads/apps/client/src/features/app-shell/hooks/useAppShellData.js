import { useMemo } from 'react';
import { useApprovalStats } from '../../../hooks/useApproval';
import { useBatchFetchCurrent } from '../../../hooks/useBatchFetch';
import { useAuth } from '../../../providers/AuthProvider';

export function useAppShellData() {
  const { user, logout } = useAuth();
  const { data: approvalStats } = useApprovalStats();
  const { data: currentJob } = useBatchFetchCurrent();

  return useMemo(
    () => ({
      isJobRunning:
        Boolean(currentJob) && ['queued', 'running'].includes(currentJob.status),
      logout,
      totalPending: approvalStats
        ? Object.values(approvalStats).reduce(
            (total, stats) => total + (stats?.pending || 0),
            0,
          )
        : 0,
      user,
    }),
    [approvalStats, currentJob, logout, user],
  );
}
