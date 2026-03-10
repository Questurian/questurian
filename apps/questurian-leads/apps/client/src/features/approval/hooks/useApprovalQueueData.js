import { useMemo } from 'react';
import {
  useApprovalPending,
  useApprovalStats,
} from '../../../hooks';
import { buildApprovalTabCounts } from '../utils/approvalPresentation';

export function useApprovalQueueData(contentType) {
  const {
    data: pendingData,
    isLoading: pendingLoading,
    isFetching: pendingFetching,
    error: pendingError,
  } = useApprovalPending(contentType);
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useApprovalStats();

  const items = pendingData?.items || [];
  const tabCounts = useMemo(() => buildApprovalTabCounts(stats), [stats]);

  return {
    error: pendingError || statsError,
    isLoading: pendingLoading || statsLoading,
    isRefreshing: pendingFetching && !pendingLoading,
    items,
    stats,
    tabCounts,
  };
}
