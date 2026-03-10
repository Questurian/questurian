import QueryErrorCard from '../components/QueryErrorCard';
import FetchLogsFilters from '../features/fetch-logs/components/FetchLogsFilters';
import FetchLogsHeader from '../features/fetch-logs/components/FetchLogsHeader';
import FetchLogsTable from '../features/fetch-logs/components/FetchLogsTable';
import { useFetchLogsActions } from '../features/fetch-logs/hooks/useFetchLogsActions';
import { useFetchLogsFilters } from '../features/fetch-logs/hooks/useFetchLogsFilters';
import { useFetchLogsPageData } from '../features/fetch-logs/hooks/useFetchLogsPageData';

export default function FetchLogs() {
  const filters = useFetchLogsFilters();
  const data = useFetchLogsPageData(filters.values);
  const actions = useFetchLogsActions();

  if (data.isLoading) return <div className="loading">Loading fetch logs...</div>;

  return (
    <div className="page">
      <FetchLogsHeader
        count={data.logs.length}
        isRefreshing={data.isRefreshing}
      />

      {data.error && <QueryErrorCard error={data.error} />}

      <FetchLogsFilters
        feeds={data.feeds}
        filters={filters.values}
        onChange={filters.handleChange}
        onClear={filters.clear}
      />

      <FetchLogsTable
        feedNames={data.feedNames}
        isMutating={actions.isMutating}
        logs={data.logs}
        onDelete={actions.handleDelete}
      />
    </div>
  );
}
