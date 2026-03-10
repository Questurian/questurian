import QueryErrorCard from '../components/QueryErrorCard';
import BatchFetchHeader from '../features/batch-fetch/components/BatchFetchHeader';
import BatchJobHistory from '../features/batch-fetch/components/BatchJobHistory';
import BatchStepsTable from '../features/batch-fetch/components/BatchStepsTable';
import CurrentBatchJobCard from '../features/batch-fetch/components/CurrentBatchJobCard';
import { useBatchFetchPageActions } from '../features/batch-fetch/hooks/useBatchFetchPageActions';
import { useBatchFetchPageData } from '../features/batch-fetch/hooks/useBatchFetchPageData';

export default function BatchFetch() {
  const data = useBatchFetchPageData();
  const actions = useBatchFetchPageActions();

  if (data.isLoading) {
    return <div className="loading">Loading batch fetch status...</div>;
  }

  return (
    <div className="page">
      <BatchFetchHeader
        isJobRunning={data.isJobRunning}
        onStart={actions.handleStart}
        startPending={actions.startPending}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      <CurrentBatchJobCard job={data.currentJob} progress={data.progress} />
      <BatchStepsTable steps={data.currentJob?.steps} />
      <BatchJobHistory jobs={data.jobs} />
    </div>
  );
}
