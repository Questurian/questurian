export default function ApprovalQueueHeader({ isRefreshing }) {
  return (
    <div className="page-header">
      <h1>Approval Queue</h1>
      <div className="approval-stats">
        {isRefreshing && <span className="badge">Refreshing...</span>}
      </div>
    </div>
  );
}
