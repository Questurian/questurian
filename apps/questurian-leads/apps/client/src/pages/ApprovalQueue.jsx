import QueryErrorCard from '../components/QueryErrorCard';
import ApprovalFilterTabs from '../features/approval/components/ApprovalFilterTabs';
import ApprovalList from '../features/approval/components/ApprovalList';
import ApprovalQueueHeader from '../features/approval/components/ApprovalQueueHeader';
import { useApprovalQueueActions } from '../features/approval/hooks/useApprovalQueueActions';
import { useApprovalQueueData } from '../features/approval/hooks/useApprovalQueueData';
import { useApprovalQueueFilters } from '../features/approval/hooks/useApprovalQueueFilters';

export default function ApprovalQueue() {
  const filters = useApprovalQueueFilters();
  const data = useApprovalQueueData(filters.contentType);
  const actions = useApprovalQueueActions();

  return (
    <div className="page">
      <ApprovalQueueHeader isRefreshing={data.isRefreshing} />

      {data.error && <QueryErrorCard error={data.error} />}

      <ApprovalFilterTabs
        filter={filters.value}
        onChange={filters.setValue}
        tabCounts={data.tabCounts}
      />

      <ApprovalList
        isLoading={data.isLoading}
        isMutating={actions.isMutating}
        items={data.items}
        onApprove={actions.handleApprove}
        onReject={actions.handleReject}
      />
    </div>
  );
}
