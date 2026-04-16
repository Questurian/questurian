import type { FormEvent } from 'react'
import { Y2B_MODEL_OPTIONS, type Y2BModelName } from '../../staging/api/ai/models'

type UploadPanelProps = {
  youtubeUrl: string
  selectedModel: Y2BModelName
  runIds: string[]
  activeRunId: string | null
  startPending: boolean
  clearPending: boolean
  startError: string | null
  onYoutubeUrlChange: (value: string) => void
  onModelChange: (model: Y2BModelName) => void
  onSubmit: (event: FormEvent) => void
  onClear: () => void
  onSelectRun: (runId: string) => void
}

export function UploadPanel({
  youtubeUrl,
  selectedModel,
  runIds,
  activeRunId,
  startPending,
  clearPending,
  startError,
  onYoutubeUrlChange,
  onModelChange,
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
        <div className="form-group">
          <label htmlFor="y2b-model-select">AI Model</label>
          <select
            id="y2b-model-select"
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value as Y2BModelName)}
          >
            {Y2B_MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
