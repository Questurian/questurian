import type { FormEvent } from 'react'

type UploadPanelProps = {
  youtubeUrl: string
  runIds: string[]
  activeRunId: string | null
  startPending: boolean
  clearPending: boolean
  startError: string | null
  onYoutubeUrlChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onClear: () => void
  onSelectRun: (runId: string) => void
}

export function UploadPanel({
  youtubeUrl,
  runIds,
  activeRunId,
  startPending,
  clearPending,
  startError,
  onYoutubeUrlChange,
  onSubmit,
  onClear,
  onSelectRun,
}: UploadPanelProps) {
  const canSubmit = Boolean(youtubeUrl.trim())
  const submitLabel = startPending ? 'Starting...' : 'Start pipeline'

  return (
    <section className="panel upload">
      <div className="panel-header">
        <h2>Start YouTube2Blog</h2>
        <p>
          Paste a YouTube video URL and the app will extract the transcript, then generate the
          article end-to-end.
        </p>
      </div>
      <form className="panel-body" onSubmit={onSubmit}>
        <div className="form-group">
          <label htmlFor="youtube-url-input">YouTube video URL</label>
          <input
            id="youtube-url-input"
            type="url"
            value={youtubeUrl}
            onChange={(event) => onYoutubeUrlChange(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            autoComplete="off"
          />
        </div>

        <div className="button-row">
          <button type="submit" disabled={!canSubmit || startPending}>
            {submitLabel}
          </button>
          <button type="button" className="clear-btn" onClick={onClear} disabled={clearPending}>
            {clearPending ? 'Clearing...' : 'Clear'}
          </button>
        </div>
        {startError ? <p className="error">{startError}</p> : null}
        {runIds.length > 1 ? (
          <div className="run-list">
            {runIds.map((runId) => (
              <button
                type="button"
                key={runId}
                className={runId === activeRunId ? 'run active' : 'run'}
                onClick={() => onSelectRun(runId)}
              >
                {runId}
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </section>
  )
}
