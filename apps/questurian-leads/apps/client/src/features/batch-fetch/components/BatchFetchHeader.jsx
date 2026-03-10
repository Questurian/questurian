export default function BatchFetchHeader({
  isJobRunning,
  onStart,
  startPending,
}) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Daily Fetch</h1>
          <p className="page-subtitle">
            Runs RSS, Instagram, YouTube, El Comercio, and Diario Correo fetches in
            one batch.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="button success"
            onClick={() => onStart(false)}
            disabled={startPending || isJobRunning}
          >
            {startPending
              ? 'Starting...'
              : isJobRunning
                ? 'Job Running'
                : 'Start Daily Fetch'}
          </button>
          <button
            className="button warning"
            onClick={() => onStart(true)}
            disabled={startPending || isJobRunning}
          >
            Force Run
          </button>
        </div>
      </div>

      {isJobRunning && <span className="badge">Live updates every 5s</span>}
    </>
  );
}
