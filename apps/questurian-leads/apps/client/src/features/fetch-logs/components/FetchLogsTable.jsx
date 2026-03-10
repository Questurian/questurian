import FetchLogRow from './FetchLogRow';

export default function FetchLogsTable({
  feedNames,
  isMutating,
  logs,
  onDelete,
}) {
  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <p>
          No fetch logs found. Logs are automatically created when feeds are
          fetched.
        </p>
      </div>
    );
  }

  return (
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
            <FetchLogRow
              key={log.id}
              feedName={feedNames.get(log.feed_id) || 'Unknown'}
              isMutating={isMutating}
              log={log}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
