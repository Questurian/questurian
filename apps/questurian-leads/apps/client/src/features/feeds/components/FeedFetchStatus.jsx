export default function FeedFetchStatus({ fetchStatus }) {
  if (!fetchStatus) return null;

  return (
    <div
      className="fetch-status"
      data-tone={fetchStatus.tone}
      role="status"
      aria-live="polite"
    >
      <span>{fetchStatus.message}</span>
      <span className="fetch-status-time">{fetchStatus.timestamp}</span>
    </div>
  );
}
