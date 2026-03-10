export default function FetchLogsHeader({
  count,
  isRefreshing,
}) {
  return (
    <>
      <div className="page-header">
        <h1>Fetch Logs</h1>
        <div className="log-count">{count} logs found</div>
      </div>

      {isRefreshing && <div className="badge">Refreshing...</div>}
    </>
  );
}
