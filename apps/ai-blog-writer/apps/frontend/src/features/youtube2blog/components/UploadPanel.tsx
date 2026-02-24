import type { ChangeEvent, DragEvent, FormEvent } from 'react'

type UploadPanelProps = {
  selectedFile: File | null
  isDragOver: boolean
  runIds: string[]
  activeRunId: string | null
  uploadPending: boolean
  clearPending: boolean
  uploadError: boolean
  onSubmit: (event: FormEvent) => void
  onClear: () => void
  onSelectRun: (runId: string) => void
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
}

export function UploadPanel({
  selectedFile,
  isDragOver,
  runIds,
  activeRunId,
  uploadPending,
  clearPending,
  uploadError,
  onSubmit,
  onClear,
  onSelectRun,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
}: UploadPanelProps) {
  return (
    <section className="panel upload">
      <div className="panel-header">
        <h2>Upload CSV</h2>
        <p>
          Upload a CSV file with YouTube video transcripts, and our AI will transform each one
          into a professionally written article, complete with smart classification, content
          enhancement, and compelling titles.
        </p>
      </div>
      <form className="panel-body" onSubmit={onSubmit}>
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
            <span>{isDragOver ? 'Drop CSV file here' : 'Choose a CSV file or drag and drop'}</span>
          )}
        </div>
        <div className="button-row">
          <button type="submit" disabled={!selectedFile || uploadPending}>
            {uploadPending ? 'Uploading...' : 'Start pipeline'}
          </button>
          <button type="button" className="clear-btn" onClick={onClear} disabled={clearPending}>
            {clearPending ? 'Clearing...' : 'Clear'}
          </button>
        </div>
        {uploadError ? <p className="error">Upload failed. Check the backend logs.</p> : null}
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
