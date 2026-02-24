import type { ChangeEvent, DragEvent, FormEvent } from 'react'

type UploadPanelProps = {
  inputMode: 'url' | 'csv'
  youtubeUrl: string
  selectedFile: File | null
  isDragOver: boolean
  runIds: string[]
  activeRunId: string | null
  startPending: boolean
  clearPending: boolean
  startError: string | null
  onInputModeChange: (mode: 'url' | 'csv') => void
  onYoutubeUrlChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onClear: () => void
  onSelectRun: (runId: string) => void
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
}

export function UploadPanel({
  inputMode,
  youtubeUrl,
  selectedFile,
  isDragOver,
  runIds,
  activeRunId,
  startPending,
  clearPending,
  startError,
  onInputModeChange,
  onYoutubeUrlChange,
  onSubmit,
  onClear,
  onSelectRun,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
}: UploadPanelProps) {
  const canSubmit = inputMode === 'url' ? Boolean(youtubeUrl.trim()) : Boolean(selectedFile)
  const submitLabel = startPending
    ? inputMode === 'url'
      ? 'Starting...'
      : 'Uploading...'
    : 'Start pipeline'

  return (
    <section className="panel upload">
      <div className="panel-header">
        <h2>Start YouTube2Blog</h2>
        <p>
          Paste a YouTube video URL and the app will extract the transcript, then generate the
          article end-to-end. CSV upload remains available as a legacy fallback.
        </p>
      </div>
      <form className="panel-body" onSubmit={onSubmit}>
        <div className="input-mode-toggle">
          <button
            type="button"
            className={inputMode === 'url' ? 'mode-btn active' : 'mode-btn'}
            onClick={() => onInputModeChange('url')}
          >
            YouTube URL
          </button>
          <button
            type="button"
            className={inputMode === 'csv' ? 'mode-btn active' : 'mode-btn'}
            onClick={() => onInputModeChange('csv')}
          >
            Legacy CSV
          </button>
        </div>

        {inputMode === 'url' ? (
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
        ) : (
          <div
            className={`file-input ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => document.getElementById('csv-file-input')?.click()}
          >
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              onChange={onFileSelect}
              className="visually-hidden-input"
            />
            {selectedFile ? (
              <div className="selected-file-preview">
                <span>{selectedFile.name}</span>
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z"
                    fill="#f36f2b"
                  />
                  <path d="M14 9H13V4L18 9H14Z" fill="#f36f2b" />
                  <path d="M16 13H8V15H16V13Z" fill="white" />
                  <path d="M16 17H8V19H16V17Z" fill="white" />
                </svg>
              </div>
            ) : (
              <span>
                {isDragOver ? 'Drop CSV file here' : 'Choose a CSV file or drag and drop'}
              </span>
            )}
          </div>
        )}

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
