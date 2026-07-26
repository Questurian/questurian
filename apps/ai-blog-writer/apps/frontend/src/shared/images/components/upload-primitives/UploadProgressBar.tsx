import type { UploadProgress } from '../../api/contracts/image-api.contracts'

type UploadProgressBarProps = {
  progress: UploadProgress
  canRetry?: boolean
  canBackToCrop?: boolean
  onRetry?: () => void
  onBackToCrop?: () => void
  onStartOver?: () => void
}

export function UploadProgressBar({
  progress,
  canRetry = false,
  canBackToCrop = false,
  onRetry,
  onBackToCrop,
  onStartOver,
}: UploadProgressBarProps) {
  if (progress.status === 'error') {
    return (
      <div className="iu-progress__error">
        <svg className="iu-progress__error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="iu-progress__error-body">
          <p className="iu-progress__error-message">{progress.message}</p>
          <div className="iu-progress__error-actions">
            {canRetry && onRetry && (
              <button type="button" className="iu-progress__error-action iu-progress__error-action--primary" onClick={onRetry}>
                Retry upload
              </button>
            )}
            {canBackToCrop && onBackToCrop && (
              <button type="button" className="iu-progress__error-action" onClick={onBackToCrop}>
                Back to crop
              </button>
            )}
            {onStartOver && (
              <button type="button" className="iu-progress__error-action" onClick={onStartOver}>
                Start over
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="iu-progress">
      <div className="iu-progress__meta">
        <span>{progress.message}</span>
        <span>{progress.progress}%</span>
      </div>
      <div className="iu-progress__track">
        <div className="iu-progress__fill" style={{ width: `${progress.progress}%` }} />
      </div>
    </div>
  )
}
