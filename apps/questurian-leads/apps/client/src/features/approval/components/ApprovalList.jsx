import ApprovalCard from './ApprovalCard';

export default function ApprovalList({
  isLoading,
  isMutating,
  items,
  onApprove,
  onReject,
}) {
  if (isLoading) {
    return <div className="loading">Loading pending items...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>No pending items to review!</p>
      </div>
    );
  }

  return (
    <div className="approval-list">
      {items.map((item) => (
        <ApprovalCard
          key={`${item.content_type}-${item.content_id}`}
          item={item}
          isMutating={isMutating}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}
