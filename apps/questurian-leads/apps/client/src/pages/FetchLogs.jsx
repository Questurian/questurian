import { useState } from 'react';
import { useDeleteFetchLog, useFetchLogsList, useFeeds } from '../hooks';
import { useDialog } from '../providers/DialogProvider';

export default function FetchLogs() {
  const [filters, setFilters] = useState({
    feed_id: '',
    status: '',
  });
  const dialog = useDialog();

  const {
    data: feeds = [],
    isLoading: feedsLoading,
    error: feedsError,
  } = useFeeds();
  const {
    data: logs = [],
    isLoading: logsLoading,
    isFetching: logsFetching,
    error: logsError,
  } = useFetchLogsList(filters);

  const deleteLog = useDeleteFetchLog();

  const isLoading = feedsLoading || logsLoading;
  const error = feedsError || logsError;
  const isMutating = deleteLog.isPending;

  async function handleDelete(id) {
    const confirmed = await dialog.confirm('Are you sure you want to delete this log?');
    if (!confirmed) return;
    try {
      await deleteLog.mutateAsync(id);
    } catch (err) {
      await dialog.alert(`Error: ${err.message}`);
    }
  }

  function getFeedName(feedId) {
    const feed = feeds.find(f => f.id === feedId);
    return feed ? feed.source_name : 'Unknown';
  }

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      feed_id: '',
      status: '',
    });
  }

  if (isLoading) return <div className="loading">Loading fetch logs...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Fetch Logs</h1>
        <div className="log-count">{logs.length} logs found</div>
      </div>

      {logsFetching && !logsLoading && <div className="badge">Refreshing...</div>}

      {error && <div className="error">{error.message}</div>}

      <div className="filters card">
        <h3>Filters</h3>
        <div className="filters-grid">
          <div className="form-group">
            <label>Feed</label>
            <select
              value={filters.feed_id}
              onChange={(e) => handleFilterChange('feed_id', e.target.value)}
            >
              <option value="">All Feeds</option>
              {feeds.map(feed => (
                <option key={feed.id} value={feed.id}>{feed.source_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>
        <button className="button secondary" onClick={clearFilters}>
          Clear Filters
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Feed</th>
              <th>Fetched At</th>
              <th>Status</th>
              <th>Lead Count</th>
              <th>Error</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{getFeedName(log.feed_id)}</td>
                <td>{new Date(log.fetched_at).toLocaleString()}</td>
                <td>
                  <span className={`status ${log.status?.toLowerCase()}`}>
                    {log.status || 'N/A'}
                  </span>
                </td>
                <td>{log.lead_count ?? '-'}</td>
                <td className={log.error_message ? 'error-text' : ''}>
                  {log.error_message || '-'}
                </td>
                <td className="actions">
                  <button className="button-sm danger" onClick={() => handleDelete(log.id)} disabled={isMutating}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>No fetch logs found. Logs are automatically created when feeds are fetched.</p>
        </div>
      )}
    </div>
  );
}
